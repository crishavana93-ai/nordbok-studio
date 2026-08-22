"use client";

/* components/LocaleSwitcher.jsx
 * Two languages, one control. Put it in the sidebar footer and in Inställningar.
 */

import { useT, setLocale, LOCALES } from "@/lib/i18n";

const NAME = { sv: "Svenska", en: "English" };

export default function LocaleSwitcher({ compact = false }) {
  const { locale } = useT();

  return (
    <div
      role="group"
      aria-label="Språk / Language"
      className="flex gap-0.5 rounded-[var(--radius-ctl)] border border-border bg-raised p-[3px]"
    >
      {LOCALES.map((l) => (
        <button
          key={l}
          onClick={() => l !== locale && setLocale(l)}
          aria-pressed={l === locale}
          className={`rounded-[5px] px-2.5 py-1 text-[12px] font-medium transition-colors
            ${l === locale ? "bg-surface text-ink" : "text-ink-3 hover:text-ink"}`}
        >
          {compact ? l.toUpperCase() : NAME[l]}
        </button>
      ))}
    </div>
  );
}
