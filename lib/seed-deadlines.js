/* Auto-seed Swedish tax-year deadlines for an enskild firma. */
import { TAX_2025 } from "./swedish-tax";

/**
 * Returns an array of tasks to insert for `year`.
 * Dates are chosen from Skatteverket's published business deadlines.
 */
export function buildTaxYearDeadlines(year, userId) {
  const yyyy = year;
  const mk = (date, title, category = "tax_deadline", priority = "high", description = "") => ({
    user_id: userId, title, description,
    due_at: new Date(date + "T08:00:00+01:00").toISOString(),
    remind_at: new Date(new Date(date).getTime() - 7 * 86400000).toISOString(),
    category, priority, source: "system",
  });

  return [
    // ─── Annual ────────────────────────────────────────────────────────────
    mk(`${yyyy}-01-31`, "Kontrolluppgifter (KU) — sista dag",
       "tax_deadline", "high", "Lämna kontrolluppgifter till Skatteverket för utbetalda löner/ersättningar."),
    mk(`${yyyy}-05-02`, "Inkomstdeklaration 1 + NE-bilaga",
       "tax_deadline", "high", `Deklarera ${yyyy - 1} (NE-bilaga). Sista dag normalt 2 maj.`),
    mk(`${yyyy}-12-31`, "Räkenskapsårets slut",
       "filing", "normal", "Stäng böcker, gör periodisering, kontrollera periodiseringsfond (max 30% av resultat)."),

    // ─── Moms — quarterly (om kvartalsredovisning) ────────────────────────
    mk(`${yyyy}-02-12`, "Momsdeklaration Q4 föregående år",
       "tax_deadline", "high", "Sista dag att lämna momsdeklaration för Q4 vid kvartalsredovisning."),
    mk(`${yyyy}-05-12`, "Momsdeklaration Q1",
       "tax_deadline", "high"),
    mk(`${yyyy}-08-17`, "Momsdeklaration Q2",
       "tax_deadline", "high"),
    mk(`${yyyy}-11-12`, "Momsdeklaration Q3",
       "tax_deadline", "high"),

    // ─── F-skatt månadsbetalning (recurring) ──────────────────────────────
    ...Array.from({ length: 12 }, (_, m) => {
      const d = `${yyyy}-${String(m + 1).padStart(2, "0")}-12`;
      return {
        user_id: userId,
        title: `Betala F-skatt — ${monthName(m)}`,
        description: "Debiterad preliminärskatt: betalning till Skatteverkets bankgiro 5050-1055.",
        due_at: new Date(d + "T08:00:00+01:00").toISOString(),
        remind_at: new Date(new Date(d).getTime() - 3 * 86400000).toISOString(),
        category: "tax_deadline",
        priority: "high",
        source: "system",
        recurring_rule: "FREQ=MONTHLY;BYMONTHDAY=12",
      };
    }),
  ];
}

function monthName(m) {
  return ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti", "september", "oktober", "november", "december"][m];
}
