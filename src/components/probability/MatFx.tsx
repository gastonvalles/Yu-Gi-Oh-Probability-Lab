import { Fragment, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import type { PickStat } from '../../app/auto/ask-ui'
import type { ChainBadgeData } from '../../app/card-glow'
import { printedBadge, statShift } from '../../app/field-stats'
import { cuesBetween, fated, play, type Cue, type LinkLook } from '../../app/chain-motion'
import type { LandingTone, ShowcaseKind, SpotlightKind } from '../../app/mat-effects'
import { EASE_IN_OUT, EASE_OUT, prefersReducedMotion } from '../../app/motion'
import { PHASES, type MatPhase, type MatSpot } from '../../app/practice-mat'
import { FLIGHT_MS, LANDING_AT, type CardPose } from '../../app/use-card-flights'
import { t } from '../../i18n'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { CARD_BACK, FX_RGB, type FxTone } from './practice-styles'

/**
 * Los efectos de la mesa de práctica, además del vuelo de las cartas: el marco de una carta destacada, la mira de un objetivo, el destello
 * de una invocación, el cartel de la fase y la carta grande del centro. Todos son decorativos (`aria-hidden`; lo que pasó lo dice la barra
 * de pasos) y se apagan con `prefers-reduced-motion`. El color de cada uno es `--fx-rgb` (ver `FX_RGB`); las animaciones están en index.css.
 */

/** El color de un efecto como variable CSS: lo heredan todos los pedazos que lo dibujan. */
export const fxVars = (tone: FxTone): CSSProperties => ({ '--fx-rgb': FX_RGB[tone] }) as CSSProperties

/** Color de cada destaque: dorado al activar, rojo al marcar un objetivo o atacar, celeste al mostrar y violeta al declarar. */
export const SPOTLIGHT_TONE: Record<SpotlightKind, FxTone> = { activate: 'gold', target: 'red', reveal: 'cyan', declare: 'violet', attack: 'red' }

/** Color de cada forma de llegar al campo. */
export const LANDING_TONE: Record<LandingTone, FxTone> = { normal: 'gold', special: 'cyan', fusion: 'violet', synchro: 'white', xyz: 'indigo', link: 'teal' }

/** Color del cartel del centro: el del destaque, o el de a dónde van las cartas del paso (la mano y el deck celeste, el cementerio violeta, el destierro ámbar) o cómo llegan al campo. */
export const STAGE_TONE: Record<SpotlightKind | ShowcaseKind, FxTone> = { ...SPOTLIGHT_TONE, ...LANDING_TONE, hand: 'cyan', gy: 'violet', banish: 'amber', extra: 'cyan', deck: 'cyan', attach: 'indigo' }

/**
 * El brillo de una carta en un duelo (`app/card-glow.ts`), por fuera y quieto: una línea clara de 1 px pegada al borde, el aro de color de 3 px y un halo de 24 px (corto: a 390 px no se come las
 * casillas vecinas). Lo que podés hacer ahora, en celeste casi blanco (`--playable-rgb`); lo que se activa o se resuelve, en ámbar. Dos atributos en cada selector: le ganan al aro de una regla del Lab
 * (`data-glow`) y al de la carta con el menú abierto. Lo llevan las cartas (en `FX_CARD`) y la casilla del Deck; el marco de adentro es el fino de `FxFrame`.
 */
export const DUEL_GLOW = [
  'data-[glow=true]:data-[glow-kind=can]:[box-shadow:var(--card-shadow),0_0_0_1px_rgb(255_255_255/0.95),0_0_0_3px_rgb(var(--playable-rgb)),0_0_24px_6px_rgb(var(--playable-rgb)/0.75)]',
  'data-[glow=true]:data-[glow-kind=act]:[box-shadow:var(--card-shadow),0_0_0_1px_rgb(255_255_255/0.95),0_0_0_3px_rgb(var(--warning-rgb)),0_0_24px_6px_rgb(var(--warning-rgb)/0.75)]',
  // El tuyo que ataca mientras elegís a quién (`aim`): el rojo del ataque, que la carta ya tiene en `--fx-rgb` (`fxVars('red')`).
  'data-[glow=true]:data-[glow-kind=aim]:[box-shadow:var(--card-shadow),0_0_0_1px_rgb(255_255_255/0.95),0_0_0_3px_rgb(var(--fx-rgb)),0_0_20px_5px_rgb(var(--fx-rgb)/0.65)]',
].join(' ')

/**
 * «Puede atacar»: la ficha celeste con la espada, en la esquina de arriba a la derecha de un monstruo tuyo que puede atacar en tu Battle Phase (además de su brillo `can`), medio afuera: no tapa
 * el arte (la de la izquierda es de la insignia de la cadena, `chainBadgeAt`). Va al lado de la carta (la carta recortaría lo que se sale) y mide el 26 % de la casilla (15 px a 390). Decorativa:
 * lo dice la descripción de la carta (`practice.card.canAttack`). Quieta, como el brillo.
 */
export function AttackMark() {
  return (
    <span
      aria-hidden="true"
      data-attack-mark=""
      className="pointer-events-none absolute right-[15.71%] top-0 z-11 grid aspect-square w-[26%] min-w-4 -translate-y-1/2 translate-x-1/2 animate-fx-frame-in place-items-center bg-[rgb(var(--playable-rgb))] text-background shadow-[0_0_0_1.5px_var(--background),0_2px_6px_rgb(0_0_0/0.5)] motion-reduce:animate-none"
    >
      <Icon name="sword" strokeWidth={2.4} className="size-[72%]" />
    </span>
  )
}

/**
 * Estados de una carta destacada (la de la mano y la del campo los comparten): el aro de afuera es el `box-shadow` de la carta y, lo que late o se
 * expande (activada, revelada o declarada: se enciende y se expande; marcada como objetivo: late), una capa con la sombra fija a la que se le anima
 * la opacidad (`fx-ring`, en index.css: así lo mueve el compositor). Piden `--card-shadow` y `--fx-rgb`.
 */
export const FX_CARD = [
  // `z-10` también hace de la carta que destella su propio contexto: la onda de `fx-ring` va detrás de ella.
  'fx-ring data-[flash=true]:z-10',
  DUEL_GLOW,
  // La carta de la que se está viendo el menú: aro y resplandor celestes fijos (el marco de adentro lleva la luz que gira).
  'data-[selected=true]:z-10 data-[selected=true]:[box-shadow:var(--card-shadow),0_0_0_2px_rgb(56_189_248/0.9),0_0_22px_4px_rgb(56_189_248/0.55)]',
  // Sin animaciones, el aro queda fijo.
  'motion-reduce:data-[flash=true]:[box-shadow:var(--card-shadow),0_0_0_2px_rgb(var(--fx-rgb)),0_0_18px_rgb(var(--fx-rgb)/0.7)]',
  'motion-reduce:data-[targeted=true]:[box-shadow:var(--card-shadow),0_0_0_2px_rgb(var(--fx-rgb)),0_0_18px_rgb(var(--fx-rgb)/0.7)]',
].join(' ')

/**
 * Pasar el mouse por una carta del duelo (Gastón, 2026-10-20: «al hacer hover sobre una carta en un duelo la misma debe tener el borde iluminado en blanco de forma tenue y debe elevarse un poco»):
 * el borde se enciende en blanco, tenue, y la carta se eleva (sube un poco, crece apenas y su sombra se agranda y baja). El aro va por `--card-shadow`, la base de todos los aros de color
 * (`FX_CARD`): una carta que destella, está marcada o tiene el menú abierto lleva el borde blanco debajo de su aro y no se pisan. `hover:` ya viene dentro de `@media (hover: hover)`: en el celular no queda pegado.
 * Sin movimiento (`motion-reduce`) la carta no se mueve y queda sólo el borde. Arrastrada no se eleva. La carta del campo sube lo justo para no perderse de la casilla; la de la mano, más (`HAND_CARD_HOVER`).
 * Las dos piden `--card-shadow` y una lista de transiciones con `translate` y `scale` (`CARD_TRANSITION`, completa: Tailwind sólo lee clases literales).
 * **La de la mano sólo sube, no crece** (Gastón, 2026-10-20: «se levanta mal, debe ser hacia arriba, no hacia el costado»): cada carta del abanico está puesta con su `transform: translate3d(x, y) rotate(…)` y la propiedad `scale` se aplica
 * *después* de ese `transform`, desde el origen de la carta (no desde donde quedó): multiplicaba el desplazamiento `x` del abanico y cada carta se corría hacia la derecha tanto más cuanto más lejos estaba (35 px la quinta). `translate`,
 * en cambio, va por fuera: sube derecho.
 */
const HOVER_RING = 'hover:[--card-shadow:0_10px_20px_rgba(0,0,0,0.5),0_0_0_1px_rgb(255_255_255/0.6),0_0_12px_rgb(255_255_255/0.2)]'
const NO_LIFT = 'motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100 data-[dragging=true]:hover:translate-y-0 data-[dragging=true]:hover:scale-100 data-[state=dragging]:hover:translate-y-0 data-[state=dragging]:hover:scale-100'

export const CARD_HOVER = [HOVER_RING, 'hover:z-10 hover:-translate-y-0.5 hover:scale-105', NO_LIFT].join(' ')
export const HAND_CARD_HOVER = [HOVER_RING, 'hover:z-40! hover:-translate-y-3.5', NO_LIFT].join(' ')

/**
 * Mantener apretada una carta del campo (o el deck) mientras se espera la retención (`HOLD_MS` de `use-mat-drag.ts`, que pone `data-holding` por el DOM): se hunde de a poco, como al apretarla.
 * Mientras dura le gana a los otros movimientos de la carta (el latido del Target, un destello): es lo que se está tocando. Con el movimiento reducido no se hunde: la jugada (o el menú) ya lo dice.
 */
export const HOLD_PRESS = 'motion-safe:data-[holding=true]:animate-hold-press!'

/**
 * Las transiciones de una carta de la mesa: el giro al cambiar de posición, el brillo y, para elevarse, `translate` y `scale` (propiedades individuales: no pisan el `transform` de la rotación de una carta
 * en defensa ni los vuelos). Sin `box-shadow`: el aro de un brillo cambia de una (con cada pregunta del núcleo cambian muchas cartas a la vez, y una transición de sombra corre en el hilo principal);
 * `filter` sí transiciona, que lo compone el compositor. Quien sabe qué más anima (la mano tiene su propio ritmo) escribe la suya entera.
 */
export const CARD_TRANSITION =
  '[transition:transform_var(--motion-duration)_var(--ease-snap),translate_var(--motion-duration)_var(--ease-snap),scale_var(--motion-duration)_var(--ease-snap),filter_var(--motion-duration)_var(--ease-out)]'

interface FxFrameProps {
  tone: FxTone
  /** La luz que le da la vuelta al marco (por defecto sí; las cartas que brillan por una regla sólo llevan el marco). */
  orbit?: boolean
  /** Un reflejo que cruza la carta una vez. */
  shine?: boolean
  /** El marco fino del brillo de un duelo (`DUEL_GLOW` ya dibuja la línea clara por fuera). */
  fine?: boolean
}

/** Marco de color adentro de una carta: borde parejo, brillo hacia adentro y, si se pide, la luz que gira y el reflejo. */
export function FxFrame({ tone, orbit = true, shine = false, fine = false }: FxFrameProps) {
  return (
    <span
      aria-hidden="true"
      data-fx="frame"
      data-orbit={orbit ? undefined : 'false'}
      data-shine={shine ? 'true' : undefined}
      className={cx('fx-frame animate-fx-frame-in motion-reduce:animate-none', fine && '[box-shadow:inset_0_0_0_1.5px_rgb(var(--fx-rgb)/0.9),inset_0_0_12px_1px_rgb(var(--fx-rgb)/0.45)]!')}
      style={fxVars(tone)}
    >
      {/* La luz que gira va en su propio elemento (el aro quieto, el degradé que gira adentro con `rotate`): así la anima el compositor y la mesa no recalcula estilos en cada cuadro. */}
      {orbit ? <span data-fx="orbit" /> : null}
    </span>
  )
}

/** El número de orden de una carta elegida eligiendo varias, arriba a la derecha y sobre su marco: blanco sobre oscuro (`PickGrid`, `PileViewer`). */
export const PICK_ORDER = 'absolute right-0.5 top-0.5 z-4 grid h-5 min-w-5 place-items-center rounded-full bg-background/85 px-1 text-micro font-bold leading-none tabular-nums text-white'

/** Las cuatro esquinas de la mira. */
const BRACKETS = [
  'left-[7%] top-[5%] border-l-[3px] border-t-[3px]',
  'right-[7%] top-[5%] border-r-[3px] border-t-[3px]',
  'bottom-[5%] left-[7%] border-b-[3px] border-l-[3px]',
  'bottom-[5%] right-[7%] border-b-[3px] border-r-[3px]',
]

/**
 * La mira de un objetivo (la comparten las cartas de la mano y del campo, las del visor de una pila y la casilla del cementerio y del destierro): cae sobre la carta girando, se cierra y queda con el aro
 * punteado dando vueltas; una onda sale del centro al fijarse y la carta se tiñe de rojo.
 */
export function TargetMark() {
  return (
    // Se recorta sola (la carta marcada deja ver su aro, que sale de ella: `fx-ring`), con la caja de la carta: lo que cae girando y la onda no se salen.
    <span role="img" aria-label={t('practice.card.targetMark')} data-fx="target" className="pointer-events-none absolute inset-0 z-3 overflow-hidden" style={fxVars('red')}>
      <span className="absolute inset-0 animate-fx-lock motion-reduce:animate-none">
        <span className="absolute inset-0 bg-[radial-gradient(circle,rgb(var(--fx-rgb)/0.34),transparent_72%)]" />
        {BRACKETS.map((corner) => (
          <span key={corner} className={cx('absolute aspect-square w-[22%] border-[color:rgb(var(--fx-rgb))] drop-shadow-[0_0_3px_rgb(var(--fx-rgb))]', corner)} />
        ))}
        <span className="fx-crosshair absolute left-1/2 top-1/2 aspect-square w-[64%] -translate-x-1/2 -translate-y-1/2" />
        <span className="absolute left-1/2 top-1/2 aspect-square w-[46%] -translate-x-1/2 -translate-y-1/2 animate-fx-spin rounded-full border-2 border-dashed border-[color:rgb(var(--fx-rgb))] motion-reduce:animate-none" />
        <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:rgb(var(--fx-rgb))] shadow-[0_0_8px_3px_rgb(var(--fx-rgb)/0.9)]" />
        <span className="absolute left-1/2 top-1/2 aspect-square w-[56%] -translate-x-1/2 -translate-y-1/2 animate-fx-ping rounded-full border-2 border-[color:rgb(var(--fx-rgb))] motion-reduce:hidden" />
      </span>
    </span>
  )
}

