"use client";

/* components/nav/BottomNav.jsx
 *
 * Grassfeld's architecture, Direction A's skin: four fixed destinations and Mer.
 * The map lives in lib/nav.js. A tab bar that scrolls is not a tab bar, so this
 * one never does — everything else is in the Mer sheet, grouped into card
 * sections with a one-line hint each, so you can find a page by what it does.
 *
 * `sticky` not `fixed`: WebKit bounces fixed elements during momentum scroll, and
 * `position: fixed; bottom: 0` breaks outright when the keyboard opens.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Drawer } from "vaul";
import NavIcon from "@/components/nav/icons";
import { PRIMARY, MORE_SECTIONS, isOn, inUnderlag } from "@/lib/nav";

export default function BottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const inMore = MORE_SECTIONS.some((s) => s.items.some((m) => isOn(pathname, m.href)));

  const cls = (on) =>
    `flex min-w-0 flex-1 flex-col items-center gap-[3px] rounded-lg px-1 py-1.5 text-[10.5px] no-underline transition-colors ${
      on ? "text-brand" : "text-ink-3"
    }`;

  return (
    <nav className="app-nav" aria-label="Huvudmeny">
      <div className="mx-auto flex w-full max-w-[560px] items-stretch px-1 pt-1.5">
        {PRIMARY.map((t) => {
          const on = t.group === "underlag" ? inUnderlag(pathname) : isOn(pathname, t.href);
          return (
            <Link key={t.href} href={t.href} className={cls(on)} aria-current={on ? "page" : undefined}>
              <NavIcon name={t.icon} />
              <span className="w-full truncate text-center">{t.short || t.label}</span>
            </Link>
          );
        })}

        <Drawer.Root open={open} onOpenChange={setOpen}>
          <Drawer.Trigger asChild>
            <button className={cls(inMore)} aria-label="Fler sidor">
              <NavIcon name="more" />
              <span className="w-full truncate text-center">Mer</span>
            </button>
          </Drawer.Trigger>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" />
            <Drawer.Content
              className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85dvh] rounded-t-[16px]
                         border-t border-border bg-surface shadow-[var(--shadow-sheet)] sm:max-w-[520px]"
            >
              <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-border-firm" />
              <div className="overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom))] pt-3">
                <Drawer.Title className="mb-1 text-[15px] font-semibold">Mer</Drawer.Title>
                {MORE_SECTIONS.map((sec) => (
                  <section key={sec.title} className="mt-3">
                    <h3 className="micro-label mb-1.5">{sec.title}</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {sec.items.map((m) => {
                        const on = isOn(pathname, m.href);
                        return (
                          <Link key={m.href} href={m.href} onClick={() => setOpen(false)}
                            className={`flex min-h-[74px] flex-col gap-1 rounded-[10px] border border-border bg-raised
                                        px-3 py-2.5 no-underline ${on ? "text-brand" : "text-ink"}`}>
                            <span className="flex items-center gap-2 text-[13.5px] font-medium">
                              <NavIcon name={m.icon} size={18} />{m.label}
                            </span>
                            <span className="text-[11.5px] leading-snug text-ink-3">{m.hint}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      </div>
    </nav>
  );
}
