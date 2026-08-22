# Patch: per-rate VAT breakdown in `lib/invoice-html.js`

The current totals block shows one combined `vat_amount`. That is **not compliant**
for an invoice carrying more than one VAT rate — which every invoice mixing the
magazine (6%) with accessories (25%) will do.

## 1. Add the import

At the top of `lib/invoice-html.js`, next to the existing currency import:

```js
import { fmtMoney, fmtDate } from "./currency";
import { vatBreakdown } from "./invoice-compliance";   // ← add
```

## 2. Add two labels to each translation block

In `T.sv`:

```js
    taxable_base: "Beskattningsunderlag",
    vat_rate: "Momssats",
```

In `T.en`:

```js
    taxable_base: "Taxable amount",
    vat_rate: "VAT rate",
```

## 3. Compute the breakdown

Inside `renderInvoiceHTML`, just after the `totalDays` line:

```js
  // Prefer the frozen breakdown stored at send time; fall back to recomputing.
  const bd = invoice.vat_breakdown
    ? { rows: invoice.vat_breakdown }
    : vatBreakdown(items);
  const rateRows = (bd.rows || []).filter((r) => Number(r.net) !== 0);
  const showBreakdown = rateRows.length > 1;
```

## 4. Replace the totals block

Find this:

```html
<div class="totals">
  <table>
    <tbody>
      <tr><td>${t.subtotal}</td><td class="num">${f(invoice.subtotal)}</td></tr>
      <tr><td>${t.vat_amount}</td><td class="num">${f(invoice.vat_amount)}</td></tr>
```

Replace those two `<tr>` lines with:

```html
      ${showBreakdown
        ? rateRows.map((r) => `
            <tr>
              <td>${t.taxable_base} ${esc(r.rate)}%</td>
              <td class="num">${f(r.net)}</td>
            </tr>
            <tr>
              <td style="color:#8a8a90">${t.vat_amount} ${esc(r.rate)}%</td>
              <td class="num" style="color:#8a8a90">${f(r.vat)}</td>
            </tr>`).join("")
        : `<tr><td>${t.subtotal}</td><td class="num">${f(invoice.subtotal)}</td></tr>
           <tr><td>${t.vat_amount}</td><td class="num">${f(invoice.vat_amount)}</td></tr>`}
```

Leave the ROT/RUT rows and the `grand` row exactly as they are.

## What this produces

**Single-rate invoice** — unchanged, still reads:

```
Delsumma           12 000,00 kr
Moms                3 000,00 kr
Att betala         15 000,00 kr
```

**Mixed-rate invoice** — now legally complete:

```
Beskattningsunderlag 25%    12 000,00 kr
Moms 25%                     3 000,00 kr
Beskattningsunderlag 6%       2 000,00 kr
Moms 6%                         120,00 kr
Att betala                   17 120,00 kr
```

## 5. Two small wording fixes while you're in the file

**a.** The seller identifier is labelled `Personnr`. On an invoice it should read
**Org.nr** — for an enskild firma the number is the same, but `Org.nr` is what a
client's accounts-payable team expects to see:

```js
${lang === "sv" ? "Org.nr" : "Company ID"}: ${esc(settings?.org_nr || settings?.personnummer || "—")}
```

**b.** The reverse-charge note says *"Omvänd skattskyldighet"*. The current statutory
term in the Swedish VAT Act is **"Omvänd betalningsskyldighet"**. Update both
`T.sv.reverse_charge_note` and the English gloss's Swedish counterpart. The old
wording isn't fatal, but a correct invoice uses the current term.
