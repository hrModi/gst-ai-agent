import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import api from '../lib/api'

interface Consultant {
  id: string
  name: string
  email: string
}

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

const STATE_CODES = [
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
]

export default function EditClient() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [consultants, setConsultants] = useState<Consultant[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [form, setForm] = useState({
    gstin: '',
    legalName: '',
    tradeName: '',
    contactPerson: '',
    email: '',
    phone: '',
    address: '',
    stateCode: '',
    filingFrequency: 'MONTHLY',
    assignedTo: '',
    automationEnabled: false,
    notifyEmail: true,
    notifyWhatsapp: false,
    gstr1DueDay: 11,
    gstr3bDueDay: 20,
    reminderDaysBefore: [7, 3, 1] as number[],
    dataEmailSubject: '',
  })

  const [gstinError, setGstinError] = useState('')

  useEffect(() => {
    if (id) {
      fetchClient()
      fetchConsultants()
    }
  }, [id])

  async function fetchClient() {
    try {
      setLoading(true)
      const response = await api.get(`/clients/${id}`)
      const c = response.data.data
      setForm({
        gstin: c.gstin || '',
        legalName: c.legalName || '',
        tradeName: c.tradeName || '',
        contactPerson: c.contactPerson || '',
        email: c.email || '',
        phone: c.phone || '',
        address: c.address || '',
        stateCode: c.stateCode || '',
        filingFrequency: c.filingFrequency || 'MONTHLY',
        assignedTo: c.assignedTo || '',
        automationEnabled: c.automationEnabled || false,
        notifyEmail: c.notifyEmail ?? true,
        notifyWhatsapp: c.notifyWhatsapp || false,
        gstr1DueDay: c.gstr1DueDay || 11,
        gstr3bDueDay: c.gstr3bDueDay || 20,
        reminderDaysBefore: c.reminderDaysBefore || [7, 3, 1],
        dataEmailSubject: c.dataEmailSubject || '',
      })
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load client')
    } finally {
      setLoading(false)
    }
  }

  async function fetchConsultants() {
    try {
      const response = await api.get('/users')
      setConsultants(response.data.data || [])
    } catch {
      // Non-critical
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target
    setForm((prev) => ({ ...prev, [name]: value }))
    if (name === 'gstin') setGstinError('')
  }

  function validateGstin() {
    const gstin = form.gstin.toUpperCase().trim()
    if (!gstin) {
      setGstinError('GSTIN is required')
      return false
    }
    if (!GSTIN_REGEX.test(gstin)) {
      setGstinError('Invalid GSTIN format')
      return false
    }
    setGstinError('')
    return true
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!validateGstin()) return

    setSubmitting(true)
    try {
      const payload = {
        ...form,
        gstin: form.gstin.toUpperCase().trim(),
        assignedTo: form.assignedTo || null,
      }
      await api.put(`/clients/${id}`, payload)
      setSuccess('Client updated successfully')
      setTimeout(() => navigate(`/clients/${id}`), 1500)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update client')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout title="Edit Client">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Edit Client">
      <div className="mb-6">
        <Link to={`/clients/${id}`} className="text-indigo-600 hover:text-indigo-800 text-sm font-medium">
          &larr; Back to Client
        </Link>
      </div>

      <div className="max-w-3xl">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-6">Edit Client Information</h3>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* GSTIN */}
            <div>
              <label htmlFor="gstin" className="block text-sm font-medium text-gray-700 mb-1">
                GSTIN <span className="text-red-500">*</span>
              </label>
              <input
                id="gstin"
                name="gstin"
                type="text"
                value={form.gstin}
                onChange={handleChange}
                onBlur={validateGstin}
                required
                maxLength={15}
                className={`w-full px-4 py-2.5 border rounded-lg text-sm font-mono uppercase focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none ${
                  gstinError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
              />
              {gstinError && <p className="text-xs text-red-600 mt-1">{gstinError}</p>}
            </div>

            {/* Legal Name */}
            <div>
              <label htmlFor="legalName" className="block text-sm font-medium text-gray-700 mb-1">
                Legal Name <span className="text-red-500">*</span>
              </label>
              <input
                id="legalName"
                name="legalName"
                type="text"
                value={form.legalName}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            {/* Trade Name */}
            <div>
              <label htmlFor="tradeName" className="block text-sm font-medium text-gray-700 mb-1">
                Trade Name
              </label>
              <input
                id="tradeName"
                name="tradeName"
                type="text"
                value={form.tradeName}
                onChange={handleChange}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>

            {/* Contact Person and Email */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="contactPerson" className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Person
                </label>
                <input
                  id="contactPerson"
                  name="contactPerson"
                  type="text"
                  value={form.contactPerson}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            {/* Phone and State Code */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
              </div>
              <div>
                <label htmlFor="stateCode" className="block text-sm font-medium text-gray-700 mb-1">
                  State
                </label>
                <select
                  id="stateCode"
                  name="stateCode"
                  value={form.stateCode}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="">Select State</option>
                  {STATE_CODES.map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.code} - {state.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Address */}
            <div>
              <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <textarea
                id="address"
                name="address"
                value={form.address}
                onChange={handleChange}
                rows={3}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none resize-none"
              />
            </div>

            {/* Filing Frequency and Assigned To */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="filingFrequency" className="block text-sm font-medium text-gray-700 mb-1">
                  Filing Frequency
                </label>
                <select
                  id="filingFrequency"
                  name="filingFrequency"
                  value={form.filingFrequency}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                </select>
              </div>
              <div>
                <label htmlFor="assignedTo" className="block text-sm font-medium text-gray-700 mb-1">
                  Assigned Consultant
                </label>
                <select
                  id="assignedTo"
                  name="assignedTo"
                  value={form.assignedTo}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="">Unassigned</option>
                  {consultants.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Automation Config */}
            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-base font-semibold text-gray-800 mb-4">Automation Settings</h3>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <input
                    id="automationEnabled"
                    type="checkbox"
                    checked={form.automationEnabled}
                    onChange={(e) => setForm(prev => ({ ...prev, automationEnabled: e.target.checked }))}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="automationEnabled" className="text-sm font-medium text-gray-700">
                    Enable automated reminders and processing for this client
                  </label>
                </div>

                {form.automationEnabled && (
                  <>
                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={form.notifyEmail}
                          onChange={(e) => setForm(prev => ({ ...prev, notifyEmail: e.target.checked }))}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Notify via Email
                      </label>
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={form.notifyWhatsapp}
                          onChange={(e) => setForm(prev => ({ ...prev, notifyWhatsapp: e.target.checked }))}
                          className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        Notify via WhatsApp
                      </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">GSTR-1 Due Day</label>
                        <input
                          type="number"
                          min={1}
                          max={28}
                          value={form.gstr1DueDay}
                          onChange={(e) => setForm(prev => ({ ...prev, gstr1DueDay: Number(e.target.value) }))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">GSTR-3B Due Day</label>
                        <input
                          type="number"
                          min={1}
                          max={28}
                          value={form.gstr3bDueDay}
                          onChange={(e) => setForm(prev => ({ ...prev, gstr3bDueDay: Number(e.target.value) }))}
                          className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Reminder Days Before Due Date
                      </label>
                      <input
                        type="text"
                        value={form.reminderDaysBefore.join(', ')}
                        onChange={(e) => {
                          const days = e.target.value.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d) && d > 0)
                          setForm(prev => ({ ...prev, reminderDaysBefore: days }))
                        }}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                        placeholder="7, 3, 1"
                      />
                      <p className="text-xs text-gray-400 mt-1">Comma-separated days (e.g., 7, 3, 1)</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 transition-colors flex items-center gap-2"
              >
                {submitting && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
              <Link
                to={`/clients/${id}`}
                className="px-6 py-2.5 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </DashboardLayout>
  )
}
