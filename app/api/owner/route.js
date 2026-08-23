/* app/api/owner/route.js — switch which books the app is showing.
 *
 * Validates before it writes. A cookie the user could set by hand is not an
 * authorisation decision: the id must appear in the list the database says they may
 * read, or this returns 403 and nothing changes.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getViewableOwners, OWNER_COOKIE } from "@/lib/access";

export async function POST(req) {
  const { user, owners } = await getViewableOwners();
  if (!user) return NextResponse.json({ error: "Inte inloggad." }, { status: 401 });

  const { owner_id } = await req.json().catch(() => ({}));
  if (!owners.some((o) => o.id === owner_id)) {
    return NextResponse.json({ error: "Du har inte behörighet till de böckerna." }, { status: 403 });
  }

  const jar = await cookies();
  jar.set(OWNER_COOKIE, owner_id, {
    httpOnly: false,        // the client switcher reads it to show the current choice
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 90,
  });

  return NextResponse.json({ ok: true, owner_id });
}
