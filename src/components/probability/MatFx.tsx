import type { CSSProperties } from 'react'

import type { LandingTone, SpotlightKind } from '../../app/mat-effects'
import { PHASES, type MatPhase } from '../../app/practice-mat'
import { FLIGHT_MS } from '../../app/use-card-flights'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { FX_RGB, type FxTone } from './practice-styles'

/**
 * Los efectos de la mesa de práctica, además del vuelo de las cartas: el marco de una carta destacada, la mira de un objetivo, el destello
 * de una invocación, el cartel de la fase y la carta grande del centro. Todos son decorativos (`aria-hidden`; lo que pasó lo dice la barra
 * de pasos) y se apagan con `prefers-reduced-motion`. El color de cada uno es `--fx-rgb` (ver `FX_RGB`); las animaciones están en index.css.
 */

/** El color de un efecto como variable CSS: lo heredan todos los pedazos que lo dibujan. */
export const fxVars = (tone: FxTone): CSSProperties => ({ '--fx-rgb': FX_RGB[tone] }) as CSSProperties

/** Color de cada destaque: dorado al activar, rojo al marcar un objetivo, celeste al mostrar y violeta al declarar. */
export const SPOTLIGHT_TONE: Record<SpotlightKind, FxTone> = { activate: 'gold', target: 'red', reveal: 'cyan', declare: 'violet' }

/** Color de cada forma de llegar al campo. */
const LANDING_TONE: Record<LandingTone, FxTone> = { normal: 'gold', special: 'cyan', fusion: 'violet', synchro: 'white', xyz: 'indigo', link: 'teal' }

/**
 * Estados de una carta destacada (la de la mano y la del campo los comparten): el aro de afuera es el `box-shadow` de la carta, que se anima
 * según lo que le pasa (activada, revelada o declarada: se enciende y se expande; marcada como objetivo: late). Piden `--card-shadow` y `--fx-rgb`.
 */
export const FX_CARD = [
  'data-[flash=true]:z-10',
  'data-[flash-kind=activate]:animate-fx-halo data-[flash-kind=reveal]:animate-fx-halo data-[flash-kind=declare]:animate-fx-halo',
  'data-[targeted=true]:animate-fx-target-glow',
  // La carta de la que se está viendo el menú: aro y resplandor celestes fijos (el marco de adentro lleva la luz que gira).
  'data-[selected=true]:z-10 data-[selected=true]:[box-shadow:var(--card-shadow),0_0_0_2px_rgb(56_189_248/0.9),0_0_22px_4px_rgb(56_189_248/0.55)]',
  // Sin animaciones, el aro queda fijo.
  'motion-reduce:data-[flash=true]:[box-shadow:var(--card-shadow),0_0_0_2px_rgb(var(--fx-rgb)),0_0_18px_rgb(var(--fx-rgb)/0.7)]',
  'motion-reduce:data-[targeted=true]:[box-shadow:var(--card-shadow),0_0_0_2px_rgb(var(--fx-rgb)),0_0_18px_rgb(var(--fx-rgb)/0.7)]',
].join(' ')

interface FxFrameProps {
  tone: FxTone
  /** La luz que le da la vuelta al marco (por defecto sí; las cartas que brillan por una regla sólo llevan el marco). */
  orbit?: boolean
  /** Un reflejo que cruza la carta una vez. */
  shine?: boolean
}

/** Marco de color adentro de una carta: borde parejo, brillo hacia adentro y, si se pide, la luz que gira y el reflejo. */
export function FxFrame({ tone, orbit = true, shine = false }: FxFrameProps) {
  return <span aria-hidden="true" data-fx="frame" data-orbit={orbit ? undefined : 'false'} data-shine={shine ? 'true' : undefined} className="fx-frame animate-fx-frame-in motion-reduce:animate-none" style={fxVars(tone)} />
}

/** Las cuatro esquinas de la mira. */
const BRACKETS = [
  'left-[7%] top-[5%] border-l-[3px] border-t-[3px]',
  'right-[7%] top-[5%] border-r-[3px] border-t-[3px]',
  'bottom-[5%] left-[7%] border-b-[3px] border-l-[3px]',
  'bottom-[5%] right-[7%] border-b-[3px] border-r-[3px]',
]

/**
 * La mira de un objetivo (la comparten las cartas de la mano y del campo): cae sobre la carta girando, se cierra y queda con el aro
 * punteado dando vueltas; una onda sale del centro al fijarse y la carta se tiñe de rojo.
 */
export function TargetMark() {
  return (
    <span role="img" aria-label={t('practice.card.targetMark')} data-fx="target" className="pointer-events-none absolute inset-0 z-3 animate-fx-lock motion-reduce:animate-none" style={fxVars('red')}>
      <span className="absolute inset-0 bg-[radial-gradient(circle,rgb(var(--fx-rgb)/0.34),transparent_72%)]" />
      {BRACKETS.map((corner) => (
        <span key={corner} className={cx('absolute aspect-square w-[22%] border-[color:rgb(var(--fx-rgb))] drop-shadow-[0_0_3px_rgb(var(--fx-rgb))]', corner)} />
      ))}
      <span className="fx-crosshair absolute left-1/2 top-1/2 aspect-square w-[64%] -translate-x-1/2 -translate-y-1/2" />
      <span className="absolute left-1/2 top-1/2 aspect-square w-[46%] -translate-x-1/2 -translate-y-1/2 animate-fx-spin rounded-full border-2 border-dashed border-[color:rgb(var(--fx-rgb))] motion-reduce:animate-none" />
      <span className="absolute left-1/2 top-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:rgb(var(--fx-rgb))] shadow-[0_0_8px_3px_rgb(var(--fx-rgb)/0.9)]" />
      <span className="absolute left-1/2 top-1/2 aspect-square w-[56%] -translate-x-1/2 -translate-y-1/2 animate-fx-ping rounded-full border-2 border-[color:rgb(var(--fx-rgb))] motion-reduce:hidden" />
    </span>
  )
}

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
 * Especial celeste, Fusión violeta, Sincronía blanca, Xyz azul, Enlace verde agua) y esperando a que termine de volar hasta la zona.
 */
