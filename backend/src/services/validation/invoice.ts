import { Decimal } from '@prisma/client/runtime/library'

// Types for invoice data used in validation
interface InvoiceForValidation {
  id: string
  invoiceNumber: string
  invoiceDate: string
  buyerGstin: string | null
  buyerName: string | null
  placeOfSupply: string | null
  invoiceValue: Decimal | number
  taxableValue: Decimal | number
  taxRate: Decimal | number
  igstAmount: Decimal | number
  cgstAmount: Decimal | number
  sgstAmount: Decimal | number
  cessAmount: Decimal | number
  hsnCode: string | null
  noteType: string | null
  exportType: string | null
  month: number
  year: number
  rowNumber: number | null
}

export interface ValidationResult {
  errorType: string
  fieldName: string
  errorMessage: string
  severity: 'ERROR' | 'WARNING'
}

export type TransactionType = 'B2B' | 'B2CL' | 'B2CS' | 'CDNR' | 'EXP'

// GSTIN regex: 2-digit state code + 5 alpha + 4 digits + 1 alpha + 1 alphanumeric + Z + 1 alphanumeric
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

// Valid state codes: 01-38
const VALID_STATE_CODES = Array.from({ length: 38 }, (_, i) =>
  String(i + 1).padStart(2, '0')
)

// Date format: DD-MM-YYYY
const DATE_REGEX = /^(\d{2})-(\d{2})-(\d{4})$/

function toNumber(val: Decimal | number): number {
  if (typeof val === 'number') return val
  return Number(val.toString())
}

/**
 * Validate GSTIN format (Rule 1)
 */
function validateGstinFormat(gstin: string | null, fieldName: string): ValidationResult[] {
  const errors: ValidationResult[] = []
  if (!gstin) return errors

  if (!GSTIN_REGEX.test(gstin)) {
    errors.push({
      errorType: 'gstin_format',
      fieldName,
      errorMessage: `GSTIN "${gstin}" does not match required 15-character format`,
      severity: 'ERROR',
    })
    return errors
  }

  const stateCode = gstin.substring(0, 2)
  if (!VALID_STATE_CODES.includes(stateCode)) {
    errors.push({
      errorType: 'gstin_format',
      fieldName,
      errorMessage: `GSTIN "${gstin}" has invalid state code "${stateCode}" (must be 01-38)`,
      severity: 'ERROR',
    })
  }

  return errors
}

/**
 * Check for duplicate invoice numbers within the period (Rule 2)
 */
function validateDuplicateInvoice(
  invoice: InvoiceForValidation,
  allInvoices: InvoiceForValidation[]
): ValidationResult[] {
  const errors: ValidationResult[] = []
  const duplicates = allInvoices.filter(
    (other) =>
      other.id !== invoice.id &&
      other.invoiceNumber === invoice.invoiceNumber
  )

  if (duplicates.length > 0) {
    const dupRows = duplicates
      .map((d) => d.rowNumber ?? 'unknown')
      .join(', ')
    errors.push({
      errorType: 'duplicate_invoice',
      fieldName: 'invoice_number',
      errorMessage: `Invoice number "${invoice.invoiceNumber}" already exists for this period (also in row ${dupRows})`,
      severity: 'ERROR',
    })
  }

  return errors
}

/**
 * Verify tax calculation (Rule 3)
 * |taxableValue * taxRate/100 - declaredTax| <= 0.01
 * Check total IGST or CGST+SGST
 */
