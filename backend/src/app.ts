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
import sheetSyncRoutes from './routes/sheet-sync'
import agentActivityRoutes from './routes/agent-activity'
import systemSettingsRoutes from './routes/system-settings'
import reminderTemplateRoutes from './routes/reminder-templates'
import inboxRoutes from './routes/inbox'

const app = express()

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
app.use('/api/sheet-sync', sheetSyncRoutes)
app.use('/api/agent-activity', agentActivityRoutes)
app.use('/api/system-settings', systemSettingsRoutes)
app.use('/api/reminder-templates', reminderTemplateRoutes)
app.use('/api/inbox', inboxRoutes)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Error handling
app.use(errorHandler)

export default app
