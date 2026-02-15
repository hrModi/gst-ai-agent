# GSTPilot — Phase 1 Implementation Plan (Yaksh AI Agent)

> **Status**: DRAFT — awaiting approval before implementation begins.
> **Last updated**: 2026-02-14
> **Product**: GSTPilot — *Your Command Center for GST Compliance*
> **AI Agent**: Yaksh — *The intelligent compliance guardian inside GSTPilot*
> **Naming note**: Uses GSTR-2B (not GSTR-2A) throughout.
> **Brand reference**: See `BRAND_AND_AI_IDENTITY.md` for full brand guidelines.

---

## Context

GSTPilot's base system (Express backend + React frontend monorepo) is built with manual workflows: manual client creation, manual invoice upload, manual validation trigger, manual JSON generation, manual reminder sending. The goal is to evolve this into **Yaksh** — a hybrid AI-powered autonomous agent that automates the entire monthly GST filing workflow per client — from syncing client data, to sending reminders, to receiving data via email, to processing and preparing filings — with minimal human intervention.

**Phase 1 scope**: Everything up to *preparing* the filing. Actual GST portal filing (GSTR-1/3B submission, NIL returns, payments, ITC credits) is deferred to Phase 2 when GST API access is available.

### Branding Rules (from `BRAND_AND_AI_IDENTITY.md`)

- Product name: **GSTPilot** (never GST PILOT / gstpilot / GstPilot)
- AI agent name: **Yaksh** (capital Y, no suffix — never YakshBot / Yaksha AI / GSTYaksh)
- Yaksh is a **persona**, not a "bot" or "assistant"
- UI copy tone: professional, intelligent, non-gimmicky
- UI messages use Yaksh as subject: "Yaksh is validating your invoices...", "Yaksh detected 3 errors"
- Backend service file: `yaksh.ts` (not `ai-agent.ts`)

---

## What Already Exists (Reuse, Don't Rebuild)

| Component | File | Status |
|-----------|------|--------|
| Invoice validation (7 rules) | `backend/src/services/validation/invoice.ts` | Complete |
| GSTR-1 JSON generator | `backend/src/services/gstr1/generator.ts` | Complete |
| Email sending (AWS SES) | `backend/src/services/email.ts` | Real, working |
| WhatsApp sending (Gupshup) | `backend/src/services/whatsapp.ts` | Real, working |
| Audit logging | `backend/src/services/audit.ts` | Complete |
| Auth + RBAC | `backend/src/middleware/auth.ts` | Complete |
| Client CRUD | `backend/src/routes/clients.ts` | Complete |
| Invoice upload + parse | `backend/src/routes/invoices.ts` | Complete |
| Filing status tracking | `backend/src/routes/filing-status.ts` | Complete |
| Zod validation schemas | `backend/src/services/validation/schemas.ts` | Complete |
| Storage service (S3/local) | `backend/src/services/storage.ts` | Complete |
| 12 frontend pages | `frontend/src/pages/*` | Complete |
| Prisma schema (11 tables) | `backend/prisma/schema.prisma` | Complete |

---

## Sub-Phase 1A: Google Sheets Client Sync

**Goal**: Allow admins to import/update client master data from a Google Sheet, with a review step before committing changes.

### Design Decisions
- **Admin-only** — only admins can configure sheet URL and trigger sync
- **Fixed column format** — sheet must have these exact column headers: `GSTIN | Legal Name | Trade Name | Contact Person | Email | Phone | Address | State Code | Filing Frequency`
- **On-demand sync** — admin clicks "Sync Now", no automatic polling
- **Match key: GSTIN** — if GSTIN already exists for this tenant, it's an update; if new, it's an insert
- **Review before commit** — sync fetches data and presents a diff (new / changed / unchanged rows), admin selects which to apply

### New Dependency
```
googleapis    // Google Sheets API (also reused in 1D for Gmail)
```