function validateTaxCalculation(invoice: InvoiceForValidation): ValidationResult[] {
  const errors: ValidationResult[] = []
  const taxableValue = toNumber(invoice.taxableValue)
  const taxRate = toNumber(invoice.taxRate)
  const igst = toNumber(invoice.igstAmount)
  const cgst = toNumber(invoice.cgstAmount)
  const sgst = toNumber(invoice.sgstAmount)

  const expectedTotalTax = taxableValue * (taxRate / 100)
  const tolerance = 0.01

  // Check IGST path (inter-state)
  if (igst > 0) {
    if (Math.abs(expectedTotalTax - igst) > tolerance) {
      errors.push({
        errorType: 'tax_calculation',
        fieldName: 'igst_amount',
        errorMessage: `IGST amount ${igst} does not match expected ${expectedTotalTax.toFixed(2)} (taxable: ${taxableValue} x rate: ${taxRate}%)`,
        severity: 'ERROR',
      })
    }
  }

  // Check CGST + SGST path (intra-state)
  if (cgst > 0 || sgst > 0) {
    const halfTax = expectedTotalTax / 2
    if (Math.abs(halfTax - cgst) > tolerance) {
      errors.push({
        errorType: 'tax_calculation',
        fieldName: 'cgst_amount',
        errorMessage: `CGST amount ${cgst} does not match expected ${halfTax.toFixed(2)} (half of ${expectedTotalTax.toFixed(2)})`,
        severity: 'ERROR',
      })
    }
    if (Math.abs(halfTax - sgst) > tolerance) {
      errors.push({
        errorType: 'tax_calculation',
        fieldName: 'sgst_amount',
        errorMessage: `SGST amount ${sgst} does not match expected ${halfTax.toFixed(2)} (half of ${expectedTotalTax.toFixed(2)})`,
        severity: 'ERROR',
      })
    }
  }

  // If no tax amounts are provided at all but rate > 0, warn
  if (igst === 0 && cgst === 0 && sgst === 0 && taxRate > 0) {
    errors.push({
      errorType: 'tax_calculation',
      fieldName: 'tax_amounts',
      errorMessage: `No tax amounts declared but tax rate is ${taxRate}%`,
      severity: 'WARNING',
    })
  }

  return errors
}

/**
 * Validate required fields (Rule 4)
 */
function validateRequiredFields(invoice: InvoiceForValidation): ValidationResult[] {
  const errors: ValidationResult[] = []

  if (!invoice.invoiceNumber || invoice.invoiceNumber.trim() === '') {
    errors.push({
      errorType: 'required_field',
      fieldName: 'invoice_number',
      errorMessage: 'Invoice number is required',
      severity: 'ERROR',
    })
  }

  if (!invoice.invoiceDate || invoice.invoiceDate.trim() === '') {
    errors.push({
      errorType: 'required_field',
      fieldName: 'invoice_date',
      errorMessage: 'Invoice date is required',
      severity: 'ERROR',
    })
  }

  if (toNumber(invoice.taxableValue) === 0 && !invoice.noteType) {
    errors.push({
      errorType: 'required_field',
      fieldName: 'taxable_value',
      errorMessage: 'Taxable value is required and must be greater than zero',
      severity: 'WARNING',
    })
  }

  // buyer_gstin required for B2B
  const txType = classifyTransaction(invoice)
  if (txType === 'B2B' && (!invoice.buyerGstin || invoice.buyerGstin.trim() === '')) {
    errors.push({
      errorType: 'required_field',
      fieldName: 'buyer_gstin',
      errorMessage: 'Buyer GSTIN is required for B2B transactions',
      severity: 'ERROR',
    })
  }

  return errors
}

/**
 * Validate date format DD-MM-YYYY, valid date, within filing month, not future (Rule 5)
 */
