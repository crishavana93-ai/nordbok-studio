import Link from "next/link";

export const metadata = { title: "Hjälp & funktioner" };

const sections = [
  {
    icon: "🏠",
    href: "/dashboard",
    title: "Dashboard",
    blurb: "Din morgondashboard. Här ser du allt som hänt i år: pengar in, pengar ut, vad du sannolikt ska betala i skatt, och vilka kvitton som väntar på granskning.",
    use: ["Översikt över YTD-siffror.", "Snabbknappar för 'Ny faktura', 'Scanna kvitto', 'Logga resa'.", "'Skicka veckorapport nu' om du inte vill vänta till måndag."],
  },
  {
    icon: "🧾",
    href: "/invoices",
    title: "Fakturor",
    blurb: "Skicka professionella fakturor som följer svensk lag. Funkar lika bra för svenska kunder (med F-skatt-stämpel + moms) som för UK/US-kunder (på engelska, i USD/GBP utan moms).",
    use: [
      "Klicka 'Ny faktura'. Välj kund — om du saknar kunden klickar du '+ Ny' och fyller i på 30 sekunder.",
      "ROT/RUT? Aktivera under 'Avancerat' — appen lägger till fastighetsbeteckning automatiskt och räknar av rätt andel — 30 % för ROT, 50 % för RUT.",
      "Skickar du till EU-företag med VAT-nummer? Reverse-charge slås på automatiskt och 'Köparen redovisar moms' skrivs ut på fakturan.",
      "Spara som utkast eller skicka direkt via e-post (din kund får ett snyggt mail med PDF-utseende och OCR-nummer).",
    ],
  },
  {
    icon: "📸",
    href: "/receipts",
    title: "Kvitton",
    blurb: "Snappa kvittot med kameran direkt när du betalt. AI:n läser av leverantör, datum, belopp, moms och föreslår vilket BAS-konto + NE-rad det ska bokföras på. Du tittar igenom och klickar Spara.",
    use: [
      "Klicka 'Scanna med kamera' — telefonen öppnar kameran, du tar bilden, AI:n läser av på 5 sekunder.",
      "Granska siffrorna (om något ser fel ut: ändra), bekräfta kategori (resor, IT-tjänster, kontorsmaterial...).",
      "Markera som 'Privat' om kvittot inte hör till företaget.",
      "Originalbilden lagras i 7 år (Bokföringslagen).",
    ],
  },
  {
    icon: "🚗",
    href: "/mileage",
    title: "Körjournal",
    blurb: "Skatteverket vill ha en körjournal för varje resa du gör i tjänsten. Här loggar du datum, från, till, syfte, km och regnr — och appen räknar avdraget åt dig (25 kr/mil för privatbil i tjänsten 2026).",
    use: [
      "Klicka '+ Logga resa' efter mötet medan du minns syftet.",
      "Skriv något konkret som syfte: 'Kundmöte Acme AB' — inte bara 'jobb'. Skatteverket vill se vem du träffade.",
      "Lägg in mätarställning vid årets början och slut — då kan Skatteverket se att din loggade total stämmer.",
    ],
  },
  {
    icon: "👥",
    href: "/clients",
    title: "Kunder",
    blurb: "Adressboken för dina fakturakunder. När du väljer land (SE, UK, US, DE...) gissar appen rätt valuta och momsregler.",
    use: [
      "Lägg till kontaktperson, e-post, organisationsnr/personnr.",
      "ROT-kunder: fyll i fastighetsbeteckning. RUT-i-bostadsrätt: fyll i BRF org-nr.",
      "EU B2B med VAT-nummer? Appen aktiverar reverse-charge automatiskt nästa gång du fakturerar dem.",
    ],
  },
  {
    icon: "🏦",
    href: "/bank",
    title: "Bank",
    blurb: "Importera dina kontoutdrag som CSV — Swedbank, SEB, Handelsbanken, Nordea och Revolut funkar. Listan kan sen matchas mot fakturor och kvitton.",
    use: [
      "Logga in i din bank → exportera transaktioner som CSV → dra hit eller klicka 'Importera CSV'.",
      "Automatisk PSD2-koppling kommer i v1.5.",
    ],
  },
  {
    icon: "📂",
    href: "/documents",
    title: "Arkiv",
    blurb: "Det digitala kontorsarkivet. Här ligger sådant som inte är fakturor eller kvitton — registreringsbevis, hyresavtal, försäkringspapper, årsredovisningar, ID-handlingar. Allt sparas automatiskt i 7 år (Bokföringslagen).",
    use: [
      "Ladda upp PDF/bild → välj typ (avtal, registreringsbevis, bankutdrag...) → tagga.",
      "När du raderar varnar appen så att du inte råkar ta bort något du måste arkivera.",
    ],
  },
  {
    icon: "⏰",
    href: "/deadlines",
    title: "Deadlines",
    blurb: "Klicka 'Importera Skatteverket-deadlines' EN gång → så är hela årets skattekalender på plats: moms Q1–Q4, NE-bilaga (2 maj), kontrolluppgifter (31 jan), F-skatt 12:e varje månad.",
    use: [
      "Lägg till egna påminnelser ('skicka offert till X', 'förnya domän').",
      "Snooze om något ska skjutas upp.",
      "På måndagar (08:00 svensk tid) får du ett mail med vad som väntar nästa två veckor.",
      "På telefonen: aktivera 'Push-notiser' på dashboarden — då pingar telefonen dig dagen innan en deadline.",
    ],
  },
  {
    icon: "🤖",
    href: "/assistant",
    title: "Assistent",
    blurb: "Chatta med en AI-assistent som ser hela din bokföring. Den svarar på svenska och kan referera till Skatteverkets regler.",
    use: [
      "'Vad har jag för vinst hittills i år?' — den räknar.",
      "'Vilka fakturor är förfallna?' — den listar dem med belopp och kund.",
      "'Kan jag dra av min Berlin-resa?' — den förklarar reglerna och tittar på syftet du loggat.",
      "'Sammanställ mina avdrag per BAS-konto.' — den grupperar och summerar.",
    ],
  },
  {
    icon: "⚙️",
    href: "/settings",
    title: "Inställningar",
    blurb: "Företagsuppgifter, betalningsuppgifter, valuta, språk, notisinställningar.",
    use: [
      "Personnummer/orgnr — appen kollar att de stämmer (Luhn-algoritm).",
      "Standardvaluta — sätter default på nya fakturor (kan alltid ändras per faktura).",
      "Notiser — bestäm om du vill ha veckorapport, deadline-notiser, push-notiser.",
    ],
  },
];

