# GST Pilot — Testing Guide

## Automated Tests

### Backend (Jest + Supertest)
```bash
cd backend
npm test              # Run all tests once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```
- **200 tests** across 16 test suites
- Tests run in-band (serially) via `--runInBand` for stability
- Prisma, email, WhatsApp, storage, and scheduler are all mocked
- Service-level imports (parsePurchaseFile, parseGstr2bFile, runReconciliation, generateGSTR3B, etc.) are mocked with `jest.mock()` in route tests

### Frontend (Vitest + React Testing Library)
```bash
cd frontend
npm test              # Run all tests once
npm run test:ui       # Open Vitest UI
npm run test:coverage # With coverage report
```
- **12 tests** across 3 test suites
- jsdom environment; api module mocked with vi.mock

---

## Manual QA Checklist

The following test cases require visual/browser inspection and cannot be automated.

### Group 2 — Login Page Visual

| ID | Test Case | Steps |
|----|-----------|-------|
| 2.2 | Background gradient renders correctly | Open `/login` — verify indigo-to-purple gradient covers full screen |
| 2.3 | Card has rounded corners and shadow | Verify white card with `shadow-2xl` and `rounded-xl` styling |
| 2.4 | Responsive layout on mobile (320–768px) | Resize browser to mobile width — card should be full-width with px-4 padding |

### Group 4 — Client List Visual / UX

| ID | Test Case | Steps |
|----|-----------|-------|
| 4.10 | Status badge colors are correct | Open Clients — verify ACTIVE=green, INACTIVE=gray, ARCHIVED=red badges |
| 4.11 | Hover state on client rows | Hover over client row — verify `hover:bg-gray-50` highlight appears |

### Group 7 — Sheet Sync

| ID | Test Case | Steps |
|----|-----------|-------|
| 7.1 | Sync trigger creates/updates invoice data | Go to Settings → Sheet Sync → trigger sync for a client. Verify invoices appear in the client's data tab. |
| 7.2 | Sync with empty sheet clears existing data | Set up a sheet with no rows, trigger sync — verify existing invoice data is removed |
| 7.3 | Invalid sheet URL returns error | Set an invalid Google Sheets URL in sync config — verify error message displayed |

### Group 8 — Filing Status Visual

| ID | Test Case | Steps |
|----|-----------|-------|
| 8.13 | Stage progress bar renders | Open Filing Status → verify horizontal progress indicator shows current stage |
| 8.14 | Color-coded stage badges | Verify stage chips: NOT_STARTED=gray, DATA_RECEIVED=blue, FILED=green, etc. |

### Group 11 — GSTR-1 JSON Download Button (Filing Status page)

| ID | Test Case | Steps |
|----|-----------|-------|
| 11.D.UI1 | "Download JSON" button visible only for rows with `jsonGenerated=true` | Open Filing Status — verify button appears for clients with stage JSON_GENERATED or READY_TO_FILE but not for NOT_STARTED/DATA_RECEIVED rows |
| 11.D.UI2 | Download triggers correct filename | Click "Download JSON" — verify browser downloads a file named `{GSTIN}_{MMYYYY}_GSTR1.json` (e.g. `27AABCU9603R1ZX_012026_GSTR1.json`) |
| 11.D.UI3 | Error message shown for failed download | Manually force a 400/500 response (e.g. delete invoice data first) — verify the error banner appears above the table |
| 11.D.UI4 | Re-download produces identical file | Click "Download JSON" twice for the same client — verify both downloads are byte-for-byte identical |

### Group 14 — Reminder Schedule Visual

| ID | Test Case | Steps |
|----|-----------|-------|
| 14.2 | Schedule tab shows calendar-style layout | Open Reminders → Schedule tab — verify events are grouped by date in chronological order |

### Group 19 — Documents Coming Soon

| ID | Test Case | Steps |
|----|-----------|-------|
| 19.2 | Coming-soon illustration/icon renders | Open `/documents` — verify the clock SVG icon renders above the "Documents" heading |

### Group 20 — Navigation

