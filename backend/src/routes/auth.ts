import { Router, Response } from 'express'
import crypto from 'crypto'
import { prisma } from '../lib/prisma'
import { verifyPassword, hashPassword, signToken } from '../lib/auth'
import { loginSchema } from '../services/validation/schemas'
import { authenticate } from '../middleware/auth'
import { AuthRequest } from '../types'
import { sendEmail } from '../services/email'

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

// POST /api/auth/forgot-password (unauthenticated)
router.post('/forgot-password', async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required' })
      return
    }

    const user = await prisma.user.findFirst({ where: { email, isActive: true } })

    if (user) {
      const token = crypto.randomBytes(32).toString('hex')
      const expiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

      await prisma.user.update({
        where: { id: user.id },
        data: { passwordResetToken: token, passwordResetExpiry: expiry },
      })

      const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`
      await sendEmail(
        user.email,
        'Reset your GST Pilot password',
        `Hi ${user.name},\n\nYou requested a password reset. Click the link below to set a new password:\n\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request this, please ignore this email.\n\nRegards,\nGST Pilot`
      )
    }

    // Always return 200 — don't reveal whether the email exists
    res.json({ data: { message: "If that email is registered, you'll receive a reset link shortly." } })
  } catch (error) {
    console.error('Forgot password error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/auth/reset-password (unauthenticated)
router.post('/reset-password', async (req: AuthRequest, res: Response) => {
  try {
    const { token, newPassword } = req.body
    if (!token || !newPassword) {
      res.status(400).json({ error: 'token and newPassword are required' })
      return
    }

    const user = await prisma.user.findFirst({ where: { passwordResetToken: token } })

    if (!user || !user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
      res.status(400).json({ error: 'Invalid or expired reset token' })
      return
    }

    const passwordPolicy = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    if (!passwordPolicy.test(newPassword)) {
      res.status(400).json({
        error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character',
      })
      return
    }

    const passwordHash = await hashPassword(newPassword)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordResetToken: null, passwordResetExpiry: null },
    })

    res.json({ data: { message: 'Password reset successfully' } })
  } catch (error) {
    console.error('Reset password error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/auth/change-password (authenticated, any role)
router.put('/change-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'currentPassword and newPassword are required' })
      return
    }

    const user = await prisma.user.findUnique({ where: { id: req.user!.id } })
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash)
    if (!valid) {
      res.status(401).json({ error: 'Current password is incorrect' })
      return
    }

    const passwordPolicy = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    if (!passwordPolicy.test(newPassword)) {
      res.status(400).json({
        error: 'New password must be at least 8 characters with uppercase, lowercase, number, and special character',
      })
      return
    }

    const passwordHash = await hashPassword(newPassword)
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

    res.json({ data: { message: 'Password changed successfully' } })
  } catch (error) {
    console.error('Change password error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
