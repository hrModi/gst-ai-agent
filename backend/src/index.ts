import dotenv from 'dotenv'
import path from 'path'

// Load environment-specific .env file, then fall back to .env
const env = process.env.NODE_ENV || 'development'
const root = path.resolve(__dirname, '../..')
dotenv.config({ path: path.resolve(root, `.env.${env}`), override: true })
dotenv.config({ path: path.resolve(root, '.env') })

import express from 'express'
import cors from 'cors'
import { errorHandler } from './middleware/error'

import authRoutes from './routes/auth'
import clientRoutes from './routes/clients'
import invoiceRoutes from './routes/invoices'
import jsonGenerateRoutes from './routes/json-generate'
import filingStatusRoutes from './routes/filing-status'
import filedReturnRoutes from './routes/filed-returns'
import dashboardRoutes from './routes/dashboard'
import reminderRoutes from './routes/reminders'
import documentRoutes from './routes/documents'
import userRoutes from './routes/users'
import auditLogRoutes from './routes/audit-logs'

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/clients', clientRoutes)
app.use('/api/invoices', invoiceRoutes)
app.use('/api/json-generate', jsonGenerateRoutes)
app.use('/api/filing-status', filingStatusRoutes)
app.use('/api/filed-returns', filedReturnRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/reminders', reminderRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/users', userRoutes)
app.use('/api/audit-logs', auditLogRoutes)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Error handling
app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
})

export default app
