"use client";

/* The box at the bottom of Hem: type a question, or drop/photograph a receipt.
   A question goes to the assistant with the text prefilled and sent; a file goes
   to the receipt scanner. Two destinations, one box, because the user should
   not have to know which page handles what. */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function AskBox() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const fileRef = useRef(null);

  function ask(e) {
    e.preventDefault();
    if (!q.trim()) return;
    router.push(`/assistant?q=${encodeURIComponent(q.trim())}`);
  }
  function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    /* Hand the file to the receipts page through sessionStorage: a File cannot
       ride in a URL, and the receipts page already knows how to scan one. */
    const r = new FileReader();
    r.onload = () => {
      try { sessionStorage.setItem("nordbok_pending_receipt", JSON.stringify({ name: f.name, type: f.type, data: r.result })); } catch {}
      router.push("/receipts?from=hem");
    };
    r.readAsDataURL(f);
  }

  return (
    <form onSubmit={ask} className="flex gap-2">
      <label htmlFor="hem-q" className="sr-only">Skriv en fråga</label>
      <input id="hem-q" value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Skriv en fråga eller lägg in ett kvitto"
        className="min-w-0 flex-1 rounded-[var(--radius-ctl)] border border-border-firm bg-surface px-3.5 py-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-brand/25" />
      <input ref={fileRef} type="file" accept="image/*,application/pdf" capture="environment" hidden onChange={pick} />
      <button type="button" onClick={() => fileRef.current?.click()} aria-label="Fota eller välj kvitto"
        className="grid size-[46px] shrink-0 place-items-center rounded-[var(--radius-ctl)] border border-border-firm bg-surface">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
      </button>
      <button type="submit" aria-label="Fråga" disabled={!q.trim()}
        className="grid size-[46px] shrink-0 place-items-center rounded-[var(--radius-ctl)] bg-brand text-brand-ink disabled:opacity-40">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
      </button>
    </form>
  );
}
