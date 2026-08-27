import { readFile, writeFile } from "node:fs/promises";

const done = [];
async function sub(file, name, a, b) {
  const s = await readFile(file, "utf8");
  const c = s.split(a).length - 1;
  if (c !== 1) { console.error(`FAIL ${file} / ${name}: found ${c}`); process.exit(1); }
  await writeFile(file, s.replace(a, b), "utf8");
  done.push(`${file.split("/").pop()}:${name}`);
}

const N = "app/invoices/new/page.js";
const V = "app/invoices/[id]/page.js";

/* ═══ 1. Formuläret kan öppna ett befintligt utkast ═══════════════════════════
   Ett utkast gick att skapa och att skicka, men aldrig att ändra. Ett stavfel
   innebar att kasta bort utkastet och börja om. Samma formulär används, för det
   är samma dokument — bara med ett id den här gången.                        */

await sub(N, "useRef",
`import { useState, useEffect, useMemo } from "react";`,
`import { useState, useEffect, useMemo, useRef } from "react";`);

await sub(N, "state",
`  const [showNewClient, setShowNewClient] = useState(false);`,
  [
    `  const [showNewClient, setShowNewClient] = useState(false);`,
    ``,
    `  /* Sätts när sidan öppnats som ?edit=<id>. Null = ett nytt utkast. */`,
    `  const [editId, setEditId] = useState(null);`,
    `  const [laddarUtkast, setLaddarUtkast] = useState(false);`,
    `  /* Kundkaskaden nedan skriver över valuta, momssats, omvänd betalnings-`,
    `     skyldighet och språk varje gång client_id ändras. När ett sparat utkast`,
    `     läses in är det precis fel: de värdena är redan valda en gång. Flaggan`,
    `     låter kaskaden hoppa över exakt den ena gången. */`,
    `  const hoppaKaskad = useRef(false);`,
  ].join("\n"));

await sub(N, "kaskad-guard",
`  useEffect(() => {
    if (!selectedClient) return;
    const country = selectedClient.country_code || "SE";`,
`  useEffect(() => {
    if (!selectedClient) return;
    if (hoppaKaskad.current) { hoppaKaskad.current = false; return; }
    const country = selectedClient.country_code || "SE";`);

await sub(N, "ladda-utkast",
`  async function saveDraft() {`,
  [
    `  /* Id:t läses ur adressraden i stället för med useSearchParams(), som i`,
    `     Next 15 kräver en Suspense-gräns runt hela sidan för att bygget ska gå`,
    `     igenom. Här behövs bara ett värde, en gång, på klienten. */`,
    `  useEffect(() => {`,
    `    const id = new URLSearchParams(window.location.search).get("edit");`,
    `    if (!id) return;`,
    `    setEditId(id);`,
    `    setLaddarUtkast(true);`,
    `    (async () => {`,
    `      const [{ data: inv, error: e1 }, { data: rader, error: e2 }] = await Promise.all([`,
    `        sb.from("studio_invoices").select("*").eq("id", id).maybeSingle(),`,
    `        sb.from("studio_invoice_items").select("*").eq("invoice_id", id).order("position"),`,
    `      ]);`,
    `      if (e1 || !inv) {`,
    `        setErr("Utkastet gick inte att hämta.");`,
    `        setLaddarUtkast(false);`,
    `        return;`,
    `      }`,
    `      /* Bara utkast. En skickad faktura är ett dokument någon annan har i sin`,
    `         bokföring — den rättas med en ändringsfaktura, inte genom att skrivas`,
    `         om. Databasens trigger säger samma sak, men användaren ska aldrig`,
    `         hinna fram till det felet. */`,
    `      if (inv.status !== "draft") {`,
    `        router.replace(\`/invoices/\${id}\`);`,
    `        return;`,
    `      }`,
    `      if (e2) setErr("Raderna gick inte att hämta.");`,
    ``,
    `      hoppaKaskad.current = true;`,
    `      setClientId(inv.client_id || "");`,
    `      setIssueDate((inv.issue_date || today).slice(0, 10));`,
    `      setDueDate((inv.due_date || due30).slice(0, 10));`,
    `      setCurrency(inv.currency || "SEK");`,
    `      setReference(inv.reference || "");`,
    `      setRotRutType(inv.rot_rut_type || "");`,
    `      setReverseCharge(!!inv.reverse_charge);`,
    `      setOssCountry(inv.oss_country || "");`,
    `      setLanguage(inv.language || "sv");`,
    `      setNotes(inv.notes || "");`,
    `      setVenture(inv.venture || "");`,
    `      if (rader?.length) {`,
    `        setItems(rader.map((r) => ({`,
    `          description: r.description || "",`,
    `          quantity: r.quantity ?? 1,`,
    `          unit: r.unit || "st",`,
    `          unit_price: r.unit_price ?? 0,`,
    `          vat_rate: r.vat_rate ?? 25,`,
    `          rot_rut_hours: r.rot_rut_hours ?? "",`,
    `        })));`,
    `      }`,
    `      setLaddarUtkast(false);`,
    `    })();`,
    `  }, [sb, router]);`,
    ``,
    `  async function saveDraft() {`,
  ].join("\n"));

