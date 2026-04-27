import { requireUser } from "@/lib/supabase-server";
import { runDigest } from "../../cron/digest/route";

/** Manual "Run digest now" — sends only to the calling user, ignores schedule. */
export async function POST() {
  const { user } = await requireUser();
  return runDigest({ singleUser: user.id, force: true });
}