function validateDateFormat(invoice: InvoiceForValidation): ValidationResult[] {
  const errors: ValidationResult[] = []
  const dateStr = invoice.invoiceDate

  if (!dateStr) return errors

  const match = DATE_REGEX.exec(dateStr)
  if (!match) {
    errors.push({
      errorType: 'date_format',
      fieldName: 'invoice_date',
      errorMessage: `Date "${dateStr}" is not in DD-MM-YYYY format`,
      severity: 'ERROR',
    })
    return errors
  }

  const day = parseInt(match[1], 10)
  const month = parseInt(match[2], 10)
  const year = parseInt(match[3], 10)

  // Validate the date is real
  const date = new Date(year, month - 1, day)
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    errors.push({
      errorType: 'date_format',
      fieldName: 'invoice_date',
      errorMessage: `Date "${dateStr}" is not a valid calendar date`,
      severity: 'ERROR',
    })
    return errors
  }

  // Check within filing month
  if (month !== invoice.month || year !== invoice.year) {
    errors.push({
      errorType: 'date_format',
      fieldName: 'invoice_date',
      errorMessage: `Invoice date ${dateStr} is not within the filing period ${String(invoice.month).padStart(2, '0')}/${invoice.year}`,
      severity: 'WARNING',
    })
  }

  // Check not future date
  const now = new Date()
  if (date > now) {
    errors.push({
      errorType: 'date_format',
      fieldName: 'invoice_date',
      errorMessage: `Invoice date "${dateStr}" is a future date`,
      severity: 'ERROR',
    })
  }

  return errors
}

/**
 * Validate HSN/SAC code (Rule 6)
 * Must be 4, 6, or 8 digit numeric if provided
 */
function validateHsnCode(invoice: InvoiceForValidation): ValidationResult[] {
  const errors: ValidationResult[] = []
  const hsn = invoice.hsnCode

  if (!hsn || hsn.trim() === '') return errors

  const trimmed = hsn.trim()
  if (!/^\d+$/.test(trimmed)) {
    errors.push({
      errorType: 'hsn_code',
      fieldName: 'hsn_code',
      errorMessage: `HSN/SAC code "${trimmed}" must be numeric`,
      severity: 'ERROR',
    })
    return errors
  }

  if (![4, 6, 8].includes(trimmed.length)) {
    errors.push({
      errorType: 'hsn_code',
      fieldName: 'hsn_code',
      errorMessage: `HSN/SAC code "${trimmed}" must be 4, 6, or 8 digits (got ${trimmed.length})`,
      severity: 'ERROR',
    })
  }

  return errors
}

/**
 * Classify transaction type (Rule 7)
 */
export function classifyTransaction(invoice: InvoiceForValidation): TransactionType {
  // CDNR: credit or debit notes
  if (invoice.noteType === 'CREDIT' || invoice.noteType === 'DEBIT') {
    return 'CDNR'
  }

  // EXP: export type present
  if (invoice.exportType) {
    return 'EXP'
  }

  // B2B: buyer GSTIN present and valid
  if (invoice.buyerGstin && GSTIN_REGEX.test(invoice.buyerGstin)) {
    return 'B2B'
  }

  // B2CL: no buyer GSTIN and taxable value > 250000
  const taxableValue = toNumber(invoice.taxableValue)
  if (!invoice.buyerGstin && taxableValue > 250000) {
    return 'B2CL'
  }

  // B2CS: no buyer GSTIN and taxable value <= 250000
  return 'B2CS'
}

/**
 * Run all 7 validation rules on an invoice
 */
export function validateInvoice(
  invoice: InvoiceForValidation,
  allInvoicesInPeriod: InvoiceForValidation[]
): ValidationResult[] {
  const errors: ValidationResult[] = []

  // Rule 1: GSTIN format
  errors.push(...validateGstinFormat(invoice.buyerGstin, 'buyer_gstin'))

  // Rule 2: Duplicate invoice number
  errors.push(...validateDuplicateInvoice(invoice, allInvoicesInPeriod))

  // Rule 3: Tax calculation
  errors.push(...validateTaxCalculation(invoice))

  // Rule 4: Required fields
  errors.push(...validateRequiredFields(invoice))

  // Rule 5: Date format
  errors.push(...validateDateFormat(invoice))

  // Rule 6: HSN/SAC code
  errors.push(...validateHsnCode(invoice))

  return errors
}
