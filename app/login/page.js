"use client";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { browserClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const [mode, setMode] = useState("login"); // login | signup | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");

  // If we land here already signed in (e.g. layout missed it), bounce.
  useEffect(() => {
    const sb = browserClient();
    sb.auth.getUser().then(({ data }) => { if (data.user) router.replace(params.get("next") || "/dashboard"); });
  }, [router, params]);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setInfo(""); setBusy(true);
    const sb = browserClient();
    try {
      if (mode === "signup") {
        const { error } = await sb.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/dashboard` },
        });
        if (error) throw error;
        setInfo("Konto skapat. Kontrollera din e-post för att verifiera.");
      } else if (mode === "reset") {
        const { error } = await sb.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/api/auth/callback?next=/settings`,
        });
        if (error) throw error;
        setInfo("Återställningslänk skickad. Kontrollera din e-post.");
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace(params.get("next") || "/dashboard");
        router.refresh();
      }
    } catch (e) {
      setErr(e.message || "Något gick fel.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const sb = browserClient();
    await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/api/auth/callback?next=/dashboard` },
    });
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
      <div className="card" style={{ width: "100%", maxWidth: 420 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span className="brand-dot" style={{ width: 32, height: 32, fontSize: 16, borderRadius: 9 }}>N</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>Nordbok Studio</div>
            <div className="muted" style={{ fontSize: 12 }}>Daglig bokföring för enskild firma</div>
          </div>
        </div>

        {err && <div className="alert alert-error">{err}</div>}
        {info && <div className="alert alert-ok">{info}</div>}

        <form onSubmit={submit}>
          <div className="field">
            <label className="label">E-post</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          {mode !== "reset" && (
            <div className="field">
              <label className="label">Lösenord</label>
              <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
            </div>
          )}
          <button className="btn" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>
            {busy ? "..." : mode === "signup" ? "Skapa konto" : mode === "reset" ? "Skicka återställningslänk" : "Logga in"}
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "16px 0", color: "var(--text-muted)", fontSize: 12 }}>
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
          <span>eller</span>
          <div style={{ flex: 1, height: 1, background: "var(--line)" }} />
        </div>

        <button className="btn btn-ghost" onClick={google} style={{ width: "100%", justifyContent: "center" }} type="button">
          Fortsätt med Google
        </button>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 18, fontSize: 13 }}>
          {mode === "login" ? (
            <>
              <button onClick={() => { setMode("signup"); setErr(""); setInfo(""); }} className="btn btn-ghost btn-sm" type="button">Skapa konto</button>
              <button onClick={() => { setMode("reset"); setErr(""); setInfo(""); }} className="btn btn-ghost btn-sm" type="button">Glömt lösenord?</button>
            </>
          ) : (
            <button onClick={() => { setMode("login"); setErr(""); setInfo(""); }} className="btn btn-ghost btn-sm" type="button">← Tillbaka till logga in</button>
          )}
        </div>
      </div>
    </div>
  );
}