### New Environment Variables
```
GOOGLE_CLIENT_ID=           // OAuth2 client (shared with Gmail in 1D)
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
```

### DB Schema Changes (`backend/prisma/schema.prisma`)

**New model `SheetSyncConfig`**:
```prisma
model SheetSyncConfig {
  id              String    @id @default(uuid())
  tenantId        String    @unique          // one config per tenant
  spreadsheetUrl  String                     // full Google Sheets URL
  spreadsheetId   String                     // extracted sheet ID
  sheetName       String    @default("Sheet1") // tab name
  lastSyncedAt    DateTime?
  lastSyncStatus  String?                    // SUCCESS, PARTIAL, FAILED
  lastSyncSummary Json?                      // { created: N, updated: N, skipped: N, errors: [...] }
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  tenant          Tenant    @relation(fields: [tenantId], references: [id])
}
```

### Backend Changes

| Action | File | Details |
|--------|------|---------|
| New | `backend/src/services/google-sheets.ts` | Google Sheets API client: OAuth2 setup with refresh token, `fetchSheetData(spreadsheetId, sheetName)` returns array of row objects. Validates column headers match expected format. Maps rows to client field names. |
| New | `backend/src/routes/sheet-sync.ts` | Admin-only endpoints: `PUT /api/sheet-sync/config` save/update sheet URL + sheet name. `GET /api/sheet-sync/config` get current config. `POST /api/sheet-sync/preview` fetch sheet, diff against existing clients. `POST /api/sheet-sync/apply` create/update selected clients. Logs audit trail + YakshActivity. |
| Modify | `backend/src/index.ts` | Register `/api/sheet-sync` route. |

**Preview response shape:**
```typescript
{
  preview: {
    new: [{ rowNum, gstin, legalName, ... }],
    changed: [{ rowNum, gstin, clientId, changes: { fieldName: { old, new } } }],
    unchanged: number,
    errors: [{ rowNum, gstin, message }],
  }
}
```

**Apply request shape:**
```typescript
{
  create: string[],    // GSTINs to create from preview
  update: string[],    // client IDs to update from preview
}
```

### Frontend Changes

| Action | File | Details |
|--------|------|---------|
| New | `frontend/src/pages/SheetSync.tsx` | Admin-only page: **Config** (Google Sheet URL, sheet tab name, save, last sync status), **Preview** (table with new/changed/error rows, checkboxes, field-level diffs in yellow), **Apply** (confirm button, result summary). |
| Modify | `frontend/src/App.tsx` | Add route `/sheet-sync` (admin-only). |
| Modify | `frontend/src/components/layout/Sidebar.tsx` | Add "Sheet Sync" nav item (admin-only). |

### Expected Google Sheet Format

| GSTIN | Legal Name | Trade Name | Contact Person | Email | Phone | Address | State Code | Filing Frequency |
|-------|-----------|------------|----------------|-------|-------|---------|-----------|-----------------|
| 27AABCU9603R1ZM | ABC Corp | ABC | John Doe | john@abc.com | 9876543210 | Mumbai | 27 | MONTHLY |

### Sync Flow
1. Admin pastes Google Sheet URL in config section, saves
2. Admin clicks "Sync Now"
3. Backend fetches sheet via Google Sheets API
4. Backend validates each row (GSTIN format, required fields, state code)
5. Backend diffs against existing clients (match by GSTIN within tenant)
6. Frontend displays: X new, Y changed, Z unchanged, E errors
7. Admin reviews, selects rows to apply (checkboxes, select-all)
8. Admin clicks "Apply Selected"
9. Backend creates/updates clients, returns summary
10. Audit log records all changes

### Summary
- **New files**: 3 (`google-sheets.ts`, `sheet-sync.ts` route, `SheetSync.tsx`)
- **Modified files**: 3
- **New DB table**: 1 (`SheetSyncConfig`)
- **Outcome**: Admins can bulk-import and update 130+ clients from a Google Sheet with full review before committing.

---

