import { useCallback, useEffect, useMemo, useState } from 'react'

import { duelReplayAt, passcodeOf, walkReplay, type DuelReplay, type ReplayFrame, type ReplaySide } from '../../app/duel-replay'
import { describeMatAction, isToken } from '../../app/practice-mat'
import { t } from '../../i18n'
import { artOfDrawId } from '../duel/duel-art'
import { DuelTable, TheirHand, type DuelSideView } from '../duel/DuelTable'
import { LifeScore } from '../duel/LifeScore'
import { PLAYER_COLOR } from '../duel/player-color'
import { ReplayTimeline, ReplayTransport, type ReplayMark, type ReplaySpeed } from '../probability/ReplayBar'
import { stepTone } from '../probability/step-tone'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { OverflowMenu, type OverflowItem } from '../ui/OverflowMenu'
import { playerName, replayResultText, titleOf } from './duel-replay-text'

/**
 * El replay de un duelo, de sólo lectura: las dos mesas como las vería un espectador (lo que nadie mostró, de dorso; con «mi mano», la de quien grabó boca arriba), las vidas, de quién
 * es el turno y qué pasó en cada jugada, con la línea de tiempo y los botones de la práctica (`ReplayTimeline`, `ReplayTransport`: los turnos marcados con una línea). Quien grabó va
 * abajo; se puede dar vuelta la mesa como quien mira un duelo. Lo que vino de otro (los nombres, el de cada carta) se dibuja como texto.
 */
interface DuelReplayScreenProps {
  replay: DuelReplay
  onClose: () => void
  /** Llegó por un enlace o un archivo: el aviso «Replay compartido» con «Guardar en mis replays». */
  shared?: { onSave: () => void } | undefined
  /** Copiar el enlace (si entra) y descargar el archivo. */
  actions: OverflowItem[]
}

/** Cuánto dura cada jugada al reproducir, a velocidad normal. */
const STEP_MS = 900

/** El id real de una carta de un lado: lo que mostró ese lado (o, si es una del otro que controla —`f.c12`—, lo que mostró su dueño) y, con «mi mano», lo oculto de quien grabó. */
function realOf(replay: DuelReplay, frame: ReplayFrame, side: ReplaySide, id: string): string | undefined {
  const owner = (id.startsWith('f.') ? 1 - side : side) as ReplaySide
  const own = id.startsWith('f.') ? id.slice(2) : id
  return frame.known[owner][own] ?? (owner === 0 ? replay.hidden?.[own] : undefined)
}

