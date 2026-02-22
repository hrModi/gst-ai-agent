import { Decimal } from '@prisma/client/runtime/library'
import { ValidationResult } from '../validation/invoice'

// GSTIN regex (same as invoice validator)
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/
const DATE_REGEX = /^(\d{2})-(\d{2})-(\d{4})$/

interface PurchaseRowForValidation {
  id: string
  invoiceNumber: string
  invoiceDate: string
  supplierGstin: string
  taxableValue: Decimal | number
  igstAmount: Decimal | number
  cgstAmount: Decimal | number
  sgstAmount: Decimal | number
  hsnCode: string | null
  month: number
  year: number
  rowNumber: number | null
}

function toNumber(val: Decimal | number): number {
  if (typeof val === 'number') return val
  return Number(val.toString())
}

function validateSupplierGstin(gstin: string): ValidationResult[] {
  const errors: ValidationResult[] = []
  if (!gstin || gstin.trim() === '') {
    errors.push({
      errorType: 'required_field',
      fieldName: 'supplier_gstin',
      errorMessage: 'Supplier GSTIN is required',
      severity: 'ERROR',
    })
    return errors
  }
  if (!GSTIN_REGEX.test(gstin)) {
    errors.push({
      errorType: 'gstin_format',
      fieldName: 'supplier_gstin',
      errorMessage: `Supplier GSTIN "${gstin}" does not match required 15-character format`,
      severity: 'ERROR',
    })
  }
  return errors
}

function validateRequiredFields(row: PurchaseRowForValidation): ValidationResult[] {
  const errors: ValidationResult[] = []

  if (!row.invoiceNumber || row.invoiceNumber.trim() === '') {
    errors.push({
      errorType: 'required_field',
      fieldName: 'invoice_number',
      errorMessage: 'Invoice number is required',
      severity: 'ERROR',
    })
  }

  if (!row.invoiceDate || row.invoiceDate.trim() === '') {
    errors.push({
      errorType: 'required_field',
      fieldName: 'invoice_date',
      errorMessage: 'Invoice date is required',
      severity: 'ERROR',
    })
  }

  if (toNumber(row.taxableValue) === 0) {
    errors.push({
      errorType: 'required_field',
      fieldName: 'taxable_value',
      errorMessage: 'Taxable value is required and must be greater than zero',
      severity: 'WARNING',
    })
  }

  return errors
}

function validateDateFormat(row: PurchaseRowForValidation): ValidationResult[] {
  const errors: ValidationResult[] = []
  const dateStr = row.invoiceDate
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

  if (month !== row.month || year !== row.year) {
    errors.push({
      errorType: 'date_format',
      fieldName: 'invoice_date',
      errorMessage: `Invoice date ${dateStr} is not within the filing period ${String(row.month).padStart(2, '0')}/${row.year}`,
      severity: 'WARNING',
    })
  }

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

function validateTaxCalculation(row: PurchaseRowForValidation): ValidationResult[] {
  const errors: ValidationResult[] = []
  const taxableValue = toNumber(row.taxableValue)
  const igst = toNumber(row.igstAmount)
  const cgst = toNumber(row.cgstAmount)
  const sgst = toNumber(row.sgstAmount)

  // For purchase data we don't have taxRate, so just check CGST == SGST for intra-state
  if ((cgst > 0 || sgst > 0) && Math.abs(cgst - sgst) > 0.01) {
    errors.push({
      errorType: 'tax_calculation',
      fieldName: 'cgst_sgst',
      errorMessage: `CGST (${cgst}) and SGST (${sgst}) should be equal for intra-state purchases`,
      severity: 'ERROR',
    })
  }

  // Warn if both IGST and CGST/SGST are set simultaneously
  if (igst > 0 && (cgst > 0 || sgst > 0)) {
    errors.push({
      errorType: 'tax_calculation',
      fieldName: 'tax_amounts',
      errorMessage: 'Both IGST and CGST/SGST are set — use IGST for inter-state or CGST+SGST for intra-state',
      severity: 'WARNING',
    })
  }

  return errors
}

function validateHsnCode(row: PurchaseRowForValidation): ValidationResult[] {
  const errors: ValidationResult[] = []
  const hsn = row.hsnCode
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

function validateDuplicateInvoice(
  row: PurchaseRowForValidation,
  allRows: PurchaseRowForValidation[]
): ValidationResult[] {
  const errors: ValidationResult[] = []
  const duplicates = allRows.filter(
    (other) =>
      other.id !== row.id &&
      other.invoiceNumber === row.invoiceNumber &&
      other.supplierGstin === row.supplierGstin
  )

  if (duplicates.length > 0) {
    const dupRows = duplicates.map((d) => d.rowNumber ?? 'unknown').join(', ')
    errors.push({
      errorType: 'duplicate_invoice',
      fieldName: 'invoice_number',
      errorMessage: `Invoice number "${row.invoiceNumber}" from supplier "${row.supplierGstin}" already exists (also in row ${dupRows})`,
      severity: 'ERROR',
    })
  }

  return errors
}

export function validatePurchaseRow(
  row: PurchaseRowForValidation,
  allRows: PurchaseRowForValidation[]
): ValidationResult[] {
  const errors: ValidationResult[] = []

  errors.push(...validateSupplierGstin(row.supplierGstin))
  errors.push(...validateRequiredFields(row))
  errors.push(...validateDateFormat(row))
  errors.push(...validateTaxCalculation(row))
  errors.push(...validateHsnCode(row))
  errors.push(...validateDuplicateInvoice(row, allRows))

  return errors
}
