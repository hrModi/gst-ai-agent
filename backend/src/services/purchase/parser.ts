import * as XLSX from 'xlsx'

export interface MappedPurchaseRow {
  clientId: string
  month: number
  year: number
  invoiceNumber: string
  invoiceDate: string
  supplierGstin: string
  supplierName: string | null
  invoiceValue: number
  taxableValue: number
  igstAmount: number
  cgstAmount: number
  sgstAmount: number
  cessAmount: number
  hsnCode: string | null
  rowNumber: number
}

/**
 * Parse an XLSX or CSV purchase register file into mapped row objects.
 * Template columns: Supplier GSTIN, Supplier Name, Invoice Number, Invoice Date,
 * Invoice Value, Taxable Value, IGST, CGST, SGST, Cess, HSN/SAC Code
 * Throws if the file has no data rows.
 */
export function parsePurchaseFile(
  buffer: Buffer,
  fileName: string,
  clientId: string,
  month: number,
  year: number
): MappedPurchaseRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]
  const rows: any[] = XLSX.utils.sheet_to_json(sheet)

  if (rows.length === 0) {
    throw new Error('File contains no data rows')
  }

  return rows.map((row: any, index: number) => ({
    clientId,
    month,
    year,
    invoiceNumber: String(
      row['Invoice Number'] || row['invoice_number'] || row['InvoiceNumber'] || ''
    ),
    invoiceDate: String(
      row['Invoice Date'] || row['invoice_date'] || row['InvoiceDate'] || ''
    ),
    supplierGstin: String(
      row['Supplier GSTIN'] || row['supplier_gstin'] || row['SupplierGSTIN'] || ''
    ),
    supplierName: row['Supplier Name'] || row['supplier_name'] || row['SupplierName'] || null,
    invoiceValue: parseFloat(
      row['Invoice Value'] || row['invoice_value'] || row['InvoiceValue'] || '0'
    ),
    taxableValue: parseFloat(
      row['Taxable Value'] || row['taxable_value'] || row['TaxableValue'] || '0'
    ),
    igstAmount: parseFloat(
      row['IGST Amount'] || row['igst_amount'] || row['IGST'] || '0'
    ),
    cgstAmount: parseFloat(
      row['CGST Amount'] || row['cgst_amount'] || row['CGST'] || '0'
    ),
    sgstAmount: parseFloat(
      row['SGST Amount'] || row['sgst_amount'] || row['SGST'] || '0'
    ),
    cessAmount: parseFloat(
      row['Cess Amount'] || row['cess_amount'] || row['Cess'] || row['CESS'] || '0'
    ),
    hsnCode: row['HSN Code'] || row['hsn_code'] || row['HSN/SAC Code'] || row['HSN'] || null,
    rowNumber: index + 1,
  }))
}
