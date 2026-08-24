import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { pathPolicy } from "./path-policy.js";

/* ── Who decides what ────────────────────────────────────────────────────
 *
 * The middleware used to redirect ANY request without a session cookie to
 * /login — including every /api/* call. Two things broke because of that.
 *
 * 1. THE CRON JOBS NEVER RAN. Vercel calls /api/cron/digest with
 *    `Authorization: Bearer <CRON_SECRET>` and no session cookie, because a
 *    machine has no login. The middleware saw "no user", answered 307 to
 *    /login, and the route never executed. The weekly digest and the daily
 *    push have been silently dead in production the whole time — nothing
 *    errored, the cron just bounced off the door.
 *
 * 2. EVERY EXPIRED-SESSION FETCH RETURNED HTML. A redirect to /login is
 *    followed by the browser, so fetch() got a 200 with a login PAGE, and
 *    res.json() threw `Unexpected token '<', "<!DOCTYPE"...`. That is where
 *    those came from.
 *
 * A redirect is an answer for a human holding a browser. An API client wants a
 * status code. So the middleware no longer decides anything about /api: it
 * refreshes the session cookie and steps aside. Each route authenticates
 * itself — requireUser() for the user-facing ones, authorizeCron() for the two
 * that run as service_role — which is where the decision belongs anyway,
 * because only the route knows which credential it expects.
 *
 * That is safe only while every route under /api actually guards itself.
 * Verified at the time of writing: all 12 do. If you add a route, guard it.
 *
 * The path rules themselves live in lib/path-policy.js, importless and testable.
 * ────────────────────────────────────────────────────────────────────────── */

/** Refreshes the Supabase session cookie on each navigation and gates pages. */
export async function updateSession(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          list.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response = NextResponse.next({ request });
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const policy = pathPolicy(path);

  /* API calls carry their own credentials. Hand the refreshed cookie back and
     let the route answer — with a status kod, not en inloggningssida. */
  if (policy === "self-guarded") return response;

  if (!user && policy === "protected") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  if (user && (path === "/" || path === "/login")) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashUrl);
  }

  return response;
}
