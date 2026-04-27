"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

const ICONS = {
  dashboard: "M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h4v-7h4v7h4a1 1 0 0 0 1-1V10",
  invoices:  "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M9 13h6M9 17h4",
  receipts:  "M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2zM8 7h8M8 11h8M8 15h6",
  mileage:   "M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1L1.5 12v4h2M9 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0M19 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0",
  trips:     "M22 16.7v-2.7a2 2 0 0 0-1.5-1.93l-2.5-.83a2 2 0 0 0-2.84 2.05L17 17M2 7h20M2 7a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2M2 7v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7",
  clients:   "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  bank:      "M3 21h18M3 10h18M5 6l7-4 7 4M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3",
  finance:   "M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  documents: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6",
  deadlines: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  assistant: "M12 8V4M5 12H2M22 12h-3M7.5 7.5L5 5M16.5 7.5L19 5M8 21h8M9 18a3 3 0 0 1 3-3 3 3 0 0 1 3 3v3H9v-3z",
  settings:  "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  help:      "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01",
  signout:   "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};

const links = [
  { href: "/dashboard", label: "Dashboard",  icon: ICONS.dashboard },
  { href: "/invoices",  label: "Fakturor",   icon: ICONS.invoices },
  { href: "/receipts",  label: "Kvitton",    icon: ICONS.receipts },
  { href: "/mileage",   label: "Körjournal", icon: ICONS.mileage },
  { href: "/resor",     label: "Affärsresor", icon: ICONS.trips },
  { href: "/clients",   label: "Kunder",     icon: ICONS.clients },
  { href: "/bank",      label: "Bank",       icon: ICONS.bank },
  { href: "/finansiering", label: "Finans",  icon: ICONS.finance },
  { href: "/documents", label: "Arkiv",      icon: ICONS.documents },
  { href: "/deadlines", label: "Deadlines",  icon: ICONS.deadlines },
  { href: "/assistant", label: "Assistent",  icon: ICONS.assistant },
  { href: "/settings",  label: "Inställningar", icon: ICONS.settings },
  { href: "/help",      label: "Hjälp",       icon: ICONS.help },
];

export default function Sidebar({ email }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const sb = browserClient();
    await sb.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="brand">
        <span className="brand-dot">N</span>
        <span>Nordbok Studio</span>
      </Link>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`nav-link ${pathname === l.href || pathname.startsWith(l.href + "/") ? "active" : ""}`}
        >
          <Icon d={l.icon} />
          <span>{l.label}</span>
        </Link>
      ))}
      <div style={{ flex: 1 }} />
      <div className="signout" style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 10px", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>
        <button className="nav-link" style={{ width: "100%", border: 0, background: "transparent", textAlign: "left", cursor: "pointer" }} onClick={signOut}>
          <Icon d={ICONS.signout} /> <span>Logga ut</span>
        </button>
      </div>
    </aside>
  );
}
