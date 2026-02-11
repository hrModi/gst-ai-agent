import { Request, Response, NextFunction } from 'express'

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error('Error:', err.message)

  const statusCode = (err as any).statusCode || 500
  const message = err.message || 'Internal server error'

  const response: { error: string; stack?: string } = { error: message }

  if (process.env.NODE_ENV === 'development') {
    response.stack = err.stack
  }

  res.status(statusCode).json(response)
}
