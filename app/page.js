import { redirect } from "next/navigation";
import { serverClient } from "@/lib/supabase-server";

export default async function Home() {
  const sb = await serverClient();
  const { data: { user } } = await sb.auth.getUser();
  redirect(user ? "/dashboard" : "/login");
}
