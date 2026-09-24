"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { browserClient } from "@/lib/supabase";
import { useRouter } from "next/navigation";

import NavIcon from "@/components/nav/icons";
import { PRIMARY, UNDERLAG, MORE_SECTIONS, isOn } from "@/lib/nav";

/* Same map as the bottom bar (lib/nav.js), laid out flat: the rail has room for
   Underlag's three parts, so they are listed rather than hidden behind a tab. */
const GROUPS = [
  { title: null, items: [
    PRIMARY[0], PRIMARY[1], PRIMARY[2],
    ...UNDERLAG,
  ] },
  ...MORE_SECTIONS,
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
      {GROUPS.map((g, gi) => (
        <div key={gi} style={{ display: "contents" }}>
          {g.title && <div className="micro-label" style={{ padding: "12px 10px 4px" }}>{g.title}</div>}
          {g.items.map((l) => (
            <Link key={l.href} href={l.href} className={`nav-link ${isOn(pathname, l.href) ? "active" : ""}`}>
              <NavIcon name={l.icon} size={18} />
              <span>{l.label}</span>
            </Link>
          ))}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div className="signout" style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: "4px 10px", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>
        <button className="nav-link" style={{ width: "100%", border: 0, background: "transparent", textAlign: "left", cursor: "pointer" }} onClick={signOut}>
          <NavIcon name="signout" size={18} /> <span>Logga ut</span>
        </button>
      </div>
    </aside>
  );
}
