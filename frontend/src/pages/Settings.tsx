import { useState, useEffect } from 'react'
import api from '../lib/api'
import DashboardLayout from '../components/layout/DashboardLayout'

interface User {
  id: string
  name: string
  email: string
  role: string
  phone: string | null
  isActive: boolean
}

interface SystemSettings {
  gstr1DueDay: number
  gstr3bDueDay: number
  reminderDaysBefore: number[]
}

interface SyncConfig {
  isConnected: boolean
  googleEmail: string | null
}

// ---- Add User Form ----
function AddUserForm({ onSuccess }: { onSuccess: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', role: 'CONSULTANT', password: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.post('/users', form)
      setForm({ name: '', email: '', phone: '', role: 'CONSULTANT', password: '' })
      onSuccess()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create user')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-4 bg-gray-50 mb-4">
      <h3 className="text-sm font-semibold text-gray-800 mb-3">New User</h3>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
        <input
          type="text"
          placeholder="Full Name *"
          value={form.name}
          onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
          required
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <input
          type="email"
          placeholder="Email *"
          value={form.email}
          onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
          required
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <input
          type="tel"
          placeholder="Phone"
          value={form.phone}
          onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <select
          value={form.role}
          onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          <option value="CONSULTANT">Consultant</option>
          <option value="ADMIN">Admin</option>
        </select>
        <input
          type="password"
          placeholder="Password *"
          value={form.password}
          onChange={(e) => setForm(p => ({ ...p, password: e.target.value }))}
          required
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
        <p className="text-xs text-gray-400 self-center">Min 8 chars, uppercase, lowercase, number, special char</p>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create User'}
        </button>
      </div>
    </form>
  )
}

