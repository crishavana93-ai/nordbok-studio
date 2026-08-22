/* app/moms/page.jsx — Server Component.
 *
 * The period lives in the URL, so a view is shareable, survives a reload, and the back
 * button does what you'd expect. That's the URL-state rule from the interface brief.
 */

import MomsClient from "@/components/moms/MomsClient";
import { getMomsPeriod } from "@/lib/moms-period";

export const dynamic = "force-dynamic";
export const metadata = { title: "Moms" };

export default async function MomsPage({ searchParams }) {
  const sp = await searchParams;
  const data = await getMomsPeriod({ key: sp?.period });

  return (
    // NOT <main> — app/layout.js already renders <main className="app-main">
    // around every page, and nesting main inside main is invalid.
    <div className="mx-auto w-full max-w-[820px]">
      <h1 className="sr-only">Momsdeklaration</h1>
      <MomsClient data={data} />
    </div>
  );
}