/**
 * Dónde va la insignia de la cadena en una casilla del campo: en la esquina de arriba a la izquierda de la carta como se ve (parada, del alto de la casilla y centrada; acostada, del ancho y
 * centrada; en la zona de campo, la casilla entera). Va en la casilla y no en la carta, que recorta lo que se sale.
 */
export const chainBadgeAt = (spot: MatSpot, sideways: boolean) => (spot === 'field' ? 'left-0 top-0' : sideways ? 'left-0 top-[15.71%]' : 'left-[15.71%] top-0')

/** «Sin efecto · por CL2» (o «Negada»): el estado de un eslabón negado, con quién lo negó si se sabe. */
const voidedText = ({ state, by }: NonNullable<ChainBadgeData['voided']>) => (by ? t('auto.chain.by', { state: t(`auto.chain.state.${state}`), by }) : t(`auto.chain.state.${state}`))

/** El nombre de una carta con su eslabón: la insignia es decorativa y esto es lo que se lee. */
export const chainLinkLabel = (name: string, link: ChainBadgeData) => {
  const label = t(link.fromHand ? 'auto.link.labelHand' : 'auto.link.label', { name, numbers: link.numbers.join(', ') })

  return link.voided ? t('auto.link.void', { label, state: voidedText(link.voided) }) : label
}

