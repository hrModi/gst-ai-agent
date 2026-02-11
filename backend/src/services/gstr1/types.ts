/**
 * GSTR-1 JSON format types matching GST Portal expected structure
 */

export interface ItemDetail {
  /** Tax rate */
  rt: number
  /** Taxable value */
  txval: number
  /** IGST amount */
  iamt: number
  /** CGST amount */
  camt: number
  /** SGST amount */
  samt: number
  /** Cess amount */
  csamt: number
}

export interface InvoiceItem {
  /** Invoice number */
  inum: string
  /** Invoice date (DD-MM-YYYY) */
  idt: string
  /** Invoice value */
  val: number
  /** Place of supply (state code) */
  pos: string
  /** Reverse charge: Y or N */
  rchrg: string
  /** Invoice type: R (Regular), DE (Deemed Exp), SEWP (SEZ with payment), SEWOP (SEZ without payment) */
  inv_typ?: string
  /** Item details */
  itms: { num: number; itm_det: ItemDetail }[]
}

export interface B2BEntry {
  /** Buyer GSTIN */
  ctin: string
  /** Array of invoices */
  inv: InvoiceItem[]
}

export interface B2CLEntry {
  /** Place of supply (state code) */
  pos: string
  /** Array of invoices */
  inv: Omit<InvoiceItem, 'pos' | 'rchrg'>[]
}

export interface B2CSEntry {
  /** Supply type: INTRA or INTER */
  sply_ty: string
  /** Place of supply (state code) */
  pos: string
  /** Tax rate */
  rt: number
  /** Taxable value */
  txval: number
  /** IGST amount */
  iamt: number
  /** CGST amount */
  camt: number
  /** SGST amount */
  samt: number
  /** Cess amount */
  csamt: number
}

export interface CDNRNote {
  /** Note number */
  nt_num: string
  /** Note date (DD-MM-YYYY) */
  nt_dt: string
  /** Note type: C (Credit) or D (Debit) */
  ntty: string
  /** Note value */
  val: number
  /** Place of supply */
  pos: string
  /** Reverse charge: Y or N */
  rchrg: string
  /** Item details */
  itms: { num: number; itm_det: ItemDetail }[]
}

export interface CDNREntry {
  /** Buyer GSTIN */
  ctin: string
  /** Array of notes */
  nt: CDNRNote[]
}

export interface EXPInvoice {
  /** Export type: WPAY (with payment), WOPAY (without payment) */
  exp_typ: string
  /** Invoice number */
  inum: string
  /** Invoice date */
  idt: string
  /** Invoice value */
  val: number
  /** Shipping bill number */
  sbnum?: string
  /** Shipping bill date */
  sbdt?: string
  /** Item details */
  itms: { txval: number; rt: number; iamt: number; csamt: number }[]
}

export interface EXPEntry {
  /** Export type */
  exp_typ: string
  /** Array of invoices */
  inv: EXPInvoice[]
}

export interface HSNEntry {
  /** HSN/SAC code */
  hsn_sc: string
  /** Description */
  desc: string
  /** UQC (Unit Quantity Code) */
  uqc: string
  /** Quantity */
  qty: number
  /** Taxable value */
  txval: number
  /** IGST amount */
  iamt: number
  /** CGST amount */
  camt: number
  /** SGST amount */
  samt: number
  /** Cess amount */
  csamt: number
}

export interface GSTR1Json {
  /** GSTIN of the filer */
  gstin: string
  /** Filing period in MMYYYY format */
  fp: string
  /** B2B invoices */
  b2b: B2BEntry[]
  /** B2C Large invoices */
  b2cl: B2CLEntry[]
  /** B2C Small summary */
  b2cs: B2CSEntry[]
  /** Credit/Debit notes */
  cdnr: CDNREntry[]
  /** Export invoices */
  exp: EXPEntry[]
  /** HSN summary */
  hsn: { data: HSNEntry[] }
}

export interface GSTR1Metadata {
  totalInvoices: number
  totalTaxableValue: number
  totalTax: number
  sections: {
    b2b: number
    b2cl: number
    b2cs: number
    cdnr: number
    exp: number
    hsn: number
  }
}
