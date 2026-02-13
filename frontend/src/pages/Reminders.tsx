import { useState, useEffect } from 'react'
import api from '../lib/api'
import DashboardLayout from '../components/layout/DashboardLayout'

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
  createdAt: string
  client?: { legalName: string; tradeName: string | null }
}

export default function Reminders() {
  const [clients, setClients] = useState<Client[]>([])
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [formClientId, setFormClientId] = useState('')
  const [formType, setFormType] = useState('DATA_COLLECTION')
  const [formChannel, setFormChannel] = useState('EMAIL')
  const [formMessage, setFormMessage] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      setLoading(true)
      const [clientRes, reminderRes] = await Promise.all([
        api.get('/clients', { params: { status: 'ACTIVE', limit: 200 } }),
        api.get('/reminders'),
      ])
      setClients(clientRes.data.data || [])
      setReminders(reminderRes.data.data || [])
    } catch {
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!formClientId) {
      setError('Please select a client')
      return
    }
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
      fetchData()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send reminder')
    } finally {
      setSending(false)
    }
  }

  const statusBadge = (status: string) => {
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

  return (
    <DashboardLayout title="Reminders">
      <div className="space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">{success}</div>}

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Send Reminder</h2>
          <form onSubmit={handleSend} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
              <select
                value={formClientId}
                onChange={(e) => setFormClientId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.tradeName || c.legalName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="DATA_COLLECTION">Data Collection</option>
                <option value="FILING_DEADLINE">Filing Deadline</option>
                <option value="FOLLOW_UP">Follow-up</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Channel</label>
              <select
                value={formChannel}
                onChange={(e) => setFormChannel(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="EMAIL">Email</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="SMS">SMS</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message (optional)</label>
              <input
                type="text"
                value={formMessage}
                onChange={(e) => setFormMessage(e.target.value)}
                placeholder="Custom message..."
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={sending}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {sending ? 'Sending...' : 'Send Reminder'}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">Reminder History</h2>
          </div>
          {loading ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            </div>
          ) : reminders.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No reminders sent yet.</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Channel</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sent At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reminders.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {r.client?.tradeName || r.client?.legalName || r.clientId}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.reminderType.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{r.channel}</td>
                    <td className="px-4 py-3">{statusBadge(r.status)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {r.sentAt ? new Date(r.sentAt).toLocaleString('en-IN') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
