/**
 * Provision a new tenant (CA firm) with an initial admin user.
 *
 * Usage:
 *   npx ts-node scripts/provision-tenant.ts \
 *     --name "XYZ Associates" \
 *     --admin-email "admin@xyz.com" \
 *     --admin-name "Rahul Sharma" \
 *     [--domain "xyz.com"] \
 *     [--password "MyPass@123"]
 *
 * If --password is omitted, a secure random password is generated and printed.
 */

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// ── Arg parsing ────────────────────────────────────────────────────────────────

function parseArgs(): Record<string, string> {
  const args = process.argv.slice(2)
  const result: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const key = args[i]
    if (key.startsWith('--')) {
      const name = key.slice(2)
      const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true'
      result[name] = value
    }
  }
  return result
}

function generatePassword(length = 16): string {
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lower = 'abcdefghijklmnopqrstuvwxyz'
  const digits = '0123456789'
  const special = '@#$%!'
  const all = upper + lower + digits + special

  // Ensure at least one of each required character class
  const password = [
    upper[Math.floor(Math.random() * upper.length)],
    lower[Math.floor(Math.random() * lower.length)],
    digits[Math.floor(Math.random() * digits.length)],
    special[Math.floor(Math.random() * special.length)],
    ...Array.from({ length: length - 4 }, () => all[Math.floor(Math.random() * all.length)]),
  ]

  // Shuffle
  for (let i = password.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[password[i], password[j]] = [password[j], password[i]]
  }

  return password.join('')
}

function printUsage() {
  console.error(`
Usage:
  npx ts-node scripts/provision-tenant.ts \\
    --name "XYZ Associates" \\
    --admin-email "admin@xyz.com" \\
    --admin-name "Rahul Sharma" \\
    [--domain "xyz.com"] \\
    [--password "MyPass@123"]
`)
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs()

  const firmName = args['name']
  const adminEmail = args['admin-email']
  const adminName = args['admin-name']
  const domain = args['domain'] || null
  const passwordArg = args['password']

  if (!firmName || !adminEmail || !adminName) {
    console.error('❌ Missing required arguments: --name, --admin-email, --admin-name')
    printUsage()
    process.exit(1)
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
    console.error(`❌ Invalid email address: ${adminEmail}`)
    process.exit(1)
  }

  // Check if email already exists (warn but don't block — email is unique per tenant)
  const existing = await prisma.user.findFirst({ where: { email: adminEmail } })
  if (existing) {
    console.warn(`⚠  Warning: A user with email "${adminEmail}" already exists in another tenant.`)
    console.warn('   Proceeding — email uniqueness is enforced per tenant, not globally.')
  }

  const password = passwordArg || generatePassword()
  const passwordHash = await bcrypt.hash(password, 10)

  // Create tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: firmName,
      ...(domain && { domain }),
      settings: {
        filingDeadlines: { gstr1: 11, gstr3b: 20 },
        reminderDaysBefore: [7, 3, 1],
        defaultCurrency: 'INR',
      },
    },
  })

  // Create admin user
  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: adminEmail,
      name: adminName,
      role: 'ADMIN',
      passwordHash,
      isActive: true,
    },
  })

  // Print summary
  const line = '─'.repeat(44)
  console.log(`
✅ Tenant provisioned successfully
${line}
Firm:       ${tenant.name}
Tenant ID:  ${tenant.id}
${line}
Admin credentials
Email:      ${user.email}
Password:   ${password}
${line}
⚠  Share these credentials with the firm.
   Ask them to change the password after first login.
   This password is NOT stored in plain text.
`)
}

main()
  .catch((err) => {
    console.error('❌ Error:', err.message || err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
