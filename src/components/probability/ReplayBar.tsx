import { Fragment, memo, useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'

import { useEscapeKey } from '../../app/use-overlay'
import { usePresence } from '../../app/use-presence'
import { numberLocale, t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { FX_RGB, type FxTone } from './practice-styles'

/** Las velocidades del replay, como en YGOPocket: la mitad, normal, una vez y media y el doble. */
export type ReplaySpeed = 0.5 | 1 | 1.5 | 2
const REPLAY_SPEEDS: readonly ReplaySpeed[] = [0.5, 1, 1.5, 2]

/** Una marca por jugada: la que cambia de fase lleva una rayita arriba y la que empieza un turno, una línea que la separa de la anterior; `tone` es el color de lo que hace (`stepTone`), sin color (`null`) va en gris. */
export interface ReplayMark {
  phase: boolean
  turnStart: boolean
  tone?: FxTone | null
}

const formatSpeed = (speed: number) => `${new Intl.NumberFormat(numberLocale()).format(speed)}×`

/** La mano inicial, verde: el principio. */
const START_TONE: FxTone = 'green'

/** Cada paso con el color de lo que hace (`--pill`, el de su destello en la mesa): los ya vistos, vivos; el actual, ámbar y más alto (como el botón de reproducir) y con un resplandor; los que faltan, apagados. */
const PILL = {
  done: 'h-2.5 bg-[rgb(var(--pill)/0.95)]',
  current: 'h-3.5 bg-info shadow-[0_0_10px_rgb(var(--info-rgb)/0.75)]',
  upcoming: 'h-2.5 bg-[rgb(var(--pill)/0.3)]',
} as const

/** Un paso sin color (colocar boca abajo, cambiar de posición, un contador): gris. */
const PILL_PLAIN = {
  done: 'h-2.5 bg-tint/60',
  current: PILL.current,
  upcoming: 'h-2.5 bg-tint/22',
} as const

interface TimelineProps {
  marks: ReplayMark[]
  cursor: number
  describe: (cursor: number) => string
  onSeek: (cursor: number) => void
  className?: string
}

/**
 * La línea de tiempo: una pastilla por paso (la primera es la mano inicial). Se toca o se arrastra para ir a un paso, y con el teclado
 * (flechas, Inicio, Fin, Re Pág y Av Pág) como cualquier deslizador.
 */
function Timeline({ marks, cursor, describe, onSeek, className }: TimelineProps) {
  const total = marks.length
  const ref = useRef<HTMLDivElement | null>(null)
  const draggingRef = useRef(false)
  const lastRef = useRef(cursor)

  const seek = (index: number) => {
    const next = Math.min(total, Math.max(0, index))

    if (next !== lastRef.current) {
      lastRef.current = next
      onSeek(next)
    }
  }

  // Si el paso cambia por otro lado (los botones, el avance solo), la próxima vez se compara con ése.
  useEffect(() => {
    lastRef.current = cursor
  }, [cursor])

  const indexAt = (clientX: number) => {
    const rect = ref.current?.getBoundingClientRect()

    return rect && rect.width > 0 ? Math.floor(((clientX - rect.left) / rect.width) * (total + 1)) : cursor
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[event.key]

    if (step !== undefined) seek(cursor + step)
    else if (event.key === 'Home') seek(0)
    else if (event.key === 'End') seek(total)
    else return

    event.preventDefault()
  }

  return (
    <div
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={t('practice.replay.timeline')}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={cursor}
      aria-valuetext={describe(cursor)}
      // Las pastillas no tienen ancho mínimo y el espacio entre ellas es, a lo sumo, el 40 % de lo que le toca a cada paso: la línea entra en lo que haya (el lateral de la mesa ancha
      // mide 13rem) con cualquier cantidad de pasos, sin pasarse al panel de al lado. Con lugar, 3 px como siempre.
      style={{ gap: `min(3px, ${40 / (total + 1)}%)` }}
      className={cx('relative flex min-w-0 flex-1 cursor-pointer touch-none select-none items-center rounded-control px-1 outline-none focus-visible:shadow-focus', className)}
      onKeyDown={handleKeyDown}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return

        draggingRef.current = true
        event.currentTarget.setPointerCapture(event.pointerId)
        seek(indexAt(event.clientX))
      }}
      onPointerMove={(event) => {
        if (draggingRef.current) seek(indexAt(event.clientX))
      }}
      onPointerUp={() => {
        draggingRef.current = false
      }}
      onPointerCancel={() => {
        draggingRef.current = false
      }}
    >
      {Array.from({ length: total + 1 }, (_, index) => {
        const mark = index > 0 ? marks[index - 1] : undefined
        const state = index === cursor ? 'current' : index < cursor ? 'done' : 'upcoming'
        const tone = index === 0 ? START_TONE : (mark?.tone ?? null)

        return (
          <Fragment key={index}>
            {mark?.turnStart ? <span aria-hidden="true" data-fx="turn" className="mx-0.5 h-5 w-px shrink-0 bg-tint/35" /> : null}
            <span
              aria-hidden="true"
              data-state={state}
              data-tone={tone ?? 'none'}
              data-phase={mark?.phase ? 'true' : undefined}
              style={tone ? ({ '--pill': FX_RGB[tone] } as CSSProperties) : undefined}
              className={cx(
                'relative min-w-0 flex-1 rounded-full transition-[height,background-color,box-shadow] duration-150 motion-reduce:transition-none',
                tone ? PILL[state] : PILL_PLAIN[state],
                mark?.phase && 'before:absolute before:inset-x-0 before:-top-1.5 before:h-0.5 before:rounded-full before:bg-warning',
              )}
            />
          </Fragment>
        )
      })}
    </div>
  )
}