// ---- Edit User Row ----
function EditUserRow({ user, onSave, onCancel }: { user: User; onSave: () => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: user.name, phone: user.phone || '', role: user.role })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    setError('')
    setSaving(true)
    try {
      await api.put(`/users/${user.id}`, form)
      onSave()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr className="bg-indigo-50">
      <td className="px-4 py-2">
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))}
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
        />
      </td>
      <td className="px-4 py-2 text-sm text-gray-500">{user.email}</td>
      <td className="px-4 py-2">
        <select
          value={form.role}
          onChange={(e) => setForm(p => ({ ...p, role: e.target.value }))}
          className="px-2 py-1 border border-gray-300 rounded text-sm"
        >
          <option value="CONSULTANT">CONSULTANT</option>
          <option value="ADMIN">ADMIN</option>
        </select>
      </td>
      <td className="px-4 py-2">
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
          className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
        />
      </td>
      <td className="px-4 py-2 text-center">
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
          {user.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="px-4 py-2 text-center">
        {error && <p className="text-xs text-red-600 mb-1">{error}</p>}
        <div className="flex gap-1 justify-center">
          <button onClick={handleSave} disabled={saving} className="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 disabled:opacity-50">
            {saving ? '...' : 'Save'}
          </button>
          <button onClick={onCancel} className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded hover:bg-gray-200">
            Cancel
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function Settings() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [showAddUser, setShowAddUser] = useState(false)

  // System settings
  const [sysSettings, setSysSettings] = useState<SystemSettings>({ gstr1DueDay: 11, gstr3bDueDay: 20, reminderDaysBefore: [7, 3, 1] })
  const [sysLoading, setSysLoading] = useState(true)
  const [sysSaving, setSysSaving] = useState(false)
  const [reminderDaysInput, setReminderDaysInput] = useState('7, 3, 1')

  // Google OAuth
  const [syncConfig, setSyncConfig] = useState<SyncConfig | null>(null)
  const [syncLoading, setSyncLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    fetchUsers()
    fetchSystemSettings()
    fetchSyncConfig()
  }, [])

  async function fetchUsers() {
    try {
      setLoading(true)
      const res = await api.get('/users')
      setUsers(res.data.data || [])
    } catch {
      setError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  async function fetchSystemSettings() {
    try {
      setSysLoading(true)
      const res = await api.get('/system-settings')
      const d = res.data.data
      setSysSettings(d)
      setReminderDaysInput((d.reminderDaysBefore || [7, 3, 1]).join(', '))
    } catch {
      // Use defaults on failure
    } finally {
      setSysLoading(false)
    }
  }

  async function fetchSyncConfig() {
    try {
      setSyncLoading(true)
      const res = await api.get('/sheet-sync/config')
      setSyncConfig(res.data.data)
    } catch {
      setSyncConfig({ isConnected: false, googleEmail: null })
    } finally {
      setSyncLoading(false)
    }
  }

  async function toggleUserActive(userId: string, isActive: boolean) {
    try {
      setToggling(userId)
      setError('')
      setSuccess('')
      await api.put(`/users/${userId}`, { isActive: !isActive })
      setSuccess(`User ${!isActive ? 'activated' : 'deactivated'} successfully`)
      fetchUsers()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update user')
    } finally {
      setToggling(null)
    }
  }

  async function saveSystemSettings() {
    try {
      setSysSaving(true)
      setError('')
      const days = reminderDaysInput
        .split(',')
        .map(d => parseInt(d.trim()))
        .filter(d => !isNaN(d) && d > 0)
      const payload = {
        gstr1DueDay: sysSettings.gstr1DueDay,
        gstr3bDueDay: sysSettings.gstr3bDueDay,
        reminderDaysBefore: days,
      }
      await api.put('/system-settings', payload)
      setSysSettings(prev => ({ ...prev, reminderDaysBefore: days }))
      setSuccess('System settings saved successfully')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save settings')
    } finally {
      setSysSaving(false)
    }
  }

  async function handleConnectGoogle() {
    try {
      setConnecting(true)
      const res = await api.get('/sheet-sync/auth-url')
      window.location.href = res.data.data.url
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to initiate Google connection')
      setConnecting(false)
    }
  }

  async function handleDisconnectGoogle() {
    try {
      await api.post('/sheet-sync/disconnect')
      setSyncConfig({ isConnected: false, googleEmail: null })
      setSuccess('Google account disconnected.')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to disconnect')
    }
  }

  return (
    <DashboardLayout title="Settings">
      <div className="space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>}

        {/* User Management */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
              <p className="text-sm text-gray-500 mt-1">Manage team members and their access</p>
            </div>
            <button
              onClick={() => setShowAddUser(v => !v)}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              {showAddUser ? 'Cancel' : '+ Add User'}
            </button>
          </div>

          <div className="p-4">
            {showAddUser && (
              <AddUserForm
                onSuccess={() => {
                  setShowAddUser(false)
                  setSuccess('User created successfully')
                  fetchUsers()
                }}
              />
            )}
          </div>

          {loading ? (
            <div className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) =>
                  editingUserId === user.id ? (
                    <EditUserRow
                      key={user.id}
                      user={user}
                      onSave={() => {
                        setEditingUserId(null)
                        setSuccess('User updated successfully')
                        fetchUsers()
                      }}
                      onCancel={() => setEditingUserId(null)}
                    />
                  ) : (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          user.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {user.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{user.phone || '-'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={() => setEditingUserId(user.id)}
                            className="px-2 py-1 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded text-xs font-medium"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleUserActive(user.id, user.isActive)}
                            disabled={toggling === user.id}
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              user.isActive
                                ? 'bg-red-50 text-red-600 hover:bg-red-100'
                                : 'bg-green-50 text-green-600 hover:bg-green-100'
                            } disabled:opacity-50`}
                          >
                            {toggling === user.id ? '...' : user.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* System Settings */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">System Settings</h2>
          {sysLoading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600 mx-auto"></div>
            </div>
          ) : (
            <div className="space-y-5 max-w-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">GSTR-1 Due Day (1–28)</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={sysSettings.gstr1DueDay}
                    onChange={(e) => setSysSettings(p => ({ ...p, gstr1DueDay: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">GSTR-3B Due Day (1–28)</label>
                  <input
                    type="number"
                    min={1}
                    max={28}
                    value={sysSettings.gstr3bDueDay}
                    onChange={(e) => setSysSettings(p => ({ ...p, gstr3bDueDay: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reminder Days Before Deadline</label>
                <input
                  type="text"
                  value={reminderDaysInput}
                  onChange={(e) => setReminderDaysInput(e.target.value)}
                  placeholder="7, 3, 1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Comma-separated days before deadline (e.g., 7, 3, 1)</p>
              </div>
              <button
                onClick={saveSystemSettings}
                disabled={sysSaving}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {sysSaving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          )}
        </div>

        {/* Google Account */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">Google Account</h2>
          <p className="text-sm text-gray-500 mb-4">Connect a Google account to enable Sync from Sheet on the Clients page.</p>
          {syncLoading ? (
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
          ) : syncConfig?.isConnected ? (
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-sm text-green-800 font-medium">Connected</span>
                {syncConfig.googleEmail && (
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
      </div>
    </DashboardLayout>
  )
}
