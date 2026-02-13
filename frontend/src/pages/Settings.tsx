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

export default function Settings() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [toggling, setToggling] = useState<string | null>(null)

  useEffect(() => {
    fetchUsers()
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

  return (
    <DashboardLayout title="Settings">
      <div className="space-y-6">
        {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>}
        {success && <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">{success}</div>}

        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">User Management</h2>
            <p className="text-sm text-gray-500 mt-1">Manage team members and their access</p>
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
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        user.role === 'ADMIN'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{user.phone || '-'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {user.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggleUserActive(user.id, user.isActive)}
                        disabled={toggling === user.id}
                        className={`px-3 py-1 rounded text-xs font-medium ${
                          user.isActive
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'
                        } disabled:opacity-50`}
                      >
                        {toggling === user.id ? '...' : user.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">System Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Filing Deadlines</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between bg-gray-50 rounded px-3 py-2">
                  <span>GSTR-1 Due Date</span>
                  <span className="font-medium">11th of every month</span>
                </div>
                <div className="flex justify-between bg-gray-50 rounded px-3 py-2">
                  <span>GSTR-3B Due Date</span>
                  <span className="font-medium">20th of every month</span>
                </div>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Reminder Schedule</h3>
              <div className="space-y-2 text-sm text-gray-600">
                <div className="flex justify-between bg-gray-50 rounded px-3 py-2">
                  <span>Initial Reminder</span>
                  <span className="font-medium">7 days before deadline</span>
                </div>
                <div className="flex justify-between bg-gray-50 rounded px-3 py-2">
                  <span>Follow-up Reminder</span>
                  <span className="font-medium">3 days before deadline</span>
                </div>
                <div className="flex justify-between bg-gray-50 rounded px-3 py-2">
                  <span>Final Reminder</span>
                  <span className="font-medium">1 day before deadline</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