/**
 * La insignia del eslabón de la cadena («CL1», «CL1·3» si la carta tiene dos), pegada arriba a la izquierda de la carta o de la pila (`className` la ubica), montada sobre el borde de arriba para
 * no tapar el nombre. Recta y naranja, el color de lo que se activa (el mismo del trazo que une las cartas de la cadena, `ChainTrace`), con el texto carbón; de quién es lo dice su eslabón en la línea.
 * Sólo se mira: `aria-hidden`, y el eslabón va en el nombre de la carta (`chainLinkLabel`). Se va con el aviso de la cadena.
 * Negado o sin efecto (`voided`): la insignia va tachada y el arte de la carta, gris y latiendo (`VOIDED_ART`).
 */
export function ChainBadge({ link, className }: { link: ChainBadgeData; className?: string }) {
  return (
    <span
      aria-hidden="true"
      data-chain-link={link.numbers.join(',')}
      data-chain-owner={link.mine ? 'mine' : 'theirs'}
      data-chain-void={link.voided ? (link.voided.by ?? '') : undefined}
      className={cx('pointer-events-none absolute z-11 -translate-y-1/2 whitespace-nowrap bg-warning px-1 py-px text-micro font-extrabold leading-tight tabular-nums text-background ring-1 ring-background', link.voided && 'line-through', className)}
    >
      {t('auto.link.badge', { numbers: link.numbers.join('·') })}
    </span>
  )
}

/**
 * Los pasos de la cadena animada (`cuesBetween`, `app/chain-motion.ts`) en su momento: cada cambio de los eslabones (número y estado) o el final (`done`) da los suyos y `onCue` los aplica.
 * Un cambio que llega antes de que terminen los del anterior los adelanta (quedan secos, en su lugar). Con movimiento reducido o `still`, nada: el estado lo dicen el color y el texto.
 */
