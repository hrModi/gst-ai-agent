import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'

interface Client {
  id: string
  gstin: string
  legalName: string
  tradeName: string
  assignedTo: string | null
  assignedUser: { id: string; name: string; email: string } | null
  status: 'ACTIVE' | 'INACTIVE'
  automationEnabled: boolean
  notifyEmail: boolean
  notifyWhatsapp: boolean
  email: string
  phone: string
  createdAt: string
  updatedAt: string
}

interface Consultant {
  id: string
  name: string
  email: string
}

interface SyncConfig {
  isConnected: boolean
  googleEmail: string | null
  spreadsheetUrl: string | null
  spreadsheetId: string | null
  sheetName: string
  lastSyncedAt: string | null
  lastSyncStatus: string | null
  lastSyncSummary: { created: number; updated: number; errors: { gstin: string; message: string }[] } | null
}

interface SheetClientRow {
  rowNumber: number
  gstin: string
  legalName: string
  tradeName?: string
  contactPerson?: string
  email?: string
  phone?: string
  address?: string
  stateCode?: string
  filingFrequency?: string
}

interface ChangedClient {
  rowNumber: number
  gstin: string
  clientId: string
  legalName: string
  changes: Record<string, { old: string | null; new: string | null }>
}

interface PreviewData {
  new: (SheetClientRow & { _action: string })[]
  changed: ChangedClient[]
  unchanged: number
  errors: { rowNumber: number; message: string }[]
}

