import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useAuth } from '../contexts/AuthContext'

interface GmailStatus {
  connected: boolean
  gmailEnabled: boolean
  googleEmail: string | null
  lastPollAt: string | null
  unprocessedCount: number
}

interface InboxMessage {
  id: string
  gmailMessageId: string
  fromEmail: string
  subject: string
  receivedAt: string
  month: number
  year: number
  attachmentCount: number
  status: string
  pipelineStage: string | null
  errorSummary: string | null
  client: { id: string; legalName: string; gstin: string }
}

interface UnrecognisedError {
  id: string
  description: string
  metadata: any
  createdAt: string
}

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function statusBadge(status: string) {
  const map: Record<string, string> = {
    RECEIVED: 'bg-blue-100 text-blue-700',
    PROCESSING: 'bg-yellow-100 text-yellow-800',
    PROCESSED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
  }
  return map[status] || 'bg-gray-100 text-gray-700'
}

function stageBadge(stage: string | null) {
  if (!stage) return null
  const map: Record<string, string> = {
    DATA_RECEIVED: 'bg-blue-50 text-blue-600',
    VALIDATING: 'bg-yellow-50 text-yellow-700',
    VALIDATED: 'bg-green-50 text-green-700',
    VALIDATION_FAILED: 'bg-red-50 text-red-700',
    JSON_GENERATED: 'bg-purple-50 text-purple-700',
    READY_TO_FILE: 'bg-emerald-50 text-emerald-700',
  }
  const cls = map[stage] || 'bg-gray-50 text-gray-600'
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{stage.replace(/_/g, ' ')}</span>
}

