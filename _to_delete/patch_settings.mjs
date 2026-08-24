import { readFile, writeFile } from "node:fs/promises";

const F = "app/settings/page.js";
let s = await readFile(F, "utf8");
const done = [];
function sub(name, a, b) {
  const c = s.split(a).length - 1;
  if (c !== 1) { console.error(`FAIL ${name}: found ${c}`); process.exit(1); }
  s = s.replace(a, b); done.push(name);
}

sub("import",
  `import Felhistorik from "@/components/settings/Felhistorik";`,
  `import Felhistorik from "@/components/settings/Felhistorik";\nimport { momsStatus } from "@/lib/moms-status";`);

sub("useMemo",
  `  /* Move focus to the message so it is announced and not merely painted. */\n  useEffect(() => { if (err || info) alertRef.current?.focus(); }, [err, info]);`,
  [
    `  /* Move focus to the message so it is announced and not merely painted. */`,
    `  useEffect(() => { if (err || info) alertRef.current?.focus(); }, [err, info]);`,
    ``,
    `  /* Nästa deklarationsdatum, direkt under fälten som bestämmer det. Utan den`,
    `     återkopplingen är valet av redovisningsperiod bara ett ord i en lista. */`,
    `  const momsInfo = useMemo(() => {`,
    `    if (!s?.vat_registered_from || !s?.vat_period_type) return null;`,
    `    try {`,
    `      return momsStatus({`,
    `        registreradFrom: s.vat_registered_from,`,
    `        avregistreradFrom: s.vat_dereg_from,`,
    `        periodTyp: s.vat_period_type,`,
    `        euHandel: !!s.vat_eu_trade,`,
    `        storOmsattning: !!s.vat_large_turnover,`,
    `        idag: new Date().toISOString().slice(0, 10),`,
    `      });`,
    `    } catch { return null; }`,
    `  }, [s?.vat_registered_from, s?.vat_dereg_from, s?.vat_period_type, s?.vat_eu_trade, s?.vat_large_turnover]);`,
  ].join("\n"));

const SEKTION = [
  `        <Section title="Moms och redovisning"`,
  `          note="Uppgifterna står på momsregistreringsbeviset. Redovisningsperioden avgör när deklarationen ska lämnas, och kvartal eller helår skiljer flera månader — därför gissar appen den inte.">`,
  `          <Field label="Momsregistrerad från"`,
  `            hint="Datumet Skatteverket registrerade verksamheten. Ingående moms på förvärv före detta datum är som huvudregel inte avdragsgill.">`,
  `            <input className={inputCls} type="date"`,
  `              value={s.vat_registered_from || ""}`,
  `              onChange={(e) => set({ vat_registered_from: e.target.value || null })} />`,
  `          </Field>`,
  `          <Field label="Redovisningsperiod"`,
  `            hint="Skatteverket bestämmer den vid registreringen. Lämnas den tom varnar appen inte för missade deklarationer.">`,
  `            <select className={inputCls} value={s.vat_period_type || ""}`,
  `              onChange={(e) => set({ vat_period_type: e.target.value || null })}>`,
  `              <option value="">— inte angiven —</option>`,
  `              <option value="manad">Månadsvis</option>`,
  `              <option value="kvartal">Kvartalsvis</option>`,
  `              <option value="helar">Helår</option>`,
  `            </select>`,
  `          </Field>`,
  `          <Field label="Avregistrerad från" hint="Lämna tom så länge du är registrerad.">`,
  `            <input className={inputCls} type="date"`,
  `              value={s.vat_dereg_from || ""}`,
  `              onChange={(e) => set({ vat_dereg_from: e.target.value || null })} />`,
  `          </Field>`,
  `          <Field label="Lämnar periodisk sammanställning"`,
  `            hint="EU-handel. Påverkar bara helårsmoms: med den 26 februari, utan den 12 maj året efter.">`,
  `            <select className={inputCls} value={s.vat_eu_trade ? "1" : "0"}`,
  `              onChange={(e) => set({ vat_eu_trade: e.target.value === "1" })}>`,
  `              <option value="0">Nej</option><option value="1">Ja</option>`,
  `            </select>`,
  `          </Field>`,
  `          <div className="sm:col-span-2 rounded-[var(--radius-ctl)] border border-border bg-raised px-3 py-2.5 text-[13px] leading-relaxed text-ink-2">`,
  `            {!momsInfo`,
  `              ? "Fyll i registreringsdatum och redovisningsperiod, så visas nästa deklarationsdatum här."`,
  `              : momsInfo.forsenade.length`,
  `              ? (<span>`,
  `                  <strong className="text-ink">`,
  `                    {momsInfo.forsenade.length} förfallen deklaration`,
  `                    {momsInfo.forsenade.length === 1 ? "" : "er"}:{" "}`,
  `                    {momsInfo.forsenade.map((p) => p.key).join(", ")}`,
  `                  </strong>{" "}`,
  `                  — förseningsavgiften är 625 kr per utebliven deklaration.`,
  `                </span>)`,
  `              : momsInfo.nasta`,
  `              ? (<span>`,
  `                  Nästa deklaration: <strong className="text-ink">{momsInfo.nasta.key}</strong>,`,
  `                  {" "}senast <strong className="text-ink">{momsInfo.nasta.deadline}</strong>.`,
  `                </span>)`,
  `              : "Inga perioder att lämna än."}`,
  `          </div>`,
  `        </Section>`,
  ``,
  `        <Section title="Standardvärden på nya fakturor">`,
].join("\n");

sub("sektion", `        <Section title="Standardvärden på nya fakturor">`, SEKTION);

await writeFile(F, s, "utf8");
console.log("patched:", done.join(", "));