const glossary = [
  { term: "F-skatt", what: "Företagsskatt — det godkännande från Skatteverket som visar att du själv betalar in din skatt. Visas som stämpel på fakturor." },
  { term: "Moms (VAT)", what: "Mervärdesskatt. 25% standard, 12% mat/hotell, 6% böcker/transport. Du tar in det av kund och betalar vidare till Skatteverket." },
  { term: "Momsregistreringsnummer", what: "'SE' + ditt personnummer (10 siffror) + '01'. Appen bygger det åt dig." },
  { term: "BAS-konto", what: "Den svenska kontoplanen som svenska bokförare använder. T.ex. 5800 = Resekostnader. Appen föreslår rätt konto för varje kvitto." },
  { term: "NE-bilaga", what: "Bilagan du fyller i när du deklarerar enskild firma. Sammanställning av intäkter och kostnader. Sista dag: 2 maj varje år." },
  { term: "OCR-nummer", what: "Det 7+1-siffriga betalningsnumret kunden anger när de betalar via Bankgiro. Appen genererar med rätt kontrollsiffra (mod-10)." },
  { term: "ROT/RUT", what: "Skattereduktion på arbetskostnaden för bostäder (ROT = renovering, RUT = städning). Kunden får 30 % avdrag på ROT-arbete och 50 % på RUT, du får mellanskillnaden direkt från Skatteverket. Taket är 75 000 kr per person och år, varav högst 50 000 kr får vara ROT." },
  { term: "Reverse-charge / Omvänd skattskyldighet", what: "Vid B2B-försäljning till EU-företag med VAT-nummer redovisar köparen momsen, inte säljaren. Du fakturerar 0%." },
  { term: "OSS (One-Stop-Shop)", what: "EU:s system för B2C-försäljning till andra länder. Du måste registrera dig om du säljer för mer än 99 680 kr/år till EU-konsumenter." },
  { term: "Körjournal", what: "Skatteverkets krav på loggbok per resa: datum, från, till, syfte, km, regnr. Krav för avdrag på bilkörning." },
  { term: "Traktamente", what: "Schablonbelopp för måltider på tjänsteresa. 290 kr/dag inrikes 2026. Per land utomlands (Berlin 549, London 561, NYC 700)." },
  { term: "Periodiseringsfond", what: "Du kan skjuta upp att betala skatt på max 30% av vinsten varje år, i upp till 6 år. Hjälper när inkomsten varierar." },
  { term: "Egenavgifter", what: "Sociala avgifter du betalar som egenföretagare. 28,97% på resultatet. Skatteverket räknar med 25% schablonavdrag på dem (max 50 600 kr/år)." },
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-3">

      <div>
        <h1 className="text-[21px] font-medium tracking-[-0.015em]">Hjälp</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Vad varje del av appen gör, och varför den finns.
        </p>
      </div>

      <Link href="/help/avdrag"
        className="rounded-[var(--radius-card)] border border-border-firm bg-surface p-4 sm:p-5">
        <span className="micro-label">Guide</span>
        <p className="mt-1.5 text-[15.5px] font-medium tracking-[-0.01em]">Vad är avdragsgillt?</p>
        <p className="mt-1 text-[13px] leading-relaxed text-ink-2">
          Resor, måltider, IT, hemkontor, representation och OSS — med BAS-konton och
          de belopp som gäller i år.
        </p>
      </Link>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Från noll till första fakturan</h2>
        <ol className="mt-3 flex flex-col">
          {[
            ["Inställningar", "Företagsnamn, personnummer, F-skatt och ett betalsätt. Utan betalsätt stoppas fakturan innan den skickas.", "/settings"],
            ["Kunder", "Namn och adress krävs enligt mervärdesskattelagen innan du kan fakturera någon.", "/clients"],
            ["Ny faktura", "Välj kund, lägg till en rad, spara utkastet. Numret tilldelas först vid utskicket.", "/invoices/new"],
            ["Deadlines", "Importera Skatteverkets datum — moms Q1–Q4, NE-bilaga och F-skatt.", "/deadlines"],
            ["Kvitton", "Fotografera kvittot direkt när du betalar. Bilden ÄR verifikationen sedan 2024.", "/receipts"],
          ].map(([title, why, href], i) => (
            <li key={href} className="grid grid-cols-[24px_1fr] gap-3 border-b border-border py-3 last:border-b-0">
              <span aria-hidden="true" className="mt-[1px] font-mono text-[12px] text-ink-3">{i + 1}</span>
              <span>
                <Link href={href} className="text-[14px] font-medium text-ink underline decoration-border-firm underline-offset-2">
                  {title}
                </Link>
                <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-2">{why}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="px-1 text-[15.5px] font-medium tracking-[-0.01em]">Sektion för sektion</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {sections.map((s) => (
            <Link key={s.href} href={s.href}
              className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface p-4">
              <h3 className="text-[14.5px] font-medium tracking-[-0.01em]">{s.title}</h3>
              <p className="text-[12.5px] leading-relaxed text-ink-2">{s.blurb}</p>
              <ul className="flex flex-col gap-1 text-[12.5px] leading-relaxed text-ink-3">
                {s.use.map((u, i) => <li key={i}>· {u}</li>)}
              </ul>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Ordlista</h2>
        <p className="mt-1 text-[12.5px] text-ink-3">
          Termerna behålls på svenska — ”ruta 48” går att söka på hos Skatteverket, det gör inte ”box 48”.
        </p>
        <dl className="mt-3 flex flex-col">
          {glossary.map((g) => (
            <div key={g.term} className="grid gap-1 border-b border-border py-3 last:border-b-0 sm:grid-cols-[190px_1fr] sm:gap-4">
              <dt className="text-[13.5px] font-medium text-ink">{g.term}</dt>
              <dd className="m-0 text-[13px] leading-relaxed text-ink-2">{g.what}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5">
        <h2 className="text-[15.5px] font-medium tracking-[-0.01em]">Vad appen gör åt dig</h2>
        <ul className="mt-3 flex flex-col gap-2.5 text-[13px] leading-relaxed text-ink-2">
          <li>· <span className="font-medium text-ink">Veckorapport</span> på mejl varje måndag — året hittills, förfallna fakturor och kommande deadlines.</li>
          <li>· <span className="font-medium text-ink">Påminnelse</span> skapas tre dagar efter en fakturas förfallodatum om den inte är betald.</li>
          <li>· <span className="font-medium text-ink">Kontroll före utskick</span> — en faktura som saknar något mervärdesskattelagen kräver skickas inte alls.</li>
          <li>· <span className="font-medium text-ink">Fakturanummer</span> tilldelas vid utskicket, under lås, så serien aldrig får luckor.</li>
          <li>· <span className="font-medium text-ink">Sju års arkivering</span> med kontrollsummor, så en kvittobild bevisligen är den som bokfördes.</li>
        </ul>
        <p className="mt-3.5 border-t border-border pt-3 text-[12px] leading-relaxed text-ink-3">
          Push-notiser är inte igång ännu. Delad åtkomst för revisor ger läsrätt, aldrig skrivrätt.
        </p>
      </section>

      <p className="px-1 pb-2 text-[12.5px]">
        <a href="https://www.skatteverket.se" target="_blank" rel="noreferrer" className="text-ink-3 underline">
          Officiella regler hos Skatteverket →
        </a>
      </p>
    </div>
  );
}
