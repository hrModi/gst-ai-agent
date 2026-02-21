// Set required environment variables before any test runs
process.env.JWT_SECRET = 'test-secret-key-minimum-32-chars-long-ok'
process.env.JWT_EXPIRY = '24h'
process.env.NODE_ENV = 'test'
process.env.FRONTEND_URL = 'http://localhost:5173'
process.env.PORT = '5001'
