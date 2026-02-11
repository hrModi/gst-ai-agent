import { NavLink } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: '\u25A0' },
  { to: '/clients', label: 'Clients', icon: '\u263A' },
  { to: '/filing', label: 'Filing Status', icon: '\u2611' },
  { to: '/invoices/upload', label: 'Upload Invoices', icon: '\u21E7' },
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

  return (
    <div className="w-64 bg-indigo-900 text-white flex flex-col min-h-screen">
      <div className="p-5 border-b border-indigo-800">
        <h1 className="text-xl font-bold tracking-wide">GST Filing System</h1>
        <p className="text-indigo-300 text-xs mt-1">CA Firm Management</p>
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
          onClick={logout}
          className="w-full px-3 py-2 text-sm text-indigo-200 hover:text-white hover:bg-indigo-800 rounded-lg transition-colors text-left"
        >
          Logout
        </button>
      </div>
    </div>
  )
}
