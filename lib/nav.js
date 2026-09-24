/* lib/nav.js — the ONE map of where things live.
 *
 * Architecture (Grassfeld-style, 2026-09-24): four fixed destinations plus Mer.
 *   Översikt · Transaktioner · Moms · Underlag · Mer
 * Transaktioner is the spine — the bank statement is the list of what actually
 * happened, and everything else (kvitton, fakturor) is evidence attached to it.
 * Underlag groups the three kinds of evidence behind one tab with a segmented
 * control, instead of spending three tabs on them.
 *
 * BottomNav, Sidebar and SectionTabs all read from here. Add a page here or it
 * does not exist in the navigation.
 */

export const PRIMARY = [
  { href: "/dashboard", label: "Översikt", icon: "home" },
  { href: "/bank", label: "Transaktioner", short: "Transakt.", icon: "swap" },
  { href: "/moms", label: "Moms", icon: "vat" },
  { href: "/receipts", label: "Underlag", icon: "folder", group: "underlag" },
];

/* The segmented control shown at the top of every Underlag page. */
export const UNDERLAG = [
  { href: "/receipts", label: "Kvitton", icon: "receipt" },
  { href: "/invoices", label: "Fakturor", icon: "invoice" },
  { href: "/documents", label: "Arkiv", icon: "folder" },
];

export const MORE_SECTIONS = [
  {
    title: "Koll på läget",
    items: [
      { href: "/brief", label: "Veckobrev", icon: "news", hint: "Veckans siffror och vad du ska göra" },
      { href: "/assistant", label: "Assistent", icon: "spark", hint: "Fråga om moms, avdrag och skatt" },
      { href: "/deadlines", label: "Deadlines", icon: "clock", hint: "Moms, F-skatt och deklaration" },
      { href: "/finansiering", label: "Finans", icon: "chart", hint: "Resultat, skatt och kassaflöde" },
    ],
  },
  {
    title: "Verksamheten",
    items: [
      { href: "/clients", label: "Kunder", icon: "users", hint: "Fakturamottagare" },
      { href: "/mileage", label: "Körjournal", icon: "car", hint: "Milersättning" },
      { href: "/resor", label: "Affärsresor", icon: "plane", hint: "Traktamente och resekostnader" },
    ],
  },
  {
    title: "Konto",
    items: [
      { href: "/settings", label: "Inställningar", icon: "cog", hint: "Företag, moms-nr, notiser" },
      { href: "/help", label: "Hjälp", icon: "help", hint: "Så funkar appen" },
    ],
  },
];

export const isOn = (pathname, href) => pathname === href || pathname?.startsWith(href + "/");
export const inUnderlag = (pathname) => UNDERLAG.some((u) => isOn(pathname, u.href));
