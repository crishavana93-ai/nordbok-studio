import { readFile, writeFile } from "node:fs/promises";

const F = "components/MomsBanner.jsx";
let s = await readFile(F, "utf8");
const done = [];
function sub(name, a, b) {
  const c = s.split(a).length - 1;
  if (c !== 1) { console.error(`FAIL ${name}: found ${c}`); process.exit(1); }
  s = s.replace(a, b); done.push(name);
}

/* Ett ✗ i hörnet av en ruta betyder "stäng" för alla som någonsin använt en
   dator. Det här var en statussymbol utan klickfunktion, så remsan såg ut att
   gå att stänga och gjorde det inte. Symbolen byts mot en som inte lovar något,
   och texten säger i stället när remsan försvinner av sig själv. */
sub("glyf",
`      <span aria-hidden="true" style={{ color: "var(--warn)", fontWeight: 600 }}>
        {varning ? "✗" : "?"}
      </span>`,
`      <span
        aria-hidden="true"
        style={{
          flex: "0 0 auto",
          width: 20, height: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 999,
          border: "1px solid var(--warn)",
          color: "var(--warn)",
          fontWeight: 700, fontSize: 13, lineHeight: 1,
        }}
      >
        {varning ? "!" : "?"}
      </span>`);

sub("förklaring",
`        <Knapp href={\`/moms?period=\${s.forsenade[0].key}\`}>Se perioden</Knapp>`,
`        <Knapp href={\`/moms?period=\${s.forsenade[0].key}\`}>Se perioden</Knapp>
        <span style={{ flexBasis: "100%", fontSize: 12, color: "var(--ink-3)" }}>
          Meddelandet försvinner när deklarationen är lämnad och registrerad.
        </span>`);

await writeFile(F, s, "utf8");
console.log("patched:", done.join(", "));
