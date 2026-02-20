# GST Filing System — Implementation Notes

## Implemented Features (complete)

---

### Auth (`backend/src/routes/auth.ts`)
- POST `/api/auth/login` — email + password, returns JWT
- POST `/api/auth/logout` — clears token client-side
- GET `/api/auth/me` — returns user profile from token

---

### Clients (`backend/src/routes/clients.ts`, `frontend/src/pages/Clients.tsx`)

**Backend endpoints:**
- GET `/api/clients` — paginated list; supports `search`, `status`, `assignedTo` (or `'unassigned'` → `WHERE assigned_to IS NULL`), `page`, `limit`
- POST `/api/clients` — admin only; creates client with full automation settings
- PUT `/api/clients/bulk-assign` — admin only; `{ clientIds, consultantId }` → updateMany
- PUT `/api/clients/bulk-automation` — admin only; `{ clientIds, automationEnabled, notifyEmail, notifyWhatsapp, reminderDaysBefore }` → updateMany
- GET `/api/clients/:id` — includes `assignedUser`, `filingStatus`, `filedReturns`
- PUT `/api/clients/:id` — full update including automation fields
- DELETE `/api/clients/:id` — soft delete (sets status = INACTIVE)

**Client model defaults (after migration `update_automation_defaults`):**
- `automationEnabled: true`, `notifyEmail: true`, `notifyWhatsapp: true`
- `gstr1DueDay: 11`, `gstr3bDueDay: 20`, `reminderDaysBefore: [7, 3, 1]`

**Frontend (Clients.tsx) features:**
- Search + Status + Consultant filter (admin only; includes "Unassigned" option)
- Checkbox rows → bulk action bar with "Assign to Consultant" and "Edit Reminders" modals
- Reminders column: shows `"Email · WA"` / `"Email"` / `"WA"` / `"–"` based on `notifyEmail`/`notifyWhatsapp`/`automationEnabled`
- Created + Last Updated columns (date+time, 24h, en-IN locale)
- Actions column is `sticky right-0` (frozen on horizontal scroll)
- Sheet Sync modal embedded (not a separate page — `/sheet-sync` route removed)

---

### Clients — Edit & New (`frontend/src/pages/EditClient.tsx`, `NewClient.tsx`)
- NewClient defaults: `automationEnabled: true`, `notifyEmail: true`, `notifyWhatsapp: true`
- EditClient prefills all fields including automation settings
- Both submit to POST/PUT `/api/clients`

---

### Client Detail (`frontend/src/pages/ClientDetail.tsx`)
- Admin: "Edit" button → `/clients/:id/edit`, "Assigned To" live dropdown (PUT `/api/clients/:id`)
- Shows filing status history, filed returns, automation settings summary

---

### Dashboard (`frontend/src/routes/dashboard.ts`, `frontend/src/pages/Dashboard.tsx`)
- Admin: 6 stat cards (Total Clients, Data Received, With Errors, JSON Generated, GSTR-1 Filed, GSTR-3B Filed)
- Consultant: 4 stat cards
- Action Required alerts (errors → /filing, pending → /reminders, JSON ready → /json-generator)
- DeadlineBar component: progress bar + color urgency (red ≤3d, yellow ≤7d, green)
- Filing Status Breakdown
- Recent Activity feed

---

### Sheet Sync (`backend/src/routes/sheet-sync.ts`, `backend/src/services/google-sheets.ts`)

**OAuth flow:**
1. GET `/api/sheet-sync/auth-url` → Google OAuth URL with `state=tenantId`
2. User authorizes → Google redirects to GET `/api/sheet-sync/google-callback`
3. Backend saves tokens, redirects to `${FRONTEND_URL}/clients?connected=true`
4. Frontend Clients.tsx reads `?connected=true` and opens the sync modal

**Endpoints:** auth-url, google-callback, config (GET/PUT), preview (POST), apply (POST), disconnect (POST)

**Sheet columns expected:** GSTIN, Legal Name, Trade Name, Contact Person, Email, Phone, Address, State Code, Filing Frequency

**Key bug fixes applied:**
- OAuth redirects to `/clients` (not `/sheet-sync` which was removed)
- Apply update route uses dynamic `updateData` (only sets fields present in payload) — prevents wiping unchanged fields (trade name, etc.) when only one field changed
- New clients created via sync get `automationEnabled: true, notifyEmail: true, notifyWhatsapp: true`
- Sync result view shows "Sync Complete" panel with created/updated counts + FYI about automation defaults

---

### Reminders (`backend/src/routes/reminders.ts`, `frontend/src/pages/Reminders.tsx`)

