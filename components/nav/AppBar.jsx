"use client";

/* components/nav/AppBar.jsx
 *
 * Two questions that were unanswerable from inside the app until now:
 *
 *   "Which company am I sending this as?"  -> the name on the left, tappable,
 *      going straight to Installningar where it is changed. An invoicing tool that
 *      never states the seller is asking you to trust it about the one field the
 *      customer's bookkeeper will check first.
 *
 *   "Where is English?"  -> LocaleSwitcher, which had been written weeks ago and
 *      never rendered anywhere in the tree. It exists; it just had no mount point.
 *
 * Deliberately one hairline tall. This is chrome, not content -- Direction A puts its
 * weight in the numbers, not in the frame around them.
 */

import Link from "next/link";
import LocaleSwitcher from "@/components/LocaleSwitcher";

export default function AppBar({ businessName }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3 border-b border-border pb-2.5">
      <Link href="/settings" className="group flex min-w-0 flex-col gap-0.5">
        <span className="micro-label">Fakturerar som</span>
        <span className="truncate text-[13.5px] font-medium text-ink group-hover:underline">
          {businessName || "Namnge din verksamhet →"}
        </span>
      </Link>
      <LocaleSwitcher compact />
    </div>
  );
}
