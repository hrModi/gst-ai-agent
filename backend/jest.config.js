/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/*.test.ts',
  ],
  moduleNameMapper: {
    // Redirect all Prisma client imports to the mock
    '^.*/lib/prisma$': '<rootDir>/src/__mocks__/prisma.ts',
    // Email: matches both '../../services/email' (routes) and '../email' (jobs/)
    '(services/|\\.\\./+)email$': '<rootDir>/src/__mocks__/email.ts',
    // WhatsApp: same pattern
    '(services/|\\.\\./+)whatsapp$': '<rootDir>/src/__mocks__/whatsapp.ts',
    '^.*/services/storage$': '<rootDir>/src/__mocks__/storage.ts',
    '^.*/services/scheduler$': '<rootDir>/src/__mocks__/scheduler.ts',
  },
  setupFiles: ['<rootDir>/src/__tests__/setup.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          strict: false,
          esModuleInterop: true,
        },
      },
    ],
  },
  clearMocks: true,
  transformIgnorePatterns: ['node_modules'],
  testTimeout: 60000,
}
