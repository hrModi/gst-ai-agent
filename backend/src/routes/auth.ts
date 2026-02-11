import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { verifyPassword, signToken } from '../lib/auth'
import { loginSchema } from '../services/validation/schemas'
import { authenticate } from '../middleware/auth'
import { AuthRequest } from '../types'

const router = Router()

// POST /api/auth/login
router.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() })
      return
    }

    const { email, password } = parsed.data

    // Find user by email (for now, accept any tenant - find first matching user)
    const user = await prisma.user.findFirst({
      where: { email, isActive: true },
      include: { tenant: true },
    })

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const passwordValid = await verifyPassword(password, user.passwordHash)
    if (!passwordValid) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const token = signToken({
      id: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    })

    res.json({
      data: {
        token,
        user: {
          id: user.id,
          tenantId: user.tenantId,
          email: user.email,
          name: user.name,
          role: user.role,
          phone: user.phone,
          tenant: {
            id: user.tenant.id,
            name: user.tenant.name,
          },
        },
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// GET /api/auth/me
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { tenant: true },
    })

    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    res.json({
      data: {
        id: user.id,
        tenantId: user.tenantId,
        email: user.email,
        name: user.name,
        role: user.role,
        phone: user.phone,
        tenant: {
          id: user.tenant.id,
          name: user.tenant.name,
        },
      },
    })
  } catch (error) {
    console.error('Get me error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/auth/logout
router.post('/logout', (_req: AuthRequest, res: Response) => {
  // Client handles token removal; server just acknowledges
  res.json({ data: { message: 'Logged out successfully' } })
})

export default router
