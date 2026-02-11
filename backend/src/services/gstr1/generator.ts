import { prisma } from '../../lib/prisma'
import { classifyTransaction } from '../validation/invoice'
import {
  GSTR1Json,
  GSTR1Metadata,
  B2BEntry,
  B2CLEntry,
  B2CSEntry,
  CDNREntry,
  EXPEntry,
  HSNEntry,
  InvoiceItem,
  ItemDetail,
} from './types'

function toNum(val: any): number {
  return typeof val === 'number' ? val : Number(val.toString())
}

function buildItemDetail(inv: any): ItemDetail {
  return {
    rt: toNum(inv.taxRate),
    txval: toNum(inv.taxableValue),
    iamt: toNum(inv.igstAmount),
    camt: toNum(inv.cgstAmount),
    samt: toNum(inv.sgstAmount),
    csamt: toNum(inv.cessAmount),
  }
}

function buildInvoiceItem(inv: any): InvoiceItem {
  return {
    inum: inv.invoiceNumber,
    idt: inv.invoiceDate,
    val: toNum(inv.invoiceValue),
    pos: inv.placeOfSupply || '',
    rchrg: inv.reverseCharge ? 'Y' : 'N',
    itms: [{ num: 1, itm_det: buildItemDetail(inv) }],
  }
}

function buildB2BSection(invoices: any[]): B2BEntry[] {
  // Group by buyer GSTIN
  const grouped = new Map<string, any[]>()
  for (const inv of invoices) {
    const gstin = inv.buyerGstin as string
    if (!grouped.has(gstin)) {
      grouped.set(gstin, [])
    }
    grouped.get(gstin)!.push(inv)
  }

  return Array.from(grouped.entries()).map(([ctin, invs]) => ({
    ctin,
    inv: invs.map(buildInvoiceItem),
  }))
}

function buildB2CLSection(invoices: any[]): B2CLEntry[] {
  // Group by Place of Supply
  const grouped = new Map<string, any[]>()
  for (const inv of invoices) {
    const pos = inv.placeOfSupply || '00'
    if (!grouped.has(pos)) {
      grouped.set(pos, [])
    }
    grouped.get(pos)!.push(inv)
  }

  return Array.from(grouped.entries()).map(([pos, invs]) => ({
    pos,
    inv: invs.map((inv: any) => ({
      inum: inv.invoiceNumber,
      idt: inv.invoiceDate,
      val: toNum(inv.invoiceValue),
      itms: [{ num: 1, itm_det: buildItemDetail(inv) }],
    })),
  }))
}

function buildB2CSSection(invoices: any[], clientStateCode: string): B2CSEntry[] {
  // Aggregate by (supply_type: INTRA/INTER, pos, tax_rate)
  const aggregated = new Map<string, B2CSEntry>()

  for (const inv of invoices) {
    const pos = inv.placeOfSupply || clientStateCode
    const supplyType = pos === clientStateCode ? 'INTRA' : 'INTER'
    const rt = toNum(inv.taxRate)
    const key = `${supplyType}_${pos}_${rt}`

    if (!aggregated.has(key)) {
      aggregated.set(key, {
        sply_ty: supplyType,
        pos,
        rt,
        txval: 0,
        iamt: 0,
        camt: 0,
        samt: 0,
        csamt: 0,
      })
    }

    const entry = aggregated.get(key)!
    entry.txval += toNum(inv.taxableValue)
    entry.iamt += toNum(inv.igstAmount)
    entry.camt += toNum(inv.cgstAmount)
    entry.samt += toNum(inv.sgstAmount)
    entry.csamt += toNum(inv.cessAmount)
  }

  // Round values
  return Array.from(aggregated.values()).map((entry) => ({
    ...entry,
    txval: Math.round(entry.txval * 100) / 100,
    iamt: Math.round(entry.iamt * 100) / 100,
    camt: Math.round(entry.camt * 100) / 100,
    samt: Math.round(entry.samt * 100) / 100,
    csamt: Math.round(entry.csamt * 100) / 100,
  }))
}

function buildCDNRSection(invoices: any[]): CDNREntry[] {
  // Group by buyer GSTIN
  const grouped = new Map<string, any[]>()
  for (const inv of invoices) {
    const gstin = inv.buyerGstin as string
    if (!gstin) continue
    if (!grouped.has(gstin)) {
      grouped.set(gstin, [])
    }
    grouped.get(gstin)!.push(inv)
  }

  return Array.from(grouped.entries()).map(([ctin, invs]) => ({
    ctin,
    nt: invs.map((inv: any) => ({
      nt_num: inv.invoiceNumber,
      nt_dt: inv.invoiceDate,
      ntty: inv.noteType === 'CREDIT' ? 'C' : 'D',
      val: toNum(inv.invoiceValue),
      pos: inv.placeOfSupply || '',
      rchrg: inv.reverseCharge ? 'Y' : 'N',
      itms: [{ num: 1, itm_det: buildItemDetail(inv) }],
    })),
  }))
}

