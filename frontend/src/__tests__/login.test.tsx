/**
 * Test Groups 1 (login) and 2 (branding) — Frontend
 * Tests: 1.1–1.4, 1.8, 2.1
 */

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { vi, describe, test, expect, beforeEach } from 'vitest'

// Mock api module before importing components that use it
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
const mockPost = api.post as ReturnType<typeof vi.fn>

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <App />
    </MemoryRouter>
  )
}

describe('Login page — Branding & Form', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    // No stored token → AuthProvider immediately sets loading=false (no API call)
  })

  test('2.1 — GST Pilot branding text is visible', () => {
    renderLogin()
    expect(screen.getByText('GST Pilot')).toBeInTheDocument()
  })

  test('1.1 — Login form has email input, password input, and sign-in button', () => {
    renderLogin()
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument()
  })

  test('1.4 — Email input has required attribute', () => {
    renderLogin()
    const emailInput = screen.getByLabelText(/email address/i)
    expect(emailInput).toBeRequired()
  })

  test('1.2 — Wrong password shows error message', async () => {
    const user = userEvent.setup()
    renderLogin()

    // Mock API to return 401
    mockPost.mockRejectedValue({
      response: { data: { error: 'Invalid email or password' } },
    })

    await user.type(screen.getByLabelText(/email address/i), 'admin@test.com')
    await user.type(screen.getByLabelText(/password/i), 'WrongPassword!')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument()
    })
  })

  test('1.3 — Non-existent email shows error message', async () => {
    const user = userEvent.setup()
    renderLogin()

    mockPost.mockRejectedValue({
      response: { data: { error: 'Invalid email or password' } },
    })

    await user.type(screen.getByLabelText(/email address/i), 'nobody@test.com')
    await user.type(screen.getByLabelText(/password/i), 'Password@123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid email or password')).toBeInTheDocument()
    })
  })

})
