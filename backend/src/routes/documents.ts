import { Router, Response } from 'express'
import { prisma } from '../lib/prisma'
import { authenticate } from '../middleware/auth'
import { AuthRequest } from '../types'

const router = Router()

// All routes require authentication
router.use(authenticate)

// GET /api/documents
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId, documentType, month, year } = req.query

    const where: any = {
      client: { tenantId: req.user!.tenantId },
    }

    if (req.user!.role === 'CONSULTANT') {
      where.client.assignedTo = req.user!.id
    }

    if (clientId) where.clientId = clientId as string
    if (documentType) where.documentType = documentType as string
    if (month) where.month = parseInt(month as string, 10)
    if (year) where.year = parseInt(year as string, 10)

    const documents = await prisma.document.findMany({
      where,
      include: {
        client: {
          select: { id: true, legalName: true, tradeName: true, gstin: true },
        },
        uploader: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    res.json({ data: documents })
  } catch (error) {
    console.error('Get documents error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

// POST /api/documents
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { clientId, documentType, fileName, filePath, fileSize, month, year } = req.body

    if (!clientId || !documentType || !fileName || !filePath) {
      res.status(400).json({
        error: 'clientId, documentType, fileName, and filePath are required',
      })
      return
    }

    // Verify client belongs to tenant
    const clientWhere: any = {
      id: clientId,
      tenantId: req.user!.tenantId,
    }
    if (req.user!.role === 'CONSULTANT') {
      clientWhere.assignedTo = req.user!.id
    }
    const client = await prisma.client.findFirst({ where: clientWhere })
    if (!client) {
      res.status(404).json({ error: 'Client not found' })
      return
    }

    // Record document metadata (actual S3 upload is stubbed)
    const document = await prisma.document.create({
      data: {
        clientId,
        documentType,
        fileName,
        filePath,
        fileSize: fileSize ? parseInt(fileSize, 10) : null,
        month: month ? parseInt(month, 10) : null,
        year: year ? parseInt(year, 10) : null,
        uploadedBy: req.user!.id,
      },
      include: {
        client: {
          select: { id: true, legalName: true, tradeName: true, gstin: true },
        },
        uploader: {
          select: { id: true, name: true },
        },
      },
    })

    res.status(201).json({ data: document })
  } catch (error) {
    console.error('Create document error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router
