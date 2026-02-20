# GST Filing System — Project Memory

## Architecture
- **Frontend**: React 18 + React Router v6 + Tailwind CSS — hosted on Vercel (`frontend/`)
- **Backend**: Express.js + TypeScript + Prisma ORM — hosted on Railway (`backend/`)
- **Database**: PostgreSQL on Supabase
- **Auth**: JWT in `Authorization` header (cookie-less); `authenticate` + `authorize('ADMIN')` middleware
- **Multi-tenant**: All DB queries scoped by `tenantId` from JWT payload
- **Validation**: Zod on backend, inline on frontend

## Key Patterns
- All API routes: `router.use(authenticate)` then `authorize('ADMIN')` per route
- Consultants: `where.assignedTo = req.user!.id` filter applied in every list endpoint
- Admin: sees all tenant data, passes optional `assignedTo` filter param
- Audit log: `createAuditLog(...)` called after every mutating operation
- Frontend API calls: all via `src/lib/api.ts` (axios instance with base URL + auth header)

## File Structure
```
backend/
  src/
    routes/          # One file per resource
    services/        # audit.ts, google-sheets.ts, validation/schemas.ts
    middleware/      # auth.ts (authenticate, authorize)
    lib/             # prisma.ts client singleton
  prisma/
    schema.prisma    # 13 models
    migrations/      # Applied migrations

frontend/
  src/
    pages/           # One file per route
    components/      # DashboardLayout, Sidebar, etc.
    contexts/        # AuthContext
    lib/             # api.ts
```

## Database Models (13 tables)
`tenants` → `users`, `clients`, `system_settings`, `sheet_sync_configs`, `reminder_templates`
`clients` → `invoice_data`, `filing_status`, `filed_returns`, `documents`, `reminders`
`invoice_data` → `validation_errors`
`users` → `audit_logs`
`yaksh_activities` (agent activity log)

## Seed Data
- 1 tenant: ABC CA & Associates
- 6 users: Hriday (ADMIN), Vidhi/Hetal/Shivani/Jigar/Raj (CONSULTANT)
- Default password: `Password@123`

## See implementation-notes.md for full feature inventory
