import { useState, useEffect } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import api from '../lib/api'

interface FilingStatusRow {
  clientId: string
  clientName: string
  gstin: string
  dataReceived: boolean
  gstr1Status: string
  gstr3bStatus: string
  gstr1Arn: string
  gstr3bArn: string
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function getStatusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case 'filed':
      return 'bg-green-100 text-green-800'
    case 'in_progress':
    case 'in progress':
      return 'bg-yellow-100 text-yellow-800'
    case 'error':
    case 'errors':
      return 'bg-red-100 text-red-800'
    case 'not_started':
    case 'not started':
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function formatStatusLabel(status: string): string {
  if (!status) return 'Not Started'
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function Filing() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [filings, setFilings] = useState<FilingStatusRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ARN modal state
  const [arnModal, setArnModal] = useState<{
    open: boolean
    clientId: string
    clientName: string
    returnType: 'GSTR1' | 'GSTR3B'
  }>({ open: false, clientId: '', clientName: '', returnType: 'GSTR1' })
  const [arnValue, setArnValue] = useState('')
  const [arnSubmitting, setArnSubmitting] = useState(false)
  const [arnError, setArnError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    fetchFilings()
  }, [month, year])

  async function fetchFilings() {
    try {
      setLoading(true)
      setError('')
      const response = await api.get('/filing-status', { params: { month, year } })
      setFilings(response.data.filings || response.data || [])
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load filing status')
    } finally {
      setLoading(false)
    }
  }

  function openArnModal(clientId: string, clientName: string, returnType: 'GSTR1' | 'GSTR3B') {
    setArnModal({ open: true, clientId, clientName, returnType })
    setArnValue('')
    setArnError('')
  }

  function closeArnModal() {
    setArnModal({ open: false, clientId: '', clientName: '', returnType: 'GSTR1' })
    setArnValue('')
    setArnError('')
  }

  async function submitArn() {
    if (!arnValue.trim()) {
      setArnError('ARN is required')
      return
    }

    setArnSubmitting(true)
    setArnError('')
    try {
      await api.post('/filing-status/record', {
        clientId: arnModal.clientId,
        returnType: arnModal.returnType,
        month,
        year,
        arn: arnValue.trim(),
      })
      setSuccessMessage(`Filing recorded for ${arnModal.clientName}`)
      closeArnModal()
      fetchFilings()
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err: any) {
      setArnError(err?.response?.data?.message || 'Failed to record filing')
    } finally {
      setArnSubmitting(false)
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)

  return (
    <DashboardLayout title="Filing Status">
      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Month/Year Selector */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Month</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto text-sm text-gray-500">
            Showing filing status for {MONTHS[month - 1]} {year}
          </div>
        </div>
      </div>

      {/* Filing Status Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          </div>
        ) : filings.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">No filing data available</p>
            <p className="text-sm mt-1">No clients found for this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Client Name
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    GSTIN
                  </th>
                  <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Data Received
                  </th>
                  <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    GSTR-1 Status
                  </th>
                  <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    GSTR-3B Status
                  </th>
                  <th className="text-center px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filings.map((filing) => (
                  <tr key={filing.clientId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {filing.clientName}
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-mono text-sm text-gray-600 uppercase">
                        {filing.gstin}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {filing.dataReceived ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Yes
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(
                          filing.gstr1Status
                        )}`}
                      >
                        {formatStatusLabel(filing.gstr1Status)}
                      </span>
                      {filing.gstr1Arn && (
                        <p className="text-xs text-gray-400 font-mono mt-1">{filing.gstr1Arn}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(
                          filing.gstr3bStatus
                        )}`}
                      >
                        {formatStatusLabel(filing.gstr3bStatus)}
                      </span>
                      {filing.gstr3bArn && (
                        <p className="text-xs text-gray-400 font-mono mt-1">{filing.gstr3bArn}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {filing.gstr1Status !== 'filed' && (
                          <button
                            onClick={() => openArnModal(filing.clientId, filing.clientName, 'GSTR1')}
                            className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-medium transition-colors"
                          >
                            Record GSTR-1
                          </button>
                        )}
                        {filing.gstr3bStatus !== 'filed' && (
                          <button
                            onClick={() => openArnModal(filing.clientId, filing.clientName, 'GSTR3B')}
                            className="text-xs px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 font-medium transition-colors"
                          >
                            Record GSTR-3B
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ARN Entry Modal */}
      {arnModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-1">Record Filing</h3>
            <p className="text-sm text-gray-500 mb-4">
              {arnModal.returnType} for {arnModal.clientName} - {MONTHS[month - 1]} {year}
            </p>

            {arnError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {arnError}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ARN (Acknowledgement Reference Number)
              </label>
              <input
                type="text"
                value={arnValue}
                onChange={(e) => setArnValue(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                placeholder="Enter ARN from GST Portal"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={closeArnModal}
                className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitArn}
                disabled={arnSubmitting}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 transition-colors flex items-center gap-2"
              >
                {arnSubmitting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                {arnSubmitting ? 'Saving...' : 'Save Filing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
