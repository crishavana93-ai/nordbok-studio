"use client";
import { postJson } from "@/lib/safe-json";
import { reportErrorAsync } from "@/lib/report-error";
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

    const { ok, data: j, error } = await postJson("/api/assistant", { thread_id: thread, message });

    if (!ok) {
      /* The failure is shown as an error, NOT appended as a fake assistant turn.
       * It used to be pushed into the transcript as "(fel: …)" — but the server reads
       * history back from studio_assistant_log, which never saw it. The two
       * transcripts diverged permanently after the first failure, and the model was
       * then answering with a different conversation in mind than the one on screen. */
      setErr(error || "Assistenten svarade inte.");
      reportErrorAsync(new Error(error || "assistant failed"), { scope: "ui/assistant" });
      setBusy(false);
      return;
    }

    setThread(j.thread_id);
    setMsgs((m) => [...m, { role: "assistant", content: j.reply }]);
    setBusy(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[21px] font-medium tracking-[-0.015em]">Assistent</h1>
          <p className="mt-1 text-[13px] text-ink-2">
            Läser dina fakturor, kvitton och deadlines. Svarar om svensk skatt.
          </p>
        </div>
        {msgs.length > 0 && (
          <button onClick={() => { setMsgs([]); setThread(null); setErr(""); }}
            className="shrink-0 rounded-[var(--radius-ctl)] border border-border-firm px-3.5 py-2 text-[13px] font-medium text-ink-2 hover:text-ink">
            Ny konversation
          </button>
        )}
      </div>

      <section className="flex min-h-[60vh] flex-col rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <div className="flex-1 overflow-y-auto" role="log" aria-live="polite" aria-label="Konversation">
          {msgs.length === 0 ? (
            <div className="flex flex-col items-center gap-4 py-10">
              <p className="max-w-[44ch] text-center text-[13.5px] leading-relaxed text-ink-2">
                Fråga om vad som helst i dina böcker. Assistenten ser dina siffror men
                <strong className="font-medium text-ink"> ändrar ingenting</strong> — den
                läser bara.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => send(s)} disabled={busy}
                    className="rounded-[var(--radius-ctl)] border border-border px-3 py-1.5 text-[12.5px] text-ink-2 hover:border-border-firm hover:text-ink disabled:opacity-40">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {msgs.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] whitespace-pre-wrap rounded-[var(--radius-card)] px-3.5 py-2.5 text-[14px] leading-relaxed ${
                    m.role === "user"
                      ? "bg-brand text-brand-ink"   /* was #fff on --accent: unreadable once the brand went bone in dark mode */
                      : "bg-raised text-ink"
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex justify-start">
                  <div className="rounded-[var(--radius-card)] bg-raised px-3.5 py-2.5 text-[14px] text-ink-3">
                    Tänker…
                  </div>
                </div>
              )}
            </div>
          )}
          <div ref={endRef} />
        </div>

        {err && (
          <p role="alert" className="mt-3 rounded-[var(--radius-ctl)] bg-crit-bg px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink-2">
            {err}
          </p>
        )}

        <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="mt-3 flex gap-2">
          <label className="flex-1">
            <span className="sr-only">Fråga assistenten</span>
            <input
              value={input} onChange={(e) => setInput(e.target.value)} disabled={busy}
              placeholder="Fråga assistenten…"
              className="w-full rounded-[var(--radius-ctl)] border border-border bg-surface px-3 py-2.5 text-[16px] text-ink focus:border-border-firm focus:outline-none focus:ring-2 focus:ring-brand/25 disabled:opacity-60"
            />
          </label>
          <button type="submit" disabled={busy || !input.trim()}
            className="shrink-0 rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink disabled:opacity-40">
            Skicka
          </button>
        </form>
      </section>

      <p className="px-1 pb-2 text-[12px] leading-relaxed text-ink-3">
        Assistenten kan ha fel. Kontrollera siffror mot Moms- och Kvittosidorna innan du
        deklarerar något.
      </p>
    </div>
  );
}
