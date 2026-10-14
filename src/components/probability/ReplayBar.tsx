import { Fragment, memo, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'

import { useEscapeKey } from '../../app/use-overlay'
import { numberLocale, t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'

/** Las velocidades del replay, como en YGOPocket: la mitad, normal, una vez y media y el doble. */
export type ReplaySpeed = 0.5 | 1 | 1.5 | 2
const REPLAY_SPEEDS: readonly ReplaySpeed[] = [0.5, 1, 1.5, 2]

/** Una marca por jugada: la que cambia de fase lleva una rayita arriba y la que empieza un turno, una línea que la separa de la anterior. */
export interface ReplayMark {
  phase: boolean
  turnStart: boolean
}

const formatSpeed = (speed: number) => `${new Intl.NumberFormat(numberLocale()).format(speed)}×`

/** Los pasos ya vistos en violeta, el actual en verde y más alto, los que faltan apagados. */
const PILL = {
  done: 'h-2.5 bg-primary',
  current: 'h-3.5 bg-accent shadow-[0_0_10px_rgb(var(--accent-rgb)/0.75)]',
  upcoming: 'h-2.5 bg-tint/25',
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
      className={cx('relative flex h-9 min-w-0 flex-1 cursor-pointer touch-none select-none items-center gap-[3px] rounded-control px-1 outline-none focus-visible:shadow-focus', className)}
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

        return (
          <Fragment key={index}>
            {mark?.turnStart ? <span aria-hidden="true" data-fx="turn" className="mx-0.5 h-5 w-px shrink-0 bg-tint/35" /> : null}
            <span
              aria-hidden="true"
              data-state={state}
              data-phase={mark?.phase ? 'true' : undefined}
              className={cx(
                'relative min-w-[3px] flex-1 rounded-full transition-[height,background-color,box-shadow] duration-150 motion-reduce:transition-none',
                PILL[state],
                mark?.phase && 'before:absolute before:inset-x-0 before:-top-1.5 before:h-0.5 before:rounded-full before:bg-warning',
              )}
            />
          </Fragment>
        )
      })}
    </div>
  )
}

/** La velocidad con su menú que se abre hacia arriba (la barra va abajo de la mesa): 0,5× · 1× · 1,5× · 2×. */
function SpeedMenu({ speed, onSpeed }: { speed: ReplaySpeed; onSpeed: (speed: ReplaySpeed) => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${t('practice.replay.speed')}: ${formatSpeed(speed)}`}
        title={t('practice.replay.speed')}
        className="inline-flex h-9 items-center gap-1.5 rounded-control bg-lavender px-3 text-body font-semibold tabular-nums text-foreground transition-colors duration-150 hover:bg-lavender-hover focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none pointer-coarse:h-10"
        onClick={() => setOpen((current) => !current)}
      >
        {formatSpeed(speed)}
        <Icon name="chevron-down" size={14} strokeWidth={2.2} className={cx('transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} />
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-label={t('practice.replay.speed')} className="absolute bottom-full right-0 z-30 mb-2 grid min-w-32 gap-0.5 rounded-card border border-border-subtle bg-card-background p-1 shadow-overlay animate-pop motion-reduce:animate-none">
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
      ) : null}
    </div>
  )
}

interface ReplayBarProps {
  marks: ReplayMark[]
  /** Hasta qué jugada se ve (0 = mano inicial). */
  cursor: number
  playing: boolean
  /** Qué hace el botón grande ahora ("Pausar", "Reproducir", "Ver de nuevo"). */
  playLabel: string
  speed: ReplaySpeed
  /** Lo que anuncia un paso a un lector de pantalla. */
  describe: (cursor: number) => string
  onSeek: (cursor: number) => void
  onTogglePlay: () => void
  onRestart: () => void
  onPrevious: () => void
  onNext: () => void
  onOpenSteps: () => void
  onSpeed: (speed: ReplaySpeed) => void
  className?: string
}

/**
 * Los controles de un replay, como los de YGOPocket: volver al principio, paso anterior, el botón grande de reproducir y pausar, paso
 * siguiente, la línea de tiempo de pasos, la lista de pasos (que se abre aparte) y la velocidad. En el celular la línea de tiempo baja
 * a su propio renglón.
 */
export const ReplayBar = memo(function ReplayBar({ marks, cursor, playing, playLabel, speed, describe, onSeek, onTogglePlay, onRestart, onPrevious, onNext, onOpenSteps, onSpeed, className }: ReplayBarProps) {
  return (
    // `@container`: la barra se acomoda según su propio ancho (la mesa en escritorio, el celular, una muestra del playground), no el de la pantalla.
    <div role="group" aria-label={t('practice.replay.controls')} className={cx('@container', className)}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="flex items-center gap-2">
          <IconButton tone="outline" size="sm" aria-label={t('practice.replay.restart')} title={t('practice.replay.restart')} disabled={cursor === 0} onClick={onRestart}>
            <Icon name="skip-back" variant="bold" />
          </IconButton>
          <IconButton tone="raised" size="sm" aria-label={t('practice.mat.previous')} title={t('practice.mat.previous')} className="disabled:opacity-40" disabled={cursor === 0} onClick={onPrevious}>
            <Icon name="chevron-left" strokeWidth={2.2} />
          </IconButton>
          <IconButton tone="primary" size="md" aria-label={playLabel} title={playLabel} onClick={onTogglePlay}>
            <Icon name={playing ? 'pause' : 'play'} variant="bold" />
          </IconButton>
          <IconButton tone="raised" size="sm" aria-label={t('practice.mat.next')} title={t('practice.mat.next')} className="disabled:opacity-40" disabled={cursor >= marks.length} onClick={onNext}>
            <Icon name="chevron-right" strokeWidth={2.2} />
          </IconButton>
        </div>
        {/* Angosta, la línea de tiempo baja a su propio renglón; ancha, va en el medio. */}
        <Timeline marks={marks} cursor={cursor} describe={describe} onSeek={onSeek} className="order-last basis-full @min-[34rem]:order-none @min-[34rem]:basis-0" />
        <div className="ml-auto flex items-center gap-2 @min-[34rem]:ml-0">
          <IconButton tone="raised" size="sm" aria-label={t('practice.replay.steps')} title={t('practice.replay.steps')} onClick={onOpenSteps}>
            <Icon name="list" />
          </IconButton>
          <SpeedMenu speed={speed} onSpeed={onSpeed} />
        </div>
      </div>
    </div>
  )
})
