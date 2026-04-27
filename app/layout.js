import "./globals.css";
import Sidebar from "@/components/Sidebar";
import SwReg from "@/components/SwReg";
import InstallPrompt from "@/components/InstallPrompt";
import { serverClient } from "@/lib/supabase-server";

export const metadata = {
  title: { default: "Nordbok Studio", template: "%s | Nordbok Studio" },
  description: "Daily-use Swedish accounting — invoices (F-skatt, ROT/RUT, OSS), receipts (AI OCR), körjournal, deductions.",
  manifest: "/manifest.json",
  themeColor: "#0d3a2a",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Nordbok Studio" },
  viewport: { width: "device-width", initialScale: 1, viewportFit: "cover" },
  icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
};

export default async function RootLayout({ children }) {
  const sb = await serverClient();
  const { data: { user } } = await sb.auth.getUser();

  return (
    <html lang="sv">
      <body>
        {user ? (
          <div className="app-shell">
            <Sidebar email={user.email} />
            <main>{children}</main>
          </div>
        ) : (
          <main style={{ maxWidth: 1100, margin: "0 auto", padding: "20px" }}>{children}</main>
        )}
        <SwReg />
        <InstallPrompt />
      </body>
    </html>
  );
}
