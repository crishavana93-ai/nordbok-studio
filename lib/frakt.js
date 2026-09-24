/* lib/frakt.js — the freight/forwarder checklist.
 *
 * A payment to a forwarder is only deductible with the right paper behind it, and
 * which paper depends on one fact: did you buy a SERVICE from them, or are they
 * moving GOODS for you? The user answers that once per payment; the checklist
 * follows from it.
 *
 * State lives in studio_bank_tx.category (unused until now), encoded as
 *   "frakt:<tjanst|varor>:<comma-separated done keys>"
 * so no migration is needed. The invoice item is never ticked by hand — it is done
 * when the bank line is matched to a receipt/invoice record, because a tick without
 * the document is exactly the gap this checklist exists to close.
 */

const FORWARDERS = [
  "clasquin", "intercargo", "dhl", "dsv", "schenker", "kuehne", "kühne", "nagel", "maersk",
  "expeditors", "ceva", "bollor", "geodis", "fedex", "ups ", "tnt", "postnord", "db cargo",
  "panalpina", "agility", "nippon express", "yusen", "rhenus", "dachser", "hellmann", "kerry logistics",
  "freight", "cargo", "logistic", "forwarding", "spedition", "shipping", "transitario", "aduana", "customs",
];

export function isForwarder(description) {
  const d = ` ${String(description || "").toLowerCase()} `;
  return FORWARDERS.some((k) => d.includes(k));
}

export const ITEMS = {
  tjanst: [
    { key: "faktura", auto: true, label: "Faktura till ditt företag med ditt momsnummer", why: "Säljarens namn, adress och momsnummer, fakturanummer, datum, vad tjänsten är och beloppet. Från ett EU-företag: 'reverse charge' i stället för utländsk moms." },
    { key: "avtal", label: "Avtal, offert eller orderbekräftelse", why: "Visar vad du beställde och till vilket pris innan du betalade." },
    { key: "leverans", label: "Bevis att tjänsten utförts", why: "Leveransbekräftelse, rapport, inloggning, e-post — något som visar att du fick det du betalade för." },
    { key: "syfte", label: "Affärssyfte på en rad", why: "Varför verksamheten behövde tjänsten. Skriv det i kvittots beskrivning." },
  ],
  varor: [
    { key: "faktura", auto: true, label: "Speditörens faktura till ditt företag", why: "Med ditt momsnummer och uppdelning: frakt, förtullning, utlagd tull och importmoms." },
    { key: "fraktsedel", label: "Fraktsedel (AWB, B/L eller CMR)", why: "Visar att sändningen fanns: avsändare, mottagare (du), gods och vikt." },
    { key: "varufaktura", label: "Leverantörens faktura för varorna", why: "Speditören flyttar bara varorna. Köpet i sig är en egen verifikation." },
    { key: "tull", label: "Tulldeklaration (vid import utanför EU)", why: "Underlag för importmomsen (ruta 50, 60, 48) och tullen. Bocka av även om varorna kom från ett EU-land." },
    { key: "syfte", label: "Affärssyfte på en rad", why: "Vad varorna ska användas till: säljas (lager) eller användas i verksamheten." },
  ],
};

export function readState(category) {
  const m = String(category || "").match(/^frakt:(tjanst|varor):?(.*)$/);
  if (!m) return { kind: null, done: new Set() };
  return { kind: m[1], done: new Set(m[2] ? m[2].split(",") : []) };
}

export function writeState(kind, done) {
  return `frakt:${kind}:${[...done].filter(Boolean).join(",")}`;
}

/** { total, klara, saknas[] } for one bank line. */
export function progress(tx) {
  const { kind, done } = readState(tx.category);
  if (!kind) return { kind: null, total: null, klara: 0, saknas: ["Välj tjänst eller varor"] };
  const items = ITEMS[kind];
  const hasDoc = !!(tx.matched_receipt || tx.matched_invoice);
  const ok = (it) => (it.auto ? hasDoc : done.has(it.key));
  return { kind, total: items.length, klara: items.filter(ok).length, saknas: items.filter((it) => !ok(it)).map((it) => it.label) };
}