## Sub-Phase 1B: Configuration & Schema Foundation

**Goal**: Add per-client automation settings and stage-based filing tracking. This is the foundation Yaksh builds on.

### DB Schema Changes (`backend/prisma/schema.prisma`)

**Modify `Client` model** — add automation fields:
```
automationEnabled    Boolean   @default(false)
notifyEmail          Boolean   @default(true)
notifyWhatsapp       Boolean   @default(false)
gstr1DueDay          Int       @default(11)       // day of month
gstr3bDueDay         Int       @default(20)
reminderDaysBefore   Int[]     @default([7, 3, 1]) // send reminders X days before due
dataEmailSubject     String?                       // expected subject format from this client
```

**Modify `FilingStatus` model** — add stage tracking:
```
stage                String    @default("NOT_STARTED")
// Stages: NOT_STARTED → REMINDER_SENT → DATA_RECEIVED → VALIDATING → VALIDATION_FAILED → VALIDATED → JSON_GENERATED → READY_TO_FILE → FILED
stageUpdatedAt       DateTime?
```

**New model `YakshActivity`** (agent activity log):
```
id            String   @id @default(uuid())
tenantId      String
clientId      String?
activityType  String   // REMINDER_SENT, EMAIL_RECEIVED, VALIDATION_RUN, JSON_GENERATED, NOTIFICATION_SENT, SHEET_SYNC, ERROR
description   String
metadata      Json?
createdAt     DateTime @default(now())
```

### Backend Changes
- **Modify** `backend/src/routes/clients.ts` — accept/return new automation fields on GET/POST/PUT
- **Modify** `backend/src/services/validation/schemas.ts` — update `clientSchema` with new fields
- **New** `backend/src/routes/yaksh-activity.ts` — GET endpoint for Yaksh activity log (paginated, filterable)
- **Modify** `backend/src/index.ts` — register new route

### Frontend Changes
- **Modify** `frontend/src/pages/NewClient.tsx` — add automation config section
- **Modify** `frontend/src/pages/ClientDetail.tsx` — show automation config, allow editing
- **Modify** `frontend/src/pages/Clients.tsx` — show automation badge in table
- **Modify** `frontend/src/pages/Filing.tsx` — show stage column with color-coded badges
- **Modify** `frontend/src/pages/Settings.tsx` — add global defaults section

### Summary
- **New files**: 1 (`yaksh-activity.ts` route)
- **Modified files**: ~8
- **New DB columns**: 9 on existing tables, 1 new table (`YakshActivity`)
- **Outcome**: All automation settings configurable per client. Stage-based tracking visible on Filing Status page.

---

## Sub-Phase 1C: Scheduler + Automated Reminders

**Goal**: Yaksh automatically sends email/WhatsApp reminders to clients who haven't submitted data, based on their configured schedule.

### New Dependency
```
node-cron          // Cron scheduling
```

### Backend Changes
- **New** `backend/src/services/scheduler.ts` — cron manager that registers and runs daily jobs
- **New** `backend/src/services/jobs/reminder-job.ts` — daily job (9 AM IST):
  1. For each client where `automationEnabled = true`
  2. Check if current date is X days before their `gstr1DueDay`
  3. Check if data NOT yet received (stage < DATA_RECEIVED)
  4. Check if reminder not already sent for this interval
  5. Send via preferred channels (email/WhatsApp)
  6. Create `Reminder` record + `YakshActivity` log
  7. Update `FilingStatus.stage` to `REMINDER_SENT` if first reminder
- **New** `backend/src/services/jobs/status-init-job.ts` — monthly job (1st of each month):
  1. Create `FilingStatus` records for all active clients for the new month
  2. Set stage to `NOT_STARTED`
- **Modify** `backend/src/services/email.ts` — add reminder-specific email templates (sender: "Yaksh via GSTPilot")
- **Modify** `backend/src/services/whatsapp.ts` — add reminder-specific message templates
- **Modify** `backend/src/index.ts` — start scheduler on server boot
- **Modify** `backend/src/routes/reminders.ts` — add `GET /api/reminders/schedule` for preview

