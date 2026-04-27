# Nordbok Studio

Daily-use accounting app for Swedish enskild firma (sole trader) — invoices, receipts (AI OCR), körjournal, deadlines, document archive, and a Claude-powered assistant. Designed to live at `studio.skattenavigator.se` (or your own domain) as a separate PWA from the existing skattenavigator marketing site.

## Stack

- **Next.js 15** (App Router, server components, streaming)
- **React 19**
- **Supabase** — auth + Postgres + storage (reuse the existing project; the `studio_*` tables are namespaced so they don't collide)
- **Anthropic Claude** — receipt OCR (`claude-haiku-4-5`) and the assistant (`claude-sonnet-4-6`)
- **Resend** — invoice email delivery
- **Service Worker + manifest** — installable PWA, works offline for the shell

## Setup (10 minutes)

```bash
cd studio-app
npm install

# Apply the schema to your Supabase project
# Either via the SQL editor in the Supabase dashboard, or:
#   psql "$DATABASE_URL" -f supabase/migrations/001_studio_schema.sql
#   psql "$DATABASE_URL" -f supabase/migrations/002_office_vault.sql

# Create two storage buckets (private):
#   studio-receipts   — for receipt images
#   studio-documents  — for the long-term archive

# Copy env and fill it in
cp .env.local.example .env.local
# Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
#     ANTHROPIC_API_KEY, RESEND_API_KEY, RESEND_FROM_EMAIL.

npm run dev   # http://localhost:3001
```

In Supabase → Authentication → URL Configuration, add `http://localhost:3001/**` and your production URL to the redirect whitelist. (Skipping this is the #1 reason logins silently fail.)

## What's in v1

| Page | What it does |
|---|---|
| `/dashboard` | YTD revenue, expenses, VAT in/out, mileage deduction, estimated tax, recent invoices/receipts. |
| `/invoices` | List, filter by status. |
| `/invoices/new` | Swedish-compliant invoice builder — F-skatt stamp, multi-VAT lines, ROT/RUT with hour breakdown, OSS for EU B2C, reverse-charge text, OCR-number auto-generated. Save draft or send via Resend. |
| `/invoices/[id]` | View + Save-as-PDF + Send + Mark paid. Auto-creates a "remind 3 days after due" task on send. |
| `/receipts` | Camera scan or file upload → Claude vision extracts vendor/date/total/VAT/category → suggests BAS account + NE-bilaga row → user reviews → saved with image attached. |
| `/mileage` | Körjournal with all Skatteverket-required fields (datum, från, till, syfte, km, reg-nr) + 2026 rate auto-applied. |
| `/clients` | Client book with org-nr, VAT-nr, fastighetsbeteckning for ROT, BRF org-nr for RUT. |
| `/bank` | CSV import for Swedbank/SEB/Handelsbanken/Nordea/Revolut. PSD2 sync coming v1.5. |
| `/documents` | Long-term office archive — contracts, registreringsbevis, leases, payslips. Auto-sets 7-year retention per Bokföringslagen. |
| `/deadlines` | Tax calendar (moms Q1–Q4, NE-bilaga, F-skatt månadsbetalning, kontrolluppgifter) auto-seeded for the current year + manual reminders. |
| `/assistant` | Claude with read-only access to all your data — "what's my deductible YTD?", "summarize my BAS-konto breakdown", "which invoices are overdue?". |
| `/settings` | Business identity (personnr, F-skatt, moms-nr auto-built), payment details (bankgiro, IBAN), notification prefs. |

## Security notes

- All Supabase tables have RLS enabled; every policy is `auth.uid() = user_id`.
- API routes use `requireUser()` (`lib/supabase.js`) — they 401 if no valid session, so unauthenticated requests can't drain your Anthropic/Resend tokens.
- No secrets are exposed via `NEXT_PUBLIC_*`. Service-role key lives server-only and is asserted at use time.
- Middleware (`middleware.js`) protects every non-public route at the edge.

## Deploy

1. Push the `studio-app/` directory to its own Vercel project.
2. Set env vars in the Vercel dashboard (mirror `.env.local`).
3. Point a subdomain (`studio.skattenavigator.se`) at the Vercel project.
4. Add the production URL to Supabase → Auth → URL Configuration.
5. Run the two SQL migrations once.

## Roadmap (v1.5+)

- Mindee OCR fallback when Claude vision confidence < 0.8
- PSD2 bank sync via Nordigen
- Push notifications (web push) for deadlines and invoice events
- SIE-fil export for Skatteverket
- Multi-entity (run EF + AB in the same workspace)
- Apple Wallet pass for ICA/Willys auto-receipt capture
- Periodic health-check via the assistant ("is your Q2 moms ready to file?")
