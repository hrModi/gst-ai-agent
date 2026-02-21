import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import ClientDetail from './pages/ClientDetail'
import NewClient from './pages/NewClient'
import Filing from './pages/Filing'
import InvoiceUpload from './pages/InvoiceUpload'
import ClientInvoices from './pages/ClientInvoices'
import JsonGenerator from './pages/JsonGenerator'
import Reminders from './pages/Reminders'
import Documents from './pages/Documents'
import Settings from './pages/Settings'
import EditClient from './pages/EditClient'
import ComingSoon from './pages/ComingSoon'

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (adminOnly && user.role !== 'ADMIN') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients"
        element={
          <ProtectedRoute>
            <Clients />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/new"
        element={
          <ProtectedRoute adminOnly>
            <NewClient />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/:id"
        element={
          <ProtectedRoute>
            <ClientDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/clients/:id/edit"
        element={
          <ProtectedRoute adminOnly>
            <EditClient />
          </ProtectedRoute>
        }
      />
      <Route
        path="/filing"
        element={
          <ProtectedRoute>
            <Filing />
          </ProtectedRoute>
        }
      />
      <Route
        path="/invoices/upload"
        element={
          <ProtectedRoute>
            <InvoiceUpload />
          </ProtectedRoute>
        }
      />
      <Route
        path="/invoices/:clientId"
        element={
          <ProtectedRoute>
            <ClientInvoices />
          </ProtectedRoute>
        }
      />
      <Route
        path="/json-generator"
        element={
          <ProtectedRoute>
            <JsonGenerator />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reminders"
        element={
          <ProtectedRoute>
            <Reminders />
          </ProtectedRoute>
        }
      />
      <Route
        path="/documents"
        element={
          <ProtectedRoute>
            <Documents />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute adminOnly>
            <Settings />
          </ProtectedRoute>
        }
      />
      <Route path="/inbox" element={<ProtectedRoute><ComingSoon title="Inbox Monitor" description="Yaksh monitors a dedicated Gmail inbox, detects client data submissions, and matches them to the right client automatically." phase="1D" /></ProtectedRoute>} />
      <Route path="/reconciliation" element={<ProtectedRoute><ComingSoon title="GSTR-2B Reconciliation" description="Automatically reconcile your GSTR-1 data against GSTR-2B to identify mismatches and compute eligible ITC." phase="1G" /></ProtectedRoute>} />
      <Route path="/gstr3b" element={<ProtectedRoute><ComingSoon title="GSTR-3B Preparation" description="Yaksh computes your GSTR-3B from GSTR-1 and GSTR-2B data — NIL, payment, or credit returns identified automatically." phase="1H" /></ProtectedRoute>} />
      <Route path="/yaksh" element={<ProtectedRoute><ComingSoon title="Yaksh Activity" description="Full visibility into everything Yaksh is doing: reminders sent, emails processed, validations run, and JSONs generated." phase="1I" /></ProtectedRoute>} />
    </Routes>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App
