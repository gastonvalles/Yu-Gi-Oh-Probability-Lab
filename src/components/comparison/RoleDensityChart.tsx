import type { GroupedRoleDensity, RoleDensityEntry } from '../../app/build-comparison'
import { getCardRoleDefinition } from '../../app/deck-groups'
import { formatInteger } from '../../app/utils'
import type { CardRole } from '../../types'

// ── Semantic colors per role ──

const ROLE_COLORS: Record<CardRole, string> = {
  starter: '#22c55e',       // green
  extender: '#4ade80',      // light green
  enabler: '#a3e635',       // lime
  handtrap: '#3b82f6',      // blue
  disruption: '#6366f1',    // indigo
  boardbreaker: '#f97316',  // orange
  floodgate: '#8b5cf6',     // violet
  removal: '#ec4899',       // pink
  searcher: '#06b6d4',      // cyan
  draw: '#14b8a6',          // teal
  recovery: '#facc15',      // yellow
  combo_piece: '#a855f7',   // purple
  payoff: '#d946ef',        // fuchsia
  brick: '#ef4444',         // red
  garnet: '#f87171',        // light red
  tech: '#94a3b8',          // slate
}

function getRoleColor(role: CardRole): string {
  return ROLE_COLORS[role] ?? '#6b7280'
}

// ── Public interface ──

interface RoleDensityChartProps {
  grouped: GroupedRoleDensity
  variant: 'full' | 'compact'
  label?: string
  /** Called when any pie segment is clicked. Receives the CardRole. */
  onSegmentClick?: (role: CardRole) => void
}

// ── Pie chart types ──

export interface PieSegment {
  startAngle: number
  endAngle: number
  color: string
  label: string
  shortLabel: string
  count: number
  density: number
  pct: string
  role: CardRole
}

// ── Pie chart helpers (exported for testing) ──

export function computePieSegments(
  entries: RoleDensityEntry[],
): PieSegment[] {
  const totalDensity = entries.reduce((s, e) => s + e.density, 0)
  if (totalDensity <= 0) return []

  const segments: PieSegment[] = []
  let currentAngle = -90

  for (const entry of entries) {
    const angle = (entry.density / totalDensity) * 360
    const definition = getCardRoleDefinition(entry.role)
    const pct = `${(entry.density * 100).toFixed(1)}%`

    segments.push({
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: getRoleColor(entry.role),
      label: definition.label,
      shortLabel: definition.shortLabel,
      count: entry.count,
      density: entry.density,
      pct,
      role: entry.role,
    })
    currentAngle += angle
  }

  return segments
}

export function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const x1 = cx + r * Math.cos(rad(startAngle))
  const y1 = cy + r * Math.sin(rad(startAngle))
  const x2 = cx + r * Math.cos(rad(endAngle))
  const y2 = cy + r * Math.sin(rad(endAngle))
  const largeArc = endAngle - startAngle > 180 ? 1 : 0

  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
}

// ── PieChart SVG component ──

function PieChart({
  segments,
  onSegmentClick,
}: {
  segments: PieSegment[]
  onSegmentClick?: (role: CardRole) => void
}) {
  const cx = 50
  const cy = 50
  const r = 46

  const handleClick = (seg: PieSegment) => {
    if (onSegmentClick) {
      onSegmentClick(seg.role)
    }
  }

  // Single segment → full circle
  if (segments.length === 1) {
    const seg = segments[0]
    const tooltipText = `${seg.label}: ${formatInteger(seg.count)}`
    return (
      <svg viewBox="0 0 100 100" className="mx-auto block w-full max-w-[140px] aspect-square" role="img" aria-label="Gráfico de densidad de roles">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill={seg.color}
          className="cursor-pointer transition-opacity hover:opacity-80"
          onClick={() => handleClick(seg)}
        >
          <title>{tooltipText}</title>
        </circle>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 100 100" className="mx-auto block w-full max-w-[140px] aspect-square" role="img" aria-label="Gráfico de densidad de roles">
      {segments.map((seg, i) => {
        const angleDiff = seg.endAngle - seg.startAngle
        const tooltipText = `${seg.label}: ${formatInteger(seg.count)}`

        if (angleDiff >= 359.99) {
          const mid = seg.startAngle + angleDiff / 2
          const d1 = describeArc(cx, cy, r, seg.startAngle, mid)
          const d2 = describeArc(cx, cy, r, mid, seg.endAngle)
          return (
            <g key={i} className="cursor-pointer transition-opacity hover:opacity-80" onClick={() => handleClick(seg)}>
              <path d={d1} fill={seg.color}>
                <title>{tooltipText}</title>
              </path>
              <path d={d2} fill={seg.color}>
                <title>{tooltipText}</title>
              </path>
            </g>
          )
        }

        const d = describeArc(cx, cy, r, seg.startAngle, seg.endAngle)
        return (
          <path
            key={i}
            d={d}
            fill={seg.color}
            className="cursor-pointer transition-opacity hover:opacity-80"
            onClick={() => handleClick(seg)}
          >
            <title>{tooltipText}</title>
          </path>
        )
      })}
    </svg>
  )
}

// ── PieLegend component ──

function PieLegend({
  segments,
  variant,
  onSegmentClick,
}: {
  segments: PieSegment[]
  variant: 'full' | 'compact'
  onSegmentClick?: (role: CardRole) => void
}) {
  const compact = variant === 'compact'

  return (
    <div role="list" className="grid gap-0.5">
      {segments.map((seg, i) => {
        const tooltipText = `${seg.label}: ${formatInteger(seg.count)}`
        return (
          <div
            key={i}
            role="listitem"
            title={tooltipText}
            className="flex items-center gap-1.5 cursor-pointer hover:brightness-125 transition-[filter]"
            onClick={onSegmentClick ? () => onSegmentClick(seg.role) : undefined}
          >
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            {compact ? (
              <>
                <span className="truncate text-[0.62rem] text-(--text-muted)">{seg.shortLabel}</span>
                <span className="ml-auto shrink-0 text-[0.62rem] tabular-nums text-(--text-main)">{seg.pct}</span>
              </>
            ) : (
              <>
                <span className="truncate text-[0.68rem] text-(--text-muted)">{seg.label}</span>
                <span className="ml-auto shrink-0 text-[0.66rem] tabular-nums text-(--text-main)">
                  {formatInteger(seg.count)} · {seg.pct}
                </span>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main export ──

export function RoleDensityChart({ grouped, variant: _variant, label, onSegmentClick }: RoleDensityChartProps) {
  const allEntries = grouped.visible

  if (allEntries.length === 0) return null

  const segments = computePieSegments(allEntries)
  if (segments.length === 0) return null

  return (
    <div className="grid gap-1">
      {label ? (
        <span className="text-[0.66rem] uppercase tracking-widest text-(--text-muted)">{label}</span>
      ) : null}
      <PieChart segments={segments} onSegmentClick={onSegmentClick} />
    </div>
  )
}