/* ── Spara: uppdatera i stället för att skapa när vi redigerar ────────────── */
await sub(N, "spara",
`      const { data: inserted, error } = await sb.from("studio_invoices").insert(inv).select().single();
      if (error) throw error;

      const itemRows = items.map((it, position) => ({
        invoice_id: inserted.id, user_id: user.id, position,`,
  [
    `      let fakturaId = editId;`,
    `      if (editId) {`,
    `        /* user_id och status rörs inte vid en uppdatering. */`,
    `        const { user_id, status, ocr_number, ...andringsbart } = inv;`,
    `        const { data: uppdaterad, error } = await sb`,
    `          .from("studio_invoices")`,
    `          .update(andringsbart)`,
    `          .eq("id", editId)`,
    `          .eq("status", "draft")   /* backstopp: aldrig en skickad faktura */`,
    `          .select("id")`,
    `          .maybeSingle();`,
    `        if (error) throw error;`,
    `        if (!uppdaterad) throw new Error("Utkastet gick inte att uppdatera — det kan redan ha skickats.");`,
    `        /* Raderna ersätts i stället för att jämföras: en faktura har få rader,`,
    `           och att räkna ut vilka som ändrats är fler tillfällen att göra fel. */`,
    `        const { error: eDel } = await sb.from("studio_invoice_items").delete().eq("invoice_id", editId);`,
    `        if (eDel) throw eDel;`,
    `      } else {`,
    `        const { data: inserted, error } = await sb.from("studio_invoices").insert(inv).select().single();`,
    `        if (error) throw error;`,
    `        fakturaId = inserted.id;`,
    `      }`,
    ``,
    `      const itemRows = items.map((it, position) => ({`,
    `        invoice_id: fakturaId, user_id: user.id, position,`,
  ].join("\n"));

await sub(N, "efter-spara",
`      router.push(\`/invoices/\${inserted.id}\`);`,
`      router.push(\`/invoices/\${fakturaId}\`);`);

/* ── Knapptexten ska säga vad som faktiskt händer ─────────────────────────── */
await sub(N, "knapp",
`        <button onClick={() => router.push("/invoices")} disabled={busy}`,
`        <button onClick={() => router.push(editId ? \`/invoices/\${editId}\` : "/invoices")} disabled={busy}`);

/* ═══ 2. Vägen in: en Ändra-knapp på utkastet ═════════════════════════════════ */
await sub(V, "andra-lank",
`      {isDraft && (`,
  [
    `      {isDraft && (`,
    `        <div className="mb-3">`,
    `          <Link`,
    `            href={\`/invoices/new?edit=\${inv.id}\`}`,
    `            className="inline-block rounded-[var(--radius-ctl)] border border-border-firm px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-raised"`,
    `          >`,
    `            Ändra utkastet`,
    `          </Link>`,
    `        </div>`,
    `      )}`,
    ``,
    `      {isDraft && (`,
  ].join("\n"));

console.log("patched:\n  " + done.join("\n  "));