| ID | Test Case | Steps |
|----|-----------|-------|
| 20.2 | Active nav item highlighted in sidebar | While on /filing, verify "Filing Status" item has indigo background in sidebar |
| 20.3 | Sidebar collapsed on mobile | Resize to <768px — verify sidebar collapses or shows hamburger menu |
| 20.4 | Logout clears session and redirects to /login | Click logout in sidebar — verify token removed from localStorage and user lands on /login |

### Group 21 — Reconciliation Page Visual / UX (Phase 1G+1H)

| ID | Test Case | Steps |
|----|-----------|-------|
| 21.UI1 | 4 tabs render in correct order | Open `/reconciliation` → verify tabs: "Purchase Data", "GSTR-2B Upload", "Reconciliation", "GSTR-3B" appear in order |
| 21.UI2 | Upload card shows drag-and-drop zone | On Purchase Data tab — verify dashed border upload zone is visible |
| 21.UI3 | Polling spinner appears during validation | Upload a purchase file → verify spinner with "Validating..." appears within 1–2 seconds before results show |
| 21.UI4 | Run Reconciliation button disabled without data | Open Reconciliation tab before uploading any data → verify button is disabled (grayed) |
| 21.UI5 | Match status badge colors | After reconciliation, verify MATCHED=green, MISMATCHED=orange, MISSING IN PURCHASE=red, EXTRA IN PURCHASE=gray badges |
| 21.UI6 | GSTR-3B tab blocked without reconciliation | Open GSTR-3B tab → verify "Generate GSTR-3B" button is disabled and explanatory text is shown |
| 21.UI7 | Classification badge shows correct color | After GSTR-3B generation — NIL=gray, PAYMENT=red, CREDIT=green |
| 21.UI8 | Download JSON button appears after generation | Click "Generate GSTR-3B" → verify "Download JSON" button appears and triggers file download |
| 21.UI9 | GSTR-2B upload accepts .json extension | On GSTR-2B Upload tab — upload a `.json` file → verify it parses without format error |
| 21.UI10 | Inbox Monitor shows PURCHASE badge | Send an email with `PURCHASE-DATA | {GSTIN} | 01-2026` subject → verify purple "PURCHASE" badge appears in Inbox Monitor table |

---

## Test Group Coverage Summary

| Group | Topic | Automated | Manual |
|-------|-------|-----------|--------|
| 1 | Authentication (JWT login/me/logout) | ✅ Backend + Frontend | — |
| 2 | Login page branding | ✅ Frontend (text) | Visual styling |
| 3 | Multi-tenancy isolation | ✅ Backend | — |
| 4 | Client list & filters | ✅ Backend | Badge colors, row hover |
| 5 | Client CRUD | ✅ Backend | — |
| 6 | Bulk client actions | ✅ Backend | — |
| 7 | Google Sheets sync | — | Manual E2E |
| 8 | Filing status grid | ✅ Backend | Stage colors, progress bar |
| 9 | ARN recording | ✅ Backend | — |
| 10 | Invoice validation | ✅ Backend + Service | — |
| 11 | GSTR-1 JSON generator + re-download | ✅ Backend + Service | Download button UX, filename format |
| 12 | Send reminders | ✅ Backend | — |
| 13 | Reminder templates | ✅ Backend | — |
| 14 | Reminder schedule | ✅ Backend | Calendar UI layout |
| 15 | Reminder logs | ✅ Backend | — |
| 16 | Scheduler jobs | ✅ Service unit tests | — |
| 17 | User management | ✅ Backend | — |
| 18 | Tenant provisioning script | ✅ Unit tests | — |
| 19 | Documents coming-soon | ✅ Frontend | Icon rendering |
| 20 | Navigation & routing | ✅ Frontend (routing) | Sidebar active state, mobile |
| 21 | Purchase Data API + validator | ✅ Backend (15) + Service unit (14) | Reconciliation page UI, polling spinner |
| 22 | GSTR-2B upload, reconciliation API | ✅ Backend (12) | GSTR-2B badge colors, matchStatus filter |
| 23 | GSTR-3B computation API | ✅ Backend (11) | Classification badge, download UX |
