# GST Filing System — Implementation Notes

## Phase Progress (IMPLEMENTATION_PLAN.md)

| Phase | Status | Summary |
|-------|--------|---------|
| 1A | ✅ Complete | Google Sheets OAuth sync modal in /clients. Backend: sheet-sync.ts + google-sheets.ts. DB: SheetSyncConfig. |
| 1B | ✅ Complete | Per-client automation fields on Client model. FilingStatus.stage + stageUpdatedAt. YakshActivity table. |
| 1C | ✅ Complete | node-cron scheduler. Daily reminder job (9 AM IST). Monthly status-init job (1st). isAuto field on Reminder. Schedule tab in Reminders.tsx. |
| 1D | ⏳ Pending | Gmail inbox poller. InboxMessage model. InboxMonitor.tsx page. |
| 1E | ⏳ Pending | Auto pipeline: email → parse → validate → JSON → notify. pipeline.ts + notification.ts. |
| 1F | ⏳ Pending | Claude AI (Yaksh intelligence). yaksh.ts service. Anthropic SDK. |
| 1G | ⏳ Pending | GSTR-2B upload + reconciliation. 2 new DB tables. Reconciliation.tsx page. |
| 1H | ⏳ Pending | GSTR-3B computation. NIL/PAYMENT/CREDIT classification. Gstr3bView.tsx. |
| 1I | ⏳ Pending | Yaksh Dashboard page (/yaksh). Full activity monitor. |

---

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
- Status filter default: `'ACTIVE'` — only active clients shown by default; select "All (incl. Archived)" to see all
- Checkbox rows → bulk action bar with "Assign to Consultant" and "Edit Reminders" modals
- Reminders column: shows `"Email · WA"` / `"Email"` / `"WA"` / `"–"` based on `notifyEmail`/`notifyWhatsapp`/`automationEnabled`
- Created + Last Updated columns (date+time, 24h, en-IN locale)
- Actions column is `sticky right-0` (frozen on horizontal scroll)
- **Archive** (admin): calls `DELETE /api/clients/:id` with confirm dialog → sets INACTIVE, disappears from default view
- **Restore** (admin): shown on INACTIVE clients; calls `PUT /api/clients/:id { status: 'ACTIVE' }`
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

**4 tabs:**
1. **Send** — select client + type + channel; shows template preview; always uses template (no custom message override)
2. **Templates** (admin) — accordion per type, EMAIL/WHATSAPP/SMS sub-tabs, subject + body editors
3. **Schedule** — upcoming automated reminder events for current month (calls GET /api/reminders/schedule)
4. **Logs** — filterable table (client, channel, status, month, year); expandable rows; "Auto" badge for Yaksh-sent reminders

**Endpoints:**
- POST `/api/reminders` — manual send; resolves template; sends via channel; creates Reminder record with `isAuto: false`
- GET `/api/reminders` — list with filters (clientId, month, year, status, channel)
- GET `/api/reminders/schedule` — upcoming automated events for current month (all automationEnabled clients)

**6 Reminder Types (automation trigger identifiers):**
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

**isAuto field on Reminder:**
- `isAuto: true` — set by Yaksh scheduler jobs (reminder-job.ts)
- `isAuto: false` — default, set on manual sends from Send tab

---

### Reminder Templates API (`backend/src/routes/reminder-templates.ts`)
- GET `/api/reminder-templates` (admin) — merges DB templates with defaults, returns `isCustom` flag
- PUT `/api/reminder-templates/:reminderType/:channel` (admin) — upserts template

---

### Scheduler (1C — `backend/src/services/scheduler.ts`)
- `startScheduler()` called inside `app.listen()` in `index.ts`
- **Daily job** (9 AM IST): `reminder-job.ts` — sends automated reminders to clients due soon
- **Monthly job** (1st of month, midnight IST): `status-init-job.ts` — creates FilingStatus records for all active clients

**reminder-job.ts logic:**
1. For each tenant: get all ACTIVE clients with `automationEnabled = true`
2. Calculate `daysUntilDue = client.gstr1DueDay - today's day`
3. If `daysUntilDue` is in `client.reminderDaysBefore` → proceed
4. Check FilingStatus.stage — skip if `DATA_RECEIVED` or later
5. Deduplicate: skip if reminder already sent today for this client/month
6. Determine type: first-ever = `SALES_DATA_COLLECTION`, subsequent = `SALES_FOLLOW_UP`
7. Send via notifyEmail/notifyWhatsapp channels; create Reminder with `isAuto: true`
8. First reminder: upsert FilingStatus with `stage: REMINDER_SENT`
9. Log YakshActivity with `activityType: REMINDER_SENT`

**status-init-job.ts logic:**
- Upserts FilingStatus for all ACTIVE clients for new month with `stage: NOT_STARTED`
- Uses `create + update: {}` so existing records are never overwritten

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
- Stages: NOT_STARTED → REMINDER_SENT → DATA_RECEIVED → VALIDATING → VALIDATION_FAILED → VALIDATED → JSON_GENERATED → READY_TO_FILE → FILED / NIL_RETURN

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
- `/api/agent-activity` — Yaksh agent activity log

---

### Navigation & Routing (`frontend/src/App.tsx`, `frontend/src/components/layout/Sidebar.tsx`)

**Current routes:**
- `/dashboard`, `/clients`, `/clients/new`, `/clients/:id`, `/clients/:id/edit`
- `/filing`, `/invoices/upload`, `/invoices/:clientId`, `/json-generator`
- `/reminders`, `/documents`, `/settings` (admin only)

