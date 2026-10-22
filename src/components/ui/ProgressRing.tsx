import type { CSSProperties, ReactNode } from 'react'

import { useAnimatedNumber } from '../../app/life-effects'
import { easeSnap } from '../../app/motion'
import { cx } from './cx'
import { RING_MIN_NUMBER_SIZE, RING_TRACK, RING_TRACK_ON_BRAND, RING_TRANSITION, RING_UNMEASURED_DASH, clamp01, formatPer100, ringCenterText, ringGeometry } from './ring-shared'
import { RING_ARC, type Tone } from './tone'
import { RING_FILL_MS, useRingReveal } from './use-ring-reveal'

interface ProgressRingProps {
  /** 0 a 1. */
  value: number
  /** Qué dice el color del arco (ver los cinco anillos en `ui/tone.ts`); por defecto el lila de lo tuyo. `onBrand` es para la tarjeta índigo de la navegación. */
  tone?: Tone | 'onBrand'
  /** Color propio ("R G B" o `var(--x-rgb)`), p. ej. el de un rol; reemplaza al tono. Tiene que dar 3:1 contra la tarjeta y la pista. */
  color?: string
  /** Diámetro en px: 140 (celular) a 184 (escritorio) el protagonista, 56 a 88 en una tarjeta y 36 a 44 en una lista o una opción; con menos de 36 no lleva número. */
  size?: number
  strokeWidth?: number
  /** Nombre accesible: qué mide y su valor con el decimal («Yendo 1º: 78,3 %»). */
  label: string
  /** El valor en palabras para el lector de pantalla (`aria-valuetext`), p. ej. «78 de cada 100». */
  valueText?: string
  /** Marcas sobre el anillo (0 a 1). */
  ticks?: ReadonlyArray<number>
  /** Milisegundos de espera antes de llenarse (para escalonar varios anillos). */
  delay?: number
  /** Contenido fijo del centro; por defecto el número «de cada 100», entero y sin «%» (`formatPer100`). */
  children?: ReactNode
  /** Cómo se escribe el centro según el valor (0 a 1). Desde 64 px el número cuenta de 0 junto con el arco; más chico, aparece con su valor. */
  format?: (value: number) => ReactNode
  /** Todavía no se puede medir (falta clasificar): la pista punteada, sin arco y «?» al centro. Es una imagen, no un medidor: `label` tiene que decirlo. */
  unmeasured?: boolean
}

/** Anillo de progreso que se llena al aparecer, con su número al centro. Es la única forma de mostrar un porcentaje en la app. */
export function ProgressRing({ value, tone = 'brand', color, size = 42, strokeWidth, label, valueText, ticks, delay = 0, children, format, unmeasured = false }: ProgressRingProps) {
  const clamped = clamp01(value)
  const { stroke, radius, circumference, center } = ringGeometry(size, strokeWidth)
  const { ref, revealed, settled, delayMs, instant } = useRingReveal<HTMLDivElement>(delay)
  const shown = revealed ? clamped : 0
  const onBrand = tone === 'onBrand'
  const arc = color ?? (onBrand ? null : RING_ARC[tone])
  // Las listas (36 a 56 px) muestran su número de una: un número tan chico no se llega a leer mientras cuenta.
  const centerContent = unmeasured
    ? (children ?? '?')
    : format
      ? size >= 64
        ? <CountingValue target={shown} ms={instant ? 0 : RING_FILL_MS} delay={delayMs} format={format} />
        : format(clamped)
      : (children ?? formatPer100(clamped))
  const meter = unmeasured
    ? { role: 'img' }
    : { role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(clamped * 100), 'aria-valuetext': valueText }

  return (
    <div
      ref={ref}
      className={cx('relative inline-grid shrink-0 place-items-center', !settled && 'will-change-transform')}
      style={{ width: size, height: size, ...(arc ? ({ '--tone-rgb': arc } as CSSProperties) : null) }}
      aria-label={label}
      {...meter}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={center} cy={center} r={radius} fill="none" strokeWidth={stroke} strokeDasharray={unmeasured ? RING_UNMEASURED_DASH : undefined} className={onBrand ? RING_TRACK_ON_BRAND : RING_TRACK} />
        {unmeasured ? null : (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap={shown > 0 ? 'round' : 'butt'}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - shown)}
            style={{ transitionDelay: `${delayMs}ms`, ...(instant ? { transitionDuration: '0ms' } : null) }}
            // Sobre la tarjeta de la navegación el arco es lavanda, salvo que venga un color propio (p. ej. verde = listo).
            className={cx(RING_TRANSITION, arc ? 'stroke-[rgb(var(--tone-rgb))]' : 'stroke-lavender-light')}
          />
        )}
        {ticks?.map((tick) => {
          const angle = tick * 2 * Math.PI
          const inner = radius - stroke / 2
          const outer = radius + stroke / 2

          return (
            <line
              key={tick}
              x1={center + inner * Math.cos(angle)}
              y1={center + inner * Math.sin(angle)}
              x2={center + outer * Math.cos(angle)}
              y2={center + outer * Math.sin(angle)}
              strokeWidth={2.5}
              className="stroke-background"
            />
          )
        })}
      </svg>
      {size >= RING_MIN_NUMBER_SIZE ? (
        <span className={cx('absolute inset-0 grid place-items-center text-center tabular-nums', ringCenterText(size), onBrand ? 'text-primary-foreground' : 'text-foreground')}>
          {centerContent}
        </span>
      ) : null}
    </div>
  )
}

/**
 * El número del centro mientras cuenta: va con el arco, con el mismo tiempo (`RING_FILL_MS`), el mismo retraso y la curva de `--ease-snap`. El valor real va en `aria-valuenow` desde el primer cuadro.
 * ponytail: el número va por estado de React, así que pinta un cuadro después que el arco (medido: 1 o 2 cuadros bajo carga). Si hiciera falta exacto, `flushSync` dentro del cuadro.
 */
function CountingValue({ target, ms, delay, format }: { target: number; ms: number; delay: number; format: (value: number) => ReactNode }) {
  const counted = useAnimatedNumber(target, { ms, delay, ease: easeSnap, round: false })

  return <>{format(counted)}</>
}
