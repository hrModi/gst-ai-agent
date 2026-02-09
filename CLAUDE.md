# CLAUDE.md - GST Filing Management System

## Project Overview

This repository contains the planning, design, and prototype artifacts for a **Semi-Automated GST Filing Management System (Phase 2)** built for **ABC CA & Associates** -- a CA firm managing ~130 clients across 6 team members.

The system streamlines invoice data validation, GSTR-1 JSON generation, filing status tracking, and automated client communication (email/WhatsApp reminders), while keeping manual control over GST Portal uploads and OTP/DSC authentication.

**Current status:** Pre-development (planning & design complete, awaiting approval to begin implementation).

---

## Repository Structure

```
gst-ai-agent/
├── CLAUDE.md                                        # This file - AI assistant guide
├── README.md                                        # Project readme (placeholder)
├── GST_Filing_Management_System_Project_Recap.md    # Complete project specification (PRD)
└── gst-prototype-v2.html                            # Interactive React/Tailwind prototype
```

### Key Files

- **`GST_Filing_Management_System_Project_Recap.md`** -- The primary reference document (~1700 lines). Contains the full system specification including architecture, database schema, validation rules, JSON format specs, cost analysis, timeline options, security requirements, and deployment plan. Treat this as the single source of truth for all product and technical decisions.

- **`gst-prototype-v2.html`** -- A self-contained interactive prototype (~1345 lines) using React 18 + Babel + Tailwind CSS loaded via CDN. Demonstrates all major UI screens: login, dashboard, client management, filing status, data validation, JSON preview, email automation, reminders, documents, and settings. Contains mock data for 5 sample clients and 2 user accounts.

---

## Planned Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | React 18.x + Tailwind CSS | React Router v6, Context API for state |
| Backend | Node.js 20.x LTS + Express.js | TypeScript, Joi validation |
| ORM | Prisma | Type-safe database access |
| Database | PostgreSQL 15.x | Hosted on Supabase |
| Auth | JWT | 24-hour token expiry, bcrypt hashing |
| File Storage | AWS S3 | Organized: `tenant/client/year/month/` |
| Email | SendGrid | Automated reminders |
| WhatsApp | Gupshup or Interakt | Client communication |
| SMS | MSG91 | Backup communication channel |
| Frontend Hosting | Vercel | Auto-deploy from GitHub |
| Backend Hosting | Railway | Node.js hosting |

---

## Architecture & Key Patterns

### Multi-Tenant Design
Each CA firm is a separate tenant with data isolation. All queries must be scoped by `tenant_id`.

### Role-Based Access Control (RBAC)
- **Admin** -- Full system access, manages all 130+ clients, assigns clients to consultants, system configuration
- **Consultant** -- View/manage only assigned clients, upload data, generate JSON, send reminders

### Database Schema (11 Tables)
`tenants` > `users`, `clients`, `system_settings`
`clients` > `invoice_data`, `filing_status`, `filed_returns`, `documents`, `reminders`
`invoice_data` > `validation_errors`
`users` > `audit_logs`

See the Project Recap document for full column definitions and relationships.

### Monthly Filing Workflow
1. **Days 1-5:** Data Collection -- automated reminders sent to clients
2. **Days 5-9:** Data Validation -- upload, validate, fix errors, re-validate
3. **Days 9-10:** JSON Generation -- GSTR-1 JSON created from validated data
4. **Days 10-11:** Portal Filing -- manual upload via GST Offline Tool
5. **Days 11-12:** Record Keeping -- ARN entry, status update, archival

### Data Validation Rules (7 Types)
1. GSTIN format: `/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/`
2. Invoice number uniqueness per client/month
3. Tax calculation verification (tolerance: +/-0.01 INR)
4. Required fields (invoice number, date, buyer GSTIN, values)
5. Date format: `DD-MM-YYYY` only
6. HSN/SAC code: 4-8 digit numeric
7. Transaction type auto-classification: B2B, B2CL, B2CS, CDNR, EXP

### GSTR-1 JSON Output
- Format: GST Portal compatible JSON with sections: `b2b`, `b2cl`, `b2cs`, `cdnr`, `exp`, `hsn`
- Naming: `{GSTIN}_{MMYYYY}_GSTR1.json`
- Storage: AWS S3 with signed URLs (1-hour expiry)

---

## Development Guidelines

### When Implementation Begins

The planned project structure (not yet created):

```
frontend/
├── src/
│   ├── components/       # React components (LoginPage, Dashboard, etc.)
│   ├── pages/            # Route-level page components
│   ├── context/          # React Context providers for state management
│   ├── services/         # API calls using Axios
│   └── styles/           # Tailwind customizations

backend/
├── src/
│   ├── api/
│   │   ├── routes/       # Express route definitions
│   │   ├── controllers/  # Request handlers
│   │   ├── middleware/    # JWT auth, RBAC, error handling
│   │   ├── validation/   # Joi schemas for request validation
│   │   └── services/     # Business logic layer
│   ├── database/
│   │   ├── schema.prisma # Prisma schema definition
│   │   └── migrations/   # Database migrations
│   ├── config/           # Environment and app configuration
│   ├── utils/            # Shared utility functions
│   └── types/            # TypeScript type definitions
```

