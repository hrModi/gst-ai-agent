import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'

interface ClientData {
  id: string
  gstin: string
  legalName: string
  tradeName: string
  contactPerson: string
  email: string
  phone: string
  address: string
  stateCode: string
  filingFrequency: string
  status: 'ACTIVE' | 'INACTIVE'
  assignedTo: string | null
  assignedUser: { id: string; name: string; email: string } | null
  createdAt: string
}

interface FilingRecord {
  id: string
  month: number
  year: number
  returnType: string
  arn: string | null
  filingDate: string | null
}

interface InvoiceSummary {
  totalInvoices: number
  totalTaxableValue: number
  totalTax: number
  lastUploaded: string
}

function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [client, setClient] = useState<ClientData | null>(null)
  const [filingHistory, setFilingHistory] = useState<FilingRecord[]>([])
  const [invoiceSummary, setInvoiceSummary] = useState<InvoiceSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (id) fetchClientDetail()
  }, [id])

  async function fetchClientDetail() {
    try {
      setLoading(true)
      const response = await api.get(`/clients/${id}`)
      const clientData = response.data.data
      setClient(clientData)
      setFilingHistory(clientData?.filedReturns || [])
      setInvoiceSummary(null)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load client details')
    } finally {
      setLoading(false)
    }
  }

  function getStatusColor(status: string): string {
    switch (status?.toLowerCase()) {
      case 'filed':
        return 'bg-green-100 text-green-800'
      case 'in_progress':
      case 'in progress':
        return 'bg-yellow-100 text-yellow-800'
      case 'error':
      case 'errors':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Client Detail">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  if (error || !client) {
    return (
      <DashboardLayout title="Client Detail">
        <div className="text-center py-20">
          <p className="text-red-600 mb-4">{error || 'Client not found'}</p>
          <Link to="/clients" className="text-indigo-600 hover:text-indigo-800 font-medium">
            Back to Clients
          </Link>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title={client.legalName}>
      {/* Back link */}
      <div className="mb-6">
        <Link to="/clients" className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
          &larr; Back to Clients
        </Link>
      </div>

      {/* Client Info Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">{client.legalName}</h3>
            {client.tradeName && (
              <p className="text-gray-500 mt-1">Trade Name: {client.tradeName}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                client.status === 'ACTIVE'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {client.status}
            </span>
            {(user?.role === 'ADMIN') && (
              <button className="px-4 py-2 text-sm border border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors">
                Edit Client
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">GSTIN</label>
            <p className="font-mono text-sm text-gray-900 uppercase mt-1">{client.gstin}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Contact Person</label>
            <p className="text-sm text-gray-900 mt-1">{client.contactPerson || '-'}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Email</label>
            <p className="text-sm text-gray-900 mt-1">{client.email || '-'}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Phone</label>
            <p className="text-sm text-gray-900 mt-1">{client.phone || '-'}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">State Code</label>
            <p className="text-sm text-gray-900 mt-1">{client.stateCode || '-'}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Filing Frequency</label>
            <p className="text-sm text-gray-900 mt-1">{client.filingFrequency || 'Monthly'}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Assigned To</label>
            <p className="text-sm text-gray-900 mt-1">{client.assignedUser?.name || '-'}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Address</label>
            <p className="text-sm text-gray-900 mt-1">{client.address || '-'}</p>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Member Since</label>
            <p className="text-sm text-gray-900 mt-1">{formatDate(client.createdAt)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Invoice Summary */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Invoice Summary</h3>
            <Link
              to={`/invoices/${id}`}
              className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
            >
              View All
            </Link>
          </div>
          {invoiceSummary ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Total Invoices</p>
                <p className="text-lg font-semibold text-gray-900">{invoiceSummary.totalInvoices}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Taxable Value</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatINR(invoiceSummary.totalTaxableValue)}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Total Tax</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatINR(invoiceSummary.totalTax)}
                </p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500">Last Uploaded</p>
                <p className="text-lg font-semibold text-gray-900">
                  {formatDate(invoiceSummary.lastUploaded)}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No invoice data available.</p>
          )}
        </div>

        {/* Filing History */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Filing History</h3>
          {filingHistory.length === 0 ? (
            <p className="text-sm text-gray-500">No filing history available.</p>
          ) : (
            <div className="space-y-3">
              {filingHistory.map((filing) => (
                <div
                  key={filing.id}
                  className="flex items-center justify-between p-3 border border-gray-100 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {filing.returnType} - {MONTH_NAMES[filing.month - 1]} {filing.year}
                    </p>
                    {filing.arn && (
                      <p className="text-xs text-gray-500 font-mono mt-0.5">ARN: {filing.arn}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        filing.arn ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {filing.arn ? 'Filed' : 'Pending'}
                    </span>
                    {filing.filingDate && (
                      <p className="text-xs text-gray-400 mt-1">{formatDate(filing.filingDate)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