**3 tabs:**
1. **Send** — select client + type + channel + optional custom message; shows template preview
2. **Templates** (admin) — accordion per type, EMAIL/WHATSAPP/SMS sub-tabs, subject + body editors
3. **Logs** — filterable table (client, channel, status, month, year); expandable rows

**6 Reminder Types (automation trigger identifiers for future Yaksh agent):**
| Key | Label |
|-----|-------|
| `SALES_DATA_COLLECTION` | Sales Data Collection |
| `PURCHASE_DATA_COLLECTION` | Purchase Data Collection |
| `SALES_FOLLOW_UP` | Sales Follow-Up |
| `PURCHASE_FOLLOW_UP` | Purchase Follow-Up |
| `GSTR1_DEADLINE` | GSTR-1 Deadline |
| `GSTR3B_DEADLINE` | GSTR-3B Deadline |

**Template system:**
- `ReminderTemplate` table stores per-tenant custom templates (tenantId + reminderType + channel unique)
- `DEFAULT_TEMPLATES` in `backend/src/routes/reminder-templates.ts` — fallback if no DB override
- Placeholder substitution: `{clientName}`, `{month}`, `{year}`, `{dueDate}`, `{consultantName}`
- Admin can override any template via Templates tab; `isCustom: true` flag shown in preview

---

### Reminder Templates API (`backend/src/routes/reminder-templates.ts`)
- GET `/api/reminder-templates` (admin) — merges DB templates with defaults, returns `isCustom` flag
- PUT `/api/reminder-templates/:reminderType/:channel` (admin) — upserts template

---

### Users (`backend/src/routes/users.ts`, `frontend/src/pages/Settings.tsx`)
- GET `/api/users` — list all active users in tenant
- POST `/api/users` — admin only; creates user with bcrypt hash, validates email uniqueness + password policy
- PUT `/api/users/:id` — admin only; updates name, phone, role, optional email

---

### Settings (`frontend/src/pages/Settings.tsx`)
**3 sections:**
1. **User Management** — add user form, inline edit (name/phone/role), role badge
2. **System Settings** — GSTR-1 due day, GSTR-3B due day, reminder days (comma-separated); stored in `system_settings` key-value table
3. **Google Account** — connect/disconnect OAuth for sheet sync

---

### System Settings (`backend/src/routes/system-settings.ts`)
- GET `/api/system-settings` — returns `gstr1DueDay`, `gstr3bDueDay`, `reminderDaysBefore` with defaults (11, 20, [7,3,1])
- PUT `/api/system-settings` (admin) — upserts each key in `SystemSetting` table

---

### Filing Status (`backend/src/routes/filing-status.ts`)
- Standard CRUD for filing status per client/month/year
- Stages: NOT_STARTED → DATA_RECEIVED → VALIDATION_ERRORS → JSON_GENERATED → FILED / NIL_RETURN

---

### JSON Generation (`backend/src/routes/json-generate.ts`)
- Generates GSTR-1 JSON from validated invoice data
- 6 sections: b2b, b2cl, b2cs (aggregated), cdnr, exp, hsn (aggregated)
- Transaction classification: CDNR → EXP → B2B → B2CL (>₹2.5L interstate) → B2CS (default)

---

### Other Routes
- `/api/invoices` — upload/validate invoice data
- `/api/filed-returns` — ARN entry and acknowledgment tracking
- `/api/documents` — file upload/download via S3 signed URLs
- `/api/audit-logs` — read-only audit trail
- `/api/agent-activity` — Yaksh agent activity log (future use)

---

## Known Patterns / Gotchas

- **Bulk routes must be registered before `/:id`** — e.g. `bulk-assign` and `bulk-automation` are PUT routes registered before `PUT /:id` to prevent Express treating the literal string as an `:id` param
- **Sheet sync apply**: Only send fields present in payload for UPDATE (dynamic `updateData`) to avoid overwriting unchanged fields with null
- **Prisma array defaults**: `reminderDaysBefore Int[] @default([7, 3, 1])` — PostgreSQL stores as integer array
- **Google OAuth state param**: `tenantId` is passed as `state` through the OAuth flow since the callback endpoint has no auth middleware
- **Frontend route `/sheet-sync` removed** — Sheet Sync is now a modal inside `/clients`; OAuth redirects to `/clients?connected=true`
- **Consultant filter**: `assignedTo=unassigned` is a special value → `WHERE assigned_to IS NULL`

---

## Migrations Applied
1. `20260220194015_add_reminder_templates` — adds `reminder_templates` table
2. `20260220205222_update_automation_defaults` — sets `automation_enabled` and `notify_whatsapp` defaults to `true`
