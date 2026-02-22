import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import api from '../lib/api'

interface ClientOption {
  id: string
  legalName: string
  gstin: string
}

type UploadState = 'idle' | 'uploading' | 'validating' | 'done'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function InvoiceUpload() {
  const now = new Date()
  const [clients, setClients] = useState<ClientOption[]>([])
  const [selectedClient, setSelectedClient] = useState('')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [file, setFile] = useState<File | null>(null)
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [error, setError] = useState('')
  const [validationResult, setValidationResult] = useState<{ valid: number; invalid: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchClients()
  }, [])

  // Polling: check validation status every 2s while in 'validating' state
  useEffect(() => {
    if (uploadState !== 'validating') return
    const interval = setInterval(async () => {
      try {
        const res = await api.get(`/invoices/status?clientId=${selectedClient}&month=${month}&year=${year}`)
        const { validating, valid, invalid } = res.data.data
        if (!validating) {
          clearInterval(interval)
          setValidationResult({ valid, invalid })
          setUploadState('done')
        }
      } catch {
        // Ignore transient polling errors
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [uploadState, selectedClient, month, year])

  async function fetchClients() {
    try {
      const response = await api.get('/clients', { params: { limit: 200, status: 'ACTIVE' } })
      setClients(response.data.data || [])
    } catch {
      // Non-critical
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) {
      validateAndSetFile(droppedFile)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      validateAndSetFile(selectedFile)
    }
  }

  function validateAndSetFile(f: File) {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ]
    const validExtensions = ['.xlsx', '.xls', '.csv']
    const ext = '.' + f.name.split('.').pop()?.toLowerCase()

    if (!validTypes.includes(f.type) && !validExtensions.includes(ext)) {
      setError('Invalid file type. Please upload .xlsx, .xls, or .csv files only.')
      setFile(null)
      return
    }

    setFile(f)
    setError('')
    setValidationResult(null)
    setUploadState('idle')
  }

  async function handleUpload() {
    if (!selectedClient) {
      setError('Please select a client')
      return
    }
    if (!file) {
      setError('Please select a file to upload')
      return
    }

    setUploadState('uploading')
    setError('')
    setValidationResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('clientId', selectedClient)
      formData.append('month', String(month))
      formData.append('year', String(year))

      await api.post('/invoices/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setUploadState('validating')
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to upload file')
      setUploadState('idle')
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i)
  const isProcessing = uploadState === 'uploading' || uploadState === 'validating'

  return (
    <DashboardLayout title="Upload Sales Data">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {uploadState === 'uploading' && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 flex-shrink-0"></div>
          Uploading your file...
        </div>
      )}

      {uploadState === 'validating' && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 flex-shrink-0"></div>
          File uploaded. System is validating your data...
        </div>
      )}

      {uploadState === 'done' && validationResult && (
        validationResult.invalid === 0 ? (
          <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-green-600 text-base font-bold">&#10003;</span>
              <span className="font-medium">
                {validationResult.valid} record{validationResult.valid !== 1 ? 's' : ''} uploaded and validated successfully.
              </span>
            </div>
            <Link
              to={`/filing?month=${month}&year=${year}`}
              className="text-green-700 hover:text-green-900 underline font-medium"
            >
              View Filing Status &rarr;
            </Link>
          </div>
        ) : (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-amber-600 text-base font-bold">&#9888;</span>
              <span className="font-medium">
                {validationResult.valid + validationResult.invalid} record{(validationResult.valid + validationResult.invalid) !== 1 ? 's' : ''} uploaded.{' '}
                {validationResult.invalid} record{validationResult.invalid !== 1 ? 's' : ''} have errors.
              </span>
            </div>
            <Link
              to={`/invoices/${selectedClient}?month=${month}&year=${year}`}
              className="text-amber-700 hover:text-amber-900 underline font-medium"
            >
              View Sales Data &rarr;
            </Link>
          </div>
        )
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Form */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-6">Upload Sales Data</h3>

            {/* Client Selector */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                <option value="">Select Client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.legalName} ({c.gstin})
                  </option>
                ))}
              </select>
            </div>

            {/* Month/Year */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Month</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  {MONTHS.map((m, i) => (
                    <option key={i} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Download Sample + hint */}
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm text-gray-500">Upload a .xlsx or .csv file with your sales data.</p>
              <a
                href={`${import.meta.env.DEV ? '/api' : 'https://api.gstpilot.in/api'}/invoices/sample-template`}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
                download
              >
                &#11015; Download Sample
              </a>
            </div>

            {/* File Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-indigo-500 bg-indigo-50'
                  : file
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="hidden"
              />

              {file ? (
                <div>
                  <div className="text-green-600 text-3xl mb-2">&#10003;</div>
                  <p className="text-sm font-medium text-gray-800">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {(file.size / 1024).toFixed(1)} KB - Click to change
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-gray-400 text-3xl mb-2">&#8682;</div>
                  <p className="text-sm font-medium text-gray-600">
                    Drag and drop your file here, or click to browse
                  </p>
                  <p className="text-xs text-gray-400 mt-2">Accepts .xlsx, .xls, .csv files</p>
                </div>
              )}
            </div>

            {/* Upload Button */}
            <div className="mt-6">
              <button
                onClick={handleUpload}
                disabled={isProcessing || !file || !selectedClient}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {isProcessing && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                {uploadState === 'uploading' ? 'Uploading...' : uploadState === 'validating' ? 'Validating...' : 'Upload & Validate'}
              </button>
            </div>
          </div>
        </div>

        {/* Instructions Sidebar */}
        <div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <h4 className="text-sm font-semibold text-gray-800 mb-3">Upload Instructions</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 mt-0.5">1.</span>
                Select the client and filing period
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 mt-0.5">2.</span>
                Upload the sales data file (.xlsx or .csv)
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 mt-0.5">3.</span>
                System will auto-validate GSTIN format, tax calculations, and required fields
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 mt-0.5">4.</span>
                Fix any errors and re-upload if needed
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-500 mt-0.5">5.</span>
                Once validated, proceed to JSON generation
              </li>
            </ul>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Required Columns</h4>
              <ul className="text-xs text-gray-500 space-y-1">
                <li>Invoice Number</li>
                <li>Invoice Date (DD-MM-YYYY)</li>
                <li>Buyer GSTIN</li>
                <li>Taxable Value</li>
                <li>CGST / SGST / IGST Amount</li>
                <li>HSN/SAC Code</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
