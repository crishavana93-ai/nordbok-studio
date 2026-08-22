/* Credit-building 12-month plan — seeds a structured checklist into studio_tasks
   so the dashboard shows them and the cron digest reminds you. */

export const CREDIT_PLAN_STEPS = [
  // Week 1 — accounts
  { offsetDays: 1,  title: "Boka möte hos Swedbank-kontor i Malmö",
    description: "Ring 0771-22 11 22 eller boka via swedbank.se → Boka möte. Mål: öppna Företagspaket Bas för Hopkins Method (kräver inget UC, bara KYC).",
    priority: "high", category: "credit_plan", emoji: "🏦" },
  { offsetDays: 2, title: "Boka Almi rådgivning (digital)",
    description: "almi.se/boka-radgivare → Skåne → 'Du som vill starta företag'. Gratis möte, ~45 min, ingen UC-kontroll. Förbered: registreringsbevis, F-skatt-bevis, ID, kort affärsidé.",
    priority: "high", category: "credit_plan", emoji: "🤝" },
  { offsetDays: 3, title: "Skriv affärsplan (1–3 sidor)",
    description: "Använd Almis gratis mall (almi.se/planera). Innehåll: vad du erbjuder, målmarknad, prismodell, prognos 12 mån framåt, vad du behöver kapital till.",
    priority: "high", category: "credit_plan", emoji: "📝" },
  { offsetDays: 5, title: "Verifiera registreringsbevis + F-skatt för Hopkins Method",
    description: "Logga in på Bolagsverket Mina sidor → ladda ner registreringsbevis. Skatteverket Mina sidor → bekräfta F-skatt-godkännande. Spara i Arkiv-fliken.",
    priority: "high", category: "credit_plan", emoji: "📂" },
  { offsetDays: 7, title: "Genomför Swedbank-mötet i person",
    description: "Ta med: registreringsbevis, F-skatt-bevis, körkort/pass, senaste 3 månaders kontoutdrag (privat). Be om Företagspaket Bas. Om rådgivare tvekar — be att få träffa kontorschefen.",
    priority: "high", category: "credit_plan", emoji: "🚪" },

  // Month 2–3 — first revenue + Almi follow-up
  { offsetDays: 14, title: "Skicka första Hopkins Method-fakturan",
    description: "Även 5 000 kr räcker. Mål är att börja generera synlig bankaktivitet. Använd /invoices/new i appen.",
    priority: "high", category: "credit_plan", emoji: "🧾" },
  { offsetDays: 21, title: "Almi-möte genomfört",
    description: "Diskutera mikrolån (50–250k) eller startuplån. De avgör inte beslut första mötet — håll det öppet. Be om feedback på affärsplanen.",
    priority: "normal", category: "credit_plan", emoji: "💬" },
  { offsetDays: 45, title: "3+ fakturor skickade via Hopkins Method",
    description: "Bygger inkomststräng som syns i nästa UC-kontroll. Sätt in alla intäkter på företagskonto.",
    priority: "normal", category: "credit_plan", emoji: "📈" },

  // Month 4–6 — apply for Almi loan, build card history
  { offsetDays: 90, title: "Ansök om Företagskreditkort med låg gräns (5–10k)",
    description: "Eurocard, AmEx Business, eller bankens eget. Använd för faktiska företagsutgifter. Betala 100% varje månad — bygger snabbt positiv kreditfil.",
    priority: "normal", category: "credit_plan", emoji: "💳" },
  { offsetDays: 120, title: "Ansök om Almi mikrolån (50–150k)",
    description: "Vid det här laget har du 4 månaders aktivitet, en affärsplan, och Almi-rådgivare som känner dig. Ansök via almi.se → 'Ansök om finansiering'.",
    priority: "high", category: "credit_plan", emoji: "💰" },

  // Month 7–12 — major credit milestones
  { offsetDays: 150, title: "Inkomstdeklaration NE-bilaga (om kalenderåret-skifte)",
    description: "Använd appens data → exportera. Lämnas till Skatteverket senast 2 maj. Får din nya inkomst på UC-rapporten.",
    priority: "high", category: "credit_plan", emoji: "📄" },
  { offsetDays: 180, title: "Beställ ny UC-rapport och jämför",
    description: "Pay 39 kr eller skriv brev (gratis). Kolla att inkomst nu visar Hopkins Method-verksamhet. Notera UC-Risk-förändring.",
    priority: "normal", category: "credit_plan", emoji: "🔍" },
  { offsetDays: 270, title: "Ansök om större Kontokredit (100–300k)",
    description: "Med 9 månaders ren historia + Almi-lån avbetalat punktligt → din huvudbank borde nu acceptera. Kontokredit ger dig flexibilitet utan ränta tills du använder den.",
    priority: "normal", category: "credit_plan", emoji: "📊" },
  { offsetDays: 365, title: "Utvärdera AB-övergång om intäkter > 500k kr",
    description: "Konsultera revisor. AB ger begränsat ansvar — kritisk när skulder närmar sig 500k. Ombildning är skattefri enligt 23 kap. inkomstskattelagen.",
    priority: "low", category: "credit_plan", emoji: "🏢" },
];

/** Build task rows for inserting into studio_tasks. */
export function buildCreditPlan(userId, startDate = new Date()) {
  return CREDIT_PLAN_STEPS.map((s, i) => {
    const due = new Date(startDate.getTime() + s.offsetDays * 86400000);
    return {
      user_id: userId,
      title: `${s.emoji} ${s.title}`,
      description: s.description,
      due_at: due.toISOString(),
      remind_at: new Date(due.getTime() - 2 * 86400000).toISOString(), // remind 2 days before
      category: s.category,
      priority: s.priority,
      source: "credit_plan",
      status: "open",
    };
  });
}
