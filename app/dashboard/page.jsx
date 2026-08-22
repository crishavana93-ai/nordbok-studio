/* app/dashboard/page.jsx — Server Component.
 *
 * One await, everything computed server-side, handed to the client shell as props.
 * No client fetching means no waterfalls and no spinners inside tiles: the page
 * either isn't there yet or it's complete.
 */

import DashboardClient from "@/components/dashboard/DashboardClient";
import { getDashboard, VENTURES } from "@/lib/dashboard-data";

export const dynamic = "force-dynamic"; // auth + live figures, never statically cached

export const metadata = { title: "Översikt · Nordbök Studio" };

export default async function DashboardPage() {
  const data = await getDashboard();

  return (
    // NOT <main> — layout.js already wraps every page in <main className="app-main">.
    <div>
      <h1 className="sr-only">Översikt</h1>
      <DashboardClient data={data} ventures={VENTURES} />
    </div>
  );
}