export function useChainCues(rows: readonly LinkLook[], done: boolean, onCue: (cue: Cue) => void, still = false) {
  const before = useRef<{ rows: readonly LinkLook[]; done: boolean } | null>(null)
  const apply = useRef(onCue)
  const signature = `${rows.map((row) => `${row.number}:${row.state}`).join('|')}${done ? '|fin' : ''}`

  useLayoutEffect(() => {
    apply.current = onCue
  })
  useLayoutEffect(() => {
    const prev = before.current

    before.current = { rows, done }
    if (still || prefersReducedMotion()) return
    const run = play(cuesBetween(prev?.rows ?? null, rows, done, prev?.done ?? false), ({ cue }) => apply.current(cue))

    return run.finish
    // `signature` resume `rows` y `done`: un dibujo con la misma cadena no da pasos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, still])
}

/** El centro de `element` en el plano de `root` (su caja sin transformar: en la vista 3D, el campo antes de inclinarse), sumando `offsetLeft`/`offsetTop` hasta llegar a él. */
function centerIn(element: HTMLElement, root: HTMLElement): [number, number] {
  let x = element.offsetWidth / 2
  let y = element.offsetHeight / 2

  for (let node: HTMLElement | null = element; node && node !== root; node = node.offsetParent as HTMLElement | null) {
    x += node.offsetLeft
    y += node.offsetTop
  }
  return [x, y]
}

interface TraceSegment {
  /** Une CL`from` con CL`from + 1`. */
  from: number
  x: number
  y: number
  length: number
  angle: number
}

/** Dónde está cada eslabón en el campo: la casilla de la carta (o la pila) que lleva su insignia. */
const anchorsIn = (field: HTMLElement) => {
  const anchors = new Map<number, HTMLElement>()

  for (const badge of field.querySelectorAll<HTMLElement>('[data-chain-link]')) for (const n of (badge.dataset.chainLink ?? '').split(',')) if (badge.parentElement) anchors.set(Number(n), badge.parentElement)
  return anchors
}

function segmentsIn(field: HTMLElement, count: number): TraceSegment[] {
  const anchors = anchorsIn(field)
  const segments: TraceSegment[] = []

  for (let from = 1; from < count; from += 1) {
    const a = anchors.get(from)
    const b = anchors.get(from + 1)

    if (!a || !b || a === b) continue
    const [x, y] = centerIn(a, field)
    const [x2, y2] = centerIn(b, field)

    segments.push({ from, x, y, length: Math.hypot(x2 - x, y2 - y), angle: (Math.atan2(y2 - y, x2 - x) * 180) / Math.PI })
  }
  return segments
}

const sameSegments = (a: readonly TraceSegment[], b: readonly TraceSegment[]) => a.length === b.length && a.every((seg, i) => (Object.keys(seg) as Array<keyof TraceSegment>).every((key) => Math.abs(seg[key] - b[i]![key]) < 0.5))

/** Le da a la casilla de la carta del eslabón `n` una animación de una vez (se levanta al encadenarse, ejecuta al resolverse) y se la saca al terminar. */
function bump(field: HTMLElement | null | undefined, n: number, classes: readonly string[], ms: number) {
  const cell = field ? anchorsIn(field).get(n) : undefined

  if (!cell) return
  cell.classList.remove(...classes)
  cell.classList.add(...classes)
  window.setTimeout(() => cell.classList.remove(...classes), ms)
}

/**
 * El trazo de la cadena en la mesa: las cartas de la cadena unidas en orden por un trazo recto naranja numerado («1–2», «2–3»), de casilla a casilla de las insignias `CL#`. Cada trazo es un
 * `span` rotado que crece con `scaleX` (`animate-seg-in`, el número después); el de un eslabón que se resolvió (o toda la cadena al terminar) se apaga (`animate-fade-out`). Al encadenarse, la carta
 * se levanta (`animate-lift`); al resolverse, ejecuta (`animate-act`). Se dibuja adentro del campo (`data-chain-trace`, el lugar que le deja la mesa; `slot` en el catálogo) y se mide con
 * `offsetLeft`/`offsetTop` en su plano, así en la vista 3D se inclina con él (la caja de `getBoundingClientRect` sería la proyectada). Decorativo: lo que pasa lo dicen la línea y las insignias.
 */
export function ChainTrace({ rows, done = false, slot, still = false }: { rows: readonly LinkLook[]; done?: boolean; slot?: HTMLElement | null; still?: boolean }) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  const [segments, setSegments] = useState<TraceSegment[]>([])
  const count = rows.length

  useLayoutEffect(() => {
    setHost(slot ?? document.querySelector<HTMLElement>('[data-chain-trace]'))
  }, [slot])
  useLayoutEffect(() => {
    const field = host?.parentElement

    if (!field) return
    let frame = 0
    const measure = () => {
      frame = 0
      const next = segmentsIn(field, count)

      setSegments((prev) => (sameSegments(prev, next) ? prev : next))
    }
    const soon = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    // Las cartas cambian de lugar (un costo, una Invocación) y el campo de tamaño: se vuelve a medir, una vez por cuadro.
    const moved = new MutationObserver(soon)
    const resized = typeof ResizeObserver === 'function' ? new ResizeObserver(soon) : null

    measure()
    moved.observe(field, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-chain-link'] })
    resized?.observe(field)
    return () => {
      cancelAnimationFrame(frame)
      moved.disconnect()
      resized?.disconnect()
    }
  }, [host, count])
  useChainCues(
    rows,
    done,
    (cue) => {
      if (cue.kind === 'enter') bump(host?.parentElement, cue.link, ['animate-lift', 'motion-reduce:animate-none'], 360)
      if (cue.kind === 'act') bump(host?.parentElement, cue.link, ['animate-act', 'motion-reduce:animate-none'], 200)
    },
    still,
  )

  if (!host) return null
  const off = (from: number) => done || fated(rows.find((row) => row.number === from + 1)?.state ?? 'chained')
  // Sin movimiento (el catálogo; la preferencia del sistema la toma `motion-reduce:`): aparece y se va seco.
  const look = (from: number, grow: string) => (off(from) ? (still ? 'invisible' : 'animate-fade-out motion-reduce:invisible motion-reduce:animate-none') : still ? null : grow)

  return createPortal(
    segments.map((seg) => (
      <Fragment key={seg.from}>
        <span
          data-chain-segment={`${seg.from}-${seg.from + 1}`}
          className={cx('absolute h-0.75 origin-left bg-warning', look(seg.from, 'animate-seg-in motion-reduce:animate-none'))}
          style={{ left: seg.x, top: seg.y - 1.5, width: seg.length, rotate: `${seg.angle}deg` }}
        />
        <span
          className={cx('absolute -translate-x-1/2 -translate-y-1/2 bg-background px-1 text-micro font-extrabold leading-tight tabular-nums text-warning ring-1 ring-warning', look(seg.from, 'animate-seg-num-in motion-reduce:animate-none'))}
          style={{ left: seg.x + (Math.cos((seg.angle * Math.PI) / 180) * seg.length) / 2, top: seg.y + (Math.sin((seg.angle * Math.PI) / 180) * seg.length) / 2 }}
        >
          {`${seg.from}–${seg.from + 1}`}
        </span>
      </Fragment>
    )),
    host,
  )
}

/** El nombre de una carta con su ATK/DEF de ahora mientras se elige («Ponix, nivel 4, ATK 1900, DEF 1000, elegible»): la etiqueta es decorativa y esto es lo que se lee. */
export function pickStatLabel(name: string, { attack: atk, defense: def, badge }: PickStat) {
  if (badge?.kind === 'link') return t('auto.pick.statRating', { name, atk, link: badge.value })
  if (def === null) return t('auto.pick.statLink', { name, atk })
  if (badge?.kind === 'level') return t('auto.pick.statLevel', { name, atk, def, level: badge.value })
  if (badge?.kind === 'rank') return t('auto.pick.statRank', { name, atk, def, rank: badge.value })
  return t('auto.pick.stat', { name, atk, def })
}

/** El nombre de un monstruo del campo con su ficha y su ATK/DEF de siempre («Ponix, nivel 4, ATK 1900, DEF 1000»; «…, rango 4, …»; «…, LINK 2, ATK 2300»); eligiéndolo, `pickStatLabel`. */
export function statLabel(name: string, { attack: atk, defense: def, badge }: PickStat) {
  if (badge?.kind === 'link') return t('practice.mat.cardStatRating', { name, atk, link: badge.value })
  if (def === null) return t('practice.mat.cardStatLink', { name, atk })
  if (badge?.kind === 'level') return t('practice.mat.cardStatLevel', { name, atk, def, level: badge.value })
  if (badge?.kind === 'rank') return t('practice.mat.cardStatRank', { name, atk, def, rank: badge.value })
  return t('practice.mat.cardStat', { name, atk, def })
}

/** La marca de cada ficha, igual en los dos idiomas (como en la carta). */
const BADGE_MARK = { level: '★', rank: 'R', link: 'LINK' } as const

/** Lo que tarda la ficha de arriba en aparecer con su carta: lo que tarda la carta que viene volando en tocar su casilla (`LANDING_AT`); el ATK/DEF, 70 ms después. */
const STAT_ARRIVAL_MS = Math.round(FLIGHT_MS * LANDING_AT)
const BADGE_ARRIVAL: CSSProperties = { animationDelay: `${STAT_ARRIVAL_MS}ms` }
const STAT_ARRIVAL: CSSProperties = { animationDelay: `${STAT_ARRIVAL_MS + 70}ms` }

/** El Nivel, Rango o LINK impreso de una carta para su ficha («Nivel 4», «Rango 4», «LINK-2»; `printedBadge`), o null: en la mesa no va (sólo mientras se elige, `StatTag`). */
export function levelText(card: ApiCardReference | null | undefined): string | null {
  const badge = printedBadge(card)
  return badge ? t(`practice.mat.badge.${badge.kind}`, { value: badge.value }) : null
}

/** El color de un número que cambió respecto del impreso (`statShift`): menta si subió, rojo claro si bajó. */
const SHIFT_TONE = { up: 'text-success-soft', down: 'text-danger-soft' } as const

/**
 * El ATK/DEF de un monstruo boca arriba del campo (`fieldStatsOf`: el de ahora en el duelo automático, el impreso en la mesa manual; eligiéndolo, `pickStatsOf`), en una placa de 15 px al pie
 * de la carta, sobre su cuadro de texto (que a este tamaño no se lee): el arte queda entero. Nada más va sobre la carta: la ficha (`badge`: ★ Nivel, R Rango o LINK) sale de la mesa y vive en
 * la ficha de la carta (`levelText`); vuelve, arriba y al centro, sólo mientras se elige (la de `pickStatsOf`, o la casilla con `data-pick`: Sacrificios y materiales de la mesa manual), que
 * es cuando el Nivel decide. No cambian la caja de la carta ni la de la casilla. El número que cambió respecto del impreso (`printed`, sólo los de ahora), en menta si subió y en rojo claro si
 * bajó; un «?» y la mesa manual, sin color. La DEF que no cambió, apagada. Sólo se mira (`aria-hidden`): lo que se lee va en el nombre de la carta (`statLabel`, `pickStatLabel`). Si la casilla
 * no llega a los dos números de cuatro cifras (`@container`: el celular y la mesa de escritorio angosta), va sólo el de su posición, el ATK parada y la DEF acostada (`sideways`); el nombre
 * lleva los dos. Se monta con la carta (también sin `stat`) y entra cuando la carta llega volando a su casilla (`animate-chip-drop`, `animate-chip-rise` 70 ms después); con movimiento reducido,
 * quietas.
 */
export function StatTag({ stat, sideways = false, className }: { stat: PickStat | null; sideways?: boolean; className?: string }) {
  const def = stat !== null && stat.defense !== null && sideways
  const badge = stat?.badge
  const atkShift = stat ? statShift(stat.attack, stat.printed?.attack) : null
  const defShift = stat ? statShift(stat.defense, stat.printed?.defense) : null

  return (
    <>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[16%] z-11 animate-chip-drop motion-reduce:animate-none" style={BADGE_ARRIVAL}>
        {badge ? (
          <span data-stat-badge={badge.kind} className={cx(STAT_CHIP, stat.resting ? 'hidden in-data-[pick=true]:block' : 'block')}>{`${BADGE_MARK[badge.kind]}\u2009${badge.value}`}</span>
        ) : null}
      </span>
      <span aria-hidden="true" className={cx('pointer-events-none absolute inset-x-0 bottom-0 z-11 @container animate-chip-rise motion-reduce:animate-none', className)} style={STAT_ARRIVAL}>
        {stat ? (
          <span data-pick-stat="" className={cx(STAT_CHIP, 'block')}>
            <span data-shift={atkShift ?? undefined} className={cx(def && '@max-[5rem]:hidden', atkShift && SHIFT_TONE[atkShift])}>{stat.attack}</span>
            {stat.defense === null ? null : (
              <span data-shift={defShift ?? undefined} className={cx('font-semibold', defShift ? SHIFT_TONE[defShift] : 'text-muted', def ? cx('@max-[5rem]:font-extrabold', !defShift && '@max-[5rem]:text-foreground') : '@max-[5rem]:hidden')}>
                <span className={cx('text-muted', def && '@max-[5rem]:hidden')}>{STAT_SEPARATOR}</span>
                {stat.defense}
              </span>
            )}
          </span>
        ) : null}
      </span>
    </>
  )
}

/** 12 px con su renglón de 15 (`leading-tight`), cifras tabulares y el carbón al 92 % debajo: se lee sobre cualquier arte (≥4,5:1). Sin `block`: lo pone cada uso. */
const STAT_CHIP = 'mx-auto w-fit max-w-full whitespace-nowrap bg-background/92 px-1 text-micro leading-tight font-extrabold tabular-nums text-foreground ring-1 ring-border-subtle'

/**
 * La barra entre el ATK y la DEF, con espacios finos: «2500 / 2000» mide 80 px y entra justo en la casilla de 1440 px (80–81). El corte (`@max-[5rem]`) es el de cuatro cifras y
 * cuatro: un ATK de cinco cifras desborda unos 8 px el fondo de la etiqueta (se lee igual, no se corta); si se vuelve común, un corte por cantidad de cifras.
 */
const STAT_SEPARATOR = '\u2009/\u2009'

/**
 * El arte de una carta cuyo eslabón quedó negado o sin efecto (Gastón: «una carta negada debe verse gris parpadeando»), mientras se ve el aviso de la cadena: en escala de grises y con el pulso
 * de opacidad de `animate-fx-void` (1 s el ciclo: se ve latir en los 1,2 s del aviso y queda lejos de los 3 destellos por segundo de WCAG 2.3.1). Con movimiento reducido queda gris y quieta. Va en
 * el arte y no en la carta: no le pisa las animaciones (destello, mira, retención), ni el aro, ni el giro 3D, y no cambia su caja. Lo que pasó lo dice el nombre (`chainLinkLabel`) y la insignia tachada.
 */
export const VOIDED_ART = 'grayscale motion-safe:animate-fx-void'

/** Adónde salen las chispas de una invocación (en rem, desde el centro de la zona): un hexágono. */
const SPARKS = [
  [0, -2.7],
  [2.4, -1.35],
  [2.4, 1.35],
  [0, 2.7],
  [-2.4, 1.35],
  [-2.4, -1.35],
] as const

/**
 * Una carta que cae en una zona de monstruo: un fogonazo, dos ondas que se expanden y chispas. Del color de cómo llega (Normal dorado,
 * Especial celeste, Fusión violeta, Sincronía blanca, Xyz azul, Enlace verde agua) y cuando la carta, que viene volando, toca la zona (`LANDING_AT` del vuelo).
 */
export function LandingBurst({ tone, flies }: { tone: LandingTone; flies: boolean }) {
  // El retraso va en línea en cada pieza: una variable en el token de la animación se resolvería en la raíz, no acá.
  const delay = (extra = 0): CSSProperties => ({ animationDelay: `${(flies ? Math.round(FLIGHT_MS * LANDING_AT) : 0) + extra}ms` })

  return (
    <span aria-hidden="true" data-fx="landing" data-tone={tone} className="pointer-events-none absolute inset-0 z-4 motion-reduce:hidden" style={fxVars(LANDING_TONE[tone])}>
      <span className="absolute inset-0 animate-fx-flash bg-[radial-gradient(circle,rgb(255_255_255/0.95),rgb(var(--fx-rgb)/0.75)_35%,transparent_72%)]" style={delay()} />
      <span className="absolute inset-0 animate-fx-shock border-[3px] opacity-0 border-[color:rgb(var(--fx-rgb))] shadow-[0_0_14px_rgb(var(--fx-rgb)/0.8)]" style={delay()} />
      <span className="absolute inset-0 animate-fx-shock border opacity-0 border-[color:rgb(var(--fx-rgb)/0.8)]" style={delay(110)} />
      {SPARKS.map(([x, y]) => (
        <span
          key={`${x}:${y}`}
          className="absolute left-1/2 top-1/2 -ml-[3px] -mt-[3px] size-1.5 animate-fx-spark bg-white opacity-0 shadow-[0_0_6px_2px_rgb(var(--fx-rgb))]"
          style={{ ...delay(), '--dx': `${x}rem`, '--dy': `${y}rem` } as CSSProperties}
        />
      ))}
    </span>
  )
}

/**
 * El cartel de una fase nueva (y del turno, si empieza otro): una placa plana y recta de borde violeta, como las del comienzo y el final, con el nombre
 * de la fase en grande y el turno arriba en lavanda. Nada más: las seis fases ya están en los botones de la mesa. En un duelo, `label` cambia la frase grande
 * ("Tu turno") y `who` dice de quién es la fase cuando no es tuya. Con menos movimiento se ve igual, quieto, el mismo rato (lo saca quien lo monta).
 */
export function PhaseBanner({ phase, turn, who, label, className }: { phase: MatPhase; turn: number | null; who?: string; label?: string; className?: string }) {
  const name = label ?? PHASES.find((entry) => entry.id === phase)?.name ?? phase

  return (
    <div aria-hidden="true" data-fx="banner" className={cx('pointer-events-none grid place-items-center', className)}>
      <div className="grid animate-fx-banner justify-items-center gap-1 border-2 border-primary bg-background/92 px-6 py-3 motion-reduce:animate-none min-[1101px]:px-8 min-[1101px]:py-4">
        {turn !== null || who ? <span className="animate-fx-banner-text text-micro font-bold text-accent motion-reduce:animate-none">{turn !== null ? t('practice.mat.turn', { turn }) : who}</span> : null}
        <span className="animate-fx-banner-text text-title font-extrabold leading-none text-foreground motion-reduce:animate-none min-[1101px]:text-stat">{name}</span>
      </div>
    </div>
  )
}

interface SpotlightCard {
  id: string
  name: string
  art: string | null
  /** No se sabe cuál es (una carta del rival que no mostró): se ve de dorso. */
  back?: boolean
}

interface SpotlightProps {
  /** Para qué se muestra o a dónde van las cartas: da el color. */
  kind: SpotlightKind | ShowcaseKind
  /** Una carta (activar, mostrar, declarar, una invocación) o varias (robar o mandar al cementerio de a más de una). */
  cards: SpotlightCard[]
  /** Lo que pasó, en una línea (el texto del paso). */
  caption: string | null
  /** El efecto que se activa, si se eligió uno entre varios: cuándo se activa y qué hace, textual, debajo de la carta; se queda 7 s para leerlo. */
  detail?: { lead: string; text: string }
  /** Las cartas salen del deck o del Extra: aparecen de dorso y se dan vuelta en 3D. */
  flip?: boolean
  /** Se queda más tiempo (3 s en vez de 1): lo que el rival activa o muestra y es público, para que se alcance a leer la carta y su nombre. */
  linger?: boolean
  /** Dónde se ve cada carta en la mesa al aparecer (`cardPose`): la carta grande sale de ahí. Sin esto, o si no hay ninguna a la vista, aparecen en el centro. */
  origin?: (id: string) => CardPose | null
  /** Dónde se ubica (el padre dice sobre qué parte de la mesa se centran las cartas). */
  className?: string
}

/** Lo que tarda la carta grande en llegar desde su carta hasta el centro. */
export const SPOTLIGHT_TRAVEL_MS = 320

/** El giro de una carta, del lado más corto: de cabeza (180°) se endereza por un lado, de costado (90° o −90°) por el otro. */
const shortTurn = (angle: number) => angle - 360 * Math.round(angle / 360)

/** Lo más que espera, invisible, la carta que sale de su carta a que su imagen esté lista: si no estaba en la caché, sale con su esqueleto. */
const ART_WAIT_MS = 80

/**
 * La carta que sale de su carta arranca encima de ella con la misma imagen: se ve desde el primer cuadro que se pinta, sin el esqueleto ni el fundido de `CardArt`
 * (como la copia de `flyAbove`); si no, en esos cuadros tapaba su carta con un rectángulo oscuro. Espera invisible a que la imagen esté lista para pintarse (`decode`:
 * de la caché, un cuadro) y, si tarda más de `ART_WAIT_MS` (no estaba en la caché), sale con su esqueleto, como siempre. Devuelve cómo dejarla como estaba.
 */
function showArtAtOnce(face: HTMLElement): () => void {
  const image = face.querySelector('img')

  if (!image) return () => {}

  let waiting = true
  const show = () => {
    if (!waiting) return

    waiting = false
    window.clearTimeout(timer)

    if (image.naturalWidth > 0) {
      image.style.transition = 'none'
      image.style.opacity = '1'
      for (const placeholder of face.querySelectorAll<HTMLElement>('[class*="animate-shimmer"]')) placeholder.style.visibility = 'hidden'
    }

    face.style.removeProperty('visibility')
  }
  const timer = window.setTimeout(show, ART_WAIT_MS)

  face.style.visibility = 'hidden'
  image.loading = 'eager'
  if (typeof image.decode === 'function') image.decode().then(show, show)
  else show()

  return () => {
    waiting = false
    window.clearTimeout(timer)
    face.style.removeProperty('visibility')
  }
}

/**
 * La carta grande sale de su carta (Gastón, 2026-10-21: «animaciones y transiciones suaves y fluidas»; la idea de YGOPocket, la carta grande unida a la suya):
 * cada carta que se ve en la mesa (`origin`) arranca encima de ella, de su tamaño y con su giro (la del rival, de cabeza), y viaja al centro en
 * `SPOTLIGHT_TRAVEL_MS` con la curva de lo que viaja; el cartel, los nombres, el efecto y la que no tiene de dónde salir aparecen en la segunda mitad, y el
 * resplandor y la onda esperan a que llegue. El CSS de la carta (`animate-card-activate-*`) queda sólo para la espera y la salida: `--stage-entered` le saca la
 * entrada. Sin ninguna carta a la vista (o con movimiento reducido) no se toca nada: aparecen en el centro como siempre.
 */
function useStageTravel(rootRef: RefObject<HTMLDivElement | null>, origin: SpotlightProps['origin']) {
  useLayoutEffect(() => {
    const root = rootRef.current

    if (!root || !origin || typeof root.animate !== 'function' || prefersReducedMotion()) return

    // Primero se le saca la entrada a la carta (el CSS la tendría al 55 %): así lo que se mide es dónde termina cada una. Y se mide todo junto, antes de escribir nada más (una sola fase
    // de lectura): medir cada carta después de esconderla y de animar la anterior recalculaba estilos y layout de toda la capa por cada una.
    root.style.setProperty('--stage-entered', '1')

    const bounds = root.getBoundingClientRect()
    // En el celular la caja termina en la fila del medio (`useStageRoom`): una carta tuya, más abajo, igual sale de su lugar (abajo vale la mesa entera).
    const bottom = Math.max(bounds.bottom, root.parentElement?.getBoundingClientRect().bottom ?? 0)
    const inside = (pose: CardPose) => pose.width >= 1 && pose.height >= 1 && pose.x >= bounds.left && pose.x <= bounds.right && pose.y >= bounds.top && pose.y <= bottom
    const faces = [...root.querySelectorAll<HTMLElement>('[data-stage-card]')].map((face) => {
      const pose = origin(face.dataset.stageCard ?? '')

      return { face, pose: pose && inside(pose) ? pose : null, end: face.getBoundingClientRect() }
    })

    if (faces.every(({ pose }) => pose === null)) {
      root.style.removeProperty('--stage-entered')
      return
    }

    const appear = { duration: SPOTLIGHT_TRAVEL_MS / 2, delay: SPOTLIGHT_TRAVEL_MS / 2, easing: EASE_OUT, fill: 'backwards' as const }
    const glows = [...root.querySelectorAll<HTMLElement>('[data-stage-glow]')]
    const restores: Array<() => void> = []
    const animations = faces.map(({ face, pose, end }) => {
      if (!pose) return face.animate([{ opacity: 0 }, { opacity: 1 }], appear)

      restores.push(showArtAtOnce(face))
      const start = `translate(${pose.x - (end.left + end.width / 2)}px, ${pose.y - (end.top + end.height / 2)}px) rotate(${shortTurn(pose.angle)}deg) scale(${pose.width / end.width}, ${pose.height / end.height})`

      return face.animate([{ transform: start }, { transform: 'translate(0px, 0px) rotate(0deg) scale(1, 1)' }], { duration: SPOTLIGHT_TRAVEL_MS, easing: EASE_IN_OUT })
    })

    for (const text of root.querySelectorAll<HTMLElement>('[data-stage-text]')) animations.push(text.animate([{ opacity: 0 }, { opacity: 1 }], appear))
    // El resplandor y la onda del centro, cuando la carta llega (con relleno hacia atrás o de base transparentes: no se ven mientras esperan).
    for (const glow of glows) glow.style.animationDelay = `${SPOTLIGHT_TRAVEL_MS}ms`

    // Todo vuelve a como estaba (en desarrollo, React monta dos veces: la segunda mide la carta quieta, no a mitad del viaje).
    return () => {
      for (const animation of animations) animation.cancel()
      for (const restore of restores) restore()
      for (const glow of glows) glow.style.removeProperty('animation-delay')
      root.style.removeProperty('--stage-entered')
    }
    // Sólo al aparecer: el nombre que llega después (la carta del rival) no la hace viajar de nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/**
 * En el celular la carta grande va arriba de la fila del medio, nunca encima de la línea de la cadena (Gastón, «Las 7»: «la cadena siempre a la vista»): la caja termina donde empieza esa fila
 * (`--stage-room`, que usa `max-sm:`; medida en pantalla, así en 3D es la fila como se ve). Sin campo (el catálogo), la mesa entera. Se mide una vez, antes del viaje: el campo no se mueve.
 */
function useStageRoom(rootRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current
    const row = root?.parentElement?.querySelector('[data-drop="emz:0"]')

    if (root && row) root.style.setProperty('--stage-room', `${Math.max(0, row.getBoundingClientRect().top - root.getBoundingClientRect().top)}px`)
  }, [rootRef])
}

/** El resplandor de cada carta del centro (el color del paso, con una sombra abajo). */
const STAGE_FACE = 'absolute inset-0 overflow-hidden bg-input shadow-[0_0_0_3px_rgb(var(--fx-rgb)),0_0_60px_rgb(var(--fx-rgb)/0.8),0_24px_48px_rgba(0,0,0,0.6)]'

/** Ancho de cada carta según cuántas son: una sola es grande; con más, se achican para entrar juntas. */
const STAGE_CARD_WIDTH = ['', 'w-[min(42cqw,13rem)]', 'w-[min(30cqw,10rem)]', 'w-[min(22cqw,7.5rem)]', 'w-[min(18cqw,6.5rem)]']

/** Con el efecto escrito debajo la carta es más chica: lo que hay que leer es el texto, y el conjunto tiene que entrar en el alto de la mesa. */
const STAGE_CARD_WIDTH_WITH_DETAIL = 'w-[min(34cqw,10.5rem)]'

/**
 * Las cartas grandes en el centro de la mesa cuando se activa, se muestra o se declara una carta (o, al reproducir un combo, cuando
 * un paso las mueve): aparecen con un resplandor y una onda, cada una con su marco de color, un reflejo y su nombre debajo, y arriba una
 * línea que dice qué pasó. Se van solas. Se centran en el recuadro que les da el padre (`className`), y sus medidas (`cqw`) son las de ese
 * recuadro, no las de la pantalla. Con `origin`, cada una sale de su carta en la mesa (`useStageTravel`).
 */
export function Spotlight({ kind, cards, caption, detail, flip = false, linger = false, origin, className }: SpotlightProps) {
  const tone = STAGE_TONE[kind]
  const shown = cards.slice(0, 4)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useStageRoom(rootRef)
  useStageTravel(rootRef, origin)

  return (
    <div
      ref={rootRef}
      data-activation={shown[0]?.id}
      data-kind={kind}
      aria-hidden="true"
      // En el celular, apoyada sobre la fila del medio (como la lámina): arriba queda la barra a la vista.
      className={cx('pointer-events-none grid place-items-center overflow-hidden @container', className, 'max-sm:bottom-auto max-sm:h-[var(--stage-room,100%)] max-sm:items-end max-sm:pb-2')}
      style={fxVars(tone)}
    >
      <span data-stage-glow className="absolute left-1/2 top-1/2 aspect-square w-[min(100cqw,30rem)] -translate-x-1/2 -translate-y-1/2 animate-fx-stage rounded-full bg-[radial-gradient(circle,rgb(var(--fx-rgb)/0.6),rgb(var(--fx-rgb)/0.18)_42%,transparent_68%)] motion-reduce:hidden" />
      <span data-stage-glow className="absolute left-1/2 top-1/2 aspect-square w-[min(56cqw,14rem)] -translate-x-1/2 -translate-y-1/2 animate-fx-shock rounded-full border-[3px] border-[color:rgb(var(--fx-rgb))] opacity-0 motion-reduce:hidden" />
      {/* En el celular el efecto escrito va al lado de la carta, no debajo: el conjunto entra arriba de la fila del medio. */}
      <div className={cx('relative motion-reduce:animate-none', detail ? 'animate-card-activate-read max-sm:flex max-sm:items-start max-sm:gap-2' : linger ? 'animate-card-activate-linger' : 'animate-card-activate-center')}>
        {caption ? (
          <span data-stage-text className="absolute bottom-full left-1/2 mb-3 max-w-[88cqw] max-sm:mb-1.5 -translate-x-1/2 truncate whitespace-nowrap rounded-full border-2 border-[color:rgb(var(--fx-rgb)/0.9)] bg-background/90 px-3.5 py-1 text-micro font-bold text-foreground shadow-[0_0_18px_rgb(var(--fx-rgb)/0.5)]">
            {caption}
          </span>
        ) : null}
        <div className="flex items-start justify-center gap-3">
          {shown.map((card) => (
            <figure key={card.id} className={cx('m-0 grid justify-items-center gap-2 max-sm:max-w-23', detail && shown.length === 1 ? STAGE_CARD_WIDTH_WITH_DETAIL : STAGE_CARD_WIDTH[shown.length])}>
              {/* Dos caras: la de adelante (la carta) y la de atrás (el dorso), que se muestra primero y se da vuelta en 3D. */}
              <div data-stage-card={card.id} className="relative aspect-[421/614] w-full [perspective:900px]">
                <div className={cx('absolute inset-0 [transform-style:preserve-3d]', flip && 'animate-fx-flip-in motion-reduce:animate-none')}>
                  <div className={cx(STAGE_FACE, '[backface-visibility:hidden]')}>
                    {card.back ? <span className={CARD_BACK} /> : <CardArt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />}
                    <FxFrame tone={tone} shine />
                  </div>
                  {flip ? (
                    <div className={cx(STAGE_FACE, '[backface-visibility:hidden] [transform:rotateY(180deg)]')}>
                      <span className={CARD_BACK} />
                    </div>
                  ) : null}
                </div>
              </div>
              {card.name ? <figcaption data-stage-text className="line-clamp-2 max-w-full bg-background/85 px-2 py-0.5 text-center text-micro font-bold text-foreground">{card.name}</figcaption> : null}
            </figure>
          ))}
        </div>
        {/* El efecto que activa el rival (Gastón, 2026-10-20: «sería ideal que el rival pueda ver qué efecto estoy activando»): cuándo se activa y qué hace, tal cual el texto de la carta. */}
        {detail ? (
          <div data-stage-text className="mx-auto mt-3 grid w-[min(88cqw,24rem)] gap-0.5 rounded-card border border-[color:rgb(var(--fx-rgb)/0.6)] bg-background/92 px-3 py-2 text-left max-sm:mx-0 max-sm:mt-0 max-sm:w-[min(60cqw,16rem)]">
            <p className="m-0 text-micro font-bold text-info-soft max-sm:line-clamp-2">{detail.lead}</p>
            {/* En el celular, tres renglones: tiene que entrar arriba de la fila del medio (el texto entero está en la ficha). */}
            <p className="m-0 line-clamp-6 text-body font-semibold leading-snug text-foreground max-sm:line-clamp-3">{detail.text}</p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
