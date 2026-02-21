// Mock data factories for tests

export function mockTenant(overrides: Record<string, any> = {}) {
  return {
    id: 'tenant-abc',
    name: 'ABC CA & Associates',
    domain: null,
    settings: {},
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

export function mockUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-admin',
    tenantId: 'tenant-abc',
    email: 'admin@test.com',
    name: 'Admin User',
    role: 'ADMIN',
    phone: '+911234567890',
    isActive: true,
    passwordHash: '$2a$10$hashedpassword',
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

export function mockConsultant(overrides: Record<string, any> = {}) {
  return mockUser({
    id: 'user-consultant',
    email: 'consultant@test.com',
    name: 'Consultant User',
    role: 'CONSULTANT',
    ...overrides,
  })
}

export function mockClient(overrides: Record<string, any> = {}) {
  return {
    id: 'client-001',
    tenantId: 'tenant-abc',
    assignedTo: null,
    gstin: '27AABCU9603R1ZX',
    legalName: 'Test Company Pvt Ltd',
    tradeName: 'Test Company',
    contactPerson: 'John Doe',
    email: 'client@test.com',
    phone: '+919876543210',
    address: 'Mumbai, Maharashtra',
    stateCode: '27',
    filingFrequency: 'MONTHLY',
    status: 'ACTIVE',
    automationEnabled: true,
    notifyEmail: true,
    notifyWhatsapp: false,
    gstr1DueDay: 11,
    gstr3bDueDay: 20,
    reminderDaysBefore: [7, 3, 1],
    dataEmailSubject: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    assignedUser: null,
    filingStatus: [],
    filedReturns: [],
    ...overrides,
  }
}

export function mockFilingStatus(overrides: Record<string, any> = {}) {
  return {
    id: 'fs-001',
    clientId: 'client-001',
    month: 1,
    year: 2026,
    stage: 'NOT_STARTED',
    gstr1Status: 'NOT_STARTED',
    gstr3bStatus: 'NOT_STARTED',
    dataReceived: false,
    jsonGenerated: false,
    jsonFilePath: null,
    notes: null,
    stageUpdatedAt: new Date('2026-01-01'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}

export function mockFiledReturn(overrides: Record<string, any> = {}) {
  return {
    id: 'fr-001',
    clientId: 'client-001',
    returnType: 'GSTR1',
    month: 1,
    year: 2026,
    arn: 'AA123456789012Z',
    filingDate: new Date('2026-01-11'),
    acknowledgmentUrl: null,
    createdAt: new Date('2026-01-11'),
    updatedAt: new Date('2026-01-11'),
    ...overrides,
  }
}

export function mockReminder(overrides: Record<string, any> = {}) {
  return {
    id: 'rem-001',
    clientId: 'client-001',
    reminderType: 'SALES_DATA_COLLECTION',
    channel: 'EMAIL',
    message: 'Please submit your GST data for January 2026.',
    status: 'SENT',
    scheduledAt: null,
    sentAt: new Date('2026-01-04'),
    month: 1,
    year: 2026,
    isAuto: false,
    createdAt: new Date('2026-01-04'),
    ...overrides,
  }
}

export function mockInvoice(overrides: Record<string, any> = {}) {
  return {
    id: 'inv-001',
    clientId: 'client-001',
    month: 1,
    year: 2026,
    invoiceNumber: 'INV-001',
    invoiceDate: '05-01-2026',
    buyerGstin: '27AABCU9603R1ZX',
    buyerName: 'Buyer Co',
    placeOfSupply: '27',
    reverseCharge: false,
    invoiceValue: 11800,
    taxableValue: 10000,
    taxRate: 18,
    igstAmount: 0,
    cgstAmount: 900,
    sgstAmount: 900,
    cessAmount: 0,
    hsnCode: '9983',
    description: 'Services',
    transactionType: 'B2B',
    noteType: null,
    originalInvoice: null,
    exportType: null,
    validationStatus: 'VALID',
    rowNumber: 1,
    createdAt: new Date('2026-01-05'),
    updatedAt: new Date('2026-01-05'),
    ...overrides,
  }
}

export function mockAuditLog(overrides: Record<string, any> = {}) {
  return {
    id: 'al-001',
    userId: 'user-admin',
    tenantId: 'tenant-abc',
    action: 'CREATE',
    entityType: 'CLIENT',
    entityId: 'client-001',
    oldValue: null,
    newValue: {},
    ipAddress: '127.0.0.1',
    createdAt: new Date('2026-01-01'),
    ...overrides,
  }
}

export function mockReminderTemplate(overrides: Record<string, any> = {}) {
  return {
    id: 'rt-001',
    tenantId: 'tenant-abc',
    reminderType: 'SALES_DATA_COLLECTION',
    channel: 'EMAIL',
    subject: 'GST Data Required - {month} {year}',
    body: 'Dear {clientName}, please submit your sales data for {month} {year}.',
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }
}
