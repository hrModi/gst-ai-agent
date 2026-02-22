import * as XLSX from 'xlsx'

export interface MappedGstr2bEntry {
  clientId: string
  month: number
  year: number
  supplierGstin: string
  supplierName: string | null
  invoiceNumber: string
  invoiceDate: string
  invoiceValue: number
  taxableValue: number
  igstAmount: number
  cgstAmount: number
  sgstAmount: number
  cessAmount: number
  itcAvailable: number
}

/**
 * Parse a GSTR-2B file (JSON or Excel) into mapped entry objects.
 * Auto-detects format by file extension/name.
 * Throws if file has no data rows.
 */
export function parseGstr2bFile(
  buffer: Buffer,
  fileName: string,
  clientId: string,
  month: number,
  year: number
): MappedGstr2bEntry[] {
  const lower = fileName.toLowerCase()

  if (lower.endsWith('.json')) {
    return parseGstr2bJson(buffer, clientId, month, year)
  }

  // .xlsx, .xls, .csv — treat as Excel
  return parseGstr2bExcel(buffer, clientId, month, year)
}

/**
 * Parse GST Portal GSTR-2B JSON format.
 * Structure: data.docdata.b2b[].inv[]
 */
function parseGstr2bJson(
  buffer: Buffer,
  clientId: string,
  month: number,
  year: number
): MappedGstr2bEntry[] {
  let parsed: any
  try {
    parsed = JSON.parse(buffer.toString('utf-8'))
  } catch {
    throw new Error('Invalid JSON file — could not parse GSTR-2B data')
  }

  // Navigate to b2b section (portal JSON structure)
  const docdata = parsed?.data?.docdata || parsed?.docdata || parsed
  const b2bList: any[] = docdata?.b2b || []

  if (b2bList.length === 0) {
    // Try alternative structure
    const b2bAlt: any[] = parsed?.b2b || []
    if (b2bAlt.length === 0) {
      throw new Error('No B2B invoice data found in GSTR-2B JSON file')
    }
    return flattenB2bList(b2bAlt, clientId, month, year)
  }

  return flattenB2bList(b2bList, clientId, month, year)
}

function flattenB2bList(
  b2bList: any[],
  clientId: string,
  month: number,
  year: number
): MappedGstr2bEntry[] {
  const entries: MappedGstr2bEntry[] = []

  for (const supplier of b2bList) {
    const supplierGstin: string = (supplier.ctin || supplier.gstin || '').toUpperCase()
    const supplierName: string | null = supplier.trdnm || supplier.name || null
    const invoices: any[] = supplier.inv || []

    for (const inv of invoices) {
      const igst = parseFloat(inv.itms?.[0]?.itm_det?.iamt ?? inv.igst ?? '0')
      const cgst = parseFloat(inv.itms?.[0]?.itm_det?.camt ?? inv.cgst ?? '0')
      const sgst = parseFloat(inv.itms?.[0]?.itm_det?.samt ?? inv.sgst ?? '0')
      const cess = parseFloat(inv.itms?.[0]?.itm_det?.csamt ?? inv.cess ?? '0')
      const taxableValue = parseFloat(inv.itms?.[0]?.itm_det?.txval ?? inv.txval ?? '0')
      const invoiceValue = parseFloat(inv.val ?? inv.ival ?? '0')
      // ITC available — use igst+cgst+sgst as default if not explicitly stated
      const itcAvailable = parseFloat(inv.elg?.amt ?? '0') || (igst + cgst + sgst)

      entries.push({
        clientId,
        month,
        year,
        supplierGstin,
        supplierName,
        invoiceNumber: String(inv.inum || inv.inv_num || ''),
        invoiceDate: String(inv.idt || inv.inv_dt || ''),
        invoiceValue,
        taxableValue,
        igstAmount: igst,
        cgstAmount: cgst,
        sgstAmount: sgst,
        cessAmount: cess,
        itcAvailable,
      })
    }
  }

  if (entries.length === 0) {
    throw new Error('No invoices found in GSTR-2B JSON file')
  }

  return entries
}

/**
 * Parse GSTR-2B Excel format.
 * Expected columns: Supplier GSTIN, Supplier Name, Invoice Number, Invoice Date,
 * Invoice Value, Taxable Value, IGST, CGST, SGST, Cess, ITC Available
 */
function parseGstr2bExcel(
  buffer: Buffer,
  clientId: string,
  month: number,
  year: number
): MappedGstr2bEntry[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows: any[] = XLSX.utils.sheet_to_json(sheet)

  if (rows.length === 0) {
    throw new Error('GSTR-2B Excel file contains no data rows')
  }

  return rows.map((row: any) => ({
    clientId,
    month,
    year,
    supplierGstin: String(
      row['Supplier GSTIN'] || row['supplier_gstin'] || row['GSTIN of Supplier'] || ''
    ).toUpperCase(),
    supplierName: row['Supplier Name'] || row['supplier_name'] || row['Trade/Legal name of Supplier'] || null,
    invoiceNumber: String(
      row['Invoice Number'] || row['invoice_number'] || row['Invoice/Advance Payment Voucher Number'] || ''
    ),
    invoiceDate: String(
      row['Invoice Date'] || row['invoice_date'] || row['Invoice Date(DD-MM-YYYY)'] || ''
    ),
    invoiceValue: parseFloat(
      row['Invoice Value'] || row['invoice_value'] || row['Invoice Value(₹)'] || '0'
    ),
    taxableValue: parseFloat(
      row['Taxable Value'] || row['taxable_value'] || row['Taxable Value(₹)'] || '0'
    ),
    igstAmount: parseFloat(
      row['IGST'] || row['igst_amount'] || row['Integrated Tax(₹)'] || '0'
    ),
    cgstAmount: parseFloat(
      row['CGST'] || row['cgst_amount'] || row['Central Tax(₹)'] || '0'
    ),
    sgstAmount: parseFloat(
      row['SGST'] || row['sgst_amount'] || row['State/UT Tax(₹)'] || '0'
    ),
    cessAmount: parseFloat(
      row['Cess'] || row['cess_amount'] || row['CESS'] || row['Cess(₹)'] || '0'
    ),
    itcAvailable: parseFloat(
      row['ITC Available'] || row['itc_available'] || row['Eligible ITC'] || '0'
    ),
  }))
}
