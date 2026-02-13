import { useState, useEffect } from 'react'
import api from '../lib/api'
import DashboardLayout from '../components/layout/DashboardLayout'

interface Client {
  id: string
  gstin: string
  legalName: string
  tradeName: string | null
}

interface GenerationResult {
  json: object
  metadata: {
    totalInvoices: number
    totalTaxableValue: number
    totalTax: number
    sections: string[]
    fileName: string
  }
}

function formatINR(value: number): string {
  return value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function JsonGenerator() {
  const [clients, setClients] = useState<Client[]>([])
  const [clientId, setClientId] = useState('')
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [loading, setLoading] = useState(false)
  const [loadingClients, setLoadingClients] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState<GenerationResult | null>(null)
  const [showJson, setShowJson] = useState(false)

  useEffect(() => {
    async function fetchClients() {
      try {
        const res = await api.get('/clients', { params: { status: 'ACTIVE', limit: 200 } })
        setClients(res.data.data || [])
      } catch {
        setError('Failed to load clients')
      } finally {
        setLoadingClients(false)
      }
    }
    fetchClients()
  }, [])

  async function handleGenerate() {
    if (!clientId) {
      setError('Please select a client')
      return
    }
    try {
      setLoading(true)
      setError('')
      setResult(null)
      const res = await api.post('/json-generate', { clientId, month, year })
      setResult(res.data.data)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to generate JSON')
    } finally {
      setLoading(false)
    }
  }

  function handleDownload() {
    if (!result) return
    const blob = new Blob([JSON.stringify(result.json, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = result.metadata.fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <DashboardLayout title="GSTR-1 JSON Generator">
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
        )}

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Generate GSTR-1 JSON</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                disabled={loadingClients}
              >
                <option value="">Select a client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.tradeName || c.legalName} ({c.gstin})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {new Date(2000, i).toLocaleString('en', { month: 'long' })}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {[2024, 2025, 2026, 2027].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleGenerate}
                disabled={loading || !clientId}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate JSON'}
              </button>
            </div>
          </div>
        </div>

        {result && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white shadow rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Generated JSON</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowJson(!showJson)}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    {showJson ? 'Hide' : 'Show'} Preview
                  </button>
                  <button
                    onClick={handleDownload}
                    className="px-3 py-1 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Download
                  </button>
                </div>
              </div>
              {showJson && (
                <div className="p-4 max-h-96 overflow-auto">
                  <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap">
                    {JSON.stringify(result.json, null, 2)}
                  </pre>
                </div>
              )}
              {!showJson && (
                <div className="p-6 text-center text-gray-500">
                  <p>JSON generated successfully. Click "Show Preview" to view or "Download" to save.</p>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Metadata</h3>
                <dl className="space-y-3">
                  <div>
                    <dt className="text-sm text-gray-500">File Name</dt>
                    <dd className="text-sm font-mono font-medium text-gray-900">{result.metadata.fileName}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Total Invoices</dt>
                    <dd className="text-sm font-medium text-gray-900">{result.metadata.totalInvoices}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Total Taxable Value</dt>
                    <dd className="text-sm font-medium text-gray-900">{formatINR(result.metadata.totalTaxableValue)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Total Tax</dt>
                    <dd className="text-sm font-medium text-gray-900">{formatINR(result.metadata.totalTax)}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Sections Included</dt>
                    <dd className="flex flex-wrap gap-1 mt-1">
                      {result.metadata.sections.map((s) => (
                        <span key={s} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                          {s.toUpperCase()}
                        </span>
                      ))}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-800 mb-2">Next Steps</h4>
                <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
                  <li>Download the JSON file</li>
                  <li>Open GST Offline Tool</li>
                  <li>Import the JSON file</li>
                  <li>Review and upload to GST Portal</li>
                  <li>Complete filing with OTP/DSC</li>
                  <li>Record ARN in Filing Status</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