function buildEXPSection(invoices: any[]): EXPEntry[] {
  // Group by export type
  const grouped = new Map<string, any[]>()
  for (const inv of invoices) {
    const expType = inv.exportType || 'WPAY'
    if (!grouped.has(expType)) {
      grouped.set(expType, [])
    }
    grouped.get(expType)!.push(inv)
  }

  return Array.from(grouped.entries()).map(([expType, invs]) => ({
    exp_typ: expType,
    inv: invs.map((inv: any) => ({
      exp_typ: expType,
      inum: inv.invoiceNumber,
      idt: inv.invoiceDate,
      val: toNum(inv.invoiceValue),
      itms: [
        {
          txval: toNum(inv.taxableValue),
          rt: toNum(inv.taxRate),
          iamt: toNum(inv.igstAmount),
          csamt: toNum(inv.cessAmount),
        },
      ],
    })),
  }))
}

function buildHSNSection(invoices: any[]): HSNEntry[] {
  // Aggregate by HSN code
  const aggregated = new Map<string, HSNEntry>()

  for (const inv of invoices) {
    const hsn = inv.hsnCode || 'NA'
    if (!aggregated.has(hsn)) {
      aggregated.set(hsn, {
        hsn_sc: hsn,
        desc: inv.description || '',
        uqc: 'NOS',
        qty: 0,
        txval: 0,
        iamt: 0,
        camt: 0,
        samt: 0,
        csamt: 0,
      })
    }

    const entry = aggregated.get(hsn)!
    entry.qty += 1
    entry.txval += toNum(inv.taxableValue)
    entry.iamt += toNum(inv.igstAmount)
    entry.camt += toNum(inv.cgstAmount)
    entry.samt += toNum(inv.sgstAmount)
    entry.csamt += toNum(inv.cessAmount)
  }

  // Round values
  return Array.from(aggregated.values()).map((entry) => ({
    ...entry,
    txval: Math.round(entry.txval * 100) / 100,
    iamt: Math.round(entry.iamt * 100) / 100,
    camt: Math.round(entry.camt * 100) / 100,
    samt: Math.round(entry.samt * 100) / 100,
    csamt: Math.round(entry.csamt * 100) / 100,
  }))
}

export async function generateGSTR1(
  clientId: string,
  month: number,
  year: number,
  tenantId: string
): Promise<{ json: GSTR1Json; metadata: GSTR1Metadata; fileName: string }> {
  // Fetch client
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
  })

  if (!client) {
    throw new Error('Client not found')
  }

  // Fetch validated invoices for this period
  const invoices = await prisma.invoiceData.findMany({
    where: {
      clientId,
      month,
      year,
      validationStatus: 'VALID',
      client: { tenantId },
    },
  })

  // Classify and group invoices by transaction type
  const b2bInvoices: any[] = []
  const b2clInvoices: any[] = []
  const b2csInvoices: any[] = []
  const cdnrInvoices: any[] = []
  const expInvoices: any[] = []

  for (const inv of invoices) {
    const txType = classifyTransaction(inv)
    switch (txType) {
      case 'B2B':
        b2bInvoices.push(inv)
        break
      case 'B2CL':
        b2clInvoices.push(inv)
        break
      case 'B2CS':
        b2csInvoices.push(inv)
        break
      case 'CDNR':
        cdnrInvoices.push(inv)
        break
      case 'EXP':
        expInvoices.push(inv)
        break
    }
  }

  const clientStateCode = client.stateCode || '24'

  // Build each section
  const b2b = buildB2BSection(b2bInvoices)
  const b2cl = buildB2CLSection(b2clInvoices)
  const b2cs = buildB2CSSection(b2csInvoices, clientStateCode)
  const cdnr = buildCDNRSection(cdnrInvoices)
  const exp = buildEXPSection(expInvoices)
  const hsnData = buildHSNSection(invoices)

  // Build filing period in MMYYYY format
  const fp = `${String(month).padStart(2, '0')}${year}`

  const json: GSTR1Json = {
    gstin: client.gstin,
    fp,
    b2b,
    b2cl,
    b2cs,
    cdnr,
    exp,
    hsn: { data: hsnData },
  }

  // Calculate metadata
  let totalTaxableValue = 0
  let totalTax = 0
  for (const inv of invoices) {
    totalTaxableValue += toNum(inv.taxableValue)
    totalTax +=
      toNum(inv.igstAmount) +
      toNum(inv.cgstAmount) +
      toNum(inv.sgstAmount) +
      toNum(inv.cessAmount)
  }

  const metadata: GSTR1Metadata = {
    totalInvoices: invoices.length,
    totalTaxableValue: Math.round(totalTaxableValue * 100) / 100,
    totalTax: Math.round(totalTax * 100) / 100,
    sections: {
      b2b: b2bInvoices.length,
      b2cl: b2clInvoices.length,
      b2cs: b2csInvoices.length,
      cdnr: cdnrInvoices.length,
      exp: expInvoices.length,
      hsn: hsnData.length,
    },
  }

  // File naming convention: {GSTIN}_{MMYYYY}_GSTR1.json
  const fileName = `${client.gstin}_${fp}_GSTR1.json`

  return { json, metadata, fileName }
}
