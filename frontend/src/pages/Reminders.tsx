import { useState, useEffect } from 'react'
import api from '../lib/api'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useAuth } from '../contexts/AuthContext'

interface Client {
  id: string
  legalName: string
  tradeName: string | null
}

interface Reminder {
  id: string
  clientId: string
  reminderType: string
  channel: string
  message: string | null
  status: string
  sentAt: string | null
  month: number | null
  year: number | null
  isAuto: boolean
  createdAt: string
  client?: { legalName: string; tradeName: string | null }
}

interface ScheduleEvent {
  clientId: string
  clientName: string
  tradeName: string | null
  reminderType: string
  channels: string[]
  scheduledDate: string
  daysUntilDue: number
  gstr1DueDay: number
  currentStage: string
}

interface TemplateEntry {
  subject?: string
  body: string
  isCustom: boolean
}

type Templates = Record<string, Record<string, TemplateEntry>>

const REMINDER_TYPES = ['SALES_DATA_COLLECTION', 'PURCHASE_DATA_COLLECTION', 'SALES_FOLLOW_UP', 'PURCHASE_FOLLOW_UP', 'GSTR1_DEADLINE', 'GSTR3B_DEADLINE']

const REMINDER_TYPE_LABELS: Record<string, string> = {
  SALES_DATA_COLLECTION: 'Sales Data Collection',
  PURCHASE_DATA_COLLECTION: 'Purchase Data Collection',
  SALES_FOLLOW_UP: 'Sales Follow-Up',
  PURCHASE_FOLLOW_UP: 'Purchase Follow-Up',
  GSTR1_DEADLINE: 'GSTR-1 Deadline',
  GSTR3B_DEADLINE: 'GSTR-3B Deadline',
}
const CHANNELS = ['EMAIL', 'WHATSAPP', 'SMS']
const PLACEHOLDERS = ['{clientName}', '{month}', '{year}', '{dueDate}', '{consultantName}']

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    SENT: 'bg-green-100 text-green-800',
    DELIVERED: 'bg-blue-100 text-blue-800',
    PENDING: 'bg-yellow-100 text-yellow-800',
    FAILED: 'bg-red-100 text-red-800',
  }
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  )
}