/** La velocidad con su menú que se abre hacia arriba (la barra va abajo de la mesa): 0,5× · 1× · 1,5× · 2×. `tall`: 44 px con el dedo, como los otros botones del reproductor partido. */
function SpeedMenu({ speed, onSpeed, tall = false }: { speed: ReplaySpeed; onSpeed: (speed: ReplaySpeed) => void; tall?: boolean }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()

  useEscapeKey(() => setOpen(false), open)

  useEffect(() => {
    if (!open) return

    const close = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }

    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  // Al cerrarse se achica y se funde, la inversa de su entrada (`usePresence`), como el menú de cada carta.
  const menu = usePresence(
    open,
    open ? (
      <div ref={menuRef} id={menuId} role="menu" aria-label={t('practice.replay.speed')} className="absolute bottom-full right-0 z-30 mb-2 grid min-w-32 gap-0.5 rounded-card border border-border-subtle bg-card-background p-1 shadow-overlay animate-pop motion-reduce:animate-none">
        {REPLAY_SPEEDS.map((value) => (
          <button
            key={value}
            type="button"
            role="menuitemradio"
            aria-checked={value === speed}
            data-initial-focus={value === speed ? '' : undefined}
            className={cx(
              'flex items-center justify-between gap-4 rounded-control px-3 py-2 text-left text-body tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
              value === speed ? 'bg-tint/10 font-semibold text-foreground' : 'text-muted hover:bg-tint/10 hover:text-foreground',
            )}
            onClick={() => {
              onSpeed(value)
              setOpen(false)
            }}
          >
            {formatSpeed(value)}
            {value === speed ? <Icon name="check" size={16} strokeWidth={2.2} className="text-success" /> : null}
          </button>
        ))}
      </div>
    ) : null,
    () => [menuRef.current],
  )

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${t('practice.replay.speed')}: ${formatSpeed(speed)}`}
        title={t('practice.replay.speed')}
        className={cx(
          'inline-flex h-9 items-center gap-1.5 rounded-control bg-lavender px-3 text-body font-semibold tabular-nums text-foreground transition-colors duration-150 hover:bg-lavender-hover focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
          tall ? 'pointer-coarse:h-11' : 'pointer-coarse:h-10',
        )}
        onClick={() => setOpen((current) => !current)}
      >
        {formatSpeed(speed)}
        <Icon name="chevron-down" size={14} strokeWidth={2.2} className={cx('transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      {menu}
    </div>
  )
}

/** Lo que mueve el replay: volver al principio, anterior, reproducir y pausar, siguiente y la velocidad. */
interface TransportProps {
  /** Cuántas jugadas tiene el combo (la mano inicial no cuenta). */
  total: number
  /** Hasta qué jugada se ve (0 = mano inicial). */
  cursor: number
  playing: boolean
  /** Qué hace el botón grande ahora ("Pausar", "Reproducir", "Ver de nuevo"). */
  playLabel: string
  speed: ReplaySpeed
  onTogglePlay: () => void
  onRestart: () => void
  onPrevious: () => void
  onNext: () => void
  onSpeed: (speed: ReplaySpeed) => void
  className?: string
}

/** Dónde va el replay y la lista: la línea de tiempo y la lista de pasos (que se abre aparte). */
interface TimelineRowProps {
  marks: ReplayMark[]
  cursor: number
  /** Lo que anuncia un paso a un lector de pantalla. */
  describe: (cursor: number) => string
  onSeek: (cursor: number) => void
  onOpenSteps: () => void
  className?: string
}

type ReplayBarProps = Omit<TransportProps, 'total'> & Omit<TimelineRowProps, 'className'> & { className?: string }

function RestartButton({ cursor, onRestart }: Pick<TransportProps, 'cursor' | 'onRestart'>) {
  return (
    <IconButton tone="raised" size="sm" aria-label={t('practice.replay.restart')} title={t('practice.replay.restart')} disabled={cursor === 0} onClick={onRestart}>
      <Icon name="skip-back" variant="bold" />
    </IconButton>
  )
}

/** Anterior, el botón grande (la acción principal) y siguiente. */
function StepButtons({ total, cursor, playing, playLabel, onTogglePlay, onPrevious, onNext }: Pick<TransportProps, 'total' | 'cursor' | 'playing' | 'playLabel' | 'onTogglePlay' | 'onPrevious' | 'onNext'>) {
  return (
    <>
      <IconButton tone="raised" size="sm" aria-label={t('practice.mat.previous')} title={t('practice.mat.previous')} className="disabled:opacity-40" disabled={cursor === 0} onClick={onPrevious}>
        <Icon name="chevron-left" strokeWidth={2.2} />
      </IconButton>
      <IconButton tone="play" size="md" aria-label={playLabel} title={playLabel} onClick={onTogglePlay}>
        <Icon name={playing ? 'pause' : 'play'} variant="bold" />
      </IconButton>
      <IconButton tone="raised" size="sm" aria-label={t('practice.mat.next')} title={t('practice.mat.next')} className="disabled:opacity-40" disabled={cursor >= total} onClick={onNext}>
        <Icon name="chevron-right" strokeWidth={2.2} />
      </IconButton>
    </>
  )
}

function StepsButton({ onOpenSteps }: Pick<TimelineRowProps, 'onOpenSteps'>) {
  return (
    <IconButton tone="raised" size="sm" aria-label={t('practice.replay.steps')} title={t('practice.replay.steps')} onClick={onOpenSteps}>
      <Icon name="list" />
    </IconButton>
  )
}

/**
 * Los controles de un replay, como los de YGOPocket: volver al principio, paso anterior, el botón grande de reproducir y pausar, paso
 * siguiente, la línea de tiempo de pasos, la lista de pasos (que se abre aparte) y la velocidad. En el celular la línea de tiempo baja
 * a su propio renglón. Es `ReplayTransport` y `ReplayTimeline` juntos (la práctica, el escritorio); «Jugar solo automático» en el celular los parte.
 */
export const ReplayBar = memo(function ReplayBar({ marks, cursor, playing, playLabel, speed, describe, onSeek, onTogglePlay, onRestart, onPrevious, onNext, onOpenSteps, onSpeed, className }: ReplayBarProps) {
  return (
    // `@container`: la barra se acomoda según su propio ancho (la mesa en escritorio, el celular, una muestra del playground), no el de la pantalla.
    <div role="group" aria-label={t('practice.replay.controls')} className={cx('@container', className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex items-center gap-2">
          <RestartButton cursor={cursor} onRestart={onRestart} />
          <StepButtons total={marks.length} cursor={cursor} playing={playing} playLabel={playLabel} onTogglePlay={onTogglePlay} onPrevious={onPrevious} onNext={onNext} />
        </div>
        {/* Angosta, la línea de tiempo baja a su propio renglón; ancha, va en el medio. */}
        <Timeline marks={marks} cursor={cursor} describe={describe} onSeek={onSeek} className="order-last h-9 basis-full @min-[28rem]:order-none @min-[28rem]:basis-0" />
        <div className="ml-auto flex items-center gap-2 @min-[28rem]:ml-0">
          <StepsButton onOpenSteps={onOpenSteps} />
          <SpeedMenu speed={speed} onSpeed={onSpeed} />
        </div>
      </div>
    </div>
  )
})

/**
 * El replay partido, abajo (Gastón, 2026-10-27, opción B: «dónde estás arriba, los botones abajo»): lo que se toca seguido en un renglón de 48 px, al alcance del pulgar: volver al principio a la
 * izquierda, anterior, el botón grande y siguiente al medio, y la velocidad a la derecha. Todos de 44 px con el dedo (el grande, 48). La línea de tiempo va arriba (`ReplayTimeline`).
 */
export const ReplayTransport = memo(function ReplayTransport({ total, cursor, playing, playLabel, speed, onTogglePlay, onRestart, onPrevious, onNext, onSpeed, className }: TransportProps) {
  return (
    <div role="group" aria-label={t('practice.replay.controls')} className={cx('flex items-center gap-2', className)}>
      <RestartButton cursor={cursor} onRestart={onRestart} />
      <span className="mx-auto flex items-center gap-2">
        <StepButtons total={total} cursor={cursor} playing={playing} playLabel={playLabel} onTogglePlay={onTogglePlay} onPrevious={onPrevious} onNext={onNext} />
      </span>
      <SpeedMenu speed={speed} onSpeed={onSpeed} tall />
    </div>
  )
})

/** El replay partido, arriba: la línea de tiempo (44 px de alto para tocarla) y, a su derecha, la lista de pasos. Va debajo del aviso que dice qué se repasa y qué paso es. */
export const ReplayTimeline = memo(function ReplayTimeline({ marks, cursor, describe, onSeek, onOpenSteps, className }: TimelineRowProps) {
  return (
    <div className={cx('flex items-center gap-1.5', className)}>
      <Timeline marks={marks} cursor={cursor} describe={describe} onSeek={onSeek} className="h-11" />
      <StepsButton onOpenSteps={onOpenSteps} />
    </div>
  )
})
