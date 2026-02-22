import { Decimal } from '@prisma/client/runtime/library'
import { prisma } from '../../lib/prisma'

function toNumber(val: Decimal | number): number {
  if (typeof val === 'number') return val
  return Number(val.toString())
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export interface Gstr3bResult {
  json: object
  fileName: string
  summary: {
    outwardTaxableValue: number
    outwardIgst: number
    outwardCgst: number
    outwardSgst: number
    itcIgst: number
    itcCgst: number
    itcSgst: number
    netIgst: number
    netCgst: number
    netSgst: number
    classification: string
  }
}

/**
 * Generate GSTR-3B summary for a client/month/year.
 * Output tax from VALID InvoiceData (GSTR-1).
 * ITC from MATCHED Gstr2bEntry rows only.
 * Net = output − ITC.
 * Classification: NIL | PAYMENT | CREDIT
 */
export async function generateGSTR3B(
  clientId: string,
  month: number,
  year: number,
  tenantId: string
): Promise<Gstr3bResult> {
  // 1. Get client GSTIN
  const client = await prisma.client.findFirst({
    where: { id: clientId, tenantId },
    select: { gstin: true, legalName: true },
  })
  if (!client) throw new Error('Client not found')

  // 2. Sum output tax from VALID invoice data (GSTR-1)
  const invoiceAgg = await prisma.invoiceData.aggregate({
    where: {
      clientId,
      month,
      year,
      validationStatus: 'VALID',
      client: { tenantId },
    },
    _sum: {
      taxableValue: true,
      igstAmount: true,
      cgstAmount: true,
      sgstAmount: true,
    },
  })

  const outwardTaxableValue = round2(toNumber(invoiceAgg._sum.taxableValue ?? 0))
  const outwardIgst = round2(toNumber(invoiceAgg._sum.igstAmount ?? 0))
  const outwardCgst = round2(toNumber(invoiceAgg._sum.cgstAmount ?? 0))
  const outwardSgst = round2(toNumber(invoiceAgg._sum.sgstAmount ?? 0))

  // 3. Sum ITC from MATCHED Gstr2bEntry rows only
  const itcAgg = await prisma.gstr2bEntry.aggregate({
    where: {
      clientId,
      month,
      year,
      matchStatus: 'MATCHED',
      client: { tenantId },
    },
    _sum: {
      igstAmount: true,
      cgstAmount: true,
      sgstAmount: true,
    },
  })

  const itcIgst = round2(toNumber(itcAgg._sum.igstAmount ?? 0))
  const itcCgst = round2(toNumber(itcAgg._sum.cgstAmount ?? 0))
  const itcSgst = round2(toNumber(itcAgg._sum.sgstAmount ?? 0))

  // 4. Net payable = output − ITC (can be negative)
  const netIgst = round2(outwardIgst - itcIgst)
  const netCgst = round2(outwardCgst - itcCgst)
  const netSgst = round2(outwardSgst - itcSgst)

  // 5. Classify
  let classification: string
  if (outwardTaxableValue === 0 && outwardIgst === 0 && outwardCgst === 0 && outwardSgst === 0) {
    classification = 'NIL'
  } else if (netIgst > 0 || netCgst > 0 || netSgst > 0) {
    classification = 'PAYMENT'
  } else {
    classification = 'CREDIT'
  }

  // 6. Build GSTR-3B JSON (portal-compatible structure)
  const monthStr = String(month).padStart(2, '0')
  const json = {
    gstin: client.gstin,
    fp: `${monthStr}${year}`,
    version: 'GST3.2.0',
    hash: 'hash',
    ret_period: `${monthStr}${year}`,
    sup_details: {
      osup_det: {
        txval: outwardTaxableValue,
        iamt: outwardIgst,
        camt: outwardCgst,
        samt: outwardSgst,
        csamt: 0,
      },
    },
    itc_elg: {
      itc_avl: [
        {
          ty: 'IMPG',
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
        },
        {
          ty: 'IMPS',
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
        },
        {
          ty: 'ISRC',
          iamt: itcIgst,
          camt: itcCgst,
          samt: itcSgst,
          csamt: 0,
        },
        {
          ty: 'ISD',
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
        },
        {
          ty: 'OTH',
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
        },
      ],
      itc_net: {
        iamt: itcIgst,
        camt: itcCgst,
        samt: itcSgst,
        csamt: 0,
      },
      itc_inelg: [
        {
          ty: 'RUL',
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
        },
        {
          ty: 'OTH',
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
        },
      ],
    },
    inward_sup: {
      isup_details: [
        {
          ty: 'GST',
          inter: 0,
          intra: 0,
        },
        {
          ty: 'NONGST',
          inter: 0,
          intra: 0,
        },
      ],
    },
    intr_ltfee: {
      intr_details: {
        iamt: 0,
        camt: 0,
        samt: 0,
        csamt: 0,
      },
    },
  }

  // 7. Upsert Gstr3bSummary
  await prisma.gstr3bSummary.upsert({
    where: { clientId_month_year: { clientId, month, year } },
    update: {
      outwardTaxableValue,
      outwardIgst,
      outwardCgst,
      outwardSgst,
      itcIgst,
      itcCgst,
      itcSgst,
      netIgst,
      netCgst,
      netSgst,
      classification,
      jsonGenerated: true,
    },
    create: {
      clientId,
      month,
      year,
      outwardTaxableValue,
      outwardIgst,
      outwardCgst,
      outwardSgst,
      itcIgst,
      itcCgst,
      itcSgst,
      netIgst,
      netCgst,
      netSgst,
      classification,
      jsonGenerated: true,
    },
  })

  // 8. Update FilingStatus.gstr3bStatus
  await prisma.filingStatus.upsert({
    where: { clientId_month_year: { clientId, month, year } },
    update: { gstr3bStatus: 'JSON_GENERATED', stageUpdatedAt: new Date() },
    create: {
      clientId,
      month,
      year,
      gstr3bStatus: 'JSON_GENERATED',
      stageUpdatedAt: new Date(),
    },
  })

  const fileName = `${client.gstin}_${monthStr}${year}_GSTR3B.json`

  return {
    json,
    fileName,
    summary: {
      outwardTaxableValue,
      outwardIgst,
      outwardCgst,
      outwardSgst,
      itcIgst,
      itcCgst,
      itcSgst,
      netIgst,
      netCgst,
      netSgst,
      classification,
    },
  }
}