export function LandingBurst({ tone, flies }: { tone: LandingTone; flies: boolean }) {
  // El retraso va en línea en cada pieza: una variable en el token de la animación se resolvería en la raíz, no acá.
  const delay = (extra = 0): CSSProperties => ({ animationDelay: `${(flies ? FLIGHT_MS - 120 : 0) + extra}ms` })

  return (
    <span aria-hidden="true" data-fx="landing" data-tone={tone} className="pointer-events-none absolute inset-0 z-4 motion-reduce:hidden" style={fxVars(LANDING_TONE[tone])}>
      <span className="absolute inset-0 animate-fx-flash bg-[radial-gradient(circle,rgb(255_255_255/0.95),rgb(var(--fx-rgb)/0.75)_35%,transparent_72%)]" style={delay()} />
      <span className="absolute inset-0 animate-fx-shock border-[3px] border-[color:rgb(var(--fx-rgb))] shadow-[0_0_14px_rgb(var(--fx-rgb)/0.8)]" style={delay()} />
      <span className="absolute inset-0 animate-fx-shock border border-[color:rgb(var(--fx-rgb)/0.8)]" style={delay(110)} />
      {SPARKS.map(([x, y]) => (
        <span
          key={`${x}:${y}`}
          className="absolute left-1/2 top-1/2 -ml-[3px] -mt-[3px] size-1.5 animate-fx-spark bg-white shadow-[0_0_6px_2px_rgb(var(--fx-rgb))]"
          style={{ ...delay(), '--dx': `${x}rem`, '--dy': `${y}rem` } as CSSProperties}
        />
      ))}
    </span>
  )
}

/** El cartel de una fase nueva (y del turno, si empieza otro): se asoma en el medio de la mesa y se va agrandándose. */
export function PhaseBanner({ phase, turn, className }: { phase: MatPhase; turn: number | null; className?: string }) {
  const name = PHASES.find((entry) => entry.id === phase)?.name ?? phase

  return (
    <div aria-hidden="true" data-fx="banner" className={cx('pointer-events-none grid place-items-center motion-reduce:hidden', className)}>
      <div
        className="grid animate-fx-banner justify-items-center gap-0.5 rounded-card border-2 border-[color:rgb(var(--fx-rgb)/0.9)] bg-background/90 px-6 py-2.5 text-center shadow-[0_0_36px_rgb(var(--fx-rgb)/0.45),inset_0_0_18px_rgb(var(--fx-rgb)/0.2)]"
        style={fxVars('gold')}
      >
        {turn !== null ? <span className="text-micro font-bold uppercase tracking-[0.2em] text-[color:rgb(var(--fx-rgb))]">{t('practice.mat.turn', { turn })}</span> : null}
        <span className="text-lead font-extrabold uppercase tracking-[0.18em] text-[#fde68a]">{name}</span>
      </div>
    </div>
  )
}

interface SpotlightProps {
  id: string
  kind: SpotlightKind
  name: string
  art: string | null
  /** Lo que pasó, en una línea (el texto del paso). */
  caption: string | null
}

/**
 * La carta grande en el centro de la pantalla cuando se activa, se muestra o se declara: aparece con un resplandor y una onda, con su marco
 * de color y un reflejo, y arriba una línea que dice qué pasó. Se va sola (la dibuja el padre en un portal, sobre todo lo demás).
 */
export function Spotlight({ id, kind, name, art, caption }: SpotlightProps) {
  const tone = SPOTLIGHT_TONE[kind]

  return (
    <div data-activation={id} data-kind={kind} aria-hidden="true" className="pointer-events-none fixed inset-0 z-205 grid place-items-center" style={fxVars(tone)}>
      <span className="absolute left-1/2 top-1/2 aspect-square w-[min(100vw,30rem)] -translate-x-1/2 -translate-y-1/2 animate-fx-stage rounded-full bg-[radial-gradient(circle,rgb(var(--fx-rgb)/0.6),rgb(var(--fx-rgb)/0.18)_42%,transparent_68%)] motion-reduce:hidden" />
      <span className="absolute left-1/2 top-1/2 aspect-square w-[min(56vw,14rem)] -translate-x-1/2 -translate-y-1/2 animate-fx-shock rounded-full border-[3px] border-[color:rgb(var(--fx-rgb))] motion-reduce:hidden" />
      <div className="relative animate-card-activate-center motion-reduce:animate-none">
        {caption ? (
          <span className="absolute bottom-full left-1/2 mb-3 max-w-[88vw] -translate-x-1/2 truncate whitespace-nowrap rounded-full border-2 border-[color:rgb(var(--fx-rgb)/0.9)] bg-background/90 px-3.5 py-1 text-micro font-bold text-foreground shadow-[0_0_18px_rgb(var(--fx-rgb)/0.5)]">
            {caption}
          </span>
        ) : null}
        <div className="relative aspect-[421/614] w-[min(42vw,13rem)] overflow-hidden bg-input shadow-[0_0_0_3px_rgb(var(--fx-rgb)),0_0_60px_rgb(var(--fx-rgb)/0.8),0_24px_48px_rgba(0,0,0,0.6)]">
          <CardArt remoteUrl={art} name={name} className="block h-full w-full object-cover" />
          <FxFrame tone={tone} shine />
        </div>
      </div>
    </div>
  )
}
