/**
 * Test Groups 1 — Auth Redirects (Frontend)
 * Tests: 1.5 (no token → /login), 1.6 (expired token → /login)
 */

import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, test, expect, beforeEach } from 'vitest'

vi.mock('../lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
  },
}))

import App from '../App'
import api from '../lib/api'

const mockGet = api.get as ReturnType<typeof vi.fn>

describe('Auth redirects', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  test('1.5 — Unauthenticated user visiting /dashboard is redirected to /login', async () => {
    // No token in localStorage → AuthProvider sets loading=false immediately
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    )

    // After AuthProvider resolves (no token), ProtectedRoute redirects to /login
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })
  })

  test('1.6 — Expired token in localStorage → /auth/me fails → redirected to /login', async () => {
    // Simulate an expired token
    localStorage.setItem('gst_token', 'expired.jwt.token')

    // Mock API to reject with 401
    mockGet.mockRejectedValue({
      response: { status: 401, data: { error: 'Token expired' } },
    })

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <App />
      </MemoryRouter>
    )

    // After validateToken fails, loading=false, user=null → redirect to /login
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
    })
  })
})
