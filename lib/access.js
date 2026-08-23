import "server-only";
import { cookies } from "next/headers";
import { serverClient } from "@/lib/supabase-server";

/* lib/access.js — whose books am I looking at?
 *
 * Until 006_delad_atkomst.sql there was exactly one answer: mine. Now a revisor can
 * hold read access to someone else's books, so every query needs an explicit owner.
 *
 * WHY THIS FILE HAS TO EXIST
 * The pages used to query `.from('studio_receipts').select('*')` with no filter and let
 * RLS decide. That was correct while RLS returned exactly one person's rows. The moment
 * a member can see a second owner, the same query silently returns BOTH sets merged into
 * one list — two people's receipts summed into one total, with nothing on screen saying
 * so. Filtering by owner is what stops that, and it must happen everywhere, not just on
 * the screens someone remembered.
 *
 * The active owner lives in a cookie so a Server Component and a Client Component agree
 * without prop-drilling. It is never trusted: getActiveOwnerId() checks it against the
 * list the database says you may read, and falls back to yourself.
 */

export const OWNER_COOKIE = "nordbok_owner";

/**
 * Everyone whose books the signed-in user may open — themselves first, then any owner
 * who has granted them an active membership.
 *
 * The label comes from `studio_settings.business_name`, which is readable to a member
 * precisely because it is in the shared set. No extra column, and no exposure of
 * auth.users, which RLS does not let the client read at all.
 */
export async function getViewableOwners() {
  const sb = await serverClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { user: null, owners: [] };

  const { data: memberships, error } = await sb
    .from("studio_memberships")
    .select("owner_id, role, status")
    .eq("member_id", user.id)
    .eq("status", "active");
  if (error) console.error("[access] memberships:", error.message);

  const ids = [user.id, ...(memberships || []).map((m) => m.owner_id)];
  const unique = [...new Set(ids)];

  const { data: settings } = await sb
    .from("studio_settings")
    .select("user_id, business_name")
    .in("user_id", unique);

  const nameOf = Object.fromEntries((settings || []).map((s) => [s.user_id, s.business_name]));

  const owners = unique.map((id) => ({
    id,
    isSelf: id === user.id,
    label: nameOf[id] || (id === user.id ? (user.email || "Mina böcker") : "Delade böcker"),
    role: id === user.id ? "agare" : "revisor",
  }));

  return { user, owners };
}

/**
 * The owner to filter every query by.
 *
 * The cookie is a hint, never an authority — a value that is not in the viewable list
 * is discarded rather than honoured. RLS would refuse the rows anyway; this just means
 * the screen says something truthful instead of going mysteriously empty.
 */
export async function getActiveOwnerId() {
  const { user, owners } = await getViewableOwners();
  if (!user) return null;

  const jar = await cookies();
  const wanted = jar.get(OWNER_COOKIE)?.value;
  if (wanted && owners.some((o) => o.id === wanted)) return wanted;

  /* A revisor invited to one set of books has none of their own. Opening the app to an
   * empty dashboard and a switcher they have not noticed is a bad first minute, so when
   * there is exactly one other owner and no choice has been made, open theirs. */
  const others = owners.filter((o) => !o.isSelf);
  if (others.length === 1 && owners.length === 2 && !wanted) {
    const sb = await serverClient();
    const { count } = await sb
      .from("studio_receipts").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if (!count) return others[0].id;
  }

  return user.id;
}

/** Convenience for server code that needs both at once. */
export async function getOwnerContext() {
  const { user, owners } = await getViewableOwners();
  const activeId = await getActiveOwnerId();
  return {
    user,
    owners,
    activeId,
    active: owners.find((o) => o.id === activeId) || null,
    isShared: Boolean(activeId && user && activeId !== user.id),
  };
}
