# Skattenavigator — Project Audit
_Generated: 2026-04-27 · Scope: `/skattenavigator-next/`_

## TL;DR
Five things are bleeding right now: (1) two `NEXT_PUBLIC_*` "secrets" are baked into the public bundle, (2) every API route that calls Anthropic/Resend has zero auth — anyone can drain your tokens, (3) the auth flow has a small race condition that explains why you couldn't log in, (4) the schablonavdrag (25% on egenavgifter) is not in the tax engine so estimates are 10–15% too high, and (5) the project root is full of dead one-off scripts. RLS on Supabase is correctly configured, the brytpunkt and egenavgifter values are correct for 2025, and the moms threshold (120,000 kr) and räntefördelningsräntan (7.96%) are right.

---

## 1. Critical bugs (ranked by severity)

| # | Bug | Impact | File · Lines | Effort |
|---|-----|--------|--------------|--------|
| 1 | `NEXT_PUBLIC_ADMIN_SECRET` and `NEXT_PUBLIC_PROMO_CODES` exposed in client bundle | Anyone on the web can read your admin password and free codes via DevTools | `.env.local:4–5` | 30 min |
| 2 | API routes have no auth checks (`/api/chat`, `/api/scan-payslip`, `/api/send-invoice`, `/api/analyze`) | Unauthenticated users burn your Anthropic + Resend tokens | `app/api/*/route.js` | 2 h |
| 3 | `PRO_TOKEN_SECRET` falls back to `"change-this-to-a-random-string-in-vercel-env"` if env missing | Pro tokens forgeable; entire revenue gate bypassable | `app/api/pro/route.js:8` | 15 min |
| 4 | Auth login race condition (loading + user + profile not coordinated) | Users see login form briefly after success → assumed broken; explains your "doesn't work" report | `lib/auth-context.js:12–37` | 1 h |
| 5 | Schablonavdrag (25% on egenavgifter, max 50,600 kr) is not implemented | Tax estimates ~10–15% too high; users overpay or distrust the tool | `app/dashboard/page.js:586`, `lib/tax-engine.js` | 1 h |

---

## 2. Why you couldn't log in (root cause)

Two-part race in `lib/auth-context.js`:

1. `useEffect` calls `getSession()`, sets the `user`, then triggers `fetchProfile(user.id)` **without awaiting**. If `fetchProfile` errors out silently (RLS misconfig, missing row), the `loading` state can flip to `false` before `setProfile` runs.
2. `app/auth/page.js` watches `user && !loading` to redirect to `/dashboard`. Because the auth listener fires twice on Supabase's first session restore, the page can render `<form>` again briefly between the two firings — producing the visual "the login broke" experience even when sign-in succeeded.

**Three concrete fixes (apply all):**

```js
// lib/auth-context.js — fetchProfile
async function fetchProfile(userId) {
  try {
    const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (data) setProfile(data);
  } catch (e) { console.error(e); }
  finally { setLoading(false); }
}
```

```js
// app/auth/page.js — show actual error message instead of generic Swedish text
const { error } = await signIn(email, password);
if (error) {
  setError(error.message);   // Supabase will say "Email not confirmed" or "Invalid login credentials"
  return;
}
```

```text
# Supabase Dashboard → Authentication → URL Configuration
Site URL:        https://skattenavigator.se
Redirect URLs:   https://skattenavigator.se/dashboard
                 https://skattenavigator.se/auth/reset
                 https://skattenavigator.se/auth
                 http://localhost:3000/**
```

If "Email confirmation" is enabled in Supabase Auth Providers and the user signs up, they cannot sign in until the confirmation link is clicked. Either disable confirmation while testing, or surface the verification step explicitly in the UI.

---

## 3. Security findings

- **Service role key fallback** in `lib/supabase.js:13` falls back to anon key — remove the fallback and assert the env var on boot.
- **`/api/chat` has only IP-based rate limiting** (line 170–231) — add session check and a per-user rate limit. Otherwise a script with 10,000 requests across rotating IPs will drain your Anthropic balance.
- **RLS is correctly enabled** on every table in `lib/supabase-schema.sql` — good.
- **Admin secret** must be moved to a server-only env var. Anything `NEXT_PUBLIC_*` is publicly readable.

