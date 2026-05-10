export type KpiTone = 'positive' | 'negative' | 'info' | 'neutral' | 'boardbreaker' | 'extender'

export function KpiCard({ label, value, tone, hint, clickable = false, onClick }: { label: string; value: string; tone: KpiTone; hint?: string | null; clickable?: boolean; onClick?: () => void }) {
  const cls = `comparison-kpi-card comparison-kpi-${tone} grid gap-0.5 place-items-center px-2.5 py-2 text-center${clickable ? ' cursor-pointer hover:brightness-125 transition-[filter]' : ''}`

  if (clickable) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        <span className="text-[0.66rem] uppercase tracking-widest text-(--text-muted)">{label}</span>
        <strong className="text-[1rem] leading-none tabular-nums text-(--text-main)">{value}</strong>
        {hint ? <span className="text-[0.6rem] leading-none text-(--text-muted)">{hint}</span> : null}
      </button>
    )
  }

  return (
    <div className={cls}>
      <span className="text-[0.66rem] uppercase tracking-widest text-(--text-muted)">{label}</span>
      <strong className="text-[1rem] leading-none tabular-nums text-(--text-main)">{value}</strong>
      {hint ? <span className="text-[0.6rem] leading-none text-(--text-muted)">{hint}</span> : null}
    </div>
  )
}
