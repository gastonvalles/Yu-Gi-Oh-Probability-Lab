import type { ProConEntry } from '../../app/build-comparison'

interface ProConSectionProps {
  prosA: ProConEntry[]
  contrasA: ProConEntry[]
  prosB: ProConEntry[]
  contrasB: ProConEntry[]
}

export function ProConSection({ prosA, contrasA, prosB, contrasB }: ProConSectionProps) {
  if (prosA.length === 0 && contrasA.length === 0 && prosB.length === 0 && contrasB.length === 0) {
    return null
  }

  return (
    <div className="grid gap-2">
      <ProConGroup label="Pros Build A" entries={prosA} type="pro" />
      <ProConGroup label="Contras Build A" entries={contrasA} type="contra" />
      <ProConGroup label="Pros Build B" entries={prosB} type="pro" />
      <ProConGroup label="Contras Build B" entries={contrasB} type="contra" />
    </div>
  )
}

function ProConGroup({ label, entries, type }: { label: string; entries: ProConEntry[]; type: 'pro' | 'contra' }) {
  if (entries.length === 0) return null

  return (
    <div className="grid gap-0.5">
      <span className="text-[0.62rem] uppercase tracking-widest text-(--text-muted)">{label}</span>
      {entries.map((entry, i) => (
        <div key={i} className="flex items-start gap-1.5 px-1 py-0.5">
          <span
            className={type === 'pro' ? 'shrink-0 text-[0.72rem] text-green-400' : 'shrink-0 text-[0.72rem] text-red-400'}
            aria-hidden="true"
          >
            {type === 'pro' ? '✓' : '✗'}
          </span>
          <span className="text-[0.72rem] leading-[1.3] text-(--text-main)">{entry.text}</span>
        </div>
      ))}
    </div>
  )
}
