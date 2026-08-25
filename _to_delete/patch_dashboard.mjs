import { readFile, writeFile } from "node:fs/promises";

const done = [];
async function sub(file, name, a, b) {
  const s = await readFile(file, "utf8");
  const c = s.split(a).length - 1;
  if (c !== 1) { console.error(`FAIL ${file} / ${name}: found ${c}`); process.exit(1); }
  await writeFile(file, s.replace(a, b), "utf8");
  done.push(`${file.split("/").pop()}:${name}`);
}

/* ═══ 1. Hjältesiffran kunde inte radbrytas ═══════════════════════════════════
   .hero-figure fanns på två ställen: olagrad i tokens.css och i @layer legacy i
   mobile.css. Olagrad CSS vinner över varje @layer, så tokens-regeln gällde och
   mobilregeln var död — inklusive `overflow-wrap: anywhere`, vars egen kommentar
   säger att ett sjusiffrigt tal måste brytas i stället för att flöda utanför.
   Det är samma kaskadfälla som en gång låg bakom hela CSS-konflikten här.
   En regel, på ett ställe, med den lägre undre gränsen från mobilvarianten.   */

await sub("app/tokens.css", "hero-figure",
`.hero-figure {
  font-size: clamp(44px, 13vw, 58px);
  font-weight: 500;
  line-height: 0.96;
  letter-spacing: -0.032em;
  font-variant-numeric: tabular-nums;
}`,
`.hero-figure {
  /* Undre gränsen är 38px, inte 44px: på en 320px-skärm tog 44px mer bredd än
     kortet hade. overflow-wrap är det som hindrar ett stort belopp från att
     skjuta ut ur ramen — den låg tidigare i ett @layer och nådde aldrig fram. */
  font-size: clamp(38px, 13vw, 58px);
  font-weight: 500;
  line-height: 0.98;
  letter-spacing: -0.032em;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}`);

await sub("app/mobile.css", "död-dubblett",
`@layer legacy {
.hero-figure {
  font-size: clamp(38px, 13vw, 60px);
  line-height: 1;
  letter-spacing: -0.035em;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;          /* a 7-figure number must wrap, not overflow */
}
}`,
`/* .hero-figure låg här, i @layer legacy, och förlorade varje gång mot den
   olagrade regeln i tokens.css. Den är hopslagen dit i stället — en regel på ett
   ställe. Lägg inte tillbaka en kopia här: allt i det här lagret förlorar. */`);

/* ═══ 2. recharts (9,3 MB) laddades direkt vid sidladdning ════════════════════
   MonthlyChart importerar recharts på modulnivå och DashboardClient importerar
   MonthlyChart rakt av, så hela diagrambiblioteket låg i förstaladdningen —
   253 kB mot ~170 kB för alla andra sidor. Diagrammet behövs först när det ska
   ritas, och panelen bakom vaul först när någon öppnar den.                   */

await sub("components/dashboard/DashboardClient.jsx", "dynamiska-importer",
`import MonthlyChart from "./MonthlyChart";
import MomsSheet from "./MomsSheet";`,
  [
    `import dynamic from "next/dynamic";`,
    ``,
    `/* recharts drar med sig d3 och victory-vendor — tillsammans nära 11 MB i`,
    `   node_modules och den enskilt största posten i förstaladdningen. Diagrammet`,
    `   ritas ändå först efter hydrering, så det får hämtas då. Platshållaren har`,
    `   exakt diagrammets höjd, annars hoppar sidan när det landar. */`,
    `const MonthlyChart = dynamic(() => import("./MonthlyChart"), {`,
    `  ssr: false,`,
    `  loading: () => (`,
    `    <div className="h-[210px] w-full animate-pulse rounded-[var(--radius-card)] bg-raised sm:h-[240px]" />`,
    `  ),`,
    `});`,
    ``,
    `/* Momspanelen ligger bakom vaul och syns inte förrän någon öppnar den. */`,
    `const MomsSheet = dynamic(() => import("./MomsSheet"), { ssr: false });`,
  ].join("\n"));

console.log("patched:\n  " + done.join("\n  "));
