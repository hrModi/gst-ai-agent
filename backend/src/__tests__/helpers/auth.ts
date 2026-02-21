import jwt from 'jsonwebtoken'

const TEST_SECRET = process.env.JWT_SECRET || 'test-secret-key-minimum-32-chars-long-ok'

export function createAdminToken(tenantId = 'tenant-abc', userId = 'user-admin') {
  return jwt.sign(
    { id: userId, tenantId, email: 'admin@test.com', role: 'ADMIN', name: 'Admin User' },
    TEST_SECRET,
    { expiresIn: '24h' }
  )
}

export function createConsultantToken(tenantId = 'tenant-abc', userId = 'user-consultant') {
  return jwt.sign(
    { id: userId, tenantId, email: 'consultant@test.com', role: 'CONSULTANT', name: 'Consultant User' },
    TEST_SECRET,
    { expiresIn: '24h' }
  )
}

export function createExpiredToken(tenantId = 'tenant-abc') {
  return jwt.sign(
    { id: 'user-admin', tenantId, email: 'admin@test.com', role: 'ADMIN' },
    TEST_SECRET,
    { expiresIn: '-1s' } // already expired
  )
}

export function createTokenForTenant(tenantId: string, userId = 'user-admin', role = 'ADMIN') {
  return jwt.sign(
    { id: userId, tenantId, email: 'admin@tenant.com', role, name: 'Admin' },
    TEST_SECRET,
    { expiresIn: '24h' }
  )
}