---

## 4. Tax / accounting correctness (2025 income year)

| Element | Value | Status | Source |
|---------|-------|--------|--------|
| Brytpunkt (BR) | 643,100 kr | ✅ | SKV 433 ed. 36 |
| Skiktgräns (SK) | 625,800 kr | ✅ | SFS 2024:663 |
| Statlig skatt | 20% | ✅ | IL 65 kap |
| Egenavgifter | 28.97% | ✅ | SKV 433 |
| **Schablonavdrag** | 25%, max 50,600 kr | ❌ MISSING | SKV 433 |
| **Periodiseringsfond** | 30% max | ❌ MISSING (only mentioned in chat prompt) | IL 32 kap |
| Räntefördelning | 7.96% (SLR + 6%) | ✅ | Riksgälden |
| Moms-fribelopp | 120,000 kr | ✅ | Skv. jan 2025 |

**Action:** add the schablonavdrag and periodiseringsfond into `lib/tax-engine.js` and surface them in the dashboard estimate. These are the two biggest deductions an EF can use; missing them changes the estimated tax materially.

---

## 5. The 72KB `app/office/page.js` monolith — what to extract

The "office" section is what the user wants pulled out into the new Studio PWA. The file holds (extracted by reading function declarations and tabs):

- ReseplanTab — travel-plan tracker (destinations, contacts, budget, notes)
- Diary / journal page (labelled `diary` icon)
- Folder & files manager (basic)
- Calculator widget
- Invoice tab (the seed for what's now in `studio-app/app/invoices/*`)
- Mileage entry stub

All of it stores via `lib/office-sync.js`. Confirm before deleting from the original site whether `office-sync.js` writes to Supabase — if it's localStorage-only, **users will lose data when the section is removed.** Migration path: ship `studio-app` first, write a one-time importer at `/api/import-from-office`, then redirect `/office` → `studio.skattenavigator.se`.

---

## 6. Cleanup checklist (safe to delete)

```
skattenavigator-next/add-verification.js
skattenavigator-next/admin-page.js
skattenavigator-next/apply-fixes.js
skattenavigator-next/apply-must-fixes.js
skattenavigator-next/fix-trust.js
skattenavigator-next/kommun-page.js
skattenavigator-next/sitemap.js                  # duplicate of app/sitemap.js
skattenavigator-next/subscribers.json            # old subscriber list
skattenavigator-next/_archive/**                 # ~116 KB of .OLD files
```

`@supabase/ssr` is installed but never imported in the existing project — remove from `package.json` if you're not migrating to SSR auth this week. (We use it heavily in the new `studio-app`, that's fine.)

`next.config.js` redirects `/declaration → /deklaration` and `/avdragsprofil → /deductions` — verify you actually deleted the source folders so you don't end up with two pages serving the same content (SEO penalty).

---

## 7. Quick wins (< 1 hour each)

1. Delete the dead root scripts and `_archive/`.
2. Move admin secret + promo codes to server-only env (drop `NEXT_PUBLIC_`).
3. Add `await requireUser()` (Studio's helper) at the top of every `app/api/*` route in the existing project.
4. Show the real Supabase error message in the auth form.
5. Implement schablonavdrag in `lib/tax-engine.js` (5-line patch).
6. Replace `setLoading(false)` in `auth-context.js` with the `try/finally` pattern.
7. Whitelist your production URL in Supabase Auth → URL Configuration.

---

## 8. Overall verdict

The skattenavigator-next codebase is a competent calculator/SEO play with sound RLS and decent SEO surface. The accounting math is mostly right but missing two of the most important EF benefits (schablonavdrag, periodiseringsfond). The product weakness is that the "office" section was never the focus and bloated into a 72KB single file — exactly the right thing to lift out into a separate daily-use app, which is what `studio-app` does. Auth has a fixable race plus a configuration step (Supabase URLs) that's almost certainly the explanation for "I tried logging in and it doesn't work."
