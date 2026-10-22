import type { CSSProperties, ReactNode } from 'react'

import { useAnimatedNumber } from '../../app/life-effects'
import { EASE_OUT, prefersReducedMotion } from '../../app/motion'
import { cx } from './cx'
import { RING_FILL_MS, useRingReveal } from './use-ring-reveal'
import { RING_TRACK, clamp01, ringCenterText, ringGeometry } from './ring-shared'

interface RingSegment {
  key: string
  /** 0 a 1: la parte del círculo que ocupa. */
  value: number
  /** "R G B" o `var(--x-rgb)`: uno de `RING_ARC` (`ui/tone.ts`), que pasan 3:1 contra la tarjeta y la pista. */
  color: string
  /** Opacidad del arco (0 a 1): sirve para graduar intensidades de un mismo color. */
  opacity?: number
}

interface SegmentedRingProps {
  segments: ReadonlyArray<RingSegment>
  size?: number
  strokeWidth?: number
  /** Texto accesible: qué reparte el anillo y sus valores, en palabras. */
  label: string
  /** Segmento resaltado (los demás se atenúan). */
  activeKey?: string | null
  /** Se llama al pasar el mouse (o tocar) un tramo del anillo. */
  onSegmentSelect?: (key: string) => void
  /** Ocupa todo su contenedor (un cuadrado) en vez de medir `size` px: `size` queda como la escala del dibujo (y del grosor). Lo usan el aro de los materiales de un Xyz, que crece con la carta, y el protagonista del Lab (140 px en el celular, 184 en escritorio). */
  fluid?: boolean
  /** El centro es el primer tramo (el protagonista, el que arranca a las 12): `format` lo escribe y cuenta de 0 junto con su arco. `children` gana si viene. */
  format?: (value: number) => ReactNode
  children?: ReactNode
}

/** Avance parejo: el tramo se barre como una aguja (lineal), así que el número que lo acompaña también. */
const linear = (progress: number) => progress

/** Anillo que reparte un total entre varios tramos (buenas / con problema / sin salida). Los tramos se llenan en orden, como una aguja. */
export function SegmentedRing({ segments, size = 160, strokeWidth, label, activeKey = null, onSegmentSelect, fluid = false, format, children }: SegmentedRingProps) {
  const { stroke, radius, circumference, center } = ringGeometry(size, strokeWidth)
  const { ref, revealed, settled, delayMs, instant: unseen } = useRingReveal<HTMLDivElement>()
  const total = segments.reduce((sum, segment) => sum + clamp01(segment.value), 0) || 1
  const visible = segments.filter((segment) => segment.value > 0.0005)
  // Con puntas redondas (como los demás anillos) cada tramo se achica lo que ocupan sus puntas, más 3 px de separación.
  const gap = visible.length > 1 ? 3 + stroke : 0
  const noMotion = unseen || prefersReducedMotion()
  const lead = clamp01(segments[0]?.value ?? 0)
  const leadMs = Math.max(160, (lead / total) * RING_FILL_MS)
  let start = 0

  return (
    <div ref={ref} className={cx('relative inline-grid shrink-0 place-items-center', fluid && 'size-full', !settled && 'will-change-transform')} style={fluid ? undefined : { width: size, height: size }} role="img" aria-label={label}>
      <svg width={fluid ? '100%' : size} height={fluid ? '100%' : size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} className={RING_TRACK} />
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
      {children ? (
        <span className={cx('absolute inset-0 grid place-content-center text-center tabular-nums text-foreground', ringCenterText(size))}>{children}</span>
      ) : format ? (
        <span className={cx('absolute inset-0 grid place-content-center text-center tabular-nums text-foreground', ringCenterText(size))}>
          <LeadValue target={revealed ? lead : 0} ms={noMotion ? 0 : leadMs} delay={settled ? 0 : delayMs} format={format} />
        </span>
      ) : null}
    </div>
  )
}

/** El número del tramo protagonista mientras se barre: el mismo tiempo, el mismo retraso y el mismo avance (lineal) que su arco. El reparto exacto va en `label`. */
function LeadValue({ target, ms, delay, format }: { target: number; ms: number; delay: number; format: (value: number) => ReactNode }) {
  const counted = useAnimatedNumber(target, { ms, delay, ease: linear, round: false })

  return <>{format(counted)}</>
}
