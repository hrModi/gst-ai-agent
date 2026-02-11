import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import api from '../lib/api'

export interface User {
  id: string
  tenantId: string
  email: string
  name: string
  role: 'ADMIN' | 'CONSULTANT'
}

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const storedToken = localStorage.getItem('gst_token')
    if (storedToken) {
      setToken(storedToken)
      validateToken(storedToken)
    } else {
      setLoading(false)
    }
  }, [])

  async function validateToken(storedToken: string) {
    try {
      const response = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${storedToken}` },
      })
      setUser(response.data.user)
      setToken(storedToken)
    } catch {
      localStorage.removeItem('gst_token')
      localStorage.removeItem('gst_user')
      setUser(null)
      setToken(null)
    } finally {
      setLoading(false)
    }
  }

  async function login(email: string, password: string) {
    const response = await api.post('/auth/login', { email, password })
    const { token: newToken, user: newUser } = response.data
    localStorage.setItem('gst_token', newToken)
    localStorage.setItem('gst_user', JSON.stringify(newUser))
    setToken(newToken)
    setUser(newUser)
  }

  async function logout() {
    try {
      await api.post('/auth/logout')
    } catch {
      // Ignore logout errors
    } finally {
      localStorage.removeItem('gst_token')
      localStorage.removeItem('gst_user')
      setToken(null)
      setUser(null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
