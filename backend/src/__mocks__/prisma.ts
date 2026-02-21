import { PrismaClient } from '@prisma/client'
import { mockDeep, DeepMockProxy } from 'jest-mock-extended'

// Single shared mock instance — both route files (via moduleNameMapper) and
// test files (via direct import) see the same object, so test setup sticks.
const prismaMock = mockDeep<PrismaClient>()

export const prisma: DeepMockProxy<PrismaClient> = prismaMock
export { prismaMock }
export default prismaMock
