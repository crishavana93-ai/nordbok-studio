"use client";

/* The segmented control on top of the Underlag tab: Kvitton · Fakturor · Arkiv.
 * Renders nothing outside that group. Mounted once in layout.js, so no page has
 * to remember to include it. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UNDERLAG, isOn, inUnderlag } from "@/lib/nav";

export default function SectionTabs() {
  const pathname = usePathname();
  if (!inUnderlag(pathname)) return null;
  return (
    <div role="tablist" aria-label="Underlag"
      className="mx-auto mb-3 flex w-full max-w-[820px] rounded-[var(--radius-ctl)] border border-border bg-raised p-1">
      {UNDERLAG.map((u) => {
        const on = isOn(pathname, u.href);
        return (
          <Link key={u.href} href={u.href} role="tab" aria-selected={on}
            className={`flex-1 rounded-[calc(var(--radius-ctl)-2px)] px-2 py-1.5 text-center text-[13px] no-underline ${
              on ? "border border-border bg-surface font-medium text-ink" : "border border-transparent text-ink-3"
            }`}>
            {u.label}
          </Link>
        );
      })}
    </div>
  );
}