### Frontend Changes
- **Modify** `frontend/src/pages/Reminders.tsx` — add "Automated Reminders" section: upcoming schedule, global pause/resume, auto vs manual distinction. UI copy: "Yaksh scheduled follow-up reminder"

### Summary
- **New files**: 3 (`scheduler.ts`, `reminder-job.ts`, `status-init-job.ts`)
- **Modified files**: ~5
- **Outcome**: Yaksh sends reminders automatically. No manual action needed.

---

## Sub-Phase 1D: Gmail Inbox Listener

**Goal**: Yaksh polls a dedicated Gmail inbox, detects client data submissions, extracts attachments, and identifies which client sent what.

### New Environment Variables
```
GMAIL_INBOX_ADDRESS=       // e.g., data@gstpilot.in
```
> Note: `googleapis` already installed in 1A. Google OAuth credentials reused from 1A.

### DB Schema Changes

**New model `InboxMessage`**:
```
id              String    @id @default(uuid())
tenantId        String
gmailMessageId  String    @unique
fromEmail       String
subject         String
receivedAt      DateTime
clientId        String?   // resolved client, null if unmatched
status          String    // RECEIVED, MATCHED, PROCESSING, PROCESSED, FAILED, UNMATCHED
attachmentCount Int       @default(0)
metadata        Json?
createdAt       DateTime  @default(now())
```

### Backend Changes
- **New** `backend/src/services/gmail.ts` — Gmail API client: OAuth2 setup (reuses Google OAuth from 1A), `pollInbox()`, `parseMessage()`, `markAsProcessed()`, `downloadAttachment()`
- **New** `backend/src/services/jobs/inbox-poll-job.ts` — cron job (every 5 min): poll, parse subject (`GSTR1-DATA | {GSTIN} | {MM-YYYY}`), match to client, route to pipeline or flag for review. Logs `YakshActivity`.
- **New** `backend/src/routes/inbox.ts` — endpoints: `GET /api/inbox`, `PUT /api/inbox/:id/assign`, `GET /api/inbox/status`
- **Modify** `backend/src/index.ts` — register route + add to scheduler

### Frontend Changes
- **New** `frontend/src/pages/InboxMonitor.tsx` — email list, unmatched assignment, connection status. UI: "Yaksh received email from..."
- **Modify** `frontend/src/App.tsx` — add route `/inbox`
- **Modify** `frontend/src/components/layout/Sidebar.tsx` — add "Inbox" nav item

### Summary
- **New files**: 4 (`gmail.ts`, `inbox-poll-job.ts`, `inbox.ts`, `InboxMonitor.tsx`)
- **Modified files**: 3
- **New DB table**: 1 (`InboxMessage`)
- **Outcome**: Yaksh detects incoming client emails. Unmatched emails flagged for manual resolution.

---

## Sub-Phase 1E: Auto-Processing Pipeline

**Goal**: When data arrives (via email or manual upload), Yaksh automatically runs the full pipeline: extract, validate, generate JSON, notify.

### Backend Changes
- **New** `backend/src/services/pipeline.ts` — orchestration engine:
  ```
  processClientData(clientId, month, year, fileBuffer, fileName, source):
    1. Stage → DATA_RECEIVED
    2. Parse Excel/CSV (reuse xlsx logic from invoices.ts)
    3. Insert invoice rows
    4. Stage → VALIDATING ("Yaksh is validating your invoices...")
    5. Run validation (reuse invoice.ts validateInvoice)
    6. If all valid → VALIDATED → generate JSON ("Yaksh generated GSTR-1 JSON successfully") → JSON_GENERATED → notify consultant → READY_TO_FILE
    7. If errors → VALIDATION_FAILED → notify client ("Yaksh detected X errors") → notify consultant
    8. Log YakshActivity at each step
    9. Create Document record
  ```
