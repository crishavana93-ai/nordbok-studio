// ONE stylesheet entry. tailwind.css imports tokens/globals/mobile in the right
// layer order — see the comment at the top of that file. Do not add CSS imports
// here; that is how the app ended up with two systems fighting each other.
import "./tailwind.css";
import { IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";

// Direction A depends on real type. IBM Plex Sans at 400/500/600 — there is no
// 700 in this system (see the note at the top of tokens.css). next/font
// self-hosts the files at build time, so the PWA has no runtime font request.
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"], weight: ["400", "500", "600"],
  variable: "--font-plex-sans", display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"], weight: ["400", "500"],
  variable: "--font-plex-mono", display: "swap",
});
import Sidebar from "@/components/Sidebar";
import BottomNav from "@/components/nav/BottomNav";
import { LocaleProvider, LOCALE_COOKIE, DEFAULT_LOCALE } from "@/lib/i18n";
import { cookies } from "next/headers";
import SwReg from "@/components/SwReg";
import InstallPrompt from "@/components/InstallPrompt";
import { serverClient } from "@/lib/supabase-server";
import { getOwnerContext } from "@/lib/access";
import OwnerSwitcher from "@/components/nav/OwnerSwitcher";
import AppBar from "@/components/nav/AppBar";
import Splash from "@/components/Splash";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfcfa" },
    { media: "(prefers-color-scheme: dark)", color: "#101311" },
  ],
};

export const metadata = {
  title: { default: "Nordbok Studio", template: "%s | Nordbok Studio" },
  description: "Daily-use Swedish accounting — invoices (F-skatt, ROT/RUT, OSS), receipts (AI OCR), körjournal, deductions.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Nordbok Studio" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export default async function RootLayout({ children }) {
  const sb = await serverClient();
  const jar = await cookies();
  const locale = jar.get(LOCALE_COOKIE)?.value || DEFAULT_LOCALE;
  const { data: { user } } = await sb.auth.getUser();
  // Only meaningful once a membership exists; OwnerSwitcher renders nothing for one owner.
  const ownerCtx = user ? await getOwnerContext() : null;

  /* The seller's own name. Scoped to the ACTIVE owner, not to auth.uid(): an
     accountant reading someone else's books must see whose books they are, and an
     unscoped .maybeSingle() throws for them because RLS returns two rows. */
  let businessName = null;
  if (user) {
    const { data: st } = await sb
      .from("studio_settings")
      .select("business_name")
      .eq("user_id", ownerCtx?.activeId || user.id)
      .maybeSingle();
    businessName = st?.business_name || null;
  }

  return (
    <html lang={locale} className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>
        <LocaleProvider locale={locale}>
        {user ? (
          <div className="app-shell">
            {/* `contents`, not `block`: the wrapper must not become a grid or
                flex item itself, or the sidebar rail loses its column and the
                sticky bottom nav loses the tall containing block it needs to
                pin. `rail:` is 820px (tokens.css) and matches the sidebar
                media query in globals.css — `sm:` (640px) did not, which left
                a 640-819px band with a broken nav at both ends. */}
            <div className="hidden rail:contents">
              <Sidebar email={user.email} />
            </div>
            <main className="app-main">
              <AppBar businessName={businessName} />
              <OwnerSwitcher owners={ownerCtx?.owners || []} activeId={ownerCtx?.activeId} />
              {children}
            </main>
            <div className="contents rail:hidden">
              <BottomNav />
            </div>
          </div>
        ) : (
          <main style={{ maxWidth: 1100, margin: "0 auto", padding: "20px" }}>{children}</main>
        )}
        {user && <Splash name={businessName} />}
        <SwReg />
        <InstallPrompt />
        </LocaleProvider>
      </body>
    </html>
  );
}