### Conventions to Follow

- **Language:** TypeScript for all backend and frontend code
- **API style:** RESTful endpoints with Joi validation on all inputs
- **Auth:** JWT tokens in Authorization header; middleware enforces RBAC
- **Error handling:** Centralized error middleware; structured error responses
- **Database:** All queries scoped by `tenant_id` for multi-tenant isolation
- **File naming:** Use kebab-case for files, PascalCase for React components
- **State management:** React Context API (no Redux)
- **Styling:** Tailwind CSS utility classes
- **Data retention:** 7-year retention policy (GST legal requirement); auto-archive after 3 years

### Security Requirements

- HTTPS/TLS 1.3 for all traffic
- Bcrypt password hashing (10 salt rounds)
- Password policy: 8+ chars, uppercase, lowercase, number, special character
- Session timeout: 30 minutes of inactivity
- AES-256 encryption at rest
- S3 server-side encryption for stored files
- Signed URLs with 1-hour expiry for file downloads
- Complete audit logging for all data modifications
- Input sanitization on all user inputs

### Environment Variables (Planned)

```
DATABASE_URL=             # Supabase PostgreSQL connection string
JWT_SECRET=               # JWT signing secret
JWT_EXPIRY=24h            # Token lifetime
AWS_ACCESS_KEY_ID=        # S3 access
AWS_SECRET_ACCESS_KEY=    # S3 secret
AWS_S3_BUCKET_NAME=       # S3 bucket
SENDGRID_API_KEY=         # Email service
GUPSHUP_API_KEY=          # WhatsApp API
GUPSHUP_PHONE_NUMBER=     # WhatsApp sender
MSG91_AUTH_KEY=            # SMS backup
NODE_ENV=                 # development | staging | production
PORT=                     # Express server port
FRONTEND_URL=             # Frontend origin (for CORS)
BACKEND_URL=              # Backend base URL
```

---

## Build & Test Commands

No build system is configured yet. When implementation begins, the expected commands will be:

```bash
# Frontend
npm install               # Install dependencies
npm run dev               # Start development server
npm run build             # Production build
npm run lint              # Run ESLint
npm test                  # Run tests

# Backend
npm install               # Install dependencies
npm run dev               # Start with nodemon/ts-node
npm run build             # Compile TypeScript
npm run start             # Start production server
npm run lint              # Run ESLint
npm test                  # Run Jest tests
npx prisma migrate dev    # Run database migrations
npx prisma generate       # Generate Prisma client
```

---

## Deployment

### Planned Environments

| Environment | Frontend | Backend | Database |
|-------------|----------|---------|----------|
| Development | Local dev server | Local Node.js | Local/Docker PostgreSQL |
| Staging | Vercel preview | Railway staging | Separate Supabase DB |
| Production | Vercel production | Railway production | Supabase production |

### Estimated Monthly Costs

- **Budget tier:** ~800 INR/month (free tiers + minimal services)
- **Production tier:** ~9,700 INR/month (recommended for 130 clients)
- **Enterprise tier:** ~18,000+ INR/month

---

## Important Notes for AI Assistants

1. **This is a pre-development repo.** The primary deliverables so far are the project specification document and the HTML prototype. There is no application source code yet.

2. **The Project Recap document is the PRD.** All product requirements, technical specifications, database schemas, and validation rules are documented in `GST_Filing_Management_System_Project_Recap.md`. Always reference it for authoritative specifications.

3. **The prototype is a reference UI.** The `gst-prototype-v2.html` file demonstrates the intended user experience. It uses inline React/Babel/Tailwind via CDN and is not production code -- it is a design reference.

4. **GST compliance is critical.** The GSTR-1 JSON format must exactly match the GST Portal's expected structure. Validation rules must enforce Indian GST regulations. Data must be retained for 7 years per law.

5. **Multi-tenancy must be enforced everywhere.** Every database query, API endpoint, and file storage operation must be scoped by `tenant_id` to prevent data leakage between firms.

6. **Manual portal filing is intentional.** The system deliberately does not automate GST Portal login, OTP, or DSC steps. This is a design decision to avoid GSP API costs and maintain human control over filing.

7. **Indian locale conventions.** Currency is INR, date format is DD-MM-YYYY, phone numbers use +91 prefix, GSTIN is a 15-character alphanumeric Indian tax identifier.

8. **Development timeline.** The planned implementation is 10 weeks across 5 phases:
   - Phase 1 (Weeks 1-2): Backend foundation + database
   - Phase 2 (Weeks 3-4): Data validation engine
   - Phase 3 (Weeks 5-6): Frontend development
   - Phase 4 (Weeks 7-8): Communication system + integration
   - Phase 5 (Weeks 9-10): Testing + deployment