- **New** `backend/src/services/notification.ts` — centralized notification dispatcher: reads client prefs, sends via email/WhatsApp, templates use Yaksh persona for all pipeline events
- **Modify** `backend/src/services/jobs/inbox-poll-job.ts` — after matching client, call `processClientData()`
- **Modify** `backend/src/routes/invoices.ts` — refactor upload to also call `processClientData()`

### Frontend Changes
- **Modify** `frontend/src/pages/Filing.tsx` — stage column with step indicators. UI: "Yaksh is preparing filing-ready data..."
- **Modify** `frontend/src/pages/ClientDetail.tsx` — pipeline stage timeline
- **Modify** `frontend/src/pages/Dashboard.tsx` — pipeline summary cards

### Summary
- **New files**: 2 (`pipeline.ts`, `notification.ts`)
- **Modified files**: ~5
- **Outcome**: End-to-end GSTR-1 automation. Email → parse → validate → JSON → notify. Zero touch for happy path.

---

## Sub-Phase 1F: AI Integration (Yaksh Hybrid Intelligence)

**Goal**: Power Yaksh with Claude AI for handling ambiguous cases that rule-based logic can't resolve.

### New Dependency
```
@anthropic-ai/sdk    // Anthropic Claude API (powers Yaksh's intelligence)
```

### New Environment Variable
```
ANTHROPIC_API_KEY=
```

### Backend Changes
- **New** `backend/src/services/yaksh.ts` — Yaksh AI engine (Claude API integration):
  - `resolveClientFromEmail(subject, senderEmail, body, clientList)` — Yaksh identifies the client when subject doesn't match expected format
  - `composeErrorNotification(client, errors, channel)` — Yaksh generates clear, professional error explanations
  - `analyzeUnusualData(invoiceData)` — Yaksh flags suspicious patterns (sudden value changes, unusual tax rates)
- **Modify** `backend/src/services/jobs/inbox-poll-job.ts` — fallback to Yaksh AI when standard parsing fails
- **Modify** `backend/src/services/notification.ts` — use Yaksh for composing contextual notifications

### Summary
- **New files**: 1 (`yaksh.ts`)
- **Modified files**: 2
- **Outcome**: Yaksh handles non-standard emails gracefully. Notifications are professional. Suspicious data is flagged. UI: "Yaksh recommends reviewing tax calculation mismatch."

---

## Sub-Phase 1G: GSTR-2B Reception & Reconciliation

**Goal**: Yaksh receives GSTR-2B data via email, reconciles against GSTR-1, identifies mismatches.

### DB Schema Changes

**New model `Gstr2bEntry`**:
```
id              String    @id @default(uuid())
clientId        String
month           Int
year            Int
supplierGstin   String
invoiceNumber   String
invoiceDate     String
invoiceValue    Decimal(15,2)
taxableValue    Decimal(15,2)
igstAmount      Decimal(15,2)  @default(0)
cgstAmount      Decimal(15,2)  @default(0)
sgstAmount      Decimal(15,2)  @default(0)
itcAvailable    Decimal(15,2)  @default(0)
matchStatus     String         // MATCHED, MISMATCHED, MISSING_IN_GSTR1, EXTRA_IN_GSTR2B
createdAt       DateTime       @default(now())
```

**New model `ReconciliationReport`**:
```
id                 String    @id @default(uuid())
clientId           String
month              Int
year               Int
totalGstr1         Int
totalGstr2b        Int
matched            Int
mismatched         Int
missingInGstr1     Int
extraInGstr2b      Int
totalItcAvailable  Decimal(15,2)
totalItcMismatch   Decimal(15,2)
generatedAt        DateTime  @default(now())
```

