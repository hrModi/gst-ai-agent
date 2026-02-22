import { useState, useEffect, useRef } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import api from '../lib/api'

interface ClientOption {
  id: string
  legalName: string
  gstin: string
}

type PurchaseUploadState = 'idle' | 'uploading' | 'validating' | 'done'
type Gstr2bUploadState = 'idle' | 'uploading' | 'done'

type TabId = 'purchase' | 'gstr2b' | 'reconciliation' | 'gstr3b'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const MATCH_STATUS_LABELS: Record<string, string> = {
  MATCHED: 'Matched',
  MISMATCHED: 'Mismatched',
  MISSING_IN_PURCHASE: 'Missing in Purchase',
  EXTRA_IN_PURCHASE: 'Extra in Purchase',
  PENDING: 'Pending',
}

const MATCH_STATUS_COLORS: Record<string, string> = {
  MATCHED: 'bg-green-100 text-green-800',
  MISMATCHED: 'bg-orange-100 text-orange-800',
  MISSING_IN_PURCHASE: 'bg-red-100 text-red-800',
  EXTRA_IN_PURCHASE: 'bg-gray-100 text-gray-700',
  PENDING: 'bg-blue-100 text-blue-700',
}

function fmt(val: number | string | null | undefined): string {
  const n = typeof val === 'string' ? parseFloat(val) : (val ?? 0)
  return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function classificationBadge(cls: string) {
  if (cls === 'NIL') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">NIL</span>
  if (cls === 'PAYMENT') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">PAYMENT DUE</span>
  if (cls === 'CREDIT') return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">CREDIT</span>
  return null
}

export default function Reconciliation() {
  const now = new Date()
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [activeTab, setActiveTab] = useState<TabId>('purchase')
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  // Purchase data state
  const [purchaseFile, setPurchaseFile] = useState<File | null>(null)
  const [purchaseState, setPurchaseState] = useState<PurchaseUploadState>('idle')
  const [purchaseResult, setPurchaseResult] = useState<{ valid: number; invalid: number } | null>(null)
  const [purchaseError, setPurchaseError] = useState('')
  const purchaseFileRef = useRef<HTMLInputElement>(null)

  // GSTR-2B state
  const [gstr2bFile, setGstr2bFile] = useState<File | null>(null)
  const [gstr2bState, setGstr2bState] = useState<Gstr2bUploadState>('idle')
  const [gstr2bRowCount, setGstr2bRowCount] = useState<number | null>(null)
  const [gstr2bError, setGstr2bError] = useState('')
  const gstr2bFileRef = useRef<HTMLInputElement>(null)

  // Reconciliation state
  const [recoReport, setRecoReport] = useState<any>(null)
  const [recoEntries, setRecoEntries] = useState<any[]>([])
  const [recoMatchFilter, setRecoMatchFilter] = useState('')
  const [recoRunning, setRecoRunning] = useState(false)
  const [recoError, setRecoError] = useState('')

  // GSTR-3B state
  const [gstr3bSummary, setGstr3bSummary] = useState<any>(null)
  const [gstr3bGenerating, setGstr3bGenerating] = useState(false)
  const [gstr3bError, setGstr3bError] = useState('')

  // Load clients on mount
  useEffect(() => {
    api.get('/clients', { params: { limit: 200, status: 'ACTIVE' } })
      .then((r) => setClients(r.data.data || []))
      .catch(() => {})
  }, [])

  // Poll purchase validation status
  useEffect(() => {
    if (purchaseState !== 'validating' || !selectedClient) return
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/purchase/status?clientId=${selectedClient}&month=${month}&year=${year}`)
        const { validating, valid, invalid } = res.data.data
        if (!validating) {
          clearInterval(interval)
          setPurchaseResult({ valid, invalid })
          setPurchaseState('done')
        }
      } catch { /* ignore transient errors */ }
    }, 2000)
    return () => clearInterval(interval)
  }, [purchaseState, selectedClient, month, year])

  // Load reconciliation data when tab changes or client/period changes
  useEffect(() => {
    if (!selectedClient) return
    if (activeTab === 'reconciliation') loadRecoData()
    if (activeTab === 'gstr3b') loadGstr3b()
  }, [activeTab, selectedClient, month, year])

  // Load GSTR-2B count when tab is gstr2b
  useEffect(() => {
    if (activeTab === 'gstr2b' && selectedClient) loadGstr2bCount()
  }, [activeTab, selectedClient, month, year])

  async function loadGstr2bCount() {
    try {
      const res = await api.get(`/gstr2b/status?clientId=${selectedClient}&month=${month}&year=${year}`)
      if (res.data.data.total > 0) setGstr2bRowCount(res.data.data.total)
    } catch { /* non-critical */ }
  }

  async function loadRecoData() {
    try {
      const [reportRes, entriesRes] = await Promise.all([
        api.get(`/gstr2b/report/${selectedClient}?month=${month}&year=${year}`),
        api.get(`/gstr2b/${selectedClient}?month=${month}&year=${year}${recoMatchFilter ? `&matchStatus=${recoMatchFilter}` : ''}`),
      ])
      setRecoReport(reportRes.data.data)
      setRecoEntries(entriesRes.data.data || [])
    } catch { /* non-critical */ }
  }

  async function loadGstr3b() {
    try {
      const res = await api.get(`/gstr3b/${selectedClient}?month=${month}&year=${year}`)
      setGstr3bSummary(res.data.data)
    } catch { /* non-critical */ }
  }

  // Reload entries when filter changes
  useEffect(() => {
    if (activeTab === 'reconciliation' && selectedClient) {
      api.get(`/gstr2b/${selectedClient}?month=${month}&year=${year}${recoMatchFilter ? `&matchStatus=${recoMatchFilter}` : ''}`)
        .then((r) => setRecoEntries(r.data.data || []))
        .catch(() => {})
    }
  }, [recoMatchFilter])

  async function handlePurchaseUpload() {
    if (!selectedClient || !purchaseFile) return
    setPurchaseState('uploading')
    setPurchaseError('')
    setPurchaseResult(null)
    try {
      const formData = new FormData()
      formData.append('file', purchaseFile)
      formData.append('clientId', selectedClient)
      formData.append('month', String(month))
      formData.append('year', String(year))
      await api.post('/purchase/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setPurchaseState('validating')
    } catch (err: any) {
      setPurchaseError(err?.response?.data?.error || 'Upload failed')
      setPurchaseState('idle')
    }
  }

  async function handleGstr2bUpload() {
    if (!selectedClient || !gstr2bFile) return
    setGstr2bState('uploading')
    setGstr2bError('')
    setGstr2bRowCount(null)
    try {
      const formData = new FormData()
      formData.append('file', gstr2bFile)
      formData.append('clientId', selectedClient)
      formData.append('month', String(month))
      formData.append('year', String(year))
      const res = await api.post('/gstr2b/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setGstr2bRowCount(res.data.data?.uploaded ?? 0)
      setGstr2bState('done')
    } catch (err: any) {
      setGstr2bError(err?.response?.data?.error || 'Upload failed')
      setGstr2bState('idle')
    }
  }

  async function handleRunReconciliation() {
    if (!selectedClient) return
    setRecoRunning(true)
    setRecoError('')
    try {
      await api.post('/gstr2b/reconcile', { clientId: selectedClient, month, year })
      await loadRecoData()
    } catch (err: any) {
      setRecoError(err?.response?.data?.error || 'Reconciliation failed')
    } finally {
      setRecoRunning(false)
    }
  }

  async function handleGenerateGstr3b() {
    if (!selectedClient) return
    setGstr3bGenerating(true)
    setGstr3bError('')
    try {
      const res = await api.post('/gstr3b/generate', { clientId: selectedClient, month, year })
      setGstr3bSummary({ ...res.data.data.summary, jsonGenerated: true })
    } catch (err: any) {
      setGstr3bError(err?.response?.data?.error || 'Generation failed')
    } finally {
      setGstr3bGenerating(false)
    }
  }

  async function handleDownloadGstr3b() {
    try {
      const res = await api.get('/gstr3b/download', {
        params: { clientId: selectedClient, month, year },
        responseType: 'blob',
      })
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/json' }))
      const a = document.createElement('a')
      const cd = res.headers['content-disposition'] || ''
      const fnMatch = cd.match(/filename="([^"]+)"/)
      a.href = url
      a.download = fnMatch ? fnMatch[1] : `GSTR3B_${month}_${year}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setGstr3bError(err?.response?.data?.error || 'Download failed')
    }
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'purchase', label: 'Purchase Data' },
    { id: 'gstr2b', label: 'GSTR-2B Upload' },
    { id: 'reconciliation', label: 'Reconciliation' },
    { id: 'gstr3b', label: 'GSTR-3B' },
  ]

  const hasPurchaseData = purchaseState === 'done' || purchaseResult !== null
  const hasGstr2bData = gstr2bRowCount !== null && gstr2bRowCount > 0
  const hasRecoReport = recoReport !== null

  return (
    <DashboardLayout title="Reconciliation">
      {/* Client / Period Selector */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs font-medium text-gray-600 mb-1">Client</label>
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">Select Client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.legalName} ({c.gstin})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="p-6">
          {/* ── Tab 1: Purchase Data ── */}
          {activeTab === 'purchase' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-800">Upload Purchase Register</h3>
                <a
                  href={`${import.meta.env.DEV ? '/api' : 'https://api.gstpilot.in/api'}/purchase/sample-template`}
                  className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  download
                >
                  &#11015; Download Sample Template
                </a>
              </div>

              <p className="text-sm text-gray-500">
                Upload your purchase register (supplier invoices) for the selected period.
                The system will validate GSTIN format, dates, tax calculations, and check for duplicates.
              </p>

              {purchaseError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{purchaseError}</div>
              )}
              {purchaseState === 'uploading' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 flex-shrink-0"></div>
                  Uploading file...
                </div>
              )}
              {purchaseState === 'validating' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 flex-shrink-0"></div>
                  File uploaded. Validating purchase data...
                </div>
              )}
              {purchaseState === 'done' && purchaseResult && (
                purchaseResult.invalid === 0 ? (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                    <span className="text-green-600 font-bold mr-2">&#10003;</span>
                    {purchaseResult.valid} purchase record{purchaseResult.valid !== 1 ? 's' : ''} uploaded and validated successfully.
                  </div>
                ) : (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    <span className="text-amber-600 font-bold mr-2">&#9888;</span>
                    {purchaseResult.valid + purchaseResult.invalid} records uploaded.{' '}
                    {purchaseResult.invalid} record{purchaseResult.invalid !== 1 ? 's' : ''} have validation errors.
                    Fix the errors and re-upload.
                  </div>
                )
              )}

              {/* File drop zone */}
              <div
                onClick={() => purchaseFileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  purchaseFile
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
                }`}
              >
                <input
                  ref={purchaseFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) { setPurchaseFile(f); setPurchaseError(''); setPurchaseResult(null); setPurchaseState('idle') }
                  }}
                />
                {purchaseFile ? (
                  <div>
                    <div className="text-green-600 text-3xl mb-2">&#10003;</div>
                    <p className="text-sm font-medium text-gray-800">{purchaseFile.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{(purchaseFile.size / 1024).toFixed(1)} KB — Click to change</p>
                  </div>
                ) : (
                  <div>
                    <div className="text-gray-400 text-3xl mb-2">&#8682;</div>
                    <p className="text-sm font-medium text-gray-600">Click to select or drag and drop</p>
                    <p className="text-xs text-gray-400 mt-1">Accepts .xlsx, .xls, .csv files</p>
                  </div>
                )}
              </div>

              <button
                onClick={handlePurchaseUpload}
                disabled={!selectedClient || !purchaseFile || purchaseState === 'uploading' || purchaseState === 'validating'}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {(purchaseState === 'uploading' || purchaseState === 'validating') && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                {purchaseState === 'uploading' ? 'Uploading...' : purchaseState === 'validating' ? 'Validating...' : 'Upload & Validate'}
              </button>
            </div>
          )}

          {/* ── Tab 2: GSTR-2B Upload ── */}
          {activeTab === 'gstr2b' && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-gray-800">Upload GSTR-2B</h3>
              <p className="text-sm text-gray-500">
                Download GSTR-2B from the GST Portal and upload it here. Both JSON and Excel formats are supported.
              </p>

              {gstr2bError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{gstr2bError}</div>
              )}
              {gstr2bState === 'uploading' && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 flex-shrink-0"></div>
                  Uploading and processing GSTR-2B...
                </div>
              )}
              {gstr2bState === 'done' && gstr2bRowCount !== null && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                  <span className="text-green-600 font-bold mr-2">&#10003;</span>
                  {gstr2bRowCount} GSTR-2B entries loaded. Proceed to the Reconciliation tab.
                </div>
              )}
              {gstr2bState === 'idle' && gstr2bRowCount && gstr2bRowCount > 0 && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-sm text-indigo-700">
                  {gstr2bRowCount} GSTR-2B entries already loaded for this period.
                </div>
              )}

              <div
                onClick={() => gstr2bFileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                  gstr2bFile
                    ? 'border-green-300 bg-green-50'
                    : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
                }`}
              >
                <input
                  ref={gstr2bFileRef}
                  type="file"
                  accept=".json,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    if (f) { setGstr2bFile(f); setGstr2bError(''); setGstr2bState('idle') }
                  }}
                />
                {gstr2bFile ? (
                  <div>
                    <div className="text-green-600 text-3xl mb-2">&#10003;</div>
                    <p className="text-sm font-medium text-gray-800">{gstr2bFile.name}</p>
                    <p className="text-xs text-gray-500 mt-1">{(gstr2bFile.size / 1024).toFixed(1)} KB — Click to change</p>
                  </div>
                ) : (
                  <div>
                    <div className="text-gray-400 text-3xl mb-2">&#8682;</div>
                    <p className="text-sm font-medium text-gray-600">Click to select GSTR-2B file</p>
                    <p className="text-xs text-gray-400 mt-1">Accepts .json (GST Portal) or .xlsx/.xls (Excel export)</p>
                  </div>
                )}
              </div>

              <button
                onClick={handleGstr2bUpload}
                disabled={!selectedClient || !gstr2bFile || gstr2bState === 'uploading'}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {gstr2bState === 'uploading' && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                {gstr2bState === 'uploading' ? 'Uploading...' : 'Upload GSTR-2B'}
              </button>
            </div>
          )}

          {/* ── Tab 3: Reconciliation ── */}
          {activeTab === 'reconciliation' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-800">Purchase vs GSTR-2B Reconciliation</h3>
                <button
                  onClick={handleRunReconciliation}
                  disabled={!selectedClient || recoRunning}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {recoRunning && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                  {recoRunning ? 'Running...' : 'Run Reconciliation'}
                </button>
              </div>

              {recoError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{recoError}</div>
              )}

              {!selectedClient && (
                <p className="text-sm text-gray-400">Select a client and period above to run reconciliation.</p>
              )}

              {/* Summary cards */}
              {recoReport && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Purchase Records', value: recoReport.totalPurchase, color: 'text-gray-800' },
                    { label: 'GSTR-2B Entries', value: recoReport.totalGstr2b, color: 'text-gray-800' },
                    { label: 'Matched', value: recoReport.matched, color: 'text-green-700' },
                    { label: 'Mismatched', value: recoReport.mismatched, color: 'text-orange-700' },
                    { label: 'Missing in Purchase', value: recoReport.missingInPurchase, color: 'text-red-700' },
                    { label: 'Extra in Purchase', value: recoReport.extraInPurchase, color: 'text-gray-600' },
                    {
                      label: 'Match Rate',
                      value: recoReport.totalGstr2b > 0
                        ? `${((recoReport.matched / recoReport.totalGstr2b) * 100).toFixed(1)}%`
                        : '—',
                      color: 'text-indigo-700',
                    },
                    { label: 'Eligible ITC', value: fmt(recoReport.totalItcAvailable), color: 'text-emerald-700' },
                  ].map((card) => (
                    <div key={card.label} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                      <p className="text-xs text-gray-500 mb-1">{card.label}</p>
                      <p className={`text-lg font-bold ${card.color}`}>{card.value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* ITC footer */}
              {recoReport && (
                <div className="flex flex-wrap gap-4 text-sm p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <span className="text-gray-700">
                    <span className="font-medium">Eligible ITC:</span>{' '}
                    <span className="text-emerald-700 font-semibold">{fmt(recoReport.totalItcAvailable)}</span>
                  </span>
                  <span className="text-gray-700">
                    <span className="font-medium">ITC at Risk:</span>{' '}
                    <span className="text-red-700 font-semibold">{fmt(recoReport.totalItcMismatch)}</span>
                  </span>
                </div>
              )}

              {/* Filter + results table */}
              {recoEntries.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-gray-600">{recoEntries.length} entries</p>
                    <select
                      value={recoMatchFilter}
                      onChange={(e) => setRecoMatchFilter(e.target.value)}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="">All Statuses</option>
                      <option value="MATCHED">Matched</option>
                      <option value="MISMATCHED">Mismatched</option>
                      <option value="MISSING_IN_PURCHASE">Missing in Purchase</option>
                      <option value="EXTRA_IN_PURCHASE">Extra in Purchase</option>
                    </select>
                  </div>

                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Supplier GSTIN</th>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">Taxable</th>
                          <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">IGST</th>
                          <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">CGST</th>
                          <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">SGST</th>
                          <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">ITC Avail.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {recoEntries.map((entry: any) => (
                          <tr key={entry.id} className="hover:bg-gray-50">
                            <td className="px-3 py-2.5">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${MATCH_STATUS_COLORS[entry.matchStatus] || 'bg-gray-100 text-gray-700'}`}>
                                {MATCH_STATUS_LABELS[entry.matchStatus] || entry.matchStatus}
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-xs text-gray-700 font-mono">{entry.supplierGstin}</td>
                            <td className="px-3 py-2.5 text-sm text-gray-700">{entry.invoiceNumber}</td>
                            <td className="px-3 py-2.5 text-sm text-gray-500">{entry.invoiceDate}</td>
                            <td className="px-3 py-2.5 text-sm text-right text-gray-700">{fmt(entry.taxableValue)}</td>
                            <td className="px-3 py-2.5 text-sm text-right text-gray-600">{fmt(entry.igstAmount)}</td>
                            <td className="px-3 py-2.5 text-sm text-right text-gray-600">{fmt(entry.cgstAmount)}</td>
                            <td className="px-3 py-2.5 text-sm text-right text-gray-600">{fmt(entry.sgstAmount)}</td>
                            <td className="px-3 py-2.5 text-sm text-right font-medium text-emerald-700">{fmt(entry.itcAvailable)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!recoReport && selectedClient && (
                <div className="text-center py-10 text-gray-400">
                  <div className="text-4xl mb-3">&#9878;</div>
                  <p className="text-sm">No reconciliation report yet. Click "Run Reconciliation" to start.</p>
                  <p className="text-xs mt-1 text-gray-400">Make sure both Purchase Data and GSTR-2B have been uploaded first.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Tab 4: GSTR-3B ── */}
          {activeTab === 'gstr3b' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-semibold text-gray-800">GSTR-3B Computation</h3>
                <div className="flex gap-2">
                  {gstr3bSummary?.jsonGenerated && (
                    <button
                      onClick={handleDownloadGstr3b}
                      className="px-4 py-2 border border-indigo-600 text-indigo-600 text-sm font-medium rounded-lg hover:bg-indigo-50 transition-colors flex items-center gap-2"
                    >
                      &#11015; Download JSON
                    </button>
                  )}
                  <button
                    onClick={handleGenerateGstr3b}
                    disabled={!selectedClient || !hasRecoReport || gstr3bGenerating}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                    title={!hasRecoReport ? 'Run reconciliation first' : undefined}
                  >
                    {gstr3bGenerating && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                    {gstr3bGenerating ? 'Generating...' : gstr3bSummary ? 'Re-generate GSTR-3B' : 'Generate GSTR-3B'}
                  </button>
                </div>
              </div>

              {gstr3bError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{gstr3bError}</div>
              )}

              {!hasRecoReport && selectedClient && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                  Reconciliation must be completed before generating GSTR-3B. Go to the Reconciliation tab first.
                </div>
              )}

              {gstr3bSummary ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-600">Classification:</span>
                    {classificationBadge(gstr3bSummary.classification)}
                  </div>

                  {/* Tax summary table */}
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tax Type</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Output Tax (GSTR-1)</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">ITC (GSTR-2B)</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Net Payable</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {[
                          {
                            label: 'IGST',
                            output: gstr3bSummary.outwardIgst,
                            itc: gstr3bSummary.itcIgst,
                            net: gstr3bSummary.netIgst,
                          },
                          {
                            label: 'CGST',
                            output: gstr3bSummary.outwardCgst,
                            itc: gstr3bSummary.itcCgst,
                            net: gstr3bSummary.netCgst,
                          },
                          {
                            label: 'SGST',
                            output: gstr3bSummary.outwardSgst,
                            itc: gstr3bSummary.itcSgst,
                            net: gstr3bSummary.netSgst,
                          },
                        ].map((row) => {
                          const netVal = typeof row.net === 'string' ? parseFloat(row.net) : row.net
                          return (
                            <tr key={row.label} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm font-medium text-gray-700">{row.label}</td>
                              <td className="px-4 py-3 text-sm text-right text-gray-700">{fmt(row.output)}</td>
                              <td className="px-4 py-3 text-sm text-right text-green-700">{fmt(row.itc)}</td>
                              <td className={`px-4 py-3 text-sm text-right font-semibold ${netVal > 0 ? 'text-red-700' : netVal < 0 ? 'text-green-700' : 'text-gray-600'}`}>
                                {fmt(row.net)}
                              </td>
                            </tr>
                          )
                        })}
                        <tr className="bg-gray-50 font-semibold">
                          <td className="px-4 py-3 text-sm text-gray-700">Total</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-700">
                            {fmt(
                              (parseFloat(gstr3bSummary.outwardIgst || 0)) +
                              (parseFloat(gstr3bSummary.outwardCgst || 0)) +
                              (parseFloat(gstr3bSummary.outwardSgst || 0))
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-right text-green-700">
                            {fmt(
                              (parseFloat(gstr3bSummary.itcIgst || 0)) +
                              (parseFloat(gstr3bSummary.itcCgst || 0)) +
                              (parseFloat(gstr3bSummary.itcSgst || 0))
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {fmt(
                              (parseFloat(gstr3bSummary.netIgst || 0)) +
                              (parseFloat(gstr3bSummary.netCgst || 0)) +
                              (parseFloat(gstr3bSummary.netSgst || 0))
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="text-xs text-gray-400">
                    Taxable Value (GSTR-1): {fmt(gstr3bSummary.outwardTaxableValue)}
                  </div>
                </div>
              ) : (
                !gstr3bGenerating && selectedClient && (
                  <div className="text-center py-10 text-gray-400">
                    <div className="text-4xl mb-3">&#128210;</div>
                    <p className="text-sm">GSTR-3B not yet generated for this period.</p>
                    {hasRecoReport && (
                      <p className="text-xs mt-1">Click "Generate GSTR-3B" to compute output tax and ITC.</p>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