**Coming Soon routes (ComingSoon.tsx placeholder):**
- `/inbox` — Inbox Monitor (Phase 1D)
- `/reconciliation` — GSTR-2B Reconciliation (Phase 1G)
- `/gstr3b` — GSTR-3B Preparation (Phase 1H)
- `/yaksh` — Yaksh Activity Dashboard (Phase 1I)

**`frontend/src/pages/ComingSoon.tsx`** — shared placeholder component; takes `title`, `description`, `phase` props; shows clock icon + description + phase badge.

**Sidebar sections:**
1. Main nav (all users): Dashboard, Clients, Filing Status, Upload Invoices, JSON Generator, Reminders, Documents
2. Admin only: Settings
3. Upcoming (all users): Inbox Monitor, Reconciliation, GSTR-3B, Yaksh — each shows phase tag; dimmed style

---

## Key Service Facts (for 1D+ implementation)

### email.ts (`backend/src/services/email.ts`)
- `sendEmail(to, subject, body)` → `{ success: boolean, messageId: string }`
- AWS SES via `@aws-sdk/client-ses` (dynamic import)
- Falls back gracefully (console.warn, returns `{ success: false }`) if `AWS_ACCESS_KEY_ID` not set
- From address: `AWS_SES_FROM_EMAIL` env var (default: noreply@abcca.com)
- Region: `AWS_SES_REGION` || `AWS_REGION` || `ap-south-1`

### whatsapp.ts (`backend/src/services/whatsapp.ts`)
- `sendWhatsApp(phone, message)` → `{ success: boolean }`
- Gupshup API: POST `https://api.gupshup.io/wa/api/v1/msg`
- Falls back gracefully (console.warn, returns `{ success: false }`) if `GUPSHUP_API_KEY` not set
- Source number: `GUPSHUP_PHONE_NUMBER` env var; src.name: `ABCCAAssociates`

### index.ts (`backend/src/index.ts`)
- Standard Express + CORS setup. `startScheduler()` called inside `app.listen()` callback.
- All routes registered under `/api/*`

### reminders.ts template pattern
```ts
// DB template → DEFAULT_TEMPLATES fallback → applyPlaceholders
const dbTemplate = await prisma.reminderTemplate.findFirst({ where: { tenantId, reminderType, channel, isActive: true } })
const templateDefaults = DEFAULT_TEMPLATES[reminderType]?.[channel]
const body = dbTemplate?.body ?? templateDefaults?.body ?? 'Reminder: Please submit your GST data.'
const subject = dbTemplate?.subject ?? templateDefaults?.subject ?? 'GST Filing Reminder'
const resolved = applyPlaceholders(body, { clientName, month, year, dueDate, consultantName })
```

### FilingStatus.stage values (ordered)
`NOT_STARTED` → `REMINDER_SENT` → `DATA_RECEIVED` → `VALIDATING` → `VALIDATION_FAILED` → `VALIDATED` → `JSON_GENERATED` → `READY_TO_FILE` → `FILED`

### YakshActivity model
- Fields: `tenantId`, `clientId` (nullable), `activityType`, `description`, `metadata` (Json), `createdAt`
- `activityType` values used: `REMINDER_SENT`, `EMAIL_RECEIVED`, `VALIDATION_RUN`, `JSON_GENERATED`, `NOTIFICATION_SENT`, `SHEET_SYNC`, `ERROR`

### Client automation fields (all on Client model)
- `automationEnabled Boolean @default(true)`
- `notifyEmail Boolean @default(true)`
- `notifyWhatsapp Boolean @default(true)`
- `gstr1DueDay Int @default(11)` — day of month GSTR-1 is due
- `gstr3bDueDay Int @default(20)`
- `reminderDaysBefore Int[] @default([7, 3, 1])` — send reminders X days before due date

### Reminder model — isAuto field (added in 1C)
- `isAuto Boolean @default(false) @map("is_auto")` — true when sent by Yaksh scheduler

---

## Known Patterns / Gotchas

- **Bulk routes must be registered before `/:id`** — e.g. `bulk-assign` and `bulk-automation` are PUT routes registered before `PUT /:id` to prevent Express treating the literal string as an `:id` param
- **Sheet sync apply**: Only send fields present in payload for UPDATE (dynamic `updateData`) to avoid overwriting unchanged fields with null
- **Prisma array defaults**: `reminderDaysBefore Int[] @default([7, 3, 1])` — PostgreSQL stores as integer array
- **Google OAuth state param**: `tenantId` is passed as `state` through the OAuth flow since the callback endpoint has no auth middleware
- **Frontend route `/sheet-sync` removed** — Sheet Sync is now a modal inside `/clients`; OAuth redirects to `/clients?connected=true`
- **Consultant filter**: `assignedTo=unassigned` is a special value → `WHERE assigned_to IS NULL`
- **IST timezone for cron**: Use `{ timezone: 'Asia/Kolkata' }` option in node-cron. IST = UTC+5:30. 9 AM IST = `30 3 * * *` in UTC cron.
- **Reminder deduplication**: Check `createdAt >= startOfToday` in IST (use `new Date()` in IST context or convert) before sending to avoid double-sends if job runs twice.

---

## Migrations Applied
1. `20260220194015_add_reminder_templates` — adds `reminder_templates` table
2. `20260220205222_update_automation_defaults` — sets `automation_enabled` and `notify_whatsapp` defaults to `true`
3. `20260221_add_is_auto_to_reminders` — adds `is_auto` boolean column to `reminders` table
