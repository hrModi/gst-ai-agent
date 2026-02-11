import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const clientSchema = z.object({
  gstin: z.string().min(1, 'GSTIN is required'),
  legalName: z.string().min(1, 'Legal name is required'),
  tradeName: z.string().optional(),
  contactPerson: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  stateCode: z.string().optional(),
  filingFrequency: z.enum(['MONTHLY', 'QUARTERLY']).default('MONTHLY'),
  assignedTo: z.string().uuid().optional().nullable(),
})

export const invoiceDataSchema = z.object({
  invoiceNumber: z.string().min(1, 'Invoice number is required'),
  invoiceDate: z.string().min(1, 'Invoice date is required'),
  buyerGstin: z.string().optional().nullable(),
  buyerName: z.string().optional().nullable(),
  placeOfSupply: z.string().optional().nullable(),
  reverseCharge: z.boolean().optional().default(false),
  invoiceValue: z.number().min(0, 'Invoice value must be non-negative'),
  taxableValue: z.number().min(0, 'Taxable value must be non-negative'),
  taxRate: z.number().min(0, 'Tax rate must be non-negative'),
  igstAmount: z.number().optional().default(0),
  cgstAmount: z.number().optional().default(0),
  sgstAmount: z.number().optional().default(0),
  cessAmount: z.number().optional().default(0),
  hsnCode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  noteType: z.string().optional().nullable(),
  originalInvoice: z.string().optional().nullable(),
  exportType: z.string().optional().nullable(),
})

export const filingStatusUpdateSchema = z.object({
  gstr1Status: z.string().optional(),
  gstr3bStatus: z.string().optional(),
  dataReceived: z.boolean().optional(),
  jsonGenerated: z.boolean().optional(),
  notes: z.string().optional().nullable(),
})

export const filedReturnSchema = z.object({
  returnType: z.string().min(1, 'Return type is required'),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2000).max(2100),
  arn: z.string().optional().nullable(),
  filingDate: z.string().optional().nullable(),
})

export const reminderSchema = z.object({
  clientId: z.string().uuid('Invalid client ID'),
  reminderType: z.string().min(1, 'Reminder type is required'),
  channel: z.enum(['EMAIL', 'WHATSAPP', 'SMS']),
  message: z.string().optional().nullable(),
  scheduledAt: z.string().optional().nullable(),
  month: z.number().int().min(1).max(12).optional().nullable(),
  year: z.number().int().min(2000).max(2100).optional().nullable(),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ClientInput = z.infer<typeof clientSchema>
export type InvoiceDataInput = z.infer<typeof invoiceDataSchema>
export type FilingStatusUpdateInput = z.infer<typeof filingStatusUpdateSchema>
export type FiledReturnInput = z.infer<typeof filedReturnSchema>
export type ReminderInput = z.infer<typeof reminderSchema>
