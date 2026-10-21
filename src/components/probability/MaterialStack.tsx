import { FLIGHT_MS } from '../../app/use-card-flights'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { SegmentedRing } from '../ui/SegmentedRing'
import { CARD_BACK } from './practice-styles'

/**
 * Los materiales de un Xyz en el campo (Gastón, 2026-10-21, con la captura de otro simulador: «los xyz deben mostrar su materiales como en la imagen»): detrás de la carta, sus
 * materiales de dorso asomando por el costado izquierdo (`MaterialStack`) y, sobre la carta, la cantidad en grande dentro de un aro ámbar con un tramo por material
 * (`MaterialCount`). Ninguna pieza recibe toques (siguen yendo a la carta) ni lleva `data-card-id`: los vuelos de la mesa (`use-card-flights`) miden las cartas por esa marca.
 */

/** Una capa por material, hasta tres: con más, la pila no crece (la cantidad la dice el número). */
const MAX_LAYERS = 3
/**
 * Cuánto asoma cada capa (% del ancho de la carta) y cuánto más oscura es que la de adelante. Tres capas asoman el 21 % del ancho de la carta: entran en el margen que la carta parada
 * deja en su casilla cuadrada (el 15,7 % de la casilla, un 23 % del ancho de la carta), así que no tapan la casilla de al lado; acostada, el mismo margen queda arriba.
 */
const LAYER_PCT = 7
const LAYER_DIM = 0.12

/** El giro de la pila: el de la carta (acostada en defensa) y, del lado del rival, media vuelta más (sus cartas miran hacia él). Va en `transform`, como la de la carta, para girar con ella. */
const TURN = { 0: '', 90: '[transform:rotate(90deg)]', 180: '[transform:rotate(180deg)]', 270: '[transform:rotate(270deg)]' } as const

interface MaterialStackProps {
  count: number
  /** En defensa (o boca abajo en una zona de monstruo): la pila se acuesta con la carta. */
  sideways: boolean
  /** Del lado del rival: media vuelta, como sus cartas. */
  rival?: boolean
  /** Lo que la carta hace con su propia caja y la pila tiene que acompañar (arrastrada, atenuada). */
  className?: string
}

/**
 * La pila de materiales: va **antes** de la carta en su casilla (así queda detrás) y con la misma caja y el mismo giro. Aparece con un fundido cuando la carta termina de volar
 * (`FLIGHT_MS`): mientras el Xyz viaja desde el Extra Deck, la pila no se adelanta en la zona vacía.
 */
export function MaterialStack({ count, sideways, rival = false, className }: MaterialStackProps) {
  const layers = Math.min(MAX_LAYERS, count)

  if (layers <= 0) {
    return null
  }

  const turn = ((sideways ? 90 : 0) + (rival ? 180 : 0)) as keyof typeof TURN

  return (
    <span
      aria-hidden="true"
      data-material-stack={count}
      className={cx(
        'pointer-events-none absolute inset-x-0 top-0 isolate mx-auto aspect-[421/614] w-[68.57%]',
        '[transition:transform_var(--motion-duration)_var(--ease-snap),opacity_var(--motion-duration)_var(--ease-out),filter_var(--motion-duration)_var(--ease-out)] motion-reduce:transition-none',
        TURN[turn],
        className,
      )}
    >
      {Array.from({ length: layers }, (_, index) => {
        // La más lejana primero: cada capa nueva va encima de la anterior.
        const depth = layers - index

        return <span key={depth} className={cx(CARD_BACK, 'animate-step-in motion-reduce:animate-none')} style={{ transform: `translateX(-${depth * LAYER_PCT}%)`, filter: `brightness(${1 - depth * LAYER_DIM})`, animationDelay: `${FLIGHT_MS}ms` }} />
      })}
    </span>
  )
}

/**
 * La cantidad de materiales, en grande en el medio de la carta (es hija de la carta: viaja, se eleva y se atenúa con ella), dentro de un aro ámbar con un tramo por material sobre un
 * disco oscuro que la deja leer sobre cualquier arte. El aro mide una parte de la carta y el número crece con el aro (`@container`): se lee igual en la casilla de 48 px del celular
 * y en la de 15 rem del escritorio. Queda derecha siempre: en defensa gira al revés que la carta. El número rebota al cambiar.
 */
export function MaterialCount({ count, sideways }: { count: number; sideways: boolean }) {
  if (count <= 0) {
    return null
  }

  return (
    <span className={cx('@container pointer-events-none absolute left-1/2 top-1/2 z-2 grid aspect-square w-[58%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/70', sideways && '-rotate-90')}>
      <SegmentedRing fluid size={100} strokeWidth={8} label={t('practice.mat.materialCount', { count })} segments={Array.from({ length: count }, (_, index) => ({ key: String(index), value: 1, color: 'var(--info-rgb)' }))}>
        <span key={count} className="animate-pop text-lead font-extrabold leading-none @[2.5rem]:text-title @[3.5rem]:text-stat @[5rem]:text-display motion-reduce:animate-none">
          {count}
        </span>
      </SegmentedRing>
    </span>
  )
}
