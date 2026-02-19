import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import api from '../lib/api'

interface SyncConfig {
  id: string
  spreadsheetUrl: string | null
  spreadsheetId: string | null
  sheetName: string
  isConnected: boolean
  googleEmail: string | null
  googleTokenExpiry: string | null
  lastSyncedAt: string | null
  lastSyncStatus: string | null
  lastSyncSummary: {
    created: number
    updated: number
    skipped: number
    errors: { gstin: string; message: string }[]
  } | null
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

export default function SheetSync() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [config, setConfig] = useState<SyncConfig | null>(null)
  const [spreadsheetUrl, setSpreadsheetUrl] = useState('')
  const [sheetName, setSheetName] = useState('Sheet1')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [selectedNew, setSelectedNew] = useState<Set<string>>(new Set())
  const [selectedChanged, setSelectedChanged] = useState<Set<string>>(new Set())
  const [applyResult, setApplyResult] = useState<{
    created: number
    updated: number
    errors: { gstin: string; message: string }[]
  } | null>(null)

  useEffect(() => {
    // Handle OAuth redirect params
    const connected = searchParams.get('connected')
    const oauthError = searchParams.get('error')

    if (connected === 'true') {
      setSuccess('Google account connected successfully.')
      setSearchParams({}, { replace: true })
    }
    if (oauthError) {
      setError(`Google OAuth failed: ${oauthError}`)
      setSearchParams({}, { replace: true })
    }

    fetchConfig()
  }, [])

