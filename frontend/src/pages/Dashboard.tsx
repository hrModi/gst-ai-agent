import { useState, useEffect } from 'react'
import DashboardLayout from '../components/layout/DashboardLayout'
import api from '../lib/api'

interface DashboardStats {
  totalClients: number
  pendingFilings: number
  completedFilings: number
  errors: number
}

interface Deadline {
  name: string
  date: string
  daysLeft: number
}

interface Activity {
  id: string
  message: string
  timestamp: string
  type: 'info' | 'warning' | 'success' | 'error'
}

function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

function getNextDeadlines(): Deadline[] {
  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const gstr1Date = new Date(currentYear, currentMonth, 11)
  if (gstr1Date < now) {
    gstr1Date.setMonth(gstr1Date.getMonth() + 1)
  }
  const gstr3bDate = new Date(currentYear, currentMonth, 20)
  if (gstr3bDate < now) {
    gstr3bDate.setMonth(gstr3bDate.getMonth() + 1)
  }

  const diffDays = (target: Date) => Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

  return [
    {
      name: 'GSTR-1 Filing',
      date: gstr1Date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      daysLeft: diffDays(gstr1Date),
    },
    {
      name: 'GSTR-3B Filing',
      date: gstr3bDate.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }),
      daysLeft: diffDays(gstr3bDate),
    },
  ]
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalClients: 0,
    pendingFilings: 0,
    completedFilings: 0,
    errors: 0,
  })
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const deadlines = getNextDeadlines()

  useEffect(() => {
    fetchDashboard()
  }, [])

  async function fetchDashboard() {
    try {
      setLoading(true)
      const response = await api.get('/dashboard')
      const d = response.data.data
      setStats({
        totalClients: d.totalClients || 0,
        pendingFilings: d.pendingFilings || 0,
        completedFilings: d.completedFilings || 0,
        errors: d.errorCount || 0,
      })
      setActivities(d.recentActivity || [])
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const statCards = [
    { label: 'Total Clients', value: stats.totalClients, color: 'bg-blue-500', icon: '\u263A' },
    { label: 'Pending Filings', value: stats.pendingFilings, color: 'bg-yellow-500', icon: '\u231B' },
    { label: 'Completed', value: stats.completedFilings, color: 'bg-green-500', icon: '\u2713' },
    { label: 'Errors', value: stats.errors, color: 'bg-red-500', icon: '\u2717' },
  ]

  return (
    <DashboardLayout title="Dashboard">
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <>
          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {statCards.map((card) => (
              <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">{card.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
                  </div>
                  <div className={`${card.color} w-12 h-12 rounded-lg flex items-center justify-center text-white text-xl`}>
                    {card.icon}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Deadline Tracker and Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Deadline Tracker */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Upcoming Deadlines</h3>
              <div className="space-y-4">
                {deadlines.map((deadline) => (
                  <div
                    key={deadline.name}
                    className="flex items-center justify-between p-4 rounded-lg border border-gray-100 bg-gray-50"
                  >
                    <div>
                      <p className="font-medium text-gray-800">{deadline.name}</p>
                      <p className="text-sm text-gray-500">Due: {deadline.date}</p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        deadline.daysLeft <= 3
                          ? 'bg-red-100 text-red-700'
                          : deadline.daysLeft <= 7
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {deadline.daysLeft} days left
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Activity</h3>
              {activities.length === 0 ? (
                <p className="text-sm text-gray-500 py-4">No recent activity to display.</p>
              ) : (
                <div className="space-y-3">
                  {activities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-gray-100"
                    >
                      <span
                        className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                          activity.type === 'success'
                            ? 'bg-green-500'
                            : activity.type === 'warning'
                            ? 'bg-yellow-500'
                            : activity.type === 'error'
                            ? 'bg-red-500'
                            : 'bg-blue-500'
                        }`}
                      ></span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700">{activity.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{activity.timestamp}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  )
}