export default function Clients() {
  const { user } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('ACTIVE')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 15

  // Filters
  const [consultantFilter, setConsultantFilter] = useState('')

  // Bulk select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [showBulkAssign, setShowBulkAssign] = useState(false)
  const [bulkConsultantId, setBulkConsultantId] = useState('')
  const [bulkAssigning, setBulkAssigning] = useState(false)

  // Bulk automation
  const [showBulkAutomation, setShowBulkAutomation] = useState(false)
  const [bulkAuto, setBulkAuto] = useState({ automationEnabled: true, notifyEmail: true, notifyWhatsapp: true, reminderDaysBefore: '7, 3, 1' })
  const [bulkAutomating, setBulkAutomating] = useState(false)

  // Sheet Sync modal
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null)
  const [syncConfigLoading, setSyncConfigLoading] = useState(false)
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('')
  const [sheetName, setSheetName] = useState('Sheet1')
  const [connecting, setConnecting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [syncError, setSyncError] = useState('')
  const [syncSuccess, setSyncSuccess] = useState('')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [selectedNew, setSelectedNew] = useState<Set<string>>(new Set())
  const [selectedChanged, setSelectedChanged] = useState<Set<string>>(new Set())
  const [syncResult, setSyncResult] = useState<{ created: number; updated: number; errors: { gstin: string; message: string }[] } | null>(null)

  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => {
    // Handle OAuth redirect
    const connected = searchParams.get('connected')
    const oauthError = searchParams.get('error')
    if (connected === 'true') {
      setSyncSuccess('Google account connected successfully.')
      setShowSyncModal(true)
      setSearchParams({}, { replace: true })
    }
    if (oauthError) {
      setSyncError(`Google OAuth failed: ${oauthError}`)
      setShowSyncModal(true)
      setSearchParams({}, { replace: true })
    }
  }, [])

  useEffect(() => {
    fetchClients()
  }, [page, statusFilter, consultantFilter])

  useEffect(() => {
    if (isAdmin) fetchConsultants()
  }, [isAdmin])

  async function fetchClients() {
    try {
      setLoading(true)
      const params: Record<string, string | number> = { page, limit }
      if (search) params.search = search
      if (statusFilter) params.status = statusFilter
      if (consultantFilter) params.assignedTo = consultantFilter

      const response = await api.get('/clients', { params })
      setClients(response.data.data || [])
      setTotal(response.data.pagination?.total || 0)
      setTotalPages(response.data.pagination?.totalPages || 1)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load clients')
    } finally {
      setLoading(false)
    }
  }

  async function fetchConsultants() {
    try {
      const res = await api.get('/users')
      setConsultants(res.data.data || [])
    } catch {
      // Non-critical
    }
  }

  async function handleArchive(id: string, name: string) {
    if (!window.confirm(`Archive ${name}? They will be hidden from the default view but can be restored later.`)) return
    try {
      await api.delete(`/clients/${id}`)
      fetchClients()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to archive client')
    }
  }

  async function handleRestore(id: string) {
    try {
      await api.put(`/clients/${id}`, { status: 'ACTIVE' })
      fetchClients()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to restore client')
    }
  }

  function handleSearch() {
    setPage(1)
    fetchClients()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSearch()
  }

  // Bulk select
  function toggleSelect(clientId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === clients.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(clients.map(c => c.id)))
    }
  }

  async function handleBulkAssign() {
    try {
      setBulkAssigning(true)
      await api.put('/clients/bulk-assign', {
        clientIds: Array.from(selectedIds),
        consultantId: bulkConsultantId || null,
      })
      setShowBulkAssign(false)
      setSelectedIds(new Set())
      setBulkConsultantId('')
      fetchClients()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Bulk assign failed')
    } finally {
      setBulkAssigning(false)
    }
  }

  async function handleBulkAutomation() {
    try {
      setBulkAutomating(true)
      const days = bulkAuto.reminderDaysBefore
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0)
      await api.put('/clients/bulk-automation', {
        clientIds: Array.from(selectedIds),
        automationEnabled: bulkAuto.automationEnabled,
        notifyEmail: bulkAuto.notifyEmail,
        notifyWhatsapp: bulkAuto.notifyWhatsapp,
        reminderDaysBefore: days,
      })
      setShowBulkAutomation(false)
      setSelectedIds(new Set())
      fetchClients()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Bulk automation update failed')
    } finally {
      setBulkAutomating(false)
    }
  }

  // Sheet Sync
  async function openSyncModal() {
    setShowSyncModal(true)
    setSyncError('')
    setSyncSuccess('')
    setPreview(null)
    setSyncResult(null)
    setSyncConfigLoading(true)
    try {
      const res = await api.get('/sheet-sync/config')
      const data = res.data.data
      setSyncConfig(data)
      if (data?.spreadsheetUrl) setSpreadsheetUrl(data.spreadsheetUrl)
      if (data?.sheetName) setSheetName(data.sheetName)
    } catch (err: any) {
      if (err?.response?.status !== 404) {
        setSyncError(err?.response?.data?.error || 'Failed to load config')
      }
    } finally {
      setSyncConfigLoading(false)
    }
  }

  async function handleConnectGoogle() {
    try {
      setConnecting(true)
      setSyncError('')
      const res = await api.get('/sheet-sync/auth-url')
      window.location.href = res.data.data.url
    } catch (err: any) {
      setSyncError(err?.response?.data?.error || 'Failed to initiate Google connection')
      setConnecting(false)
    }
  }

  async function handleDisconnectGoogle() {
    try {
      await api.post('/sheet-sync/disconnect')
      setSyncConfig(prev => prev ? { ...prev, isConnected: false, googleEmail: null } : null)
      setSyncSuccess('Google account disconnected.')
    } catch (err: any) {
      setSyncError(err?.response?.data?.error || 'Failed to disconnect')
    }
  }

  async function handleSaveConfig() {
    try {
      setSaving(true)
      setSyncError('')
      const res = await api.put('/sheet-sync/config', { spreadsheetUrl, sheetName })
      setSyncConfig(prev => ({ ...prev!, ...res.data.data }))
      setSyncSuccess('Configuration saved.')
    } catch (err: any) {
      setSyncError(err?.response?.data?.error || 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  async function handleSyncPreview() {
    try {
      setSyncing(true)
      setSyncError('')
      setSyncSuccess('')
      setPreview(null)
      const res = await api.post('/sheet-sync/preview')
      const data = res.data.data.preview
      setPreview(data)
      setSelectedNew(new Set(data.new.map((c: SheetClientRow) => c.gstin)))
      setSelectedChanged(new Set(data.changed.map((c: ChangedClient) => c.clientId)))
    } catch (err: any) {
      setSyncError(err?.response?.data?.error || 'Failed to fetch sheet data')
    } finally {
      setSyncing(false)
    }
  }

  async function handleApplySync() {
    if (!preview) return
    try {
      setApplying(true)
      setSyncError('')

      const createRows = preview.new
        .filter(c => selectedNew.has(c.gstin))
        .map(c => ({ gstin: c.gstin, legalName: c.legalName, tradeName: c.tradeName, contactPerson: c.contactPerson, email: c.email, phone: c.phone, address: c.address, stateCode: c.stateCode, filingFrequency: c.filingFrequency }))

      const updateRows = preview.changed
        .filter(c => selectedChanged.has(c.clientId))
        .map(c => {
          const fields: Record<string, string | undefined> = { clientId: c.clientId, gstin: c.gstin, legalName: c.legalName }
          for (const [field, diff] of Object.entries(c.changes)) fields[field] = diff.new ?? undefined
          return fields
        })

      const res = await api.post('/sheet-sync/apply', { create: createRows, update: updateRows })
      const summary = res.data.data.summary
      setSyncResult(summary)
      setPreview(null)
      fetchClients()
    } catch (err: any) {
      setSyncError(err?.response?.data?.error || 'Failed to apply changes')
    } finally {
      setApplying(false)
    }
  }

  const isConnected = syncConfig?.isConnected ?? false
  const canSync = isConnected && syncConfig?.spreadsheetId

  return (
    <DashboardLayout title="Clients">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex flex-1 gap-3 items-center flex-wrap">
            <input
              type="text"
              placeholder="Search by name, GSTIN..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1 min-w-[180px] max-w-sm px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Search
            </button>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              <option value="">All (incl. Archived)</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
            {isAdmin && (
              <select
                value={consultantFilter}
                onChange={(e) => { setConsultantFilter(e.target.value); setPage(1) }}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">All Consultants</option>
                {consultants.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                <option value="unassigned">Unassigned</option>
              </select>
            )}
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2">
              <button
                onClick={openSyncModal}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Sync from Sheet
              </button>
              <Link
                to="/clients/new"
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors whitespace-nowrap"
              >
                + Add Client
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && isAdmin && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-4 flex items-center gap-4 flex-wrap">
          <span className="text-sm text-indigo-800 font-medium">{selectedIds.size} client(s) selected</span>
          <button
            onClick={() => setShowBulkAssign(true)}
            className="px-3 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Assign to Consultant
          </button>
          <button
            onClick={() => setShowBulkAutomation(true)}
            className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
          >
            Edit Reminders
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
          >
            Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : clients.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">No clients found</p>
            <p className="text-sm mt-1">Try adjusting your search or filters</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {isAdmin && (
                      <th className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === clients.length && clients.length > 0}
                          onChange={toggleSelectAll}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </th>
                    )}
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">GSTIN</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Legal Name</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Trade Name</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Consultant</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Reminders</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Created</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Last Updated</th>
                    <th className="sticky right-0 bg-gray-50 text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {clients.map((client) => (
                    <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                      {isAdmin && (
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(client.id)}
                            onChange={() => toggleSelect(client.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <span className="font-mono text-sm text-gray-900 uppercase">{client.gstin}</span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{client.legalName}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{client.tradeName || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{client.assignedUser?.name || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          client.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {client.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        {client.automationEnabled ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                            {[client.notifyEmail && 'Email', client.notifyWhatsapp && 'WA'].filter(Boolean).join(' · ') || 'ON'}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {new Date(client.createdAt).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {new Date(client.updatedAt).toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}
                      </td>
                      <td className="sticky right-0 bg-white px-6 py-4 shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.06)]">
                        <div className="flex items-center gap-3">
                          <Link to={`/clients/${client.id}`} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                            View
                          </Link>
                          {isAdmin && client.status === 'ACTIVE' && (
                            <button
                              onClick={() => handleArchive(client.id, client.tradeName || client.legalName)}
                              className="text-gray-400 hover:text-red-600 text-sm font-medium transition-colors"
                            >
                              Archive
                            </button>
                          )}
                          {isAdmin && client.status === 'INACTIVE' && (
                            <button
                              onClick={() => handleRestore(client.id)}
                              className="text-gray-400 hover:text-green-600 text-sm font-medium transition-colors"
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-600">
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} clients
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5 text-sm text-gray-600">Page {page} of {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bulk Assign Modal */}
      {showBulkAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Assign Consultant</h3>
            <p className="text-sm text-gray-600 mb-4">Assign {selectedIds.size} selected client(s) to:</p>
            <select
              value={bulkConsultantId}
              onChange={(e) => setBulkConsultantId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-4"
            >
              <option value="">Unassigned</option>
              {consultants.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={handleBulkAssign}
                disabled={bulkAssigning}
                className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {bulkAssigning ? 'Assigning...' : 'Assign'}
              </button>
              <button
                onClick={() => setShowBulkAssign(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Automation Modal */}
      {showBulkAutomation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Edit Reminders</h3>
            <p className="text-sm text-gray-500 mb-4">Applies to {selectedIds.size} selected client(s)</p>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Auto Reminders</label>
                <button
                  onClick={() => setBulkAuto(p => ({ ...p, automationEnabled: !p.automationEnabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${bulkAuto.automationEnabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${bulkAuto.automationEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className={bulkAuto.automationEnabled ? '' : 'opacity-40 pointer-events-none'}>
                <p className="text-sm font-medium text-gray-700 mb-2">Channels</p>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={bulkAuto.notifyEmail} onChange={e => setBulkAuto(p => ({ ...p, notifyEmail: e.target.checked }))}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    Email
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={bulkAuto.notifyWhatsapp} onChange={e => setBulkAuto(p => ({ ...p, notifyWhatsapp: e.target.checked }))}
                      className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                    WhatsApp
                  </label>
                </div>
              </div>

              <div className={bulkAuto.automationEnabled ? '' : 'opacity-40 pointer-events-none'}>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reminder Days Before Due Date</label>
                <input
                  type="text"
                  value={bulkAuto.reminderDaysBefore}
                  onChange={e => setBulkAuto(p => ({ ...p, reminderDaysBefore: e.target.value }))}
                  placeholder="e.g. 7, 3, 1"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-400 mt-1">Comma-separated days, e.g. 7, 3, 1</p>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={handleBulkAutomation}
                disabled={bulkAutomating}
                className="flex-1 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {bulkAutomating ? 'Applying...' : `Apply to ${selectedIds.size} client(s)`}
              </button>
              <button
                onClick={() => setShowBulkAutomation(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sheet Sync Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Sync from Google Sheet</h2>
              <button onClick={() => { setShowSyncModal(false); setSyncResult(null) }} className="text-gray-400 hover:text-gray-600 text-xl font-bold">
                &times;
              </button>
            </div>

            <div className="p-6 space-y-6">
              {syncError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex justify-between">
                  {syncError}
                  <button onClick={() => setSyncError('')} className="ml-2 font-medium">Dismiss</button>
                </div>
              )}
              {syncSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex justify-between">
                  {syncSuccess}
                  <button onClick={() => setSyncSuccess('')} className="ml-2 font-medium">Dismiss</button>
                </div>
              )}

              {syncConfigLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
              ) : syncResult ? (
                /* Sync Complete result view */
                <div className="text-center py-4 space-y-4">
                  <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mx-auto">
                    <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900">Sync Complete</h3>
                  <div className="flex justify-center gap-8">
                    <div className="text-center">
                      <p className="text-3xl font-bold text-green-600">{syncResult.created}</p>
                      <p className="text-sm text-gray-500">clients added</p>
                    </div>
                    <div className="text-center">
                      <p className="text-3xl font-bold text-blue-600">{syncResult.updated}</p>
                      <p className="text-sm text-gray-500">clients updated</p>
                    </div>
                  </div>
                  {syncResult.created > 0 && (
                    <p className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-2 inline-block">
                      Auto Reminders (Email + WhatsApp) enabled by default for all new clients. Adjust per-client or via bulk edit.
                    </p>
                  )}
                  {syncResult.errors.length > 0 && (
                    <div className="text-left bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-red-700 mb-1">{syncResult.errors.length} error(s):</p>
                      {syncResult.errors.map((e, i) => (
                        <p key={i} className="text-xs text-red-600">{e.gstin}: {e.message}</p>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => { setSyncResult(null); setShowSyncModal(false) }}
                    className="px-6 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  {/* Step 1: Google Connection */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Step 1: Google Account</h3>
                    {isConnected ? (
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <span className="text-sm text-green-800 font-medium">Connected</span>
                          {syncConfig?.googleEmail && (
                            <span className="text-sm text-green-600">({syncConfig.googleEmail})</span>
                          )}
                        </div>
                        <button
                          onClick={handleDisconnectGoogle}
                          className="text-sm text-red-600 hover:text-red-800 font-medium"
                        >
                          Disconnect
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleConnectGoogle}
                        disabled={connecting}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        {connecting ? 'Redirecting...' : 'Connect with Google'}
                      </button>
                    )}
                  </div>

                  {/* Step 2: Configure Sheet */}
                  <div className={!isConnected ? 'opacity-50 pointer-events-none' : ''}>
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">Step 2: Google Sheet URL</h3>
                    <div className="space-y-3">
                      <input
                        type="url"
                        value={spreadsheetUrl}
                        onChange={(e) => setSpreadsheetUrl(e.target.value)}
                        placeholder="https://docs.google.com/spreadsheets/d/..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleSaveConfig}
                          disabled={saving || !spreadsheetUrl}
                          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        {canSync && (
                          <button
                            onClick={handleSyncPreview}
                            disabled={syncing}
                            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                          >
                            {syncing ? 'Fetching...' : 'Preview Sync'}
                          </button>
                        )}
                      </div>
                      {syncConfig?.lastSyncedAt && (
                        <p className="text-xs text-gray-500">
                          Last synced: {new Date(syncConfig.lastSyncedAt).toLocaleString()} — {syncConfig.lastSyncStatus}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Preview */}
                  {preview && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-4 gap-3">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                          <p className="text-xl font-bold text-blue-700">{preview.new.length}</p>
                          <p className="text-xs text-blue-600">New</p>
                        </div>
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                          <p className="text-xl font-bold text-yellow-700">{preview.changed.length}</p>
                          <p className="text-xs text-yellow-600">Changed</p>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                          <p className="text-xl font-bold text-gray-700">{preview.unchanged}</p>
                          <p className="text-xs text-gray-600">Unchanged</p>
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                          <p className="text-xl font-bold text-red-700">{preview.errors.length}</p>
                          <p className="text-xs text-red-600">Errors</p>
                        </div>
                      </div>

                      {preview.new.length > 0 && (
                        <div className="border border-blue-200 rounded-lg overflow-hidden">
                          <div className="px-4 py-2 bg-blue-50 flex justify-between items-center">
                            <span className="text-sm font-medium text-blue-800">New Clients ({preview.new.length})</span>
                            <label className="text-xs text-blue-700 flex items-center gap-1 cursor-pointer">
                              <input type="checkbox" checked={selectedNew.size === preview.new.length} onChange={() => {
                                if (selectedNew.size === preview.new.length) setSelectedNew(new Set())
                                else setSelectedNew(new Set(preview.new.map(c => c.gstin)))
                              }} className="rounded" />
                              Select All
                            </label>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <tbody className="divide-y divide-gray-100">
                                {preview.new.map((c) => (
                                  <tr key={c.gstin} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 w-8">
                                      <input type="checkbox" checked={selectedNew.has(c.gstin)} onChange={() => {
                                        const next = new Set(selectedNew)
                                        if (next.has(c.gstin)) next.delete(c.gstin)
                                        else next.add(c.gstin)
                                        setSelectedNew(next)
                                      }} className="rounded" />
                                    </td>
                                    <td className="px-4 py-2 font-mono text-xs">{c.gstin}</td>
                                    <td className="px-4 py-2">{c.legalName}</td>
                                    <td className="px-4 py-2 text-gray-500">{c.tradeName || '-'}</td>
                                    <td className="px-4 py-2 text-gray-500">{c.contactPerson || '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {preview.changed.length > 0 && (
                        <div className="border border-yellow-200 rounded-lg overflow-hidden">
                          <div className="px-4 py-2 bg-yellow-50 flex justify-between items-center">
                            <span className="text-sm font-medium text-yellow-800">Changed Clients ({preview.changed.length})</span>
                            <label className="text-xs text-yellow-700 flex items-center gap-1 cursor-pointer">
                              <input type="checkbox" checked={selectedChanged.size === preview.changed.length} onChange={() => {
                                if (selectedChanged.size === preview.changed.length) setSelectedChanged(new Set())
                                else setSelectedChanged(new Set(preview.changed.map(c => c.clientId)))
                              }} className="rounded" />
                              Select All
                            </label>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <tbody className="divide-y divide-gray-100">
                                {preview.changed.map((c) => (
                                  <tr key={c.clientId} className="hover:bg-gray-50">
                                    <td className="px-4 py-2 w-8">
                                      <input type="checkbox" checked={selectedChanged.has(c.clientId)} onChange={() => {
                                        const next = new Set(selectedChanged)
                                        if (next.has(c.clientId)) next.delete(c.clientId)
                                        else next.add(c.clientId)
                                        setSelectedChanged(next)
                                      }} className="rounded" />
                                    </td>
                                    <td className="px-4 py-2 font-mono">{c.gstin}</td>
                                    <td className="px-4 py-2">{c.legalName}</td>
                                    <td className="px-4 py-2 text-xs text-gray-500">
                                      {Object.keys(c.changes).join(', ')} changed
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {(preview.new.length > 0 || preview.changed.length > 0) && (
                        <div className="flex gap-3">
                          <button
                            onClick={handleApplySync}
                            disabled={applying || (selectedNew.size === 0 && selectedChanged.size === 0)}
                            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {applying ? 'Applying...' : `Apply Selected (${selectedNew.size + selectedChanged.size})`}
                          </button>
                          <button onClick={() => setPreview(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