// ---- Tab 1: Send Reminder ----
function SendTab({ clients }: { clients: Client[] }) {
  const [formClientId, setFormClientId] = useState('')
  const [formType, setFormType] = useState('SALES_DATA_COLLECTION')
  const [formChannel, setFormChannel] = useState('EMAIL')
  const [formMessage, setFormMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [templatePreview, setTemplatePreview] = useState<TemplateEntry | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    loadPreview()
  }, [formType, formChannel])

  async function loadPreview() {
    try {
      setPreviewLoading(true)
      const res = await api.get('/reminder-templates')
      const templates: Templates = res.data.data
      const t = templates?.[formType]?.[formChannel]
      setTemplatePreview(t || null)
    } catch {
      setTemplatePreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!formClientId) { setError('Please select a client'); return }
    try {
      setSending(true)
      setError('')
      setSuccess('')
      const now = new Date()
      await api.post('/reminders', {
        clientId: formClientId,
        reminderType: formType,
        channel: formChannel,
        message: formMessage || undefined,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
      })
      setSuccess('Reminder sent successfully')
      setFormClientId('')
      setFormMessage('')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send reminder')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}

      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Send Reminder</h2>
        <form onSubmit={handleSend} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <select value={formClientId} onChange={(e) => setFormClientId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="">Select client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.tradeName || c.legalName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select value={formType} onChange={(e) => setFormType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {REMINDER_TYPES.map((type) => (
                <option key={type} value={type}>{REMINDER_TYPE_LABELS[type]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
            <select value={formChannel} onChange={(e) => setFormChannel(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              <option value="EMAIL">Email</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="SMS">SMS</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Custom Message (optional)</label>
            <input type="text" value={formMessage} onChange={(e) => setFormMessage(e.target.value)}
              placeholder="Override template..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={sending}
              className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
              {sending ? 'Sending...' : 'Send Reminder'}
            </button>
          </div>
        </form>

        {/* Template preview */}
        <div className="mt-5 pt-5 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Template Preview</p>
          {previewLoading ? (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
          ) : templatePreview ? (
            <div className="bg-gray-50 rounded-lg p-4 text-sm">
              {templatePreview.subject && (
                <p className="text-gray-700 mb-1"><span className="font-medium">Subject:</span> {templatePreview.subject}</p>
              )}
              <p className="text-gray-600 whitespace-pre-line">{templatePreview.body}</p>
              {templatePreview.isCustom && (
                <p className="text-xs text-indigo-500 mt-2">Custom template</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No template configured — default message will be used.</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ---- Tab 2: Templates ----
function TemplatesTab() {
  const [templates, setTemplates] = useState<Templates>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [edits, setEdits] = useState<Record<string, Record<string, { subject: string; body: string }>>>({})
  const [activeChannels, setActiveChannels] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchTemplates()
  }, [])

  async function fetchTemplates() {
    try {
      setLoading(true)
      const res = await api.get('/reminder-templates')
      const data: Templates = res.data.data
      setTemplates(data)

      const initialEdits: typeof edits = {}
      const initialChannels: typeof activeChannels = {}
      for (const type of REMINDER_TYPES) {
        initialEdits[type] = {}
        initialChannels[type] = 'EMAIL'
        for (const ch of CHANNELS) {
          const t = data[type]?.[ch]
          initialEdits[type][ch] = { subject: t?.subject || '', body: t?.body || '' }
        }
      }
      setEdits(initialEdits)
      setActiveChannels(initialChannels)
    } catch {
      setError('Failed to load templates')
    } finally {
      setLoading(false)
    }
  }

  async function saveTemplate(type: string, channel: string) {
    const key = `${type}:${channel}`
    try {
      setSaving(key)
      setError('')
      await api.put(`/reminder-templates/${type}/${channel}`, {
        subject: edits[type]?.[channel]?.subject || undefined,
        body: edits[type]?.[channel]?.body,
      })
      setSuccess(`${REMINDER_TYPE_LABELS[type] || type.replace(/_/g, ' ')} / ${channel} template saved`)
      fetchTemplates()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save template')
    } finally {
      setSaving(null)
    }
  }

  function updateEdit(type: string, channel: string, field: 'subject' | 'body', value: string) {
    setEdits(prev => ({
      ...prev,
      [type]: { ...prev[type], [channel]: { ...prev[type]?.[channel], [field]: value } },
    }))
  }

  if (loading) {
    return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
  }

  return (
    <div className="space-y-5">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
      {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}

      <p className="text-sm text-gray-500">
        Customize message templates for each reminder type and channel.
        Supported placeholders:
        <span className="ml-1 space-x-1">
          {PLACEHOLDERS.map(p => (
            <code key={p} className="bg-gray-100 text-indigo-700 px-1.5 py-0.5 rounded text-xs font-mono">{p}</code>
          ))}
        </span>
      </p>

      {REMINDER_TYPES.map((type) => (
        <div key={type} className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-800">{REMINDER_TYPE_LABELS[type] || type.replace(/_/g, ' ')}</h3>
          </div>
          {/* Channel tabs */}
          <div className="border-b border-gray-200 px-6">
            <div className="flex gap-4">
              {CHANNELS.map((ch) => (
                <button
                  key={ch}
                  onClick={() => setActiveChannels(prev => ({ ...prev, [type]: ch }))}
                  className={`py-2.5 px-1 text-sm font-medium border-b-2 transition-colors ${
                    activeChannels[type] === ch
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
          {/* Editor */}
          {CHANNELS.map((ch) => (
            activeChannels[type] === ch && (
              <div key={ch} className="p-6 space-y-4">
                {ch === 'EMAIL' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject Line</label>
                    <input
                      type="text"
                      value={edits[type]?.[ch]?.subject || ''}
                      onChange={(e) => updateEdit(type, ch, 'subject', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message Body</label>
                  <textarea
                    rows={4}
                    value={edits[type]?.[ch]?.body || ''}
                    onChange={(e) => updateEdit(type, ch, 'body', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none font-mono"
                  />
                </div>
                <button
                  onClick={() => saveTemplate(type, ch)}
                  disabled={saving === `${type}:${ch}`}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {saving === `${type}:${ch}` ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            )
          ))}
        </div>
      ))}
    </div>
  )
}

// ---- Tab 3: Schedule ----
function ScheduleTab() {
  const [schedule, setSchedule] = useState<ScheduleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [meta, setMeta] = useState<{ month: number; year: number } | null>(null)

  useEffect(() => {
    fetchSchedule()
  }, [])

  async function fetchSchedule() {
    try {
      setLoading(true)
      const res = await api.get('/reminders/schedule')
      setSchedule(res.data.data || [])
      setMeta({ month: res.data.month, year: res.data.year })
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  const FULL_MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]

  return (
    <div className="space-y-4">
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Upcoming Automated Reminders
              {meta && <span className="ml-2 text-sm font-normal text-gray-500">— {FULL_MONTH_NAMES[meta.month - 1]} {meta.year}</span>}
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">Yaksh sends these automatically each day at 9 AM IST for clients with automation enabled</p>
          </div>
          <button onClick={fetchSchedule} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">Refresh</button>
        </div>

        {loading ? (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          </div>
        ) : schedule.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500 text-sm">No upcoming automated reminders scheduled for this month.</p>
            <p className="text-gray-400 text-xs mt-1">Reminders are sent for clients with automation enabled and data not yet received.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channels</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scheduled Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days Until Due</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Stage</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {schedule.map((event, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-900">
                    {event.tradeName || event.clientName}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {REMINDER_TYPE_LABELS[event.reminderType] || event.reminderType.replace(/_/g, ' ')}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    <div className="flex gap-1 flex-wrap">
                      {event.channels.map(ch => (
                        <span key={ch} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{ch}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                    {new Date(event.scheduledDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`font-medium ${event.daysUntilDue <= 3 ? 'text-red-600' : event.daysUntilDue <= 7 ? 'text-yellow-600' : 'text-green-600'}`}>
                      {event.daysUntilDue === 0 ? 'Today' : `${event.daysUntilDue}d`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {event.currentStage.replace(/_/g, ' ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ---- Tab 4: Logs ----
function LogsTab({ clients }: { clients: Client[] }) {
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filters
  const [filterClient, setFilterClient] = useState('')
  const [filterChannel, setFilterChannel] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterMonth, setFilterMonth] = useState('')
  const [filterYear, setFilterYear] = useState('')

  useEffect(() => {
    fetchReminders()
  }, [filterClient, filterChannel, filterStatus, filterMonth, filterYear])

  async function fetchReminders() {
    try {
      setLoading(true)
      const params: Record<string, string> = {}
      if (filterClient) params.clientId = filterClient
      if (filterChannel) params.channel = filterChannel
      if (filterStatus) params.status = filterStatus
      if (filterMonth) params.month = filterMonth
      if (filterYear) params.year = filterYear
      const res = await api.get('/reminders', { params })
      setReminders(res.data.data || [])
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }

  const currentYear = new Date().getFullYear()
  const years = [currentYear, currentYear - 1, currentYear - 2]

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="flex flex-wrap gap-3">
          <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="">All Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.tradeName || c.legalName}</option>)}
          </select>
          <select value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="">All Channels</option>
            <option value="EMAIL">Email</option>
            <option value="WHATSAPP">WhatsApp</option>
            <option value="SMS">SMS</option>
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="">All Statuses</option>
            <option value="SENT">Sent</option>
            <option value="DELIVERED">Delivered</option>
            <option value="FAILED">Failed</option>
            <option value="PENDING">Pending</option>
          </select>
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="">All Months</option>
            {MONTH_NAMES.map((m, i) => <option key={i + 1} value={String(i + 1)}>{m}</option>)}
          </select>
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none">
            <option value="">All Years</option>
            {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
          </select>
          {(filterClient || filterChannel || filterStatus || filterMonth || filterYear) && (
            <button onClick={() => {
              setFilterClient(''); setFilterChannel(''); setFilterStatus(''); setFilterMonth(''); setFilterYear('')
            }} className="text-sm text-gray-500 hover:text-gray-700 font-medium">
              Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-base font-semibold text-gray-900">Reminder History ({reminders.length})</h2>
        </div>
        {loading ? (
          <div className="p-6 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
          </div>
        ) : reminders.length === 0 ? (
          <div className="p-6 text-center text-gray-500 text-sm">No reminders found.</div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reminders.map((r) => (
                <>
                  <tr
                    key={r.id}
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {r.client?.tradeName || r.client?.legalName || r.clientId}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      <div className="flex items-center gap-1.5">
                        {REMINDER_TYPE_LABELS[r.reminderType] || r.reminderType.replace(/_/g, ' ')}
                        {r.isAuto && (
                          <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Auto</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.channel}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {r.month && r.year ? `${MONTH_NAMES[r.month - 1]} ${r.year}` : '-'}
                    </td>
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {r.sentAt ? new Date(r.sentAt).toLocaleString('en-IN') : '-'}
                    </td>
                  </tr>
                  {expandedId === r.id && (
                    <tr key={`${r.id}-expanded`} className="bg-indigo-50">
                      <td colSpan={6} className="px-4 py-3">
                        <p className="text-xs font-semibold text-gray-500 mb-1">Message Sent:</p>
                        <p className="text-sm text-gray-700 whitespace-pre-line">{r.message || '(no message recorded)'}</p>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ---- Main Reminders Page ----
export default function Reminders() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<'send' | 'templates' | 'schedule' | 'logs'>('send')
  const [clients, setClients] = useState<Client[]>([])
  const [loadingClients, setLoadingClients] = useState(true)

  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => {
    fetchClients()
  }, [])

  async function fetchClients() {
    try {
      setLoadingClients(true)
      const res = await api.get('/clients', { params: { status: 'ACTIVE', limit: 200 } })
      setClients(res.data.data || [])
    } catch {
      // silently fail
    } finally {
      setLoadingClients(false)
    }
  }

  const tabs = [
    { id: 'send', label: 'Send Reminder' },
    ...(isAdmin ? [{ id: 'templates', label: 'Message Templates' }] : []),
    { id: 'schedule', label: 'Schedule' },
    { id: 'logs', label: 'Reminder Logs' },
  ] as { id: 'send' | 'templates' | 'schedule' | 'logs'; label: string }[]

  return (
    <DashboardLayout title="Reminders">
      {/* Tab bar */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loadingClients ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <>
          {activeTab === 'send' && <SendTab clients={clients} />}
          {activeTab === 'templates' && isAdmin && <TemplatesTab />}
          {activeTab === 'schedule' && <ScheduleTab />}
          {activeTab === 'logs' && <LogsTab clients={clients} />}
        </>
      )}
    </DashboardLayout>
  )
}
