import { Request } from 'express'

export interface AuthUser {
  id: string
  tenantId: string
  email: string
  name: string
  role: 'ADMIN' | 'CONSULTANT'
}

export interface AuthRequest extends Request {
  user?: AuthUser
}
