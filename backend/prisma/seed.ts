import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Create tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: 'ABC CA & Associates',
      domain: 'abcca.com',
      settings: {
        filingDeadlines: { gstr1: 11, gstr3b: 20 },
        reminderDaysBefore: [7, 3, 1],
        defaultCurrency: 'INR',
      },
    },
  })

  console.log('Created tenant:', tenant.name)

  // Create users
  const defaultPassword = await hash('Password@123', 10)

  const hriday = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: 'hriday@abcca.com',
      passwordHash: defaultPassword,
      name: 'Hriday',
      role: 'ADMIN',
      phone: '+919876543200',
    },
  })

  const [vidhi, hetal, shivani, jigar, raj] = await Promise.all([
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'vidhi@abcca.com',
        passwordHash: defaultPassword,
        name: 'Vidhi',
        role: 'CONSULTANT',
        phone: '+919876543201',
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'hetal@abcca.com',
        passwordHash: defaultPassword,
        name: 'Hetal',
        role: 'CONSULTANT',
        phone: '+919876543202',
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'shivani@abcca.com',
        passwordHash: defaultPassword,
        name: 'Shivani',
        role: 'CONSULTANT',
        phone: '+919876543203',
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'jigar@abcca.com',
        passwordHash: defaultPassword,
        name: 'Jigar',
        role: 'CONSULTANT',
        phone: '+919876543204',
      },
    }),
    prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'raj@abcca.com',
        passwordHash: defaultPassword,
        name: 'Raj',
        role: 'CONSULTANT',
        phone: '+919876543205',
      },
    }),
  ])

  console.log('Created 6 users')

  // Create 5 sample clients matching the prototype
  const client1 = await prisma.client.create({
    data: {
      tenantId: tenant.id,
      assignedTo: vidhi.id,
      gstin: '24BIEPK3642M1Z6',
      legalName: 'ISHAK ABDULKARIM KHATANI',
      tradeName: 'Ishak Trading',
      contactPerson: 'Ishak Khatani',
      email: 'ishak@example.com',
      phone: '+919876543210',
      stateCode: '24',
      filingFrequency: 'MONTHLY',
      status: 'ACTIVE',
    },
  })

  const client2 = await prisma.client.create({
    data: {
      tenantId: tenant.id,
      assignedTo: vidhi.id,
      gstin: '24AGVPS9193D1ZO',
      legalName: 'SHAH KANTILAL AMRUTLAL & SONS',
      tradeName: 'Shah & Sons',
      contactPerson: 'Kantilal Shah',
      email: 'shah@example.com',
      phone: '+919876543211',
      stateCode: '24',
      filingFrequency: 'MONTHLY',
      status: 'ACTIVE',
    },
  })

  const client3 = await prisma.client.create({
    data: {
      tenantId: tenant.id,
      assignedTo: hetal.id,
      gstin: '24ADXPP1431G1ZG',
      legalName: 'FABRIC VILLE',
      tradeName: 'Fabric Ville',
      contactPerson: 'Patel',
      email: 'fabric@example.com',
      phone: '+919876543212',
      stateCode: '24',
      filingFrequency: 'MONTHLY',
      status: 'ACTIVE',
    },
  })

  const client4 = await prisma.client.create({
    data: {
      tenantId: tenant.id,
      assignedTo: shivani.id,
      gstin: '24AABCT1234E1Z5',
      legalName: 'TEXTILE HUB INDIA PVT LTD',
      tradeName: 'Textile Hub',
      contactPerson: 'Rahul Patel',
      email: 'textile@example.com',
      phone: '+919876543213',
      stateCode: '24',
      filingFrequency: 'MONTHLY',
      status: 'ACTIVE',
    },
  })

  const client5 = await prisma.client.create({
    data: {
      tenantId: tenant.id,
      assignedTo: jigar.id,
      gstin: '24AXYZT5678E1Z5',
      legalName: 'PATEL EXPORTS',
      tradeName: 'Patel Exports',
      contactPerson: 'Suresh Patel',
      email: 'patel@example.com',
      phone: '+919876543214',
      stateCode: '24',
      filingFrequency: 'MONTHLY',
      status: 'ACTIVE',
    },
  })

  console.log('Created 5 sample clients')

  // Create filing status for Feb 2026
  await Promise.all([
    // Client 1: Nil Return
    prisma.filingStatus.create({
      data: {
        clientId: client1.id,
        month: 2,
        year: 2026,
        gstr1Status: 'NIL_RETURN',
        gstr3bStatus: 'NOT_STARTED',
        dataReceived: false,
        jsonGenerated: false,
      },
    }),
    // Client 2: JSON Generated
    prisma.filingStatus.create({
      data: {
        clientId: client2.id,
        month: 2,
        year: 2026,
        gstr1Status: 'JSON_GENERATED',
        gstr3bStatus: 'NOT_STARTED',
        dataReceived: true,
        jsonGenerated: true,
      },
    }),
    // Client 3: Validation Errors
    prisma.filingStatus.create({
      data: {
        clientId: client3.id,
        month: 2,
        year: 2026,
        gstr1Status: 'VALIDATION_ERRORS',
        gstr3bStatus: 'NOT_STARTED',
        dataReceived: true,
        jsonGenerated: false,
      },
    }),
    // Client 4: Data Received
    prisma.filingStatus.create({
      data: {
        clientId: client4.id,
        month: 2,
        year: 2026,
        gstr1Status: 'DATA_RECEIVED',
        gstr3bStatus: 'NOT_STARTED',
        dataReceived: true,
        jsonGenerated: false,
      },
    }),
    // Client 5: Not Started
    prisma.filingStatus.create({
      data: {
        clientId: client5.id,
        month: 2,
        year: 2026,
        gstr1Status: 'NOT_STARTED',
        gstr3bStatus: 'NOT_STARTED',
        dataReceived: false,
        jsonGenerated: false,
      },
    }),
  ])

  // Create filed returns for Jan 2026 (historical data)
  await Promise.all([
    prisma.filedReturn.create({
      data: {
        clientId: client1.id,
        returnType: 'GSTR1',
        month: 1,
        year: 2026,
        arn: 'AA2401261234567',
        filingDate: new Date('2026-01-11'),
      },
    }),
    prisma.filedReturn.create({
      data: {
        clientId: client2.id,
        returnType: 'GSTR1',
        month: 1,
        year: 2026,
        arn: 'AA2401261234570',
        filingDate: new Date('2026-01-11'),
      },
    }),
  ])

  console.log('Created filing statuses and filed returns')

  // Create sample invoice data for client 2 (Shah & Sons - validated)
  const invoices = [
    {
      clientId: client2.id,
      month: 2,
      year: 2026,
      invoiceNumber: 'INV-2601',
      invoiceDate: '05-02-2026',
      buyerGstin: '24AABCT1234E1Z5',
      buyerName: 'Textile Hub India Pvt Ltd',
      placeOfSupply: '24',
      invoiceValue: 59000,
      taxableValue: 50000,
      taxRate: 18,
      cgstAmount: 4500,
      sgstAmount: 4500,
      hsnCode: '61051000',
      description: "Men's shirts",
      transactionType: 'B2B' as const,
      validationStatus: 'VALID' as const,
      rowNumber: 1,
    },
    {
      clientId: client2.id,
      month: 2,
      year: 2026,
      invoiceNumber: 'INV-2602',
      invoiceDate: '07-02-2026',
      buyerGstin: '24AXYZT5678E1Z5',
      buyerName: 'Patel Exports',
      placeOfSupply: '24',
      invoiceValue: 88500,
      taxableValue: 75000,
      taxRate: 18,
      cgstAmount: 6750,
      sgstAmount: 6750,
      hsnCode: '61051000',
      description: "Men's shirts",
      transactionType: 'B2B' as const,
      validationStatus: 'VALID' as const,
      rowNumber: 2,
    },
    {
      clientId: client2.id,
      month: 2,
      year: 2026,
      invoiceNumber: 'INV-2603',
      invoiceDate: '10-02-2026',
      buyerGstin: null,
      buyerName: 'Walk-in Customer',
      placeOfSupply: '24',
      invoiceValue: 23600,
      taxableValue: 20000,
      taxRate: 18,
      cgstAmount: 1800,
      sgstAmount: 1800,
      hsnCode: '61051000',
      description: "Men's shirts",
      transactionType: 'B2CS' as const,
      validationStatus: 'VALID' as const,
      rowNumber: 3,
    },
  ]

  for (const inv of invoices) {
    await prisma.invoiceData.create({ data: inv })
  }

  // Create sample invoice data for client 3 (Fabric Ville - has errors)
  const errorInv1 = await prisma.invoiceData.create({
    data: {
      clientId: client3.id,
      month: 2,
      year: 2026,
      invoiceNumber: 'INV-2605',
      invoiceDate: '06-02-2026',
      buyerGstin: '24AABCT1234E1Z5',
      buyerName: 'Textile Hub',
      placeOfSupply: '24',
      invoiceValue: 35400,
      taxableValue: 30000,
      taxRate: 18,
      cgstAmount: 2700,
      sgstAmount: 2700,
      hsnCode: '52081300',
      description: 'Cotton fabric',
      transactionType: 'B2B',
      validationStatus: 'INVALID',
      rowNumber: 12,
    },
  })

  const errorInv2 = await prisma.invoiceData.create({
    data: {
      clientId: client3.id,
      month: 2,
      year: 2026,
      invoiceNumber: 'INV-2618',
      invoiceDate: '08-02-2026',
      buyerGstin: '24ADXPP1431G1Z',
      buyerName: 'Unknown',
      placeOfSupply: '24',
      invoiceValue: 53100,
      taxableValue: 45000,
      taxRate: 18,
      cgstAmount: 4050,
      sgstAmount: 4050,
      hsnCode: '52081300',
      description: 'Cotton fabric',
      transactionType: 'B2B',
      validationStatus: 'INVALID',
      rowNumber: 25,
    },
  })

  const errorInv3 = await prisma.invoiceData.create({
    data: {
      clientId: client3.id,
      month: 2,
      year: 2026,
      invoiceNumber: 'INV-2605',
      invoiceDate: '07-02-2026',
      buyerGstin: '24AXYZT5678E1Z5',
      buyerName: 'Patel Exports',
      placeOfSupply: '24',
      invoiceValue: 29500,
      taxableValue: 25000,
      taxRate: 18,
      cgstAmount: 2250,
      sgstAmount: 2250,
      hsnCode: '52081300',
      description: 'Cotton fabric',
      transactionType: 'B2B',
      validationStatus: 'INVALID',
      rowNumber: 28,
    },
  })

  // Create validation errors
  await Promise.all([
    prisma.validationError.create({
      data: {
        invoiceDataId: errorInv1.id,
        errorType: 'duplicate_invoice',
        fieldName: 'invoice_number',
        errorMessage: 'Invoice number "INV-2605" already exists for this period (also in row 28)',
        severity: 'ERROR',
      },
    }),
    prisma.validationError.create({
      data: {
        invoiceDataId: errorInv2.id,
        errorType: 'gstin_format',
        fieldName: 'buyer_gstin',
        errorMessage: 'GSTIN "24ADXPP1431G1Z" does not match required 15-character format',
        severity: 'ERROR',
      },
    }),
    prisma.validationError.create({
      data: {
        invoiceDataId: errorInv3.id,
        errorType: 'duplicate_invoice',
        fieldName: 'invoice_number',
        errorMessage: 'Invoice number "INV-2605" already exists for this period (also in row 12)',
        severity: 'ERROR',
      },
    }),
  ])

  console.log('Created sample invoices and validation errors')

  // Create system settings
  await Promise.all([
    prisma.systemSetting.create({
      data: {
        tenantId: tenant.id,
        settingKey: 'reminder_email_template_initial',
        settingValue: JSON.stringify({
          subject: 'GST Filing Reminder - {{month}} {{year}}',
          body: 'Dear {{clientName}},\n\nThis is a reminder to submit your sales data for {{month}} {{year}}.\n\nDeadline: {{deadline}}\n\nPlease upload your data at your earliest convenience.\n\nRegards,\nABC CA & Associates',
        }),
      },
    }),
    prisma.systemSetting.create({
      data: {
        tenantId: tenant.id,
        settingKey: 'gstr1_deadline_day',
        settingValue: '11',
      },
    }),
    prisma.systemSetting.create({
      data: {
        tenantId: tenant.id,
        settingKey: 'gstr3b_deadline_day',
        settingValue: '20',
      },
    }),
  ])

  console.log('Created system settings')
  console.log('Seed completed successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
