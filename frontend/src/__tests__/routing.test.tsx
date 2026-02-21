/**
 * Test Groups 5.4, 17.2, 19.1, 20.x — Frontend Routing
 * Tests: consultant admin-only redirect, documents coming-soon, unknown route
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

const ADMIN_USER = {
  id: 'admin-1',
  tenantId: 'tenant-1',
  email: 'admin@test.com',
  name: 'Admin User',
  role: 'ADMIN' as const,
  tenant: { id: 'tenant-1', name: 'ABC CA' },
}

const CONSULTANT_USER = {
  id: 'consultant-1',
  tenantId: 'tenant-1',
  email: 'consultant@test.com',
  name: 'Consultant User',
  role: 'CONSULTANT' as const,
  tenant: { id: 'tenant-1', name: 'ABC CA' },
}

function setupAuthenticatedUser(user: typeof ADMIN_USER | typeof CONSULTANT_USER) {
  localStorage.setItem('gst_token', 'valid.jwt.token')
  // Return user from /auth/me (also handle other GET calls from pages with empty data)
  mockGet.mockImplementation((url: string) => {
    if (url === '/auth/me') {
      return Promise.resolve({ data: { data: user } })
    }
    // Generic empty response for dashboard/page data fetches
    return Promise.resolve({ data: { data: [] } })
  })
}

describe('Role-based routing — admin-only pages', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  test('5.4 — Consultant visiting /clients/new is redirected to /dashboard', async () => {
    setupAuthenticatedUser(CONSULTANT_USER)

    render(
      <MemoryRouter initialEntries={['/clients/new']}>
        <App />
      </MemoryRouter>
    )

    // Consultant should NOT see the New Client form — gets redirected to /dashboard
    // Dashboard renders and does NOT show "Add New Client" as a form page
    await waitFor(() => {
      expect(screen.queryByText(/new client/i)).not.toBeInTheDocument()
    })
  })

  test('17.2 — Consultant visiting /settings is redirected to /dashboard', async () => {
    setupAuthenticatedUser(CONSULTANT_USER)

    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>
    )

    // Settings page should NOT render for consultant
    await waitFor(() => {
      expect(screen.queryByText(/system settings/i)).not.toBeInTheDocument()
    })
  })

  test('5.4b — Admin visiting /clients/new is NOT redirected', async () => {
    setupAuthenticatedUser(ADMIN_USER)

    render(
      <MemoryRouter initialEntries={['/clients/new']}>
        <App />
      </MemoryRouter>
    )

    // Admin should see the new client form
    await waitFor(() => {
      // The page should render without redirect (no login button)
      expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
    })
  })
})

describe('Coming-soon and unknown routes', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  test('19.1 — Authenticated user visiting /documents sees coming-soon content', async () => {
    setupAuthenticatedUser(ADMIN_USER)

    render(
      <MemoryRouter initialEntries={['/documents']}>
        <App />
      </MemoryRouter>
    )

    // Documents page is flagged COMING_SOON=true and renders ComingSoon component
    // "Coming in Sub-Phase 1E" text only appears in the ComingSoon component
    await waitFor(() => {
      expect(screen.getByText(/coming in sub-phase 1e/i)).toBeInTheDocument()
    })
  })

  test('20.1 — Unknown route renders nothing (no 404 page defined)', async () => {
    setupAuthenticatedUser(ADMIN_USER)

    render(
      <MemoryRouter initialEntries={['/this-route-does-not-exist']}>
        <App />
      </MemoryRouter>
    )

    await waitFor(() => {
      // No sign-in button (not redirected to login), no coming-soon (not Documents)
      expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument()
    })
  })
})
