import { readFile, writeFile } from "node:fs/promises";

const done = [];
async function sub(file, name, a, b) {
  let s = await readFile(file, "utf8");
  const c = s.split(a).length - 1;
  if (c !== 1) { console.error(`FAIL ${file} / ${name}: found ${c}`); process.exit(1); }
  await writeFile(file, s.replace(a, b), "utf8");
  done.push(`${file}:${name}`);
}

/* ── welcome: inställningarna finns redan i scope ─────────────────────────── */
await sub("app/welcome/page.js", "seed",
  `        const tasks = buildTaxYearDeadlines(new Date().getFullYear(), user.id);`,
  [
    `        /* Inställningarna skickas med så att momsdatumen följer den faktiska`,
    `           redovisningsperioden. Har guiden inte frågat efter den läggs i stället`,
    `           en uppgift in om att ta reda på den — hellre det än fyra kvartalsdatum`,
    `           som kanske inte gäller. */`,
    `        const tasks = buildTaxYearDeadlines(new Date().getFullYear(), user.id, { ...settings, vat_number });`,
  ].join("\n"));

/* ── deadlines: hämta inställningarna innan raderna byggs ─────────────────── */
await sub("app/deadlines/page.js", "seed",
  [
    `  const seed = async () => {`,
    `    const { data: { user } } = await sb.auth.getUser();`,
    `    if (!user) return;`,
    `    await withErrors(`,
    `      () => sb.from("studio_tasks").insert(buildTaxYearDeadlines(new Date().getFullYear(), user.id)),`,
    `      "ui/deadlines-seed");`,
    `  };`,
  ].join("\n"),
  [
    `  const seed = async () => {`,
    `    const { data: { user } } = await sb.auth.getUser();`,
    `    if (!user) return;`,
    `    /* Momsdatumen beror på redovisningsperioden, så inställningarna måste läsas`,
    `       innan raderna byggs. Utan dem lades fyra kvartalsdeklarationer in oavsett`,
    `       vad Skatteverket faktiskt beslutat. */`,
    `    const { data: settings } = await sb`,
    `      .from("studio_settings")`,
    `      .select("vat_registered_from, vat_dereg_from, vat_period_type, vat_eu_trade, vat_large_turnover")`,
    `      .eq("user_id", user.id)`,
    `      .maybeSingle();`,
    `    await withErrors(`,
    `      () => sb.from("studio_tasks").insert(buildTaxYearDeadlines(new Date().getFullYear(), user.id, settings)),`,
    `      "ui/deadlines-seed");`,
    `  };`,
  ].join("\n"));

console.log("patched:", done.join(" · "));
