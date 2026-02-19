import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/prisma'
import { authenticate, authorize } from '../middleware/auth'
import { createAuditLog } from '../services/audit'
import { extractSpreadsheetId, fetchSheetData, getAuthUrl, exchangeCodeForTokens, SheetClientRow } from '../services/google-sheets'
import { AuthRequest } from '../types'

const router = Router()

// OAuth callback does NOT require auth (user returns from Google redirect)
// It uses a state parameter to identify the tenant instead.

// GET /api/sheet-sync/google-callback — Google redirects here after consent
router.get('/google-callback', async (req: Request, res: Response) => {
  try {
    const { code, error: oauthError } = req.query
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'

    if (oauthError) {
      res.redirect(`${frontendUrl}/sheet-sync?error=${encodeURIComponent(String(oauthError))}`)
      return
    }

    if (!code) {
      res.redirect(`${frontendUrl}/sheet-sync?error=${encodeURIComponent('No authorization code received')}`)
      return
    }

    // state param carries the tenantId
    const tenantId = req.query.state as string
    if (!tenantId) {
      res.redirect(`${frontendUrl}/sheet-sync?error=${encodeURIComponent('Missing state parameter')}`)
      return
    }

    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5001}`
    const redirectUri = `${backendUrl}/api/sheet-sync/google-callback`

    const tokens = await exchangeCodeForTokens(code as string, redirectUri)

    // Upsert the config with tokens
    await prisma.sheetSyncConfig.upsert({
      where: { tenantId },
      create: {
        tenantId,
        googleAccessToken: tokens.accessToken,
        googleRefreshToken: tokens.refreshToken,
        googleTokenExpiry: tokens.expiry,
        googleEmail: tokens.email,
      },
      update: {
        googleAccessToken: tokens.accessToken,
        googleRefreshToken: tokens.refreshToken,
        googleTokenExpiry: tokens.expiry,
        googleEmail: tokens.email,
      },
    })

    res.redirect(`${frontendUrl}/sheet-sync?connected=true`)
  } catch (error: any) {
    console.error('Google OAuth callback error:', error)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173'
    res.redirect(`${frontendUrl}/sheet-sync?error=${encodeURIComponent(error.message || 'OAuth failed')}`)
  }
})

// All remaining routes require authentication + admin role
router.use(authenticate)
router.use(authorize('ADMIN'))

// GET /api/sheet-sync/auth-url — generate Google OAuth URL for admin
router.get('/auth-url', async (req: AuthRequest, res: Response) => {
  try {
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 5001}`
    const redirectUri = `${backendUrl}/api/sheet-sync/google-callback`

    // Pass tenantId as state so the callback can identify which tenant
    const url = getAuthUrl(redirectUri) + `&state=${req.user!.tenantId}`

    res.json({ data: { url } })
  } catch (error: any) {
    console.error('Get auth URL error:', error)
    res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// GET /api/sheet-sync/disconnect — remove Google OAuth tokens
router.post('/disconnect', async (req: AuthRequest, res: Response) => {
  try {
    const config = await prisma.sheetSyncConfig.findUnique({
      where: { tenantId: req.user!.tenantId },
    })

    if (config) {
      await prisma.sheetSyncConfig.update({
        where: { tenantId: req.user!.tenantId },
        data: {
          googleAccessToken: null,
          googleRefreshToken: null,
          googleTokenExpiry: null,
          googleEmail: null,
        },
      })
    }

    res.json({ data: { message: 'Google account disconnected' } })
  } catch (error) {
    console.error('Disconnect Google error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

const configSchema = z.object({
  spreadsheetUrl: z.string().url('Invalid URL'),
  sheetName: z.string().min(1).default('Sheet1'),
})

// GET /api/sheet-sync/config — get current config for this tenant
router.get('/config', async (req: AuthRequest, res: Response) => {
  try {
    const config = await prisma.sheetSyncConfig.findUnique({
      where: { tenantId: req.user!.tenantId },
    })

    // Don't expose tokens to the frontend
    if (config) {
      const { googleAccessToken, googleRefreshToken, ...safeConfig } = config
      res.json({ data: { ...safeConfig, isConnected: !!googleRefreshToken } })
    } else {
      res.json({ data: null })
    }
  } catch (error) {
    console.error('Get sheet sync config error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/sheet-sync/config — save/update sheet URL + sheet name
router.put('/config', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = configSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
      return
    }

    const { spreadsheetUrl, sheetName } = parsed.data
    const spreadsheetId = extractSpreadsheetId(spreadsheetUrl)

    if (!spreadsheetId) {
      res.status(400).json({ error: 'Could not extract spreadsheet ID from URL. Please provide a valid Google Sheets URL.' })
      return
    }

    const config = await prisma.sheetSyncConfig.upsert({
      where: { tenantId: req.user!.tenantId },
      create: {
        tenantId: req.user!.tenantId,
        spreadsheetUrl,
        spreadsheetId,
        sheetName,
      },
      update: {
        spreadsheetUrl,
        spreadsheetId,
        sheetName,
      },
    })

    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'UPDATE',
      entityType: 'SHEET_SYNC_CONFIG',
      entityId: config.id,
      newValue: { spreadsheetUrl, sheetName },
      ipAddress: req.ip,
    })

    res.json({ data: config })
  } catch (error) {
    console.error('Update sheet sync config error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/sheet-sync/preview — fetch sheet, diff against existing clients
router.post('/preview', async (req: AuthRequest, res: Response) => {
  try {
    const config = await prisma.sheetSyncConfig.findUnique({
      where: { tenantId: req.user!.tenantId },
    })

    if (!config) {
      res.status(400).json({ error: 'Sheet sync not configured. Please save a Google Sheet URL first.' })
      return
    }

    if (!config.googleRefreshToken) {
      res.status(400).json({ error: 'Google account not connected. Please connect your Google account first.' })
      return
    }

    if (!config.spreadsheetId) {
      res.status(400).json({ error: 'No spreadsheet URL configured. Please save a Google Sheet URL first.' })
      return
    }

    // Fetch data from Google Sheets
    const sheetResult = await fetchSheetData(req.user!.tenantId, config.spreadsheetId, config.sheetName)

    // Get existing clients for this tenant (keyed by GSTIN)
    const existingClients = await prisma.client.findMany({
      where: { tenantId: req.user!.tenantId },
      select: {
        id: true,
        gstin: true,
        legalName: true,
        tradeName: true,
        contactPerson: true,
        email: true,
        phone: true,
        address: true,
        stateCode: true,
        filingFrequency: true,
        status: true,
      },
    })

    const clientsByGstin = new Map(existingClients.map(c => [c.gstin, c]))

    const newClients: (SheetClientRow & { _action: 'create' })[] = []
    const changedClients: {
      rowNumber: number
      gstin: string
      clientId: string
      legalName: string
      changes: Record<string, { old: string | null; new: string | null }>
    }[] = []
    let unchangedCount = 0

    for (const row of sheetResult.rows) {
      const existing = clientsByGstin.get(row.gstin)

      if (!existing) {
        newClients.push({ ...row, _action: 'create' })
      } else {
        const changes: Record<string, { old: string | null; new: string | null }> = {}

        const compareField = (field: string, sheetVal: string | undefined, dbVal: string | null) => {
          const sv = sheetVal || null
          const dv = dbVal || null
          if (sv !== dv) {
            changes[field] = { old: dv, new: sv }
          }
        }

        compareField('legalName', row.legalName, existing.legalName)
        compareField('tradeName', row.tradeName, existing.tradeName)
        compareField('contactPerson', row.contactPerson, existing.contactPerson)
        compareField('email', row.email, existing.email)
        compareField('phone', row.phone, existing.phone)
        compareField('address', row.address, existing.address)
        compareField('stateCode', row.stateCode, existing.stateCode)
        compareField('filingFrequency', row.filingFrequency, existing.filingFrequency)

        if (Object.keys(changes).length > 0) {
          changedClients.push({
            rowNumber: row.rowNumber,
            gstin: row.gstin,
            clientId: existing.id,
            legalName: existing.legalName,
            changes,
          })
        } else {
          unchangedCount++
        }
      }
    }

    res.json({
      data: {
        preview: {
          new: newClients,
          changed: changedClients,
          unchanged: unchangedCount,
          errors: sheetResult.errors,
        },
        totalRows: sheetResult.totalRows,
      },
    })
  } catch (error: any) {
    console.error('Sheet sync preview error:', error)
    if (error?.code === 403 || error?.message?.includes('permission')) {
      res.status(403).json({ error: 'Cannot access the Google Sheet. Make sure the sheet is shared with the connected Google account.' })
      return
    }
    if (error?.code === 404 || error?.message?.includes('not found')) {
      res.status(404).json({ error: 'Spreadsheet not found. Check the URL and ensure the sheet exists.' })
      return
    }
    res.status(500).json({ error: error.message || 'Internal server error' })
  }
})

// POST /api/sheet-sync/apply — apply selected changes from preview
router.post('/apply', async (req: AuthRequest, res: Response) => {
  try {
    const applySchema = z.object({
      create: z.array(z.object({
        gstin: z.string(),
        legalName: z.string(),
        tradeName: z.string().optional(),
        contactPerson: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        stateCode: z.string().optional(),
        filingFrequency: z.string().optional(),
      })),
      update: z.array(z.object({
        clientId: z.string().uuid(),
        gstin: z.string(),
        legalName: z.string(),
        tradeName: z.string().optional(),
        contactPerson: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        stateCode: z.string().optional(),
        filingFrequency: z.string().optional(),
      })),
    })

    const parsed = applySchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
      return
    }

    const { create, update } = parsed.data
    let created = 0
    let updated = 0
    const errors: { gstin: string; message: string }[] = []

    for (const row of create) {
      try {
        const client = await prisma.client.create({
          data: {
            tenantId: req.user!.tenantId,
            gstin: row.gstin,
            legalName: row.legalName,
            tradeName: row.tradeName || null,
            contactPerson: row.contactPerson || null,
            email: row.email || null,
            phone: row.phone || null,
            address: row.address || null,
            stateCode: row.stateCode || null,
            filingFrequency: (row.filingFrequency as 'MONTHLY' | 'QUARTERLY') || 'MONTHLY',
          },
        })

        await createAuditLog({
          userId: req.user!.id,
          tenantId: req.user!.tenantId,
          action: 'CREATE',
          entityType: 'CLIENT',
          entityId: client.id,
          newValue: { source: 'SHEET_SYNC', gstin: row.gstin },
          ipAddress: req.ip,
        })

        created++
      } catch (err: any) {
        errors.push({ gstin: row.gstin, message: err.message || 'Failed to create' })
      }
    }

    for (const row of update) {
      try {
        const existing = await prisma.client.findFirst({
          where: { id: row.clientId, tenantId: req.user!.tenantId },
        })

        if (!existing) {
          errors.push({ gstin: row.gstin, message: 'Client not found' })
          continue
        }

        const updatedClient = await prisma.client.update({
          where: { id: row.clientId },
          data: {
            legalName: row.legalName,
            tradeName: row.tradeName || null,
            contactPerson: row.contactPerson || null,
            email: row.email || null,
            phone: row.phone || null,
            address: row.address || null,
            stateCode: row.stateCode || null,
            filingFrequency: (row.filingFrequency as 'MONTHLY' | 'QUARTERLY') || existing.filingFrequency,
          },
        })

        await createAuditLog({
          userId: req.user!.id,
          tenantId: req.user!.tenantId,
          action: 'UPDATE',
          entityType: 'CLIENT',
          entityId: updatedClient.id,
          oldValue: { source: 'SHEET_SYNC', gstin: existing.gstin },
          newValue: { source: 'SHEET_SYNC', gstin: row.gstin },
          ipAddress: req.ip,
        })

        updated++
      } catch (err: any) {
        errors.push({ gstin: row.gstin, message: err.message || 'Failed to update' })
      }
    }

    await prisma.sheetSyncConfig.update({
      where: { tenantId: req.user!.tenantId },
      data: {
        lastSyncedAt: new Date(),
        lastSyncStatus: errors.length > 0 ? 'PARTIAL' : 'SUCCESS',
        lastSyncSummary: { created, updated, skipped: 0, errors },
      },
    })

    res.json({
      data: {
        summary: { created, updated, errors },
      },
    })
  } catch (error) {
    console.error('Sheet sync apply error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
