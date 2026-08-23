# Arkivering och säkerhetskopiering

**The one-line version: Supabase's own backups would not save your receipts, even if
you paid for them. Run `npm run arkiv` after every momsdeklaration.**

## The legal requirement

Bokföringslagen 7 kap. requires räkenskapsinformation to be kept for **seven years**.
Since **2024-07-01** a paper receipt may be destroyed once digitised — which means for
this business **the image in Supabase Storage IS the verifikation**. It is not a
convenience copy of a paper original; the paper original is legally allowed to be gone.

That reframes the risk. Losing the images is not an inconvenience, it is losing the
statutory record behind every deduction claimed in ruta 48.

## What Supabase actually protects — and what it does not

Verified against Supabase's own documentation, August 2026:

| Plan | Database backups | PITR |
|---|---|---|
| **Free** (what this project is on) | **None.** The docs tell free-tier projects to "regularly export their data using the Supabase CLI `db dump` command and maintain off-site backups" | — |
| Pro (~$25/mo) | last 7 days of daily backups | add-on, ~$100/mo for 7-day retention |
| Team | last 14 days | add-on |

**And the part that matters most, quoting the docs directly:**

> "Database backups do not include objects you store via the Storage API, as the
> database only includes metadata about these objects."

So **even on Pro, the receipt images are not backed up.** A paid plan would protect the
rows describing your receipts while losing the receipts themselves. Upgrading is not
the answer to this problem — it solves a different one.

Free-tier projects also pause after a period of inactivity, which is a second, separate
way to lose access at the moment you need it (an audit, a deadline).

## What we do instead

`npm run arkiv` writes a complete, self-owned archive to `~/Nordbok-arkiv/<datum>/`:

```
data/                  every table as .json (exact) and .csv (Swedish Excel: ; and ,)
verifikationer/<år>/   every image, named 2026-08-18_cigar-federation_1240.00_a1b2c3.jpg
MANIFEST.json          counts and the integrity result
LÄS-MIG.txt            plain Swedish — hand this to an accountant or an inspector
```

**It is also the only test of whether the images are retrievable at all.** For each
receipt it re-downloads the file and recomputes SHA-256 against the `file_hash` stored
when the receipt was booked:

| Result | Meaning |
|---|---|
| `ok` | present and byte-identical to what was booked |
| `HASH_MISMATCH` | present but **changed** since booking — no longer the document that was booked |
| `MISSING_IN_STORAGE` | the row claims a file that is not there — a deduction with no evidence |
| `no_file` | the row never had an image (the seeded receipts). Not a fault, but a gap worth sizing |

It also reports orphan files in the bucket that no row points at — usually a failed
commit or a deleted row.

The script exits `2` if anything serious is found, so it is safe to schedule and its
failure is loud rather than silent.

## Schema is already covered

The database *structure* lives in `supabase/migrations/` in git, so it is versioned and
recoverable independently. The archive covers the *data*. Between the two, a total loss
of the Supabase project is recoverable: create a new project, run the migrations,
re-import the JSON, re-upload the images.

That claim is worth actually testing once, on a throwaway Supabase project, before you
ever need it. An untested restore is a hope, not a backup.

## Cadence

- **After every momsdeklaration** — quarterly, so four times a year, right after filing.
  That way each archive corresponds to a period you have actually reported.
- **After year-end**, before the NE-bilaga.
- Keep **three copies, on two kinds of media, one of them off-site** — e.g. the Mac,
  an external disk, and a cloud drive that is not Supabase.

## Usage

```
npm run arkiv                       ~/Nordbok-arkiv/<datum>
npm run arkiv -- --out /Volumes/USB  somewhere else
npm run arkiv -- --no-files          data only, skip the downloads
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
The service-role key bypasses RLS, which is what lets the script see every row — so run
it locally and never from a browser or a public environment.

## Sources

- [Supabase — Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Supabase — Database backups feature page](https://supabase.com/features/database-backups)
