import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../lib/api'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '\u229E' },
  { to: '/clients', label: 'Clients', icon: '\u263A' },
  { to: '/filing', label: 'Filing Status', icon: '\u2611' },
  { to: '/invoices/upload', label: 'Upload Sales Data', icon: '\u21E7' },
  { to: '/json-generator', label: 'JSON Generator', icon: '\u27A4' },
  { to: '/reminders', label: 'Reminders', icon: '\u266A' },
  { to: '/documents', label: 'Documents', icon: '\u2637' },
]

const adminItems = [
  { to: '/settings', label: 'Settings', icon: '\u2699' },
]


export default function Sidebar() {
  const { user, logout } = useAuth()
  const isAdmin = user?.role === 'ADMIN'

  const [showChangePw, setShowChangePw] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changePwError, setChangePwError] = useState('')
  const [changePwSuccess, setChangePwSuccess] = useState('')
  const [changePwSubmitting, setChangePwSubmitting] = useState(false)

  function openChangePw() {
    setShowChangePw(true)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setChangePwError('')
    setChangePwSuccess('')
  }

  function closeChangePw() {
    setShowChangePw(false)
    setChangePwError('')
    setChangePwSuccess('')
  }

  async function handleChangePw(e: React.FormEvent) {
    e.preventDefault()
    setChangePwError('')
    if (newPassword !== confirmPassword) {
      setChangePwError('New passwords do not match')
      return
    }
    setChangePwSubmitting(true)
    try {
      await api.put('/auth/change-password', { currentPassword, newPassword })
      setChangePwSuccess('Password changed successfully!')
      setTimeout(closeChangePw, 2000)
    } catch (err: any) {
      setChangePwError(err?.response?.data?.error || 'Failed to change password')
    } finally {
      setChangePwSubmitting(false)
    }
  }

  return (
    <>
      <div className="w-64 bg-indigo-900 text-white flex flex-col min-h-screen">
        <div className="p-5 border-b border-indigo-800">
          <h1 className="text-xl font-bold tracking-wide">{user?.tenant?.name || 'GST Pilot'}</h1>
          <p className="text-indigo-300 text-xs mt-1">GST Filing Management</p>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-indigo-700 text-white'
                        : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                    }`
                  }
                >
                  <span className="text-base w-5 text-center">{item.icon}</span>
                  {item.label}
                </NavLink>
              </li>
            ))}

            {isAdmin &&
              adminItems.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-indigo-700 text-white'
                          : 'text-indigo-200 hover:bg-indigo-800 hover:text-white'
                      }`
                    }
                  >
                    <span className="text-base w-5 text-center">{item.icon}</span>
                    {item.label}
                  </NavLink>
                </li>
              ))}
          </ul>

        </nav>

        <div className="p-4 border-t border-indigo-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name || 'User'}</p>
              <p className="text-xs text-indigo-300 truncate">{user?.role || ''}</p>
            </div>
          </div>
          <button
            onClick={openChangePw}
            className="w-full px-3 py-2 text-sm text-indigo-200 hover:text-white hover:bg-indigo-800 rounded-lg transition-colors text-left mb-1"
          >
            Change Password
          </button>
          <button
            onClick={logout}
            className="w-full px-3 py-2 text-sm text-indigo-200 hover:text-white hover:bg-indigo-800 rounded-lg transition-colors text-left"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Change Password Modal */}
      {showChangePw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Change Password</h3>

            {changePwSuccess && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                {changePwSuccess}
              </div>
            )}

            {changePwError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {changePwError}
              </div>
            )}

            {!changePwSuccess && (
              <form onSubmit={handleChangePw} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="Enter current password"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="Min 8 chars, upper, lower, number, special"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="Re-enter new password"
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeChangePw}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={changePwSubmitting}
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 transition-colors flex items-center gap-2"
                  >
                    {changePwSubmitting && (
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    )}
                    {changePwSubmitting ? 'Saving...' : 'Change Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