export default function InboxMonitor() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'ADMIN'

  const [gmailStatus, setGmailStatus] = useState<GmailStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [enabling, setEnabling] = useState(false)
  const [disabling, setDisabling] = useState(false)

  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [msgLoading, setMsgLoading] = useState(true)
  const [msgTotal, setMsgTotal] = useState(0)
  const [msgPage, setMsgPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')

  const [unrecognised, setUnrecognised] = useState<UnrecognisedError[]>([])
  const [unreTotal, setUnreTotal] = useState(0)
  const [unrePage, setUnrePage] = useState(1)

  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')

  const fetchGmailStatus = useCallback(async () => {
    try {
      const res = await api.get('/sheet-sync/gmail-status')
      setGmailStatus(res.data.data)
    } catch {
      setGmailStatus({ connected: false, gmailEnabled: false, googleEmail: null, lastPollAt: null, unprocessedCount: 0 })
    } finally {
      setStatusLoading(false)
    }
  }, [])

  const fetchMessages = useCallback(async () => {
    setMsgLoading(true)
    try {
      const params: Record<string, any> = { page: msgPage, limit: 20 }
      if (statusFilter) params.status = statusFilter
      const res = await api.get('/inbox', { params })
      setMessages(res.data.data || [])
      setMsgTotal(res.data.meta?.total || 0)
    } catch {
      setError('Failed to load inbox messages')
    } finally {
      setMsgLoading(false)
    }
  }, [msgPage, statusFilter])

  const fetchUnrecognised = useCallback(async () => {
    try {
      const res = await api.get('/inbox/unrecognised', { params: { page: unrePage, limit: 20 } })
      setUnrecognised(res.data.data || [])
      setUnreTotal(res.data.meta?.total || 0)
    } catch {
      // Non-critical — don't show error for this
    }
  }, [unrePage])

  useEffect(() => {
    fetchGmailStatus()
  }, [fetchGmailStatus])

  useEffect(() => {
    fetchMessages()
  }, [fetchMessages])

  useEffect(() => {
    fetchUnrecognised()
  }, [fetchUnrecognised])

  async function handleEnableGmail() {
    setEnabling(true)
    setError('')
    try {
      await api.post('/sheet-sync/gmail-enable')
      setActionMsg('Gmail inbox monitoring enabled.')
      fetchGmailStatus()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to enable Gmail monitoring')
    } finally {
      setEnabling(false)
    }
  }

  async function handleDisableGmail() {
    setDisabling(true)
    setError('')
    try {
      await api.post('/sheet-sync/gmail-disable')
      setActionMsg('Gmail inbox monitoring disabled.')
      fetchGmailStatus()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to disable Gmail monitoring')
    } finally {
      setDisabling(false)
    }
  }

  function handleConnectGoogle() {
    // Navigate to Settings to connect Google account
    navigate('/settings')
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const totalMsgPages = Math.ceil(msgTotal / 20)
  const totalUnrePages = Math.ceil(unreTotal / 20)

  return (
    <DashboardLayout title="Inbox Monitor">
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}
        {actionMsg && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{actionMsg}</div>
        )}

        {/* Gmail Connection Status */}
        {isAdmin && (
          <div className="bg-white shadow rounded-lg p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-gray-900">Gmail Inbox Monitor</h2>
                {statusLoading ? (
                  <p className="text-sm text-gray-400 mt-1">Loading status...</p>
                ) : gmailStatus?.connected ? (
                  <div className="mt-2 space-y-1">
                    <p className="text-sm text-gray-600">
                      Listening on: <span className="font-medium text-gray-900">{gmailStatus.googleEmail}</span>
                    </p>
                    <p className="text-sm text-gray-500">
                      Polling status:{' '}
                      <span className={`font-medium ${gmailStatus.gmailEnabled ? 'text-green-700' : 'text-gray-500'}`}>
                        {gmailStatus.gmailEnabled ? 'Active (every 5 min)' : 'Paused'}
                      </span>
                    </p>
                    {gmailStatus.lastPollAt && (
                      <p className="text-xs text-gray-400">Last poll: {formatDate(gmailStatus.lastPollAt)}</p>
                    )}
                    {gmailStatus.unprocessedCount > 0 && (
                      <p className="text-xs text-orange-600 font-medium">{gmailStatus.unprocessedCount} message(s) pending processing</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 mt-1">
                    No Google account connected. Connect from{' '}
                    <button onClick={handleConnectGoogle} className="text-indigo-600 underline hover:text-indigo-800">Settings</button>.
                  </p>
                )}
              </div>

              {gmailStatus?.connected && (
                <div className="flex gap-2 flex-shrink-0">
                  {gmailStatus.gmailEnabled ? (
                    <button
                      onClick={handleDisableGmail}
                      disabled={disabling}
                      className="px-3 py-1.5 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      {disabling ? 'Pausing...' : 'Pause Monitoring'}
                    </button>
                  ) : (
                    <button
                      onClick={handleEnableGmail}
                      disabled={enabling}
                      className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {enabling ? 'Enabling...' : 'Enable Monitoring'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {gmailStatus?.connected && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <p className="text-xs text-gray-400">
                  Yaksh monitors this inbox for emails with subject: <code className="bg-gray-100 px-1 rounded">GSTR1-DATA | {'<'}GSTIN{'>'} | MM-YYYY</code>.
                  Only emails matching a client GSTIN are stored here.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Inbox Feed */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Received Data Emails</h2>
              <p className="text-sm text-gray-500 mt-0.5">{msgTotal} total</p>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setMsgPage(1) }}
                className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">All statuses</option>
                <option value="RECEIVED">Received</option>
                <option value="PROCESSING">Processing</option>
                <option value="PROCESSED">Processed</option>
                <option value="FAILED">Failed</option>
              </select>
              <button
                onClick={fetchMessages}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
              >
                Refresh
              </button>
            </div>
          </div>

          {msgLoading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="p-10 text-center text-gray-400">
              <div className="text-4xl mb-3">✉</div>
              <p className="text-sm font-medium text-gray-500">Yaksh hasn't received any data emails yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Clients should email their sales data with subject: GSTR1-DATA | GSTIN | MM-YYYY
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">From</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Received</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stage</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {messages.map((msg) => (
                      <tr key={msg.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-[160px] truncate" title={msg.fromEmail}>
                          {msg.fromEmail}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 max-w-[200px] truncate" title={msg.subject}>
                          {msg.subject}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => navigate(`/clients/${msg.client.id}`)}
                            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium text-left"
                          >
                            {msg.client.legalName}
                          </button>
                          <p className="text-xs text-gray-400">{msg.client.gstin}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {MONTH_NAMES[msg.month]} {msg.year}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                          {formatDate(msg.receivedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(msg.status)}`}>
                            {msg.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">{stageBadge(msg.pipelineStage)}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {msg.errorSummary || (msg.status === 'PROCESSED' ? 'Success' : '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalMsgPages > 1 && (
                <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-gray-600">
                  <span>Page {msgPage} of {totalMsgPages}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setMsgPage(p => Math.max(1, p - 1))}
                      disabled={msgPage <= 1}
                      className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => setMsgPage(p => Math.min(totalMsgPages, p + 1))}
                      disabled={msgPage >= totalMsgPages}
                      className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Unrecognised GSTIN errors */}
        {unreTotal > 0 && (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="text-base font-semibold text-gray-900">Unrecognised Emails</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {unreTotal} email(s) contained an unrecognised GSTIN and were discarded
              </p>
            </div>
            <ul className="divide-y divide-gray-100">
              {unrecognised.map((item) => (
                <li key={item.id} className="px-5 py-3">
                  <p className="text-sm text-red-700">{item.description}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatDate(item.createdAt)}</p>
                </li>
              ))}
            </ul>
            {totalUnrePages > 1 && (
              <div className="px-4 py-3 border-t flex items-center justify-between text-sm text-gray-600">
                <span>Page {unrePage} of {totalUnrePages}</span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setUnrePage(p => Math.max(1, p - 1))}
                    disabled={unrePage <= 1}
                    className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setUnrePage(p => Math.min(totalUnrePages, p + 1))}
                    disabled={unrePage >= totalUnrePages}
                    className="px-3 py-1 border rounded disabled:opacity-40 hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
