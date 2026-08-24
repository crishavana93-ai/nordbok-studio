/* app/not-found.js — a 404 that says where to go instead of nothing at all. */
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-4 py-14">
      <span className="micro-label">404</span>
      <h1 className="text-[21px] font-medium tracking-[-0.015em]">Sidan finns inte</h1>
      <p className="text-[14px] leading-relaxed text-ink-2">
        Adressen leder ingenstans. Om du följde en länk från en faktura eller ett kvitto
        kan posten ha tagits bort.
      </p>
      <Link href="/dashboard"
        className="mt-2 self-start rounded-[var(--radius-ctl)] bg-brand px-4 py-2.5 text-[14px] font-semibold text-brand-ink">
        Till översikten
      </Link>
    </div>
  );
}
