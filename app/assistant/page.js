"use client";
import { useState, useRef, useEffect } from "react";

const SUGGESTIONS = [
  "Vad är min beräknade vinst hittills i år?",
  "Vilka kvitton är okategoriserade?",
  "Vilka fakturor är förfallna?",
  "Hur mycket moms ska jag redovisa nästa kvartal?",
  "Vilka deadlines är inom 30 dagar?",
  "Sammanfatta mina avdrag (BAS-konto för BAS-konto).",
];

export default function AssistantPage() {
  const [thread, setThread] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  async function send(message) {
    if (!message.trim()) return;
    setBusy(true); setErr("");
    setMsgs((m) => [...m, { role: "user", content: message }]);
    setInput("");
    try {
      const r = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thread_id: thread, message }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Misslyckades");
      setThread(j.thread_id);
      setMsgs((m) => [...m, { role: "assistant", content: j.reply }]);
    } catch (e) {
      setErr(e.message);
      setMsgs((m) => [...m, { role: "assistant", content: `(fel: ${e.message})` }]);
    } finally { setBusy(false); }
  }

  return (
    <>
      <div className="spread" style={{ marginBottom: 18 }}>
        <h1 className="h1">Assistent</h1>
        <button className="btn btn-ghost btn-sm" onClick={() => { setMsgs([]); setThread(null); }}>Ny konversation</button>
      </div>

      <div className="card" style={{ minHeight: 480, display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, overflowY: "auto", paddingRight: 6 }}>
          {msgs.length === 0 ? (
            <div className="empty">
              <div style={{ marginBottom: 14 }}>Ställ frågor om dina fakturor, kvitton, resor och deadlines. Jag har läsåtkomst till din data och svensk skattekunskap.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {SUGGESTIONS.map((s) => (
                  <button key={s} className="btn btn-ghost btn-sm" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          ) : msgs.map((m, i) => (
            <div key={i} style={{ marginBottom: 14, display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
              <div style={{
                maxWidth: "78%",
                padding: "10px 14px",
                borderRadius: 12,
                background: m.role === "user" ? "var(--accent)" : "var(--bg-soft)",
                color: m.role === "user" ? "#fff" : "var(--text)",
                whiteSpace: "pre-wrap",
                fontSize: 14,
              }}>{m.content}</div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
        {err && <div className="alert alert-error">{err}</div>}
        <form onSubmit={(e) => { e.preventDefault(); send(input); }} style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Fråga assistenten..." disabled={busy} style={{ flex: 1 }} />
          <button className="btn" type="submit" disabled={busy || !input.trim()}>{busy ? "..." : "Skicka"}</button>
        </form>
      </div>
    </>
  );
}
