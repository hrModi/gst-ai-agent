import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, authorize } from '../middleware/auth'
import { clientSchema } from '../services/validation/schemas'
import { createAuditLog } from '../services/audit'
import { AuthRequest } from '../types'

const router = Router()

// All routes require authentication
router.use(authenticate)

// GET /api/clients
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { search, status, assignedTo, page = '1', limit = '50' } = req.query
    const pageNum = parseInt(page as string, 10)
    const limitNum = parseInt(limit as string, 10)
    const skip = (pageNum - 1) * limitNum

    const where: any = {
      tenantId: req.user!.tenantId,
    }

    // Consultants can only see their assigned clients
    if (req.user!.role === 'CONSULTANT') {
      where.assignedTo = req.user!.id
    } else if (assignedTo) {
      where.assignedTo = assignedTo as string
    }

    if (status) {
      where.status = status as string
    }

    if (search) {
      const searchStr = search as string
      where.OR = [
        { legalName: { contains: searchStr, mode: 'insensitive' } },
        { tradeName: { contains: searchStr, mode: 'insensitive' } },
        { gstin: { contains: searchStr, mode: 'insensitive' } },
        { contactPerson: { contains: searchStr, mode: 'insensitive' } },
      ]
    }

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        include: {
          assignedUser: { select: { id: true, name: true, email: true } },
        },
        orderBy: { legalName: 'asc' },
        skip,
        take: limitNum,
      }),
      prisma.client.count({ where }),
    ])

    res.json({
      data: clients,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    })
  } catch (error) {
    console.error('Get clients error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/clients (Admin only)
router.post('/', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const parsed = clientSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
      return
    }

    const data = parsed.data

    // Check GSTIN uniqueness per tenant
    const existing = await prisma.client.findFirst({
      where: {
        tenantId: req.user!.tenantId,
        gstin: data.gstin,
      },
    })

    if (existing) {
      res.status(409).json({ error: `Client with GSTIN ${data.gstin} already exists` })
      return
    }

    const client = await prisma.client.create({
      data: {
        tenantId: req.user!.tenantId,
        gstin: data.gstin,
        legalName: data.legalName,
        tradeName: data.tradeName,
        contactPerson: data.contactPerson,
        email: data.email || null,
        phone: data.phone,
        address: data.address,
        stateCode: data.stateCode,
        filingFrequency: data.filingFrequency,
        assignedTo: data.assignedTo,
        automationEnabled: data.automationEnabled,
        notifyEmail: data.notifyEmail,
        notifyWhatsapp: data.notifyWhatsapp,
        gstr1DueDay: data.gstr1DueDay,
        gstr3bDueDay: data.gstr3bDueDay,
        reminderDaysBefore: data.reminderDaysBefore,
        dataEmailSubject: data.dataEmailSubject,
      },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
      },
    })

    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'CREATE',
      entityType: 'CLIENT',
      entityId: client.id,
      newValue: client,
      ipAddress: req.ip,
    })

    res.status(201).json({ data: client })
  } catch (error) {
    console.error('Create client error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/clients/bulk-assign (Admin only) — must be before /:id
router.put('/bulk-assign', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const { clientIds, consultantId } = req.body

    if (!Array.isArray(clientIds) || clientIds.length === 0) {
      res.status(400).json({ error: 'clientIds must be a non-empty array' })
      return
    }

    // Validate consultantId if provided
    if (consultantId) {
      const consultant = await prisma.user.findFirst({
        where: { id: consultantId, tenantId: req.user!.tenantId, isActive: true },
      })
      if (!consultant) {
        res.status(404).json({ error: 'Consultant not found' })
        return
      }
    }

    const result = await prisma.client.updateMany({
      where: {
        id: { in: clientIds },
        tenantId: req.user!.tenantId,
      },
      data: { assignedTo: consultantId || null },
    })

    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'BULK_ASSIGN',
      entityType: 'CLIENT',
      newValue: { clientIds, consultantId: consultantId || null },
      ipAddress: req.ip,
    })

    res.json({ data: { updated: result.count } })
  } catch (error) {
    console.error('Bulk assign error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/clients/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const where: any = {
      id: req.params.id as string,
      tenantId: req.user!.tenantId,
    }

    // Consultants can only see their assigned clients
    if (req.user!.role === 'CONSULTANT') {
      where.assignedTo = req.user!.id
    }

    const client = await prisma.client.findFirst({
      where,
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
        filingStatus: { orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 12 },
        filedReturns: { orderBy: [{ year: 'desc' }, { month: 'desc' }], take: 12 },
      },
    })

    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    res.json({ data: client })
  } catch (error) {
    console.error('Get client error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/clients/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = clientSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
      return
    }

    const where: any = {
      id: req.params.id as string,
      tenantId: req.user!.tenantId,
    }

    // Consultants can only update their assigned clients
    if (req.user!.role === 'CONSULTANT') {
      where.assignedTo = req.user!.id
    }

    const existing = await prisma.client.findFirst({ where })
    if (!existing) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    // Check GSTIN uniqueness if changed
    const data = parsed.data
    if (data.gstin !== existing.gstin) {
      const duplicate = await prisma.client.findFirst({
        where: {
          tenantId: req.user!.tenantId,
          gstin: data.gstin,
          id: { not: req.params.id as string },
        },
      })
      if (duplicate) {
        res.status(409).json({ error: `Client with GSTIN ${data.gstin} already exists` })
        return
      }
    }

    const updated = await prisma.client.update({
      where: { id: req.params.id as string },
      data: {
        gstin: data.gstin,
        legalName: data.legalName,
        tradeName: data.tradeName,
        contactPerson: data.contactPerson,
        email: data.email || null,
        phone: data.phone,
        address: data.address,
        stateCode: data.stateCode,
        filingFrequency: data.filingFrequency,
        assignedTo: data.assignedTo,
        automationEnabled: data.automationEnabled,
        notifyEmail: data.notifyEmail,
        notifyWhatsapp: data.notifyWhatsapp,
        gstr1DueDay: data.gstr1DueDay,
        gstr3bDueDay: data.gstr3bDueDay,
        reminderDaysBefore: data.reminderDaysBefore,
        dataEmailSubject: data.dataEmailSubject,
      },
      include: {
        assignedUser: { select: { id: true, name: true, email: true } },
      },
    })

    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'UPDATE',
      entityType: 'CLIENT',
      entityId: updated.id,
      oldValue: existing,
      newValue: updated,
      ipAddress: req.ip,
    })

    res.json({ data: updated })
  } catch (error) {
    console.error('Update client error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// DELETE /api/clients/:id (Admin only - soft delete)
router.delete('/:id', authorize('ADMIN'), async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.client.findFirst({
      where: {
        id: req.params.id as string,
        tenantId: req.user!.tenantId,
      },
    })

    if (!existing) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    const updated = await prisma.client.update({
      where: { id: req.params.id as string },
      data: { status: 'INACTIVE' },
    })

    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'DELETE',
      entityType: 'CLIENT',
      entityId: updated.id,
      oldValue: { status: existing.status },
      newValue: { status: 'INACTIVE' },
      ipAddress: req.ip,
    })

    res.json({ data: { message: 'Client deactivated successfully' } })
  } catch (error) {
    console.error('Delete client error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
