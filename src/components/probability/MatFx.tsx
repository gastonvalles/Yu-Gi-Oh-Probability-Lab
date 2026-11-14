import { cloneElement, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement, type Ref, type RefObject } from 'react'

import type { PickStat } from '../../app/auto/ask-ui'
import type { TallyView } from '../../app/auto/tally'
import type { ChainBadgeData, ChainMedal } from '../../app/card-glow'
import { printedBadge, statShift } from '../../app/field-stats'
import { CUT } from '../../app/flipbooks'
import type { LandingTone, ShowcaseKind, SpotlightKind } from '../../app/mat-effects'
import { EASE_IN_OUT, EASE_OUT, prefersReducedMotion } from '../../app/motion'
import { FLIGHT_MS, LANDING_AT, type CardPose } from '../../app/use-card-flights'
import { DROP_HIT_MS } from '../../app/card-weight'
import { EXIT_MS, useLeaving } from '../../app/use-presence'
import { t } from '../../i18n'
import type { ApiCardReference } from '../../types'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { Flipbook } from '../ui/Flipbook'
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
 * el arte. Va al lado de la carta (la carta recortaría lo que se sale) y mide el 26 % de la casilla (15 px a 390). Decorativa:
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

/** «Sin efecto · por CL2» (o «Negada»): el estado de un eslabón negado, con quién lo negó si se sabe. */
const voidedText = ({ state, by }: NonNullable<ChainBadgeData['voided']>) => (by ? t('auto.chain.by', { state: t(`auto.chain.state.${state}`), by }) : t(`auto.chain.state.${state}`))

/** El nombre de una carta con su eslabón: la insignia es decorativa y esto es lo que se lee. */
export const chainLinkLabel = (name: string, link: ChainBadgeData) => {
  const label = t(link.fromHand ? 'auto.link.labelHand' : 'auto.link.label', { name, numbers: link.numbers.join(', ') })

  return link.voided ? t('auto.link.void', { label, state: voidedText(link.voided) }) : label
}

/** El aro de cadena del medallón: 12 eslabones alrededor, alternados de frente (huecos) y de canto (barras), en el `viewBox` de 40 × 40. */
const MEDAL_RING = Array.from({ length: 12 }, (_, i) => i * 30)

/** Cuánto se corre cada medallón respecto del de al lado cuando hay varios en un mismo lugar (se pisan un tercio), y lo que dura su salida. */
const MEDAL_STEP_PX = 24
const MEDAL_OUT_MS = 220
const medalOffsets = (medals: readonly ChainMedal[]) => new Map(medals.map((medal, i) => [medal.number, (i - (medals.length - 1) / 2) * MEDAL_STEP_PX]))

/**
 * Los medallones de la cadena (Master Duel, al resolver): uno por eslabón, centrados en el lugar donde se activó (la casilla, aunque quede vacía; la pila; la mano: quien lo usa pone
 * la caja), corridos si son varios. Cada uno es un aro de cadena (redondo: es una ficha, como las de los contadores; va en SVG) con su número adentro, blanco con luz celeste
 * y el aro del metal de la escena (la misma familia que `ChainStage`), de 36 px. El que se resuelve late; sólo el negado o sin efecto se tacha en rojo (al quedar así, lo cruza el corte: `CUT`, un flipbook). No ataja toques; sólo se mira
 * (`aria-hidden`): el eslabón va en el nombre de la carta (`chainLinkLabel`). Se van del último al primero, a medida que se resuelven (`medalsOf`).
 * - **Suave** (Gastón: «la animación de las cadenas debe ser smooth»): cada uno entra creciendo con opacidad y, al resolverse, se rompe (crece y se apaga, `MEDAL_OUT_MS`) en vez
 *   de desaparecer; los que quedan en el mismo lugar se reacomodan con `translate` (cada uno, en su lugar por número), sin saltar. El último de un lugar sale igual si quien lo usa
 *   lo envuelve en `Presence` (`useLeaving`). Sólo `translate`/`scale`/`opacity`; con movimiento reducido, sólo la opacidad.
 */