### Backend Changes
- **New** `backend/src/services/gstr2b/parser.ts` — parse GSTR-2B Excel/JSON files
- **New** `backend/src/services/gstr2b/reconciliation.ts` — reconciliation engine: match by (supplier GSTIN + invoice number), compare amounts (±1 INR tolerance), flag status, calculate ITC summary
- **New** `backend/src/routes/gstr2b.ts` — `POST /api/gstr2b/upload`, `GET /api/gstr2b/:clientId`, `GET /api/gstr2b/reconciliation/:clientId`
- **Modify** `backend/src/services/jobs/inbox-poll-job.ts` — Yaksh detects GSTR-2B emails (`GSTR2B-DATA | {GSTIN} | {MM-YYYY}`)
- **Modify** `backend/src/services/pipeline.ts` — add GSTR-2B path + auto-trigger reconciliation when both GSTR-1 and GSTR-2B data available
- **Modify** `backend/src/index.ts` — register route

### Frontend Changes
- **New** `frontend/src/pages/Reconciliation.tsx` — client/month selector, summary cards, invoice match table, ITC summary
- **Modify** `frontend/src/App.tsx` — add route `/reconciliation`
- **Modify** `frontend/src/components/layout/Sidebar.tsx` — add "Reconciliation" nav item
- **Modify** `frontend/src/pages/Filing.tsx` — show GSTR-2B + reconciliation status

### Summary
- **New files**: 4 (`parser.ts`, `reconciliation.ts`, `gstr2b.ts`, `Reconciliation.tsx`)
- **Modified files**: 5
- **New DB tables**: 2 (`Gstr2bEntry`, `ReconciliationReport`)
- **Outcome**: Yaksh auto-reconciles GSTR-2B with GSTR-1. Mismatches visible. ITC computed.

---

## Sub-Phase 1H: GSTR-3B Preparation

**Goal**: Yaksh computes GSTR-3B from GSTR-1 + GSTR-2B reconciliation. Identifies NIL returns. Flags payment/credit returns.

### Backend Changes
- **New** `backend/src/services/gstr3b/generator.ts` — compute Table 3.1 (outward supplies), Table 4 (eligible ITC from GSTR-2B matched), Table 5 (exempt inward), Table 6 (net payable = output tax - ITC). Classify: NIL / PAYMENT / CREDIT.
- **New** `backend/src/routes/gstr3b.ts` — `POST /api/gstr3b/compute`, `GET /api/gstr3b/:clientId`
- **Modify** `backend/src/services/pipeline.ts` — auto-compute after GSTR-2B reconciliation
- **Modify** `backend/src/services/notification.ts` — Yaksh GSTR-3B notifications: "Yaksh computed GSTR-3B: NIL return, ready for filing" / "Yaksh computed GSTR-3B: requires payment of ₹X" / "Yaksh computed GSTR-3B: ITC credit of ₹X to claim"
- **Modify** `backend/src/index.ts` — register route

### Frontend Changes
- **New** `frontend/src/pages/Gstr3bView.tsx` — Tables 3.1/4/6, return type badge (NIL / PAYMENT / CREDIT), action items
- **Modify** `frontend/src/App.tsx` — add route `/gstr3b`
- **Modify** `frontend/src/components/layout/Sidebar.tsx` — add "GSTR-3B" nav item
- **Modify** `frontend/src/pages/Filing.tsx` — show GSTR-3B status + return type

### Summary
- **New files**: 3 (`gstr3b/generator.ts`, `gstr3b.ts`, `Gstr3bView.tsx`)
- **Modified files**: 4
- **Outcome**: Yaksh auto-computes GSTR-3B. Liability breakdown visible. NIL returns identified.

---

## Sub-Phase 1I: Yaksh Dashboard & Activity Monitor

**Goal**: Full visibility into what Yaksh is doing across all clients.

### Frontend Changes
- **New** `frontend/src/pages/YakshDashboard.tsx` — Yaksh monitoring page:
  - **Pipeline Overview**: visual progress per client (stage badges)
  - **Yaksh Activity Feed**: real-time log (what Yaksh did, when, which client)
  - **Processing Queue**: clients currently being processed
  - **Error Alerts**: validation failures, unmatched emails, notification failures
  - **Monthly Summary**: X reminded, X data received, X validated, X JSON generated, X ready
  - **Inbox Status**: Gmail connection, last poll, unprocessed count
  - Header: "Powered by Yaksh"
