import type { CSSProperties, ReactNode } from 'react'

import { EASE_OUT, prefersReducedMotion } from '../../app/motion'
import { cx } from './cx'
import { RING_FILL_MS, useRingReveal } from './use-ring-reveal'
import { clamp01, ringCenterText, ringGeometry } from './ring-shared'

interface RingSegment {
  key: string
  /** 0 a 1: la parte del círculo que ocupa. */
  value: number
  /** "R G B" o `var(--x-rgb)`. */
  color: string
  /** Opacidad del arco (0 a 1): sirve para graduar intensidades de un mismo color. */
  opacity?: number
}

interface SegmentedRingProps {
  segments: ReadonlyArray<RingSegment>
  size?: number
  strokeWidth?: number
  /** Texto accesible: qué reparte el anillo y sus valores. */
  label: string
  /** Segmento resaltado (los demás se atenúan). */
  activeKey?: string | null
  /** Se llama al pasar el mouse (o tocar) un tramo del anillo. */
  onSegmentSelect?: (key: string) => void
  /** Ocupa todo su contenedor (un cuadrado) en vez de medir `size` px: `size` queda como la escala del dibujo (y del grosor). Lo usa el aro de los materiales de un Xyz, que crece con la carta. */
  fluid?: boolean
  children?: ReactNode
}

/** Anillo que reparte un total entre varios tramos (limpias / con problema / sin salida). Los tramos se llenan en orden, como una aguja. */
export function SegmentedRing({ segments, size = 160, strokeWidth, label, activeKey = null, onSegmentSelect, fluid = false, children }: SegmentedRingProps) {
  const { stroke, radius, circumference, center } = ringGeometry(size, strokeWidth)
  const { ref, revealed, settled, delayMs, instant: unseen } = useRingReveal<HTMLDivElement>()
  const total = segments.reduce((sum, segment) => sum + clamp01(segment.value), 0) || 1
  const visible = segments.filter((segment) => segment.value > 0.0005)
  // Con puntas redondas (como los demás anillos) cada tramo se achica lo que ocupan sus puntas, más 3 px de separación.
  const gap = visible.length > 1 ? 3 + stroke : 0
  const noMotion = unseen || prefersReducedMotion()
  let start = 0

  return (
    <div ref={ref} className={cx('relative inline-grid shrink-0 place-items-center', fluid && 'size-full', !settled && 'will-change-transform')} style={fluid ? undefined : { width: size, height: size }} role="img" aria-label={label}>
      <svg width={fluid ? '100%' : size} height={fluid ? '100%' : size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} className="stroke-tint/10" />
        {segments.map((segment) => {
          const share = clamp01(segment.value) / total
          const from = start
          start += share
          const length = Math.max(0, share * circumference - (share > 0.0005 ? gap : 0))
          const sweepMs = Math.max(160, share * RING_FILL_MS)
          const sweepDelay = from * RING_FILL_MS

          return (
            <circle
              key={segment.key}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              strokeWidth={stroke}
              strokeLinecap={revealed ? 'round' : 'butt'}
              onMouseEnter={onSegmentSelect ? () => onSegmentSelect(segment.key) : undefined}
              onClick={onSegmentSelect ? () => onSegmentSelect(segment.key) : undefined}
              strokeDasharray={`${revealed ? length : 0} ${circumference}`}
              strokeDashoffset={-(from * circumference + gap / 2)}
              style={
                {
                  stroke: `rgb(${segment.color})`,
                  opacity: activeKey && activeKey !== segment.key ? 0.5 : (segment.opacity ?? 1),
                  transition: noMotion ? 'none' : `stroke-dasharray ${sweepMs}ms linear ${settled ? 0 : delayMs + sweepDelay}ms, opacity 150ms ${EASE_OUT}`,
                } as CSSProperties
              }
            />
          )
        })}
      </svg>
      {children ? <span className={cx('absolute inset-0 grid place-content-center text-center tabular-nums text-foreground', ringCenterText(size))}>{children}</span> : null}
    </div>
  )
}
