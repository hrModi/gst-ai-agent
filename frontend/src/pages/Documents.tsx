import { useState, useEffect } from 'react'
import api from '../lib/api'
import DashboardLayout from '../components/layout/DashboardLayout'

interface Document {
  id: string
  clientId: string
  documentType: string
  fileName: string
  fileSize: number | null
  month: number | null
  year: number | null
  createdAt: string
  client?: { legalName: string; tradeName: string | null }
  uploader?: { name: string }
}

interface Client {
  id: string
  legalName: string
  tradeName: string | null
}

export default function Documents() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [filterClient, setFilterClient] = useState('')
  const [filterType, setFilterType] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      setLoading(true)
      const [docRes, clientRes] = await Promise.all([
        api.get('/documents', { params: { clientId: filterClient || undefined, documentType: filterType || undefined } }),
        api.get('/clients', { params: { status: 'ACTIVE', limit: 200 } }),
      ])
      setDocuments(docRes.data.data || [])
      setClients(clientRes.data.data || [])
    } catch {
      setError('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [filterClient, filterType])

  function formatFileSize(bytes: number | null): string {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <DashboardLayout title="Documents">
      <div className="space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}

        <div className="flex items-center gap-4">
          <select
            value={filterClient}
            onChange={(e) => setFilterClient(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.tradeName || c.legalName}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All Types</option>
            <option value="INVOICE_DATA">Invoice Data</option>
            <option value="GSTR1_JSON">GSTR-1 JSON</option>
            <option value="GSTR3B">GSTR-3B</option>
            <option value="ACKNOWLEDGMENT">Acknowledgment</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        <div className="bg-white shadow rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            </div>
          ) : documents.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No documents found.</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">File Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Uploaded By</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {doc.client?.tradeName || doc.client?.legalName || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                        {doc.documentType.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 font-mono text-xs">{doc.fileName}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatFileSize(doc.fileSize)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {doc.month && doc.year
                        ? `${new Date(2000, doc.month - 1).toLocaleString('en', { month: 'short' })} ${doc.year}`
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{doc.uploader?.name || '-'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(doc.createdAt).toLocaleDateString('en-IN')}
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
