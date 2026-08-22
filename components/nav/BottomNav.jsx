"use client";

/* components/nav/BottomNav.jsx
 *
 * The screenshots showed a bottom bar with 8+ items scrolling sideways — different
 * items visible in each shot, so you could never learn where anything was. A tab bar
 * that scrolls is not a tab bar; it's a menu pretending to be one.
 *
 * Five fixed destinations, chosen from the four questions the app exists to answer,
 * plus everything else behind "Mer". Nothing moves, ever.
 *
 * `sticky` not `fixed`: WebKit bounces fixed elements during momentum scroll, and
 * `position: fixed; bottom: 0` breaks outright when the keyboard opens.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Drawer } from "vaul";

const I = {
  home: <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  invoice: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  receipt: <><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2V2l-3 2-3-2-3 2-3-2z" /><path d="M8 9h8M8 13h6" /></>,
  vat: <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>,
  more: <><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>,
  chart: <><path d="M3 3v18h18" /><path d="M7 15l4-5 4 3 5-7" /></>,
  car: <><path d="M5 17H3v-5l2-5h14l2 5v5h-2" /><circle cx="7" cy="17" r="2" /><circle cx="17" cy="17" r="2" /></>,
  plane: <><path d="M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a.8.8 0 0 0-.8 1.3L8 11l-2 3H4l1.5 2.5L8 18l3-2v-2l3.5 4a.8.8 0 0 0 1.3-.8z" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9" /></>,
  bank: <><path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6" /></>,
  folder: <><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z" /></>,
  spark: <><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /></>,
  cog: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a1.7 1.7 0 0 0-1.6-1H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 8.4a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 7 4.6h.1A1.7 1.7 0 0 0 8.7 3V2a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 3.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1.6H23a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
    strokeLinecap="round" strokeLinejoin="round" className="size-[21px] shrink-0">
    {I[d]}
  </svg>
);

/* Five, matching the four questions the app answers, plus Mer. */
const PRIMARY = [
  { href: "/dashboard", label: "Översikt", icon: "home" },
  { href: "/invoices", label: "Fakturor", icon: "invoice" },
  { href: "/receipts", label: "Kvitton", icon: "receipt" },
  { href: "/moms", label: "Moms", icon: "vat" },
];

const MORE = [
  { href: "/finansiering", label: "Finans", icon: "chart" },
  { href: "/clients", label: "Kunder", icon: "users" },
  { href: "/bank", label: "Bank", icon: "bank" },
  { href: "/mileage", label: "Körjournal", icon: "car" },
  { href: "/resor", label: "Affärsresor", icon: "plane" },
  { href: "/documents", label: "Arkiv", icon: "folder" },
  { href: "/assistant", label: "Assistent", icon: "spark" },
  { href: "/settings", label: "Inställningar", icon: "cog" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const inMore = MORE.some((m) => pathname?.startsWith(m.href));

  const cls = (on) =>
    `flex min-w-0 flex-1 flex-col items-center gap-[3px] rounded-lg px-1 py-1.5 text-[10.5px] no-underline transition-colors ${
      on ? "text-brand" : "text-ink-3"
    }`;

  return (
    <nav className="app-nav" aria-label="Huvudmeny">
      <div className="mx-auto flex w-full max-w-[560px] items-stretch px-1 pt-1.5">
        {PRIMARY.map((t) => {
          const on = pathname === t.href || pathname?.startsWith(t.href + "/");
          return (
            <Link key={t.href} href={t.href} className={cls(on)} aria-current={on ? "page" : undefined}>
              <Icon d={t.icon} />
              <span className="w-full truncate text-center">{t.label}</span>
            </Link>
          );
        })}

        <Drawer.Root open={open} onOpenChange={setOpen}>
          <Drawer.Trigger asChild>
            <button className={cls(inMore)} aria-label="Fler sidor">
              <Icon d="more" />
              <span className="w-full truncate text-center">Mer</span>
            </button>
          </Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
            <Drawer.Content
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[80dvh] rounded-t-[16px]
                         border-t border-border bg-surface shadow-[var(--shadow-sheet)] sm:max-w-[520px]"
            >
              <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-border-firm" />
              <div className="overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3">
                <Drawer.Title className="mb-3 text-[15px] font-semibold">Fler sidor</Drawer.Title>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {MORE.map((m) => {
                    const on = pathname?.startsWith(m.href);
                    return (
                      <Link key={m.href} href={m.href} onClick={() => setOpen(false)}
                        className={`flex min-h-[76px] flex-col items-center justify-center gap-1.5 rounded-[10px]
                                    border border-border bg-raised px-2 py-3 text-[11.5px] no-underline
                                    ${on ? "text-brand" : "text-ink-2"}`}>
                        <Icon d={m.icon} />
                        <span className="w-full truncate text-center">{m.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </nav>
  );
}
