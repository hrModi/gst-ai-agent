import { google, sheets_v4 } from 'googleapis'
import { prisma } from '../lib/prisma'

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/gmail.readonly',
]

const EXPECTED_HEADERS = [
  'GSTIN',
  'Legal Name',
  'Trade Name',
  'Contact Person',
  'Email',
  'Phone',
  'Address',
  'State Code',
  'Filing Frequency',
]

// Maps sheet column headers to client field names
const HEADER_TO_FIELD: Record<string, string> = {
  'GSTIN': 'gstin',
  'Legal Name': 'legalName',
  'Trade Name': 'tradeName',
  'Contact Person': 'contactPerson',
  'Email': 'email',
  'Phone': 'phone',
  'Address': 'address',
  'State Code': 'stateCode',
  'Filing Frequency': 'filingFrequency',
}

export interface SheetClientRow {
  rowNumber: number
  gstin: string
  legalName: string
  tradeName?: string
  contactPerson?: string
  email?: string
  phone?: string
  address?: string
  stateCode?: string
  filingFrequency?: string
}

export interface SheetFetchResult {
  rows: SheetClientRow[]
  errors: { rowNumber: number; message: string }[]
  totalRows: number
}

/**
 * Extract spreadsheet ID from a Google Sheets URL.
 */
export function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  return match ? match[1] : null
}

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env')
  }

  return new google.auth.OAuth2(clientId, clientSecret)
}

/**
 * Generate the Google OAuth consent URL for the admin to authorize.
 */
export function getAuthUrl(redirectUri: string): string {
  const oauth2Client = getOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    redirect_uri: redirectUri,
  })
}

/**
 * Exchange an authorization code for tokens and fetch the user's email.
 */
export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const oauth2Client = getOAuth2Client()
  const { tokens } = await oauth2Client.getToken({ code, redirect_uri: redirectUri })

  // Get the user's email
  oauth2Client.setCredentials(tokens)
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })
  const userInfo = await oauth2.userinfo.get()

  return {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token!,
    expiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    email: userInfo.data.email || null,
  }
}

/**
 * Get an authenticated OAuth2 client using stored tokens for a tenant.
 * Auto-refreshes the access token if expired.
 */
export async function getAuthClientForTenant(tenantId: string) {
  const config = await prisma.sheetSyncConfig.findUnique({
    where: { tenantId },
  })

  if (!config?.googleRefreshToken) {
    throw new Error('Google account not connected. Please connect your Google account first.')
  }

  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({
    access_token: config.googleAccessToken,
    refresh_token: config.googleRefreshToken,
    expiry_date: config.googleTokenExpiry?.getTime(),
  })

  // Listen for token refresh events and persist new tokens
  oauth2Client.on('tokens', async (tokens) => {
    const updateData: Record<string, any> = {}
    if (tokens.access_token) updateData.googleAccessToken = tokens.access_token
    if (tokens.expiry_date) updateData.googleTokenExpiry = new Date(tokens.expiry_date)

    if (Object.keys(updateData).length > 0) {
      await prisma.sheetSyncConfig.update({
        where: { tenantId },
        data: updateData,
      })
    }
  })

  return oauth2Client
}

function getSheetsClient(auth: any): sheets_v4.Sheets {
  return google.sheets({ version: 'v4', auth })
}

/**
 * Fetch and parse client data from a Google Sheet.
 * Validates headers match expected format and returns structured rows.
 */
export async function fetchSheetData(
  tenantId: string,
  spreadsheetId: string,
  sheetName: string = 'Sheet1'
): Promise<SheetFetchResult> {
  const auth = await getAuthClientForTenant(tenantId)
  const sheets = getSheetsClient(auth)

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:I`,
  })

  const allRows = response.data.values
  if (!allRows || allRows.length === 0) {
    throw new Error('Sheet is empty or could not be read.')
  }

  // Validate headers (first row)
  const headers = allRows[0].map((h: string) => h?.trim())
  const missingHeaders = EXPECTED_HEADERS.filter(h => !headers.includes(h))
  if (missingHeaders.length > 0) {
    throw new Error(`Sheet is missing required columns: ${missingHeaders.join(', ')}. Expected columns: ${EXPECTED_HEADERS.join(', ')}`)
  }

  // Build column index map
  const colIndex: Record<string, number> = {}
  headers.forEach((header: string, idx: number) => {
    if (HEADER_TO_FIELD[header]) {
      colIndex[HEADER_TO_FIELD[header]] = idx
    }
  })

  const rows: SheetClientRow[] = []
  const errors: { rowNumber: number; message: string }[] = []
  const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

  // Process data rows (skip header)
  for (let i = 1; i < allRows.length; i++) {
    const row = allRows[i]
    const rowNumber = i + 1 // 1-based for display

    const getValue = (field: string): string => {
      const idx = colIndex[field]
      return idx !== undefined && row[idx] ? String(row[idx]).trim() : ''
    }

    const gstin = getValue('gstin').toUpperCase()
    const legalName = getValue('legalName')

    // Skip entirely empty rows
    if (!gstin && !legalName) continue

    // Validate required fields
    if (!gstin) {
      errors.push({ rowNumber, message: 'GSTIN is missing' })
      continue
    }
    if (!legalName) {
      errors.push({ rowNumber, message: `GSTIN ${gstin}: Legal Name is missing` })
      continue
    }

    // Validate GSTIN format
    if (!GSTIN_REGEX.test(gstin)) {
      errors.push({ rowNumber, message: `Invalid GSTIN format: ${gstin}` })
      continue
    }

    // Validate filing frequency if provided
    const filingFrequency = getValue('filingFrequency').toUpperCase()
    if (filingFrequency && filingFrequency !== 'MONTHLY' && filingFrequency !== 'QUARTERLY') {
      errors.push({ rowNumber, message: `GSTIN ${gstin}: Invalid filing frequency "${filingFrequency}". Must be MONTHLY or QUARTERLY.` })
      continue
    }

    // Validate state code if provided (2-digit numeric)
    const stateCode = getValue('stateCode')
    if (stateCode && !/^\d{2}$/.test(stateCode)) {
      errors.push({ rowNumber, message: `GSTIN ${gstin}: Invalid state code "${stateCode}". Must be 2 digits.` })
      continue
    }

    rows.push({
      rowNumber,
      gstin,
      legalName,
      tradeName: getValue('tradeName') || undefined,
      contactPerson: getValue('contactPerson') || undefined,
      email: getValue('email') || undefined,
      phone: getValue('phone') || undefined,
      address: getValue('address') || undefined,
      stateCode: stateCode || undefined,
      filingFrequency: filingFrequency || undefined,
    })
  }

  return {
    rows,
    errors,
    totalRows: allRows.length - 1, // exclude header
  }
}
