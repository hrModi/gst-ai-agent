import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import DashboardLayout from '../components/layout/DashboardLayout'
import { useAuth } from '../contexts/AuthContext'
import api from '../lib/api'

interface DashboardData {
  totalClients: number
  pendingFilings: number
  completedFilings: number
  errorCount: number
  dataReceivedCount: number
  jsonGeneratedCount: number
  gstr1FiledCount: number
  gstr3bFiledCount: number
  currentPeriod: { month: number; year: number }
  deadlineInfo: {
    gstr1: { date: string; daysRemaining: number }
    gstr3b: { date: string; daysRemaining: number }
  }
  statusSummary: {
    notStarted: number
    dataReceived: number
    validationErrors: number
    jsonGenerated: number
    filed: number
    nilReturn: number
  }
  recentActivity: { id: string; message: string; timestamp: string; type: 'info' | 'warning' | 'success' | 'error' }[]
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

function DeadlineBar({ label, date, daysLeft, filed, total }: {
  label: string; date: string; daysLeft: number; filed: number; total: number
}) {
  const pct = total > 0 ? Math.round((filed / total) * 100) : 0
  const urgency = daysLeft <= 3 ? 'red' : daysLeft <= 7 ? 'yellow' : 'green'
  const badgeClass = urgency === 'red'
    ? 'bg-red-100 text-red-700'
    : urgency === 'yellow'
    ? 'bg-yellow-100 text-yellow-700'
    : 'bg-green-100 text-green-700'
  const barClass = urgency === 'red' ? 'bg-red-500' : urgency === 'yellow' ? 'bg-yellow-500' : 'bg-green-500'

  return (
    <div className="p-4 rounded-lg border border-gray-100 bg-gray-50">
      <div className="flex items-center justify-between mb-2">
        <div>
          <p className="font-medium text-gray-800 text-sm">{label}</p>
          <p className="text-xs text-gray-500">Due: {formatDate(date)}</p>
        </div>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${badgeClass}`}>
          {daysLeft} days left
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-200 rounded-full h-2">
          <div className={`h-2 rounded-full ${barClass} transition-all`} style={{ width: `${pct}%` }}></div>
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">{filed}/{total} filed</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const isAdmin = user?.role === 'ADMIN'

  useEffect(() => {
    fetchDashboard()
  }, [])

  async function fetchDashboard() {
    try {
      setLoading(true)
      const response = await api.get('/dashboard')
      setData(response.data.data)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load dashboard data')
    } finally {
      setLoading(false)
    }
  }

  const adminStatCards = data ? [
    { label: 'Total Clients', value: data.totalClients, color: 'bg-blue-500', sub: '' },
    { label: 'Data Received', value: data.dataReceivedCount, color: 'bg-green-500', sub: `of ${data.totalClients}` },
    { label: 'With Errors', value: data.errorCount, color: 'bg-red-500', sub: 'records with errors' },
    { label: 'JSON Generated', value: data.jsonGeneratedCount, color: 'bg-purple-500', sub: '' },
    { label: 'GSTR-1 Filed', value: data.gstr1FiledCount, color: 'bg-indigo-500', sub: `of ${data.dataReceivedCount} received` },
    { label: 'GSTR-3B Filed', value: data.gstr3bFiledCount, color: 'bg-teal-500', sub: `of ${data.dataReceivedCount} received` },
  ] : []

  const consultantStatCards = data ? [
    { label: 'My Clients', value: data.totalClients, color: 'bg-blue-500', sub: '' },
    { label: 'Data Received', value: data.dataReceivedCount, color: 'bg-green-500', sub: `of ${data.totalClients}` },
    { label: 'JSON Generated', value: data.jsonGeneratedCount, color: 'bg-purple-500', sub: '' },
    { label: 'GSTR-1 Filed', value: data.gstr1FiledCount, color: 'bg-indigo-500', sub: `of ${data.dataReceivedCount}` },
  ] : []

  const statCards = isAdmin ? adminStatCards : consultantStatCards

  return (
    <DashboardLayout title="Dashboard">
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
        </div>
      ) : data ? (
        <>
          {/* Firm + period header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-semibold text-gray-800">{user?.tenant?.name}</h2>
            <p className="text-sm text-gray-500">
              Period: <span className="font-medium text-gray-700">{MONTH_NAMES[data.currentPeriod.month - 1]} {data.currentPeriod.year}</span>
            </p>
          </div>

          {/* Stat Cards */}
          <div className={`grid grid-cols-2 ${isAdmin ? 'lg:grid-cols-3' : 'lg:grid-cols-4'} gap-5 mb-8`}>
            {statCards.map((card) => (
              <div key={card.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{card.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-1">{card.value}</p>
                    {card.sub && <p className="text-xs text-gray-400 mt-1">{card.sub}</p>}
                  </div>
                  <div className={`${card.color} w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg flex-shrink-0`}>
                    ■
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Main two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Action Required */}
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-gray-800">Action Required</h3>

              {data.statusSummary.validationErrors > 0 && (
                <div className="bg-white rounded-xl shadow-sm border-l-4 border-red-500 border border-gray-200 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Clients with Data Errors</p>
                    <p className="text-xs text-gray-500 mt-0.5">{data.statusSummary.validationErrors} clients have validation errors</p>
                  </div>
                  <Link
                    to="/filing?stage=VALIDATION_FAILED"
                    className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 whitespace-nowrap"
                  >
                    Review Now
                  </Link>
                </div>
              )}

              {data.statusSummary.notStarted > 0 && (
                <div className="bg-white rounded-xl shadow-sm border-l-4 border-yellow-500 border border-gray-200 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">Data Pending from Clients</p>
                    <p className="text-xs text-gray-500 mt-0.5">{data.statusSummary.notStarted} clients haven't submitted data</p>
                  </div>
                  <Link
                    to="/reminders?tab=send"
                    className="px-3 py-1.5 bg-yellow-500 text-white text-xs font-medium rounded-lg hover:bg-yellow-600 whitespace-nowrap"
                  >
                    Send Reminder
                  </Link>
                </div>
              )}

              {data.statusSummary.jsonGenerated > 0 && (
                <div className="bg-white rounded-xl shadow-sm border-l-4 border-blue-500 border border-gray-200 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">JSON Files Ready to File</p>
                    <p className="text-xs text-gray-500 mt-0.5">{data.statusSummary.jsonGenerated} clients have JSON ready</p>
                  </div>
                  <Link
                    to="/json-generator"
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 whitespace-nowrap"
                  >
                    Go to JSON
                  </Link>
                </div>
              )}

              {data.statusSummary.validationErrors === 0 && data.statusSummary.notStarted === 0 && data.statusSummary.jsonGenerated === 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 text-center text-gray-500 text-sm">
                  No actions required. All filing on track.
                </div>
              )}

              {/* Recent Activity */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mt-2">
                <h3 className="text-base font-semibold text-gray-800 mb-4">Recent Activity</h3>
                {data.recentActivity.length === 0 ? (
                  <p className="text-sm text-gray-500">No recent activity.</p>
                ) : (
                  <div className="space-y-3">
                    {data.recentActivity.map((a) => (
                      <div key={a.id} className="flex items-start gap-3">
                        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${
                          a.type === 'success' ? 'bg-green-500'
                          : a.type === 'warning' ? 'bg-yellow-500'
                          : a.type === 'error' ? 'bg-red-500'
                          : 'bg-blue-500'
                        }`}></span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700">{a.message}</p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(a.timestamp).toLocaleString('en-IN')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Upcoming Deadlines */}
            <div>
              <h3 className="text-base font-semibold text-gray-800 mb-4">Upcoming Deadlines</h3>
              <div className="space-y-4">
                <DeadlineBar
                  label="GSTR-1 Filing"
                  date={data.deadlineInfo.gstr1.date}
                  daysLeft={data.deadlineInfo.gstr1.daysRemaining}
                  filed={data.gstr1FiledCount}
                  total={data.totalClients}
                />
                <DeadlineBar
                  label="GSTR-3B Filing"
                  date={data.deadlineInfo.gstr3b.date}
                  daysLeft={data.deadlineInfo.gstr3b.daysRemaining}
                  filed={data.gstr3bFiledCount}
                  total={data.totalClients}
                />
              </div>

              {/* Filing Status Breakdown */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mt-6">
                <h3 className="text-base font-semibold text-gray-800 mb-4">Filing Status Breakdown</h3>
                <div className="space-y-2">
                  {[
                    { label: 'Not Started', value: data.statusSummary.notStarted, color: 'bg-gray-400' },
                    { label: 'Data Received', value: data.statusSummary.dataReceived, color: 'bg-blue-400' },
                    { label: 'Validation Errors', value: data.statusSummary.validationErrors, color: 'bg-red-400' },
                    { label: 'JSON Generated', value: data.statusSummary.jsonGenerated, color: 'bg-purple-400' },
                    { label: 'Filed', value: data.statusSummary.filed, color: 'bg-green-500' },
                    { label: 'Nil Return', value: data.statusSummary.nilReturn, color: 'bg-teal-400' },
                  ].filter(s => s.value > 0).map((s) => (
                    <div key={s.label} className="flex items-center gap-3">
                      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${s.color}`}></span>
                      <span className="text-sm text-gray-600 flex-1">{s.label}</span>
                      <span className="text-sm font-semibold text-gray-900">{s.value}</span>
                    </div>
                  ))}
                  {Object.values(data.statusSummary).every(v => v === 0) && (
                    <p className="text-sm text-gray-500">No filing data for this period.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </DashboardLayout>
  )
}