export function ChainBadge({ medals }: { medals: readonly ChainMedal[] }) {
  const closing = useLeaving()
  // Los que se acaban de ir, en el lugar donde estaban, mientras se rompen.
  const [kept, setKept] = useState(medals)
  const [gone, setGone] = useState<Array<ChainMedal & { x: number }>>([])
  const isNow = (number: number) => medals.some((medal) => medal.number === number)

  if (medals.map((medal) => medal.number).join() !== kept.map((medal) => medal.number).join()) {
    const before = medalOffsets(kept)

    setGone([...gone.filter((medal) => !isNow(medal.number)), ...kept.filter((medal) => !isNow(medal.number)).map((medal) => ({ ...medal, resolving: false, x: before.get(medal.number) ?? 0 }))])
    setKept(medals)
  }
  useEffect(() => {
    if (!gone.length) return
    const timer = window.setTimeout(() => setGone([]), MEDAL_OUT_MS)

    return () => window.clearTimeout(timer)
  }, [gone])
  const at = medalOffsets(medals)
  const shown = [...gone.map((medal) => ({ ...medal, out: true })), ...medals.map((medal) => ({ ...medal, x: at.get(medal.number) ?? 0, out: closing }))].sort((a, b) => a.number - b.number)

  return (
    <span
      aria-hidden="true"
      data-chain-link={medals.map((medal) => medal.number).join(',')}
      data-chain-owner={medals[0]?.mine ? 'mine' : 'theirs'}
      className="pointer-events-none absolute inset-0 z-11 grid place-items-center"
    >
      {shown.map(({ number, voided, resolving, x, out }) => (
        <span
          key={number}
          {...(out ? { 'data-chain-medal-leaving': number } : { 'data-chain-medal': number })}
          {...(resolving && !out ? { 'data-resolving': '' } : {})}
          {...(voided ? { 'data-voided': '' } : {})}
          style={{ translate: `${x}px 0` }}
          className={cx(
            'relative col-start-1 row-start-1 size-9 transition-[translate,scale,opacity] duration-200 ease-out starting:scale-75 starting:opacity-0 motion-reduce:transition-opacity',
            out && 'scale-125 opacity-0',
          )}
        >
          {/* Al quedar negado, el medallón parpadea cuatro veces (`animate-chain-void`) tras un destello celeste corto, encima (Master Duel lo da azul `#1300ff`, que sobre el carbón no se ve). */}
          <span className={cx('grid size-full place-items-center motion-reduce:animate-none', !out && (voided ? 'animate-chain-void' : resolving && 'animate-chain-resolve'))}>
            <svg viewBox="0 0 40 40" className="absolute inset-0 size-full overflow-visible">
              <circle cx={20} cy={20} r={18} className="fill-background" />
              {MEDAL_RING.map((angle, i) =>
                i % 2 === 0 ? (
                  <rect key={angle} x={16.5} y={0.5} width={7} height={4.5} rx={2.25} strokeWidth={2.4} transform={`rotate(${angle} 20 20)`} className="fill-none stroke-chain-metal" />
                ) : (
                  <rect key={angle} x={16.5} y={1.25} width={7} height={3} rx={1.5} transform={`rotate(${angle} 20 20)`} className="fill-chain-metal-lo" />
                ),
              )}
              {voided ? <line x1={9} y1={31} x2={31} y2={9} strokeWidth={3.5} strokeLinecap="round" className="stroke-danger" /> : null}
            </svg>
            <span className="relative text-lead font-extrabold leading-none tabular-nums text-white text-shadow-md text-shadow-chain-glow">{number}</span>
            {/* Al resolver, el brillo corto (Master Duel: +0,2 en 100 ms): la opacidad de una capa, sin `filter`. */}
            {resolving && !voided && !out ? <span data-chain-glint="" className="absolute inset-0 animate-chain-glint bg-radial from-white/25 from-30% to-transparent to-70% fx-lite:hidden motion-reduce:hidden" /> : null}
          </span>
          {voided && !out ? <span data-chain-void-flash="" className="absolute -inset-2 animate-chain-void-flash bg-radial from-chain-glow from-30% to-transparent to-70% fx-lite:hidden motion-reduce:hidden" /> : null}
          {/* Al quedar negado, el corte (un flipbook) pasa por donde queda la tacha. */}
          {voided && !out ? <Flipbook book={CUT} className="absolute -inset-2" /> : null}
        </span>
      ))}
    </span>
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
 * El ATK/DEF de un monstruo boca arriba del campo (`fieldStatsOf`: el de ahora en el duelo automático, el impreso en la mesa manual; eligiéndolo, `pickStatsOf`), en una placa de 10 px (`text-tag`) al pie
 * de la carta, sobre su cuadro de texto (que a este tamaño no se lee): el arte queda entero. Siempre los dos números en un renglón, también en defensa (Gastón, 2026-11-12: «no depende de la posición»);
 * un Link, sólo el ATK. Nada más va sobre la carta: la ficha (`badge`: ★ Nivel, R Rango o LINK) sale de la mesa y vive en la ficha de la carta (`levelText`); vuelve, arriba y al centro, sólo mientras se
 * elige (la de `pickStatsOf`, o la casilla con `data-pick`: Sacrificios y materiales de la mesa manual), que es cuando el Nivel decide. No cambian la caja de la carta ni la de la casilla. El número que
 * cambió respecto del impreso (`printed`, sólo los de ahora), en menta si subió y en rojo claro si bajó; un «?» y la mesa manual, sin color. La DEF que no cambió, apagada. Sólo se mira (`aria-hidden`): lo
 * que se lee va en el nombre de la carta (`statLabel`, `pickStatLabel`). Se monta con la carta (también sin `stat`) y entra cuando la carta llega volando a su casilla (`animate-chip-drop`,
 * `animate-chip-rise` 70 ms después); con movimiento reducido, quietas.
 */
export function StatTag({ stat, className }: { stat: PickStat | null; className?: string }) {
  const badge = stat?.badge
  const atkShift = stat ? statShift(stat.attack, stat.printed?.attack) : null
  const defShift = stat ? statShift(stat.defense, stat.printed?.defense) : null

  return (
    <>
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[16%] z-11 grid justify-items-center animate-chip-drop motion-reduce:animate-none" style={BADGE_ARRIVAL}>
        {badge ? (
          <span data-stat-badge={badge.kind} className={cx(STAT_CHIP, stat.resting ? 'hidden in-data-[pick=true]:block' : 'block')}>{`${BADGE_MARK[badge.kind]}\u2009${badge.value}`}</span>
        ) : null}
      </span>
      <span aria-hidden="true" className={cx('pointer-events-none absolute inset-x-0 bottom-0 z-11 grid justify-items-center animate-chip-rise motion-reduce:animate-none', className)} style={STAT_ARRIVAL}>
        {stat ? (
          <span data-pick-stat="" className={cx(STAT_CHIP, 'block')}>
            <span data-shift={atkShift ?? undefined} className={cx(atkShift && SHIFT_TONE[atkShift])}>{stat.attack}</span>
            {stat.defense === null ? null : (
              <span data-shift={defShift ?? undefined} className={cx('font-semibold', defShift ? SHIFT_TONE[defShift] : 'text-muted')}>
                <span className="text-muted">{STAT_SEPARATOR}</span>
                {stat.defense}
              </span>
            )}
          </span>
        ) : null}
      </span>
    </>
  )
}

/** Lo que cuenta una carta (`tally.ts`), en una frase: «Efectos de monstruo del rival este turno: 3 de 5». La línea del visor. */
export const tallyText = ({ counts, count, limit }: TallyView) => t(`auto.tally.${counts}`, { count, limit })

/** El nombre de una carta que cuenta algo, con lo que cuenta: el número de la mesa es decorativo y esto es lo que se lee. */
export const tallyLabel = (name: string, tally: TallyView | null | undefined) => (tally ? t('auto.tally.label', { name, what: tallyText(tally) }) : name)

/**
 * El número que cuenta una carta (Angelechy Shatranga en las Mágicas y Trampas, Nibiru en tu mano: `tally.ts`), arriba a la derecha (los contadores van a la izquierda), en carbón como la placa del
 * ATK/DEF y derecho también en el campo del rival. Al llegar a su umbral, en ámbar con su aro: «ojo», el rival ya no puede (Shatranga) o vos ya podés (Nibiru). Cada número nuevo entra con un rebote
 * corto (`animate-pop`: la `key` es el número); con movimiento reducido, quieto. Sólo se mira: lo que se lee va en el nombre de la carta (`tallyLabel`).
 */
export function TallyChip({ tally }: { tally: TallyView }) {
  const reached = tally.count >= tally.limit

  return (
    <span
      key={tally.count}
      aria-hidden="true"
      data-tally={tally.count}
      data-tally-reached={reached ? 'true' : 'false'}
      className={cx('pointer-events-none absolute right-0.5 top-0.5 z-2 grid h-4.5 min-w-4.5 animate-pop place-items-center bg-background/92 px-0.5 text-micro font-extrabold leading-none tabular-nums motion-reduce:animate-none', reached ? 'text-warning-soft ring-2 ring-warning' : 'text-foreground ring-1 ring-border-subtle')}
    >
      {tally.count}
    </span>
  )
}

/** 10 px (`text-tag`) con su renglón de 12,5 (`leading-tight`), apretado (`tracking-tighter`) y de cifras tabulares, con el carbón al 92 % debajo: se lee sobre cualquier arte (≥4,5:1). Sin `block`: lo pone cada uso. */
const STAT_CHIP = 'w-fit whitespace-nowrap bg-background/92 px-px text-tag leading-tight tracking-tighter font-extrabold tabular-nums text-foreground ring-1 ring-border-subtle'

/** La barra entre el ATK y la DEF, sin espacios: «3000/2500» mide 52 px a 10 px y es lo que entra entre dos casillas a 360. */
const STAT_SEPARATOR = '/'

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

/** Cuándo toca la carta su casilla, en ms desde la jugada: al final de su vuelo (`LANDING_AT`), al caer la que esperaba levantada ahí (`DROP_HIT_MS`) o ya. */
export const landingDelay = (flies: boolean, dropped: boolean) => (flies ? Math.round(FLIGHT_MS * LANDING_AT) : dropped ? DROP_HIT_MS : 0)

/**
 * Una carta que cae en una zona de monstruo: un fogonazo, el aro lima del golpe que se abre, otro del color de cómo llega (Normal dorado,
 * Especial celeste, Fusión violeta, Sincronía blanca, Xyz azul, Enlace verde agua) y chispas, cuando la carta, que viene volando, toca la zona (`LANDING_AT` del vuelo).
 */
export function LandingBurst({ tone, flies, dropped = false }: { tone: LandingTone; flies: boolean; /** La carta esperaba levantada ahí y cae (`dropFrames`): el golpe, cuando toca. */ dropped?: boolean }) {
  // El retraso va en línea en cada pieza: una variable en el token de la animación se resolvería en la raíz, no acá.
  const delay = (extra = 0): CSSProperties => ({ animationDelay: `${landingDelay(flies, dropped) + extra}ms` })

  return (
    <span aria-hidden="true" data-fx="landing" data-tone={tone} className="pointer-events-none absolute inset-0 z-4 motion-reduce:hidden" style={fxVars(LANDING_TONE[tone])}>
      <span className="absolute inset-0 animate-fx-flash bg-[radial-gradient(circle,rgb(255_255_255/0.95),rgb(var(--fx-rgb)/0.75)_35%,transparent_72%)]" style={delay()} />
      {/* El golpe: un aro lima que se abre desde la casilla cuando la carta la toca, y detrás otro del color de cómo llegó. */}
      <span className="absolute inset-0 animate-fx-shock border-[3px] border-info bg-[radial-gradient(closest-side,transparent_60%,rgb(var(--info-rgb)/0.4))] opacity-0" style={delay()} />
      {/* Con «Livianos», menos destellos a la vez: sin el segundo aro ni las chispas. */}
      <span className="absolute inset-0 animate-fx-shock border-2 opacity-0 border-[color:rgb(var(--fx-rgb))] bg-[radial-gradient(closest-side,transparent_60%,rgb(var(--fx-rgb)/0.4))] fx-lite:hidden" style={delay(110)} />
      {SPARKS.map(([x, y]) => (
        <span
          key={`${x}:${y}`}
          className="absolute left-1/2 top-1/2 -ml-2 -mt-2 size-4 animate-fx-spark bg-[radial-gradient(circle,#fff_20%,rgb(var(--fx-rgb)/0.8)_40%,transparent_70%)] opacity-0 fx-lite:hidden"
          style={{ ...delay(), '--dx': `${x}rem`, '--dy': `${y}rem` } as CSSProperties}
        />
      ))}
    </span>
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
  /** Lo que pasó, en una línea recta arriba de la carta; sin ella, donde el texto del paso ya está a la vista (el Replay, el combo). */
  caption?: string | null
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
  /** Su raíz (`SpotlightSwap` la funde al llegar otra). */
  ref?: Ref<HTMLDivElement>
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

/**
 * Ancho de cada carta según cuántas son: una sola es grande (la mitad del recuadro: lo que mide la de adelante de `ChainStage`, unos 185 px a 390 px, y nunca menos del 38 %); con más, se achican para entrar juntas.
 * Con el efecto escrito al lado (`detail`) es más chica.
 */
const STAGE_CARD_WIDTH = ['', 'w-[min(50cqw,13rem)]', 'w-[min(30cqw,10rem)]', 'w-[min(22cqw,7.5rem)]', 'w-[min(18cqw,6.5rem)]']

/** Con el efecto escrito la carta es más chica: lo que hay que leer es el texto, y el conjunto tiene que entrar en el alto de la mesa. */
const STAGE_CARD_WIDTH_WITH_DETAIL = 'w-[min(34cqw,10.5rem)]'

/**
 * Las cartas grandes en el centro de la mesa cuando se activa, se muestra o se declara una carta (o, al reproducir un combo, cuando
 * un paso las mueve): aparecen con un resplandor y una onda, cada una con su marco de color y un reflejo, y arriba, recta, una línea que
 * dice qué pasó (`caption`; quien ya muestra el texto del paso, como el Replay y el combo, no la pasa). Con su imagen a la vista no lleva
 * la placa con el nombre (ya está impreso): ésa queda sólo en la carta sin imagen o de dorso. Se van solas. Se centran en el recuadro que les da el padre (`className`), y sus medidas (`cqw`) son las de ese
 * recuadro, no las de la pantalla. Con `origin`, cada una sale de su carta en la mesa (`useStageTravel`).
 */
export function Spotlight({ kind, cards, caption, detail, flip = false, linger = false, origin, className, ref }: SpotlightProps) {
  const tone = STAGE_TONE[kind]
  const shown = cards.slice(0, 4)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useImperativeHandle(ref, () => rootRef.current!, [])
  useStageRoom(rootRef)
  useStageTravel(rootRef, origin)

  return (
    <div
      ref={rootRef}
      data-activation={shown[0]?.id}
      data-kind={kind}
      aria-hidden="true"
      // Con el efecto escrito, en el celular se apoya sobre la fila del medio (arriba queda la barra a la vista); sola, la carta va al medio, grande.
      className={cx('pointer-events-none grid place-items-center overflow-hidden @container', className, detail && 'max-sm:bottom-auto max-sm:h-[var(--stage-room,100%)] max-sm:items-end max-sm:pb-2')}
      style={fxVars(tone)}
    >
      <span data-stage-glow className="absolute left-1/2 top-1/2 aspect-square w-[min(100cqw,30rem)] -translate-x-1/2 -translate-y-1/2 animate-fx-stage rounded-full bg-[radial-gradient(circle,rgb(var(--fx-rgb)/0.6),rgb(var(--fx-rgb)/0.18)_42%,transparent_68%)] motion-reduce:hidden" />
      <span data-stage-glow className="absolute left-1/2 top-1/2 aspect-square w-[min(56cqw,14rem)] -translate-x-1/2 -translate-y-1/2 animate-fx-shock rounded-full border-[3px] border-[color:rgb(var(--fx-rgb))] opacity-0 motion-reduce:hidden" />
      {/* En el celular el efecto escrito va al lado de la carta, no debajo: el conjunto entra arriba de la fila del medio. */}
      <div className={cx('relative motion-reduce:animate-none', detail ? 'animate-card-activate-read max-sm:flex max-sm:items-start max-sm:gap-2' : linger ? 'animate-card-activate-linger' : 'animate-card-activate-center')}>
        {caption ? (
          <span data-stage-text className="absolute bottom-full left-1/2 mb-3 max-w-[88cqw] max-sm:mb-1.5 -translate-x-1/2 truncate whitespace-nowrap border border-[color:rgb(var(--fx-rgb)/0.9)] bg-background/90 px-3.5 py-1 text-micro font-bold text-foreground shadow-[0_0_18px_rgb(var(--fx-rgb)/0.5)]">
            {caption}
          </span>
        ) : null}
        <div className="flex items-start justify-center gap-3">
          {shown.map((card) => (
            <figure key={card.id} className={cx('m-0 grid justify-items-center gap-2', detail && 'max-sm:max-w-23', detail && shown.length === 1 ? STAGE_CARD_WIDTH_WITH_DETAIL : STAGE_CARD_WIDTH[shown.length])}>
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
              {card.name && (card.back || !card.art) ? <figcaption data-stage-text className="line-clamp-2 max-w-full bg-background/85 px-2 py-0.5 text-center text-micro font-bold text-foreground">{card.name}</figcaption> : null}
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

/** ¿Se ve todavía? Corre alguna animación con fin de la carta grande (su espera y su salida; lo que gira sin fin no cuenta). */
const onStage = (root: HTMLElement | null) =>
  root?.getAnimations?.({ subtree: true }).some((animation) => animation.playState === 'running' && Number.isFinite(Number(animation.effect?.getComputedTiming().endTime))) === true

/**
 * La carta grande que llega con otra todavía a la vista no la reemplaza en seco (`docs/movimiento.md`: ningún vuelo se corta): la anterior se funde en `EXIT_MS` y recién después entra la nueva
 * (la `key` de cada `Spotlight` dice cuál es). Lo mismo si se va sin reemplazo. Si la anterior ya se fue sola (su animación terminó), la nueva entra enseguida. Sin la Web Animations API (jsdom) o
 * con movimiento reducido, como antes. Sólo `opacity`.
 */
export function SpotlightSwap({ children }: { children: ReactElement<SpotlightProps> | null }) {
  const [shown, setShown] = useState(children)
  const node = useRef<HTMLDivElement | null>(null)
  const latest = useRef(children)
  const same = (shown?.key ?? null) === (children?.key ?? null)
  // La misma carta sigue con lo último que le pasan (el nombre que llega después); sin ninguna, la nueva entra ya.
  if (same ? shown !== children : shown === null) setShown(children)
  const changing = shown !== null && !same

  useLayoutEffect(() => {
    latest.current = children
  })
  useLayoutEffect(() => {
    if (!changing) return
    const root = node.current

    if (!root || typeof root.animate !== 'function' || prefersReducedMotion() || !onStage(root)) {
      setShown(latest.current)
      return
    }
    let over = false
    const end = () => {
      if (over) return
      over = true
      setShown(latest.current)
    }
    const fade = root.animate([{ opacity: 0 }], { duration: EXIT_MS, easing: EASE_OUT, fill: 'forwards' })
    // Si la pestaña quedó atrás y la salida no avisa, igual entra la nueva.
    const net = window.setTimeout(end, EXIT_MS + 100)

    fade.finished.then(end, () => {})
    // Al terminar ya no está (la nueva tiene otra `key`); si en cambio vuelve la misma, se ve otra vez.
    return () => {
      over = true
      window.clearTimeout(net)
      fade.cancel()
    }
  }, [changing])

  return shown ? cloneElement(shown, { ref: node }) : null
}