export function DuelReplayScreen({ replay, onClose, shared, actions }: DuelReplayScreenProps) {
  const total = replay.steps.length
  const [cursor, setCursor] = useState(total)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<ReplaySpeed>(1)
  const [flipped, setFlipped] = useState(false)
  // Una sola pasada: las fotos para saltar y la marca de cada jugada (su color, si cambia de fase, si empieza un turno).
  const { shots, marks } = useMemo(() => {
    const marks: ReplayMark[] = []
    let turn = 0
    const shots = walkReplay(replay, (index, before, turnNumber) => {
      const action = replay.steps[index]![1]
      marks.push({ phase: action.type === 'phase', turnStart: index > 0 && turnNumber > turn, tone: stepTone(before, action) })
      turn = turnNumber
    })
    return { shots, marks }
  }, [replay])
  const frame = useMemo(() => duelReplayAt(replay, cursor, shots), [replay, cursor, shots])
  const names = [playerName(replay, 0), playerName(replay, 1)] as const

  const nameOfCard = useCallback(
    (at: ReplayFrame, side: ReplaySide) => (id: string) => {
      const code = passcodeOf(realOf(replay, at, side, id) ?? '')
      return (code !== null ? replay.cards[String(code)] : undefined) ?? t('practice.card.unknown')
    },
    [replay],
  )
  const describe = useCallback(
    (at: number) => {
      if (at <= 0) return t('meta.duels.start')
      const [side, action] = replay.steps[at - 1]!
      // Los nombres, con lo que se sabe después de la jugada (lo que mostró ya la nombra; lo que se mostró más adelante, todavía no).
      return `${playerName(replay, side)}: ${describeMatAction(duelReplayAt(replay, at - 1, shots).states[side], action, nameOfCard(duelReplayAt(replay, at, shots), side))}`
    },
    [replay, shots, nameOfCard],
  )

  // Reproducir: una jugada cada `STEP_MS` (según la velocidad) hasta el final.
  useEffect(() => {
    if (!playing) return
    if (cursor >= total) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => setCursor((at) => Math.min(total, at + 1)), STEP_MS / speed)
    return () => window.clearTimeout(timer)
  }, [playing, cursor, total, speed])

  const bottom: ReplaySide = flipped ? 1 : 0
  const top: ReplaySide = flipped ? 0 : 1
  const view = (side: ReplaySide): DuelSideView => ({ state: frame.states[side], artOf: (id) => artOfDrawId(isToken(id) ? id : realOf(replay, frame, side, id)), handCount: frame.states[side].hand.length })
  const bottomView = view(bottom)
  const topView = view(top)
  // Con «mi mano», la de quien grabó boca arriba (abajo; dada vuelta la mesa, de dorso como la del rival).
  const openHand = replay.view === 'mine' && bottom === 0 ? frame.states[0].hand.map((id) => ({ name: nameOfCard(frame, 0)(id), art: bottomView.artOf(id) })) : undefined
  const playLabel = playing ? t('practice.mat.pause') : cursor >= total ? t('practice.mat.watchAgain') : t('practice.mat.play')
  const title = titleOf(replay)
  const result = cursor >= total ? replayResultText(replay) : null

  return (
    <div className="h-full min-h-0 overflow-y-auto" role="region" aria-label={t('meta.duels.viewer', { title })}>
      {shared ? (
        <div role="region" aria-label={t('meta.duels.shared')} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle bg-card-background px-gutter py-2 min-[1101px]:px-4">
          <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
            <span className="text-micro font-semibold uppercase tracking-wide text-info-soft">{t('meta.duels.shared')}</span>
            <strong className="line-clamp-2 wrap-break-word text-body font-semibold text-foreground">{title}</strong>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="tertiary" size="sm" onClick={onClose}>
              {t('common.close')}
            </Button>
            <Button variant="primary" size="sm" icon="save" onClick={shared.onSave}>
              {t('meta.duels.saveShared')}
            </Button>
          </div>
        </div>
      ) : null}
      <div className="mx-auto grid w-full max-w-3xl content-start gap-2 px-2 py-2 min-[1101px]:px-4">
        <div className="flex h-11 min-w-0 items-center gap-1.5">
          <IconButton tone="flat" size="sm" className="-ml-2 shrink-0" aria-label={t('meta.duels.back')} title={t('meta.duels.back')} onClick={onClose}>
            <Icon name="arrow-left" />
          </IconButton>
          <span className="min-w-0 flex-1 truncate text-body font-bold text-foreground">{title}</span>
          <span className="inline-flex min-w-0 shrink items-center gap-1 rounded-full bg-tint/8 px-2.5 py-1 text-micro font-semibold text-muted">
            <Icon name={replay.view === 'mine' ? 'hand' : 'eye'} size={14} className="shrink-0" />
            <span className="truncate max-[419px]:sr-only">{replay.view === 'mine' ? t('meta.duels.withHand', { name: names[0] }) : t('meta.duels.public')}</span>
          </span>
          <span className="-mr-2 flex shrink-0 items-center">
            <IconButton tone="flat" size="sm" aria-label={t('duel.watch.flip')} title={t('duel.watch.flip')} onClick={() => setFlipped((current) => !current)}>
              <Icon name="swap" />
            </IconButton>
            <OverflowMenu label={t('meta.duels.more', { title })} items={actions} />
          </span>
        </div>

        <div data-testid="replay-score" className="flex min-h-11 min-w-0 items-center gap-2 px-1">
          <LifeScore name={names[bottom]} life={frame.lp[bottom]} mine color={bottom === 0 ? 'mine' : 'theirs'} />
          <span data-testid="replay-turn" className={cx('min-w-0 flex-1 truncate text-center text-lead font-bold max-[359px]:text-body', PLAYER_COLOR[frame.turn === 0 ? 'mine' : 'theirs'].text)}>
            {t('meta.duels.turn', { turn: frame.turnNumber, name: names[frame.turn] })}
          </span>
          <LifeScore name={names[top]} life={frame.lp[top]} color={top === 0 ? 'mine' : 'theirs'} />
        </div>

        {/* El tamaño de la casilla, como la del espectador, con lugar para la jugada y los controles (unos 9 rem más que él). */}
        <DuelTable
          mine={bottomView}
          theirs={topView}
          turn={frame.turn === bottom ? 'mine' : 'theirs'}
          className="[--cell:max(3rem,min(6.5rem,calc((100dvh-35rem)/5.2)))] max-sm:mx-auto max-sm:w-[min(100%,calc(5*max(3rem,(100dvh_-_32rem)/7)_+_1rem))] sm:max-[1101px]:mx-auto sm:max-[1101px]:w-[min(100%,calc(6.3714*max(3rem,(100dvh_-_35rem)/5.2)_+_1.5rem))]"
        />
        <TheirHand count={bottomView.handCount ?? 0} align="start" {...(openHand ? { cards: openHand } : {})} />

        {/* La jugada y los controles quedan pegados abajo: con una pantalla baja, la mesa scrollea por detrás y los botones siguen a mano. */}
        <div className="sticky bottom-0 z-10 -mx-2 grid gap-2 bg-background px-2 pb-2 pt-1 min-[1101px]:-mx-4 min-[1101px]:px-4">
          <p data-testid="replay-step" className="m-0 min-h-11 px-1 text-body text-foreground" aria-live={playing ? 'off' : 'polite'}>
            <span className="block truncate text-micro font-semibold text-muted tabular-nums">{cursor === 0 ? t('meta.duels.start') : result ? `${t('meta.duels.step', { n: cursor, total })} · ${result}` : t('meta.duels.step', { n: cursor, total })}</span>
            {cursor > 0 ? <span className="line-clamp-2">{describe(cursor)}</span> : null}
          </p>
          <ReplayTimeline marks={marks} cursor={cursor} describe={describe} onSeek={(at) => { setPlaying(false); setCursor(at) }} />
          <ReplayTransport
            total={total}
            cursor={cursor}
            playing={playing}
            playLabel={playLabel}
            speed={speed}
            onTogglePlay={() => {
              if (!playing && cursor >= total) setCursor(0)
              setPlaying((current) => !current)
            }}
            onRestart={() => {
              setPlaying(false)
              setCursor(0)
            }}
            onPrevious={() => {
              setPlaying(false)
              setCursor((at) => Math.max(0, at - 1))
            }}
            onNext={() => {
              setPlaying(false)
              setCursor((at) => Math.min(total, at + 1))
            }}
            onSpeed={setSpeed}
          />
        </div>
      </div>
    </div>
  )
}