  async function fetchConfig() {
    try {
      setLoading(true)
      const response = await api.get('/sheet-sync/config')
      const data = response.data.data
      if (data) {
        setConfig(data)
        if (data.spreadsheetUrl) setSpreadsheetUrl(data.spreadsheetUrl)
        setSheetName(data.sheetName)
      }
    } catch (err: any) {
      if (err?.response?.status !== 404) {
        setError(err?.response?.data?.error || 'Failed to load configuration')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleConnectGoogle() {
    try {
      setConnecting(true)
      setError('')
      const response = await api.get('/sheet-sync/auth-url')
      // Redirect to Google OAuth consent screen
      window.location.href = response.data.data.url
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to initiate Google connection')
      setConnecting(false)
    }
  }

  async function handleDisconnectGoogle() {
    try {
      setError('')
      await api.post('/sheet-sync/disconnect')
      setConfig(prev => prev ? { ...prev, isConnected: false, googleEmail: null } : null)
      setSuccess('Google account disconnected.')
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to disconnect')
    }
  }

  async function handleSaveConfig() {
    try {
      setSaving(true)
      setError('')
      setSuccess('')
      const response = await api.put('/sheet-sync/config', { spreadsheetUrl, sheetName })
      setConfig(prev => ({ ...prev, ...response.data.data, isConnected: prev?.isConnected ?? false, googleEmail: prev?.googleEmail ?? null }))
      setSuccess('Configuration saved successfully.')
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  async function handleSyncPreview() {
    try {
      setSyncing(true)
      setError('')
      setSuccess('')
      setPreview(null)
      setApplyResult(null)
      const response = await api.post('/sheet-sync/preview')
      const data = response.data.data.preview
      setPreview(data)

      setSelectedNew(new Set(data.new.map((c: SheetClientRow) => c.gstin)))
      setSelectedChanged(new Set(data.changed.map((c: ChangedClient) => c.clientId)))
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to fetch sheet data')
    } finally {
      setSyncing(false)
    }
  }

  async function handleApply() {
    if (!preview) return

    try {
      setApplying(true)
      setError('')
      setSuccess('')

      const createRows = preview.new
        .filter(c => selectedNew.has(c.gstin))
        .map(c => ({
          gstin: c.gstin,
          legalName: c.legalName,
          tradeName: c.tradeName,
          contactPerson: c.contactPerson,
          email: c.email,
          phone: c.phone,
          address: c.address,
          stateCode: c.stateCode,
          filingFrequency: c.filingFrequency,
        }))

      const updateRows = preview.changed
        .filter(c => selectedChanged.has(c.clientId))
        .map(c => {
          const fields: Record<string, string | undefined> = {
            clientId: c.clientId,
            gstin: c.gstin,
            legalName: c.legalName,
          }
          for (const [field, diff] of Object.entries(c.changes)) {
            fields[field] = diff.new || undefined
          }
          return fields
        })

      const response = await api.post('/sheet-sync/apply', {
        create: createRows,
        update: updateRows,
      })

      setApplyResult(response.data.data.summary)
      setPreview(null)
      setSuccess(`Sync complete: ${response.data.data.summary.created} created, ${response.data.data.summary.updated} updated.`)
      fetchConfig()
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to apply changes')
    } finally {
      setApplying(false)
    }
  }

  function toggleNew(gstin: string) {
    setSelectedNew(prev => {
      const next = new Set(prev)
      if (next.has(gstin)) next.delete(gstin)
      else next.add(gstin)
      return next
    })
  }

  function toggleChanged(clientId: string) {
    setSelectedChanged(prev => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }

  function toggleAllNew() {
    if (!preview) return
    if (selectedNew.size === preview.new.length) {
      setSelectedNew(new Set())
    } else {
      setSelectedNew(new Set(preview.new.map(c => c.gstin)))
    }
  }

  function toggleAllChanged() {
    if (!preview) return
    if (selectedChanged.size === preview.changed.length) {
      setSelectedChanged(new Set())
    } else {
      setSelectedChanged(new Set(preview.changed.map(c => c.clientId)))
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Sheet Sync">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  const isConnected = config?.isConnected ?? false
  const canSync = isConnected && config?.spreadsheetId

  return (
    <DashboardLayout title="Sheet Sync">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-500 hover:text-red-700 font-medium">Dismiss</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {success}
          <button onClick={() => setSuccess('')} className="ml-2 text-green-500 hover:text-green-700 font-medium">Dismiss</button>
        </div>
      )}

      {/* Step 1: Google Account Connection */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Step 1: Connect Google Account</h2>
        <p className="text-sm text-gray-500 mb-4">Connect a Google account that has access to the client data spreadsheet.</p>

        {isConnected ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              <span className="text-sm text-green-800 font-medium">Connected</span>
              {config?.googleEmail && (
                <span className="text-sm text-green-600">({config.googleEmail})</span>
              )}
            </div>
            <button
              onClick={handleDisconnectGoogle}
              className="px-3 py-2 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded-lg transition-colors font-medium"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnectGoogle}
            disabled={connecting}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {connecting ? 'Redirecting...' : 'Connect with Google'}
          </button>
        )}
      </div>

      {/* Step 2: Sheet Configuration */}
      <div className={`bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6 ${!isConnected ? 'opacity-60 pointer-events-none' : ''}`}>
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Step 2: Configure Google Sheet</h2>
        <p className="text-sm text-gray-500 mb-4">Paste the URL of the Google Sheet containing client data.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Google Sheet URL</label>
            <input
              type="url"
              value={spreadsheetUrl}
              onChange={(e) => setSpreadsheetUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Sheet Tab Name</label>
            <input
              type="text"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              placeholder="Sheet1"
              className="w-full max-w-xs px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={handleSaveConfig}
              disabled={saving || !spreadsheetUrl}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
            {canSync && (
              <button
                onClick={handleSyncPreview}
                disabled={syncing}
                className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {syncing ? 'Fetching Sheet Data...' : 'Sync Now'}
              </button>
            )}
          </div>
        </div>

        {/* Last Sync Info */}
        {config?.lastSyncedAt && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Last synced: {new Date(config.lastSyncedAt).toLocaleString()} —{' '}
              <span className={config.lastSyncStatus === 'SUCCESS' ? 'text-green-600 font-medium' : 'text-yellow-600 font-medium'}>
                {config.lastSyncStatus}
              </span>
            </p>
            {config.lastSyncSummary && (
              <p className="text-sm text-gray-500 mt-1">
                Created: {config.lastSyncSummary.created}, Updated: {config.lastSyncSummary.updated}
                {config.lastSyncSummary.errors.length > 0 && `, Errors: ${config.lastSyncSummary.errors.length}`}
              </p>
            )}
          </div>
        )}

        {/* Expected Format */}
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500 font-medium mb-1">Expected Column Headers:</p>
          <p className="text-xs text-gray-400 font-mono">
            GSTIN | Legal Name | Trade Name | Contact Person | Email | Phone | Address | State Code | Filing Frequency
          </p>
        </div>
      </div>

      {/* Preview Section */}
      {preview && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{preview.new.length}</p>
              <p className="text-sm text-blue-600">New Clients</p>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-yellow-700">{preview.changed.length}</p>
              <p className="text-sm text-yellow-600">Changed</p>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-gray-700">{preview.unchanged}</p>
              <p className="text-sm text-gray-600">Unchanged</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-red-700">{preview.errors.length}</p>
              <p className="text-sm text-red-600">Errors</p>
            </div>
          </div>

          {/* New Clients Table */}
          {preview.new.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-blue-50">
                <h3 className="text-sm font-semibold text-blue-800">New Clients ({preview.new.length})</h3>
                <label className="flex items-center gap-2 text-sm text-blue-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedNew.size === preview.new.length}
                    onChange={toggleAllNew}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Select All
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 w-10"></th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Row</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">GSTIN</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Legal Name</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Trade Name</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Contact</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Email</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Frequency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {preview.new.map((client) => (
                      <tr key={client.gstin} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedNew.has(client.gstin)}
                            onChange={() => toggleNew(client.gstin)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{client.rowNumber}</td>
                        <td className="px-4 py-3 font-mono text-sm text-gray-900">{client.gstin}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{client.legalName}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{client.tradeName || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{client.contactPerson || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{client.email || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{client.filingFrequency || 'MONTHLY'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Changed Clients Table */}
          {preview.changed.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-yellow-50">
                <h3 className="text-sm font-semibold text-yellow-800">Changed Clients ({preview.changed.length})</h3>
                <label className="flex items-center gap-2 text-sm text-yellow-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedChanged.size === preview.changed.length}
                    onChange={toggleAllChanged}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  Select All
                </label>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 w-10"></th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Row</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">GSTIN</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Legal Name</th>
                      <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500">Changes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {preview.changed.map((client) => (
                      <tr key={client.clientId} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedChanged.has(client.clientId)}
                            onChange={() => toggleChanged(client.clientId)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{client.rowNumber}</td>
                        <td className="px-4 py-3 font-mono text-sm text-gray-900">{client.gstin}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{client.legalName}</td>
                        <td className="px-4 py-3">
                          <div className="space-y-1">
                            {Object.entries(client.changes).map(([field, diff]) => (
                              <div key={field} className="text-xs">
                                <span className="font-medium text-gray-700">{field}:</span>{' '}
                                <span className="text-red-500 line-through">{diff.old || '(empty)'}</span>{' '}
                                <span className="text-green-600">{diff.new || '(empty)'}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Errors */}
          {preview.errors.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-red-200 overflow-hidden">
              <div className="px-6 py-4 border-b border-red-200 bg-red-50">
                <h3 className="text-sm font-semibold text-red-800">Validation Errors ({preview.errors.length})</h3>
              </div>
              <div className="p-4">
                <ul className="space-y-1">
                  {preview.errors.map((err, idx) => (
                    <li key={idx} className="text-sm text-red-700">
                      <span className="text-gray-400 mr-2">Row {err.rowNumber}:</span>
                      {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Apply Button */}
          {(preview.new.length > 0 || preview.changed.length > 0) && (
            <div className="flex items-center gap-4">
              <button
                onClick={handleApply}
                disabled={applying || (selectedNew.size === 0 && selectedChanged.size === 0)}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {applying ? 'Applying...' : `Apply Selected (${selectedNew.size + selectedChanged.size})`}
              </button>
              <button
                onClick={() => setPreview(null)}
                className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 font-medium"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}

      {/* Apply Result */}
      {applyResult && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">Sync Results</h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{applyResult.created}</p>
              <p className="text-sm text-gray-600">Created</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{applyResult.updated}</p>
              <p className="text-sm text-gray-600">Updated</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-red-600">{applyResult.errors.length}</p>
              <p className="text-sm text-gray-600">Errors</p>
            </div>
          </div>
          {applyResult.errors.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-sm font-medium text-red-700 mb-2">Errors:</p>
              <ul className="space-y-1">
                {applyResult.errors.map((err, idx) => (
                  <li key={idx} className="text-sm text-red-600">
                    {err.gstin}: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  )
}
