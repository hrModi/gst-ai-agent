import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate, authorize } from '../middleware/auth'
import { createAuditLog } from '../services/audit'
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

// PUT /api/users/:id
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, role, isActive } = req.body

    const existing = await prisma.user.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user!.tenantId,
      },
    })

    if (!existing) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    const updateData: any = {}
    if (name !== undefined) updateData.name = name
    if (role !== undefined) {
      if (!['ADMIN', 'CONSULTANT'].includes(role)) {
        res.status(400).json({ error: 'Invalid role. Must be ADMIN or CONSULTANT' })
        return
      }
      updateData.role = role
    }
    if (isActive !== undefined) updateData.isActive = isActive

    const updated = await prisma.user.update({
      where: { id: req.params.id },
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
      oldValue: { name: existing.name, role: existing.role, isActive: existing.isActive },
      newValue: { name: updated.name, role: updated.role, isActive: updated.isActive },
      ipAddress: req.ip,
    })

    res.json({ data: updated })
  } catch (error) {
    console.error('Update user error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
