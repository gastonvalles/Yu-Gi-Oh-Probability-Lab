import type { CSSProperties } from 'react'

import type { LandingTone, ShowcaseKind, SpotlightKind } from '../../app/mat-effects'
import { PHASES, type MatPhase } from '../../app/practice-mat'
import { FLIGHT_MS } from '../../app/use-card-flights'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { CARD_BACK, FX_RGB, type FxTone } from './practice-styles'

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

/** Color del cartel del centro: el del destaque, o el de a dónde van las cartas del paso (la mano y el deck celeste, el cementerio violeta, el destierro ámbar) o cómo llegan al campo. */
const STAGE_TONE: Record<SpotlightKind | ShowcaseKind, FxTone> = { ...SPOTLIGHT_TONE, ...LANDING_TONE, hand: 'cyan', gy: 'violet', banish: 'amber', extra: 'cyan', deck: 'cyan', attach: 'indigo' }

/**
 * Estados de una carta destacada (la de la mano y la del campo los comparten): el aro de afuera es el `box-shadow` de la carta, que se anima
 * según lo que le pasa (activada, revelada o declarada: se enciende y se expande; marcada como objetivo: late). Piden `--card-shadow` y `--fx-rgb`.
 */
export const FX_CARD = [
  'data-[flash=true]:z-10',
  // Dos atributos en cada selector (más específico que el brillo de una regla o la marca de objetivo): si coinciden, el destello de activar gana.
  'motion-safe:data-[flash=true]:data-[flash-kind=activate]:animate-fx-halo motion-safe:data-[flash=true]:data-[flash-kind=reveal]:animate-fx-halo motion-safe:data-[flash=true]:data-[flash-kind=declare]:animate-fx-halo',
  'motion-safe:data-[targeted=true]:animate-fx-target-glow',
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
 * La mira de un objetivo (la comparten las cartas de la mano y del campo, las del visor de una pila y la casilla del cementerio y del destierro): cae sobre la carta girando, se cierra y queda con el aro
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
 * El cartel de una fase nueva (y del turno, si empieza otro): una banda violeta que cruza el campo y se apaga en los bordes, con el nombre de la
 * fase en grande, el turno arriba en verde y las seis fases abajo con la actual encendida, igual que los botones de la mesa.
 */
export function PhaseBanner({ phase, turn, className }: { phase: MatPhase; turn: number | null; className?: string }) {
  const name = PHASES.find((entry) => entry.id === phase)?.name ?? phase

  return (
    <div aria-hidden="true" data-fx="banner" className={cx('pointer-events-none grid place-items-center motion-reduce:hidden', className)}>
      <div className="relative grid w-full animate-fx-banner justify-items-center gap-1.5 bg-[linear-gradient(90deg,transparent,rgb(var(--primary-rgb)/0.5)_16%,rgb(var(--background-rgb)/0.92)_50%,rgb(var(--primary-rgb)/0.5)_84%,transparent)] py-3.5 shadow-[0_0_34px_rgb(var(--primary-rgb)/0.45)] min-[1101px]:py-5">
        <span className="absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgb(var(--accent-rgb))_22%,rgb(var(--accent-rgb))_78%,transparent)] shadow-[0_0_10px_rgb(var(--accent-rgb)/0.8)]" />
        <span className="absolute inset-x-0 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgb(var(--accent-rgb))_22%,rgb(var(--accent-rgb))_78%,transparent)] shadow-[0_0_10px_rgb(var(--accent-rgb)/0.8)]" />
        {turn !== null ? <span className="animate-fx-banner-text text-micro font-bold uppercase tracking-[0.28em] text-accent">{t('practice.mat.turn', { turn })}</span> : null}
        <span className="animate-fx-banner-text text-title font-extrabold uppercase leading-none tracking-[0.22em] text-foreground [text-shadow:0_0_24px_rgb(var(--primary-hover-rgb))] min-[1101px]:text-stat">{name}</span>
        <span className="flex gap-1.5">
          {PHASES.map((entry) => (
            <span
              key={entry.id}
              className={cx(
                'grid size-6 place-items-center rounded-full border text-[0.55rem] font-extrabold leading-none',
                entry.id === phase ? 'border-accent bg-accent text-[#06140e] shadow-[0_0_12px_rgb(var(--accent-rgb)/0.7)]' : 'border-tint/25 text-soft',
              )}
            >
              {entry.short}
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

interface SpotlightCard {
  id: string
  name: string
  art: string | null
}

interface SpotlightProps {
  /** Para qué se muestra o a dónde van las cartas: da el color. */
  kind: SpotlightKind | ShowcaseKind
  /** Una carta (activar, mostrar, declarar, una invocación) o varias (robar o mandar al cementerio de a más de una). */
  cards: SpotlightCard[]
  /** Lo que pasó, en una línea (el texto del paso). */
  caption: string | null
  /** Las cartas salen del deck o del Extra: aparecen de dorso y se dan vuelta en 3D. */
  flip?: boolean
  /** Dónde se ubica (el padre dice sobre qué parte de la mesa se centran las cartas). */
  className?: string
}

/** El resplandor de cada carta del centro (el color del paso, con una sombra abajo). */
const STAGE_FACE = 'absolute inset-0 overflow-hidden bg-input shadow-[0_0_0_3px_rgb(var(--fx-rgb)),0_0_60px_rgb(var(--fx-rgb)/0.8),0_24px_48px_rgba(0,0,0,0.6)]'

/** Ancho de cada carta según cuántas son: una sola es grande; con más, se achican para entrar juntas. */
const STAGE_CARD_WIDTH = ['', 'w-[min(42cqw,13rem)]', 'w-[min(30cqw,10rem)]', 'w-[min(22cqw,7.5rem)]', 'w-[min(18cqw,6.5rem)]']

/**
 * Las cartas grandes en el centro de la mesa cuando se activa, se muestra o se declara una carta (o, al reproducir un combo, cuando
 * un paso las mueve): aparecen con un resplandor y una onda, cada una con su marco de color, un reflejo y su nombre debajo, y arriba una
 * línea que dice qué pasó. Se van solas. Se centran en el recuadro que les da el padre (`className`), y sus medidas (`cqw`) son las de ese
 * recuadro, no las de la pantalla.
 */
export function Spotlight({ kind, cards, caption, flip = false, className }: SpotlightProps) {
  const tone = STAGE_TONE[kind]
  const shown = cards.slice(0, 4)

  return (
    <div data-activation={shown[0]?.id} data-kind={kind} aria-hidden="true" className={cx('pointer-events-none @container grid place-items-center overflow-hidden', className)} style={fxVars(tone)}>
      <span className="absolute left-1/2 top-1/2 aspect-square w-[min(100cqw,30rem)] -translate-x-1/2 -translate-y-1/2 animate-fx-stage rounded-full bg-[radial-gradient(circle,rgb(var(--fx-rgb)/0.6),rgb(var(--fx-rgb)/0.18)_42%,transparent_68%)] motion-reduce:hidden" />
      <span className="absolute left-1/2 top-1/2 aspect-square w-[min(56cqw,14rem)] -translate-x-1/2 -translate-y-1/2 animate-fx-shock rounded-full border-[3px] border-[color:rgb(var(--fx-rgb))] opacity-0 motion-reduce:hidden" />
      <div className="relative animate-card-activate-center motion-reduce:animate-none">
        {caption ? (
          <span className="absolute bottom-full left-1/2 mb-3 max-w-[88cqw] -translate-x-1/2 truncate whitespace-nowrap rounded-full border-2 border-[color:rgb(var(--fx-rgb)/0.9)] bg-background/90 px-3.5 py-1 text-micro font-bold text-foreground shadow-[0_0_18px_rgb(var(--fx-rgb)/0.5)]">
            {caption}
          </span>
        ) : null}
        <div className="flex items-start justify-center gap-3">
          {shown.map((card) => (
            <figure key={card.id} className={cx('m-0 grid justify-items-center gap-2', STAGE_CARD_WIDTH[shown.length])}>
              {/* Dos caras: la de adelante (la carta) y la de atrás (el dorso), que se muestra primero y se da vuelta en 3D. */}
              <div className="relative aspect-[421/614] w-full [perspective:900px]">
                <div className={cx('absolute inset-0 [transform-style:preserve-3d]', flip && 'animate-fx-flip-in motion-reduce:animate-none')}>
                  <div className={cx(STAGE_FACE, '[backface-visibility:hidden]')}>
                    <CardArt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />
                    <FxFrame tone={tone} shine />
                  </div>
                  {flip ? (
                    <div className={cx(STAGE_FACE, '[backface-visibility:hidden] [transform:rotateY(180deg)]')}>
                      <span className={CARD_BACK} />
                    </div>
                  ) : null}
                </div>
              </div>
              <figcaption className="line-clamp-2 max-w-full bg-background/85 px-2 py-0.5 text-center text-micro font-bold text-foreground">{card.name}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  )
}
