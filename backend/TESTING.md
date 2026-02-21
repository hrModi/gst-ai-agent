# GST Pilot — Testing Guide

## Automated Tests

### Backend (Jest + Supertest)
```bash
cd backend
npm test              # Run all tests once
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
```
- **141 tests** across 12 test suites
- Tests run in-band (serially) via `--runInBand` for stability
- Prisma, email, WhatsApp, storage, and scheduler are all mocked

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
| 11 | GSTR-1 JSON generator | ✅ Backend + Service | — |
| 12 | Send reminders | ✅ Backend | — |
| 13 | Reminder templates | ✅ Backend | — |
| 14 | Reminder schedule | ✅ Backend | Calendar UI layout |
| 15 | Reminder logs | ✅ Backend | — |
| 16 | Scheduler jobs | ✅ Service unit tests | — |
| 17 | User management | ✅ Backend | — |
| 18 | Tenant provisioning script | ✅ Unit tests | — |
| 19 | Documents coming-soon | ✅ Frontend | Icon rendering |
| 20 | Navigation & routing | ✅ Frontend (routing) | Sidebar active state, mobile |