- **Modify** `frontend/src/pages/Dashboard.tsx` — add link to Yaksh Dashboard, show Yaksh health widget
- **Modify** `frontend/src/components/layout/Sidebar.tsx` — add "Yaksh" nav item
- **Modify** `frontend/src/App.tsx` — add route `/yaksh`

### Summary
- **New files**: 1 (`YakshDashboard.tsx`)
- **Modified files**: 3
- **Outcome**: Full visibility into Yaksh operations. Consultants can monitor, not micromanage.

---

## Implementation Order & Cumulative Outcomes

| # | Sub-Phase | New Files | Modified | New DB | What You Can Do After |
|---|-----------|-----------|----------|--------|----------------------|
| 1A | Google Sheets Sync | 3 | 3 | 1 table | Bulk import/update 130+ clients from a Google Sheet with review UI. |
| 1B | Config Foundation | 1 | ~8 | 9 cols + 1 table | Configure automation per client. Stage tracking on Filing Status. |
| 1C | Auto Reminders | 3 | ~5 | — | Yaksh sends reminders automatically. No manual work. |
| 1D | Gmail Inbox | 4 | 3 | 1 table | Yaksh detects incoming client emails. Inbox Monitor page. |
| 1E | Auto Pipeline | 2 | ~5 | — | **End-to-end GSTR-1 automation.** Email → JSON, zero touch. |
| 1F | Yaksh AI | 1 | 2 | — | Yaksh handles edge cases. Professional notifications. |
| 1G | GSTR-2B + Recon | 4 | 5 | 2 tables | GSTR-2B reconciliation. ITC visibility. |
| 1H | GSTR-3B Prep | 3 | 4 | — | GSTR-3B auto-computed. Payment/credit identification. |
| 1I | Yaksh Dashboard | 1 | 3 | — | Full visibility into Yaksh operations. |
| **Total** | | **~22** | **~38** | **5 tables + 9 cols** | **Fully autonomous Phase 1 — Powered by Yaksh** |

---

## New Dependencies (Total)

```
node-cron              // Cron scheduling
googleapis             // Google Sheets API + Gmail API
@anthropic-ai/sdk      // Claude AI (powers Yaksh intelligence)
```

## New Environment Variables (Total)

```
# Google APIs (Sheets + Gmail)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REFRESH_TOKEN=
GMAIL_INBOX_ADDRESS=       // e.g., data@gstpilot.in

# Yaksh AI Engine
ANTHROPIC_API_KEY=
```

---

## Verification Plan

1. **After 1A**: Paste a Google Sheet URL with 5 test clients. Click Sync Now. Verify preview shows 5 new clients. Apply all. Verify they appear in Clients page. Change one row in sheet, re-sync — verify it shows as "changed" with field diff.
2. **After 1B**: Create a client with automation enabled. Verify settings save and display. Filing Status shows stage column.
3. **After 1C**: Set client due date to tomorrow. Verify Yaksh auto-sends reminder. Reminders page shows "auto".
4. **After 1D**: Send test email to Gmail with `GSTR1-DATA | {GSTIN} | 02-2026`. Verify Inbox Monitor shows matched.
5. **After 1E**: Send Excel via email. Verify Yaksh runs full pipeline: parsed → validated → JSON → notified.
6. **After 1F**: Send non-standard email subject. Verify Yaksh resolves client.
7. **After 1G**: Send GSTR-2B file. Verify reconciliation runs, mismatches displayed.
8. **After 1H**: Verify Yaksh auto-computes GSTR-3B. Check NIL vs PAYMENT vs CREDIT classification.
9. **After 1I**: Yaksh Dashboard shows all activity from previous tests.
