import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, authorize } from '../middleware/auth'
import { createAuditLog } from '../services/audit'
import { hashPassword } from '../lib/auth'
import { AuthRequest } from '../types'

const router = Router()

// All routes require authentication and Admin role
router.use(authenticate)
router.use(authorize('ADMIN'))

// GET /api/users
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { tenantId: req.user!.tenantId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { assignedClients: true },
        },
      },
      orderBy: { name: 'asc' },
    })

    res.json({ data: users })
  } catch (error) {
    console.error('Get users error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/users
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, role, password } = req.body

    if (!name || !email || !password) {
      res.status(400).json({ error: 'name, email, and password are required' })
      return
    }

    if (!['ADMIN', 'CONSULTANT'].includes(role)) {
      res.status(400).json({ error: 'Invalid role. Must be ADMIN or CONSULTANT' })
      return
    }

    const passwordPolicy = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/
    if (!passwordPolicy.test(password)) {
      res.status(400).json({
        error: 'Password must be at least 8 characters with uppercase, lowercase, number, and special character',
      })
      return
    }

    const existing = await prisma.user.findFirst({
      where: { tenantId: req.user!.tenantId, email },
    })
    if (existing) {
      res.status(409).json({ error: 'A user with this email already exists' })
      return
    }

    const passwordHash = await hashPassword(password)

    const user = await prisma.user.create({
      data: {
        tenantId: req.user!.tenantId,
        name,
        email,
        phone: phone || null,
        role,
        passwordHash,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'CREATE',
      entityType: 'USER',
      entityId: user.id,
      newValue: { name: user.name, email: user.email, role: user.role },
      ipAddress: req.ip,
    })

    res.status(201).json({ data: user })
  } catch (error) {
    console.error('Create user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// PUT /api/users/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, phone, role, isActive } = req.body

    const existing = await prisma.user.findFirst({
      where: {
        id: req.params.id as string,
        tenantId: req.user!.tenantId,
      },
    })

    if (!existing) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (phone !== undefined) updateData.phone = phone || null
    if (role !== undefined) {
      if (!['ADMIN', 'CONSULTANT'].includes(role)) {
        res.status(400).json({ error: 'Invalid role. Must be ADMIN or CONSULTANT' })
        return
      }
      updateData.role = role
    }
    if (isActive !== undefined) updateData.isActive = isActive
    if (email !== undefined && email !== existing.email) {
      const duplicate = await prisma.user.findFirst({
        where: { tenantId: req.user!.tenantId, email, id: { not: existing.id } },
      })
      if (duplicate) {
        res.status(409).json({ error: 'A user with this email already exists' })
        return
      }
      updateData.email = email
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id as string },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        phone: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    await createAuditLog({
      userId: req.user!.id,
      tenantId: req.user!.tenantId,
      action: 'UPDATE',
      entityType: 'USER',
      entityId: updated.id,
      oldValue: { name: existing.name, role: existing.role, isActive: existing.isActive, phone: existing.phone },
      newValue: { name: updated.name, role: updated.role, isActive: updated.isActive, phone: updated.phone },
      ipAddress: req.ip,
    })

    res.json({ data: updated })
  } catch (error) {
    console.error('Update user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
