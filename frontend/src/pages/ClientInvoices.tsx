import { useState, useEffect, Fragment } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/api'
import DashboardLayout from '../components/layout/DashboardLayout'

interface ValidationError {
  id: string
  errorType: string
  fieldName: string
  errorMessage: string
  severity: 'ERROR' | 'WARNING'
  isResolved: boolean
}

interface Invoice {
  id: string
  rowNumber: number | null
  invoiceNumber: string
  invoiceDate: string
  buyerGstin: string | null
  buyerName: string | null
  taxableValue: string
  igstAmount: string
  cgstAmount: string
  sgstAmount: string
  transactionType: string | null
  validationStatus: 'PENDING' | 'VALID' | 'INVALID'
  validationErrors: ValidationError[]
}

function formatINR(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ClientInvoices() {
  const { clientId } = useParams<{ clientId: string }>()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [validating, setValidating] = useState(false)
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  useEffect(() => {
    fetchInvoices()
  }, [clientId, month, year])

  async function fetchInvoices() {
    try {
      setLoading(true)
      setError('')
      const res = await api.get(`/invoices/${clientId}`, { params: { month, year } })
      setInvoices(res.data.data.invoices || [])
      setClientName(res.data.data.clientName || '')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }

  async function handleRevalidate() {
    try {
      setValidating(true)
      await api.post('/invoices/validate', { clientId, month, year })
      await fetchInvoices()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Validation failed')
    } finally {
      setValidating(false)
    }
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      VALID: 'bg-green-100 text-green-800',
      INVALID: 'bg-red-100 text-red-800',
      PENDING: 'bg-gray-100 text-gray-800',
    }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[status] || colors.PENDING}`}>
        {status}
      </span>
    )
  }

  const totalTax = (inv: Invoice) => {
    const igst = parseFloat(inv.igstAmount) || 0
    const cgst = parseFloat(inv.cgstAmount) || 0
    const sgst = parseFloat(inv.sgstAmount) || 0
    return igst + cgst + sgst
  }

  return (
    <DashboardLayout title={clientName ? `Invoices - ${clientName}` : 'Client Invoices'}>
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {new Date(2000, i).toLocaleString('en', { month: 'long' })}
                </option>
              ))}
            </select>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              {[2024, 2025, 2026, 2027].map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleRevalidate}
              disabled={validating || invoices.length === 0}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg text-sm hover:bg-yellow-600 disabled:opacity-50"
            >
              {validating ? 'Validating...' : 'Re-validate All'}
            </button>
            <Link
              to="/invoices/upload"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
            >
              Upload More
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-3 text-gray-500">Loading invoices...</p>
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <p className="text-gray-500">No invoices found for this period.</p>
            <Link to="/invoices/upload" className="text-indigo-600 hover:underline mt-2 inline-block">
              Upload invoices
            </Link>
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Row</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Buyer</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Taxable Value</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tax</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoices.map((inv) => (
                  <Fragment key={inv.id}>
                    <tr
                      className={`hover:bg-gray-50 cursor-pointer ${inv.validationErrors.length > 0 ? 'bg-red-50/30' : ''}`}
                      onClick={() => setExpandedRow(expandedRow === inv.id ? null : inv.id)}
                    >
                      <td className="px-4 py-3 text-sm text-gray-500">{inv.rowNumber || '-'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{inv.invoiceDate}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {inv.buyerGstin ? (
                          <span className="font-mono text-xs">{inv.buyerGstin}</span>
                        ) : (
                          inv.buyerName || '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                          {inv.transactionType || 'N/A'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{formatINR(inv.taxableValue)}</td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900">{formatINR(totalTax(inv))}</td>
                      <td className="px-4 py-3 text-center">{statusBadge(inv.validationStatus)}</td>
                    </tr>
                    {expandedRow === inv.id && inv.validationErrors.length > 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-3 bg-red-50">
                          <div className="space-y-1">
                            {inv.validationErrors.map((err) => (
                              <div
                                key={err.id}
                                className={`flex items-start gap-2 text-sm ${
                                  err.severity === 'ERROR' ? 'text-red-700' : 'text-yellow-700'
                                }`}
                              >
                                <span className="font-medium">{err.severity}:</span>
                                <span>{err.errorMessage}</span>
                                <span className="text-gray-400">({err.fieldName})</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

