import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'

import { duelReplayAt, walkReplay, type DuelReplay, type ReplaySide } from '../../app/duel-replay'
import { matEffects } from '../../app/mat-effects'
import { isToken } from '../../app/practice-mat'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { artOfDrawId } from '../duel/duel-art'
import { DuelTable, TheirHand, type DuelSideView } from '../duel/DuelTable'
import { LifeBadge } from '../duel/LifeScore'
import { PhaseBand, type PhaseCue } from '../duel/PhaseBand'
import { TheirHandSize } from '../duel/their-hand'
import { COMPACT_FIELD_MEDIA_QUERY, phoneDuelLayout } from '../probability/compact-field'
import { MatScene } from '../probability/MatArena'
import { Spotlight } from '../probability/MatFx'
import { ReplayTimeline, ReplayTransport, type ReplayMark, type ReplaySpeed } from '../probability/ReplayBar'
import { stepTone } from '../probability/step-tone'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { OverflowMenu, type OverflowItem } from '../ui/OverflowMenu'
import { cardName, playerName, realOf, replayResultText, stepText, titleOf } from './duel-replay-text'

/**
 * El replay de un duelo, de sólo lectura: las dos mesas como las vería un espectador (lo que nadie mostró, de dorso; con «mi mano», la de quien grabó boca arriba), las vidas, de quién
 * es el turno y qué pasó en cada jugada, con la línea de tiempo y los botones de la práctica (`ReplayTimeline`, `ReplayTransport`: los turnos marcados con una línea). Quien grabó va
 * abajo; se puede dar vuelta la mesa como quien mira un duelo. Lo que vino de otro (los nombres, el de cada carta) se dibuja como texto.
 * Se ve como la mesa del duelo y el repaso de un combo (Gastón, 2026-11-12: «todas las replays y videos deberian compartir una misma estetica»): el remolino, el campo que llena el alto entre las dos
 * manos (en el celular, `phoneDuelLayout`), la caja de la fase al medio, las chapas de vidas y abajo la jugada, los botones y la línea de tiempo del repaso. No monta `PracticeMat`: esa mesa es la
 * de un jugador (su lado se arrastra, tiene menús y deshacer) y su replay recorre las jugadas de un solo lado; acá se dibujan los dos lados con sus mismas piezas (`DuelTable`, `TheirHand`, `LifeBadge`).
 */
interface DuelReplayScreenProps {
  replay: DuelReplay
  onClose: () => void
  /** Llegó por un enlace o un archivo: el aviso «Replay compartido» con «Guardar en mis replays». */
  shared?: { onSave: () => void } | undefined
  /** Copiar el enlace (si entra) y descargar el archivo. */
  actions: OverflowItem[]
  /** Desde qué jugada abre (si no, el final): el replay de un duelo recién jugado, desde el principio. */
  startAt?: number
  /** Lo que dice la flecha de volver (si no, «Volver a Replays»). */
  backLabel?: string
}

/** Cuánto dura cada jugada al reproducir, a velocidad normal. */
const STEP_MS = 900
/**
 * El cartel de la fase al avanzar un paso (reproducir o «Siguiente») que cambia de fase: la banda del color de quien la pasa (el de abajo al empezar, violeta; el otro, lima), como en la mesa. Saltar (la línea de tiempo, volver al
 * principio, anterior) no anuncia nada: arrastrando, cada paso era un cartel.
 */
function bannerAt(replay: DuelReplay, from: number, to: number): PhaseCue | null {
  const step = to === from + 1 ? replay.steps[to - 1] : undefined
  if (!step || step[1].type !== 'phase') return null
  // A la Draw Phase se llega pasando el turno (la juega quien termina): «Cambio de turno» y la Draw Phase, del color de quien empieza.
  const turn = step[1].phase === 'draw'

  return { key: to, phase: step[1].phase, side: (step[0] === 0) !== turn ? 'mine' : 'theirs', turn }
}

/** Cuánto se ve la carta grande de una activación (lo que dura `card-activate-center`). */
const ACTIVATION_MS = 950

/** La carta que se activa en un paso: de quién y cuál (su id, el del lado que la jugó). */
interface Activation {
  key: number
  side: ReplaySide
  id: string
}

/**
 * La carta grande al avanzar un paso (reproducir o «Siguiente») que activa algo, con la misma regla que la mesa (`matEffects`: activar, o una Mágica o Trampa que pasa boca arriba); saltar no la
 * muestra. La cadena y los medallones no entran: el replay no los trae.
 */
function activationAt(replay: DuelReplay, shots: Parameters<typeof duelReplayAt>[2], from: number, to: number): Activation | null {
  const step = to === from + 1 ? replay.steps[to - 1] : undefined
  const spotlight = step ? matEffects(duelReplayAt(replay, from, shots).states[step[0]], step[1]).spotlight : undefined

  return step && spotlight?.kind === 'activate' ? { key: to, side: step[0], id: spotlight.id } : null
}

export function DuelReplayScreen({ replay, onClose, shared, actions, startAt, backLabel = t('meta.duels.back') }: DuelReplayScreenProps) {
  const total = replay.steps.length
  const [cursor, setCursor] = useState(startAt ?? total)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<ReplaySpeed>(1)
  const [flipped, setFlipped] = useState(false)
  const [banner, setBanner] = useState<PhaseCue | null>(null)
  const [activation, setActivation] = useState<Activation | null>(null)
  // Llegó compartido: aunque se guarde (y deje de serlo), la franja de arriba sigue en su lugar.
  const [wasShared] = useState(Boolean(shared))
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
  const phone = useMediaQuery(COMPACT_FIELD_MEDIA_QUERY)
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  // El lugar de la mesa, medido: de él sale el tamaño del campo y de las manos (sin ResizeObserver, como en las pruebas, la ventana menos la barra y los controles).
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const node = stageRef.current
    if (!node) return
    const measure = () => setStage({ width: node.clientWidth || window.innerWidth, height: node.clientHeight || Math.max(0, window.innerHeight - 200) })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const names = [playerName(replay, 0), playerName(replay, 1)] as const

  const describe = useCallback(
    (at: number) => {
      if (at <= 0) return t('meta.duels.start')
      const step = replay.steps[at - 1]!
      // Los nombres, con lo que se sabe después de la jugada (lo que mostró ya la nombra; lo que se mostró más adelante, todavía no). La misma línea que el video.
      return stepText(replay, step, duelReplayAt(replay, at - 1, shots).states[step[0]], duelReplayAt(replay, at, shots))
    },
    [replay, shots],
  )

  // Lo que se anuncia al avanzar de a un paso: la banda de la fase y la carta grande de lo que se activa.
  const announce = useCallback(
    (from: number, to: number) => {
      setBanner(bannerAt(replay, from, to))
      setActivation(activationAt(replay, shots, from, to))
    },
    [replay, shots],
  )
  useEffect(() => {
    if (!activation) return
    const timer = window.setTimeout(() => setActivation(null), ACTIVATION_MS)
    return () => window.clearTimeout(timer)
  }, [activation])

  // Reproducir: una jugada cada `STEP_MS` (según la velocidad) hasta el final.
  useEffect(() => {
    if (!playing) return
    if (cursor >= total) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => {
      setCursor(cursor + 1)
      announce(cursor, cursor + 1)
    }, STEP_MS / speed)
    return () => window.clearTimeout(timer)
  }, [playing, cursor, total, speed, replay, announce])
  const jump = (at: number) => {
    setPlaying(false)
    setBanner(null)
    setActivation(null)
    setCursor(at)
  }

  const bottom: ReplaySide = flipped ? 1 : 0
  const top: ReplaySide = flipped ? 0 : 1
  const view = (side: ReplaySide): DuelSideView => ({ state: frame.states[side], artOf: (id) => artOfDrawId(isToken(id) ? id : realOf(replay, frame, side, id)), handCount: frame.states[side].hand.length })
  const bottomView = view(bottom)
  const topView = view(top)
  // Con «mi mano», la de quien grabó boca arriba (abajo; dada vuelta la mesa, de dorso como la del rival).
  const openHand = replay.view === 'mine' && bottom === 0 ? frame.states[0].hand.map((id) => ({ name: cardName(replay, frame, 0)(id), art: bottomView.artOf(id) })) : undefined
  const playLabel = playing ? t('practice.mat.pause') : cursor >= total ? t('practice.mat.watchAgain') : t('practice.mat.play')
  const title = titleOf(replay)
  const result = cursor >= total ? replayResultText(replay) : null

  const badge = (side: ReplaySide, place: 'top' | 'bottom') => (
    <LifeBadge name={names[side]} label={names[side]} life={frame.lp[side]} mine={place === 'bottom'} color={side === 0 ? 'mine' : 'theirs'} active={frame.turn === side} compact={!desktop} />
  )
  const field = stage ? fieldLayout(stage.width, stage.height, phone) : null

  return (
    <div className="mat-square relative isolate flex h-full min-h-0 flex-col overflow-hidden bg-background **:rounded-none!" role="region" aria-label={t('meta.duels.viewer', { title })}>
      {/* El fondo de la mesa (el remolino), como en el duelo y en el repaso de un combo. */}
      <MatScene className="absolute inset-0 -z-10" />
      {/* La franja de un replay compartido se queda al guardarlo (dice «Guardado»): si se fuera, la mesa saltaría. */}
      {shared || wasShared ? (
        <div role="region" aria-label={t('meta.duels.shared')} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle bg-card-background px-gutter py-2 min-[1101px]:px-4">
          <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
            <span className="text-micro font-semibold uppercase tracking-wide text-info-soft">{t('meta.duels.shared')}</span>
            <strong className="line-clamp-2 wrap-break-word text-body font-semibold text-foreground">{title}</strong>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="tertiary" size="sm" onClick={onClose}>
              {t('common.close')}
            </Button>
            {shared ? (
              <Button variant="primary" size="sm" icon="save" onClick={shared.onSave}>
                {t('meta.duels.saveShared')}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" icon="check" disabled>
                {t('meta.duels.savedShared')}
              </Button>
            )}
          </div>
        </div>
      ) : null}
      <div className="flex h-11 min-w-0 shrink-0 items-center gap-1.5 px-2 min-[1101px]:px-4">
        <IconButton tone="flat" size="sm" className="-ml-1 shrink-0" aria-label={backLabel} title={backLabel} onClick={onClose}>
          <Icon name="arrow-left" />
        </IconButton>
        <span className="min-w-0 flex-1 truncate text-body font-bold text-foreground">{title}</span>
        <span className="inline-flex min-w-0 shrink items-center gap-1 bg-tint/8 px-2 py-1 text-micro font-semibold text-muted" title={replay.view === 'mine' ? t('meta.duels.withHand', { name: names[0] }) : t('meta.duels.public')}>
          <Icon name={replay.view === 'mine' ? 'hand' : 'eye'} size={14} className="shrink-0" />
          <span className="truncate max-[639px]:sr-only">{replay.view === 'mine' ? t('meta.duels.withHand', { name: names[0] }) : t('meta.duels.public')}</span>
        </span>
        {/* En el celular, la chapa de arriba va en la barra (como en la mesa); en escritorio, al costado de su mano, afuera del campo. */}
        {desktop ? null : badge(top, 'top')}
        <span className="-mr-1 flex shrink-0 items-center">
          <IconButton tone="flat" size="sm" aria-label={t('duel.watch.flip')} title={t('duel.watch.flip')} onClick={() => setFlipped((current) => !current)}>
            <Icon name="swap" />
          </IconButton>
          {actions.length > 0 ? <OverflowMenu label={t('meta.duels.more', { title })} items={actions} /> : null}
        </span>
      </div>

      {/* La mesa: las dos manos y el campo, que llena el alto que queda entre la barra y los controles (en el celular, la geometría del duelo: `phoneDuelLayout`). */}
      <div ref={stageRef} className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-1">
        {field ? (
          <div className="relative flex flex-col items-center" style={{ gap: field.gap }}>
            {desktop ? <div className="absolute left-full top-0 z-20 ml-3">{badge(top, 'top')}</div> : null}
            <TheirHandSize value={field.top}>
              <TheirHand count={topView.handCount ?? 0} label={t('meta.duels.hand', { name: names[top], count: topView.handCount ?? 0 })} />
            </TheirHandSize>
            <div style={field.box}>
              <DuelTable mine={bottomView} theirs={{ ...topView, handCount: undefined }} turn={frame.turn === bottom ? 'mine' : 'theirs'} centerPhase phoneStyle={field.phone}>
                {/* La banda espera a que se vaya la carta grande (no se lee partida detrás), y la carta va sin cartel: el texto del paso está debajo. */}
                <PhaseBand cue={banner} hold={activation !== null} />
                {activation ? (
                  <Spotlight
                    key={activation.key}
                    kind="activate"
                    cards={[{ id: activation.id, name: cardName(replay, frame, activation.side)(activation.id), art: view(activation.side).artOf(activation.id), back: realOf(replay, frame, activation.side, activation.id) === undefined }]}
                    className="absolute inset-0 z-[120]"
                  />
                ) : null}
              </DuelTable>
            </div>
            <TheirHandSize value={field.bottom}>
              <TheirHand below count={bottomView.handCount ?? 0} label={openHand ? t('meta.duels.handShown', { name: names[bottom], cards: openHand.map((card) => card.name).join(', ') }) : t('meta.duels.hand', { name: names[bottom], count: bottomView.handCount ?? 0 })} {...(openHand ? { cards: openHand } : {})} />
            </TheirHandSize>
            {desktop ? <div className="absolute bottom-0 right-full z-20 mr-3">{badge(bottom, 'bottom')}</div> : null}
          </div>
        ) : null}
      </div>

      {/* Abajo, como en el repaso de un combo: la jugada en una línea (con tu chapa en el celular), los botones y la línea de tiempo. */}
      <div className="mx-auto grid w-full max-w-3xl shrink-0 gap-1 px-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] min-[1101px]:px-4">
        <div className="flex min-h-11 min-w-0 items-center gap-2">
          {desktop ? null : badge(bottom, 'bottom')}
          {/* El número de la jugada en su renglón y la frase entera en hasta dos, con el alto de dos siempre reservado: ni una jugada más larga ni los nombres que llegan después mueven el campo. */}
          <p data-testid="replay-step" className="m-0 grid min-w-0 flex-1 text-body text-foreground" aria-live={playing ? 'off' : 'polite'}>
            <span className="truncate text-micro font-semibold text-muted tabular-nums">{cursor === 0 ? t('meta.duels.start') : result ? `${t('meta.duels.step', { n: cursor, total })} · ${result}` : t('meta.duels.step', { n: cursor, total })}</span>
            <span data-testid="replay-step-text" className="line-clamp-2 min-h-[2lh] leading-tight">
              {cursor > 0 ? describe(cursor) : null}
            </span>
          </p>
        </div>
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
          onRestart={() => jump(0)}
          onPrevious={() => jump(Math.max(0, cursor - 1))}
          onNext={() => {
            const next = Math.min(total, cursor + 1)

            setPlaying(false)
            setCursor(next)
            announce(cursor, next)
          }}
          onSpeed={setSpeed}
        />
        {/* La línea de tiempo, debajo de los botones (como la del repaso en el celular). */}
        <ReplayTimeline marks={marks} cursor={cursor} describe={describe} onSeek={jump} />
      </div>
    </div>
  )
}

/** Lo que mide de alto la caja de la mano de abajo, sobre su carta: lo que bajan las puntas del abanico. */
const FAN_ROOM = 10
/** Una carta: 1 : 1,4612. */
const CARD_RATIO = 1.4612
/** Fuera del celular, el campo más ancho que se prueba (de ahí se angosta de a 8 px hasta que sus filas tengan el alto de una carta) y el más angosto. */
const WIDEST = 1000
const NARROWEST = 360

/**
 * El campo y las manos que entran en el lugar de la mesa (`width` × `height`, medido), con la geometría del duelo del celular en todos los anchos (`phoneDuelLayout`, la misma de la mesa): casillas con
 * forma de carta y un solo contorno (`data-phone`), la mano de arriba a 0,8 de la de abajo. En el celular, a todo el ancho; desde 640 px, el ancho más grande cuyas filas entran con el alto de una carta.
 */
function fieldLayout(width: number, height: number, phone: boolean) {
  const at = (w: number) => phoneDuelLayout(w, height, { tilted: false, bar: 0, bottom: 0 })
  let w = phone ? width : Math.min(width, WIDEST)
  let layout = at(w)
  while (!phone && w > NARROWEST && layout.row < layout.cell * CARD_RATIO * 0.99) layout = at((w -= 8))

  return {
    gap: layout.gap,
    top: { cardWidth: layout.rivalCard, maxWidth: layout.rivalWidth, room: layout.rivalRoom },
    bottom: { cardWidth: layout.handCard, maxWidth: w - 8, room: layout.handCard * CARD_RATIO + FAN_ROOM },
    box: { width: layout.fieldWidth } as CSSProperties,
    // El hueco de 3 px y la casilla (`--cell`, las columnas desde 1101 px) son los de la cuenta, en todos los anchos.
    phone: { width: layout.fieldWidth, height: layout.fieldHeight, gap: 3, gridTemplateRows: `repeat(5, ${layout.row}px)`, '--cell': `${layout.cell}px`, '--zone-aspect': 'auto', '--pile-width': '100%', '--pile-align': 'center', '--field-card': `${layout.card}px`, '--field-card-top': `${layout.cardTop}px` } as CSSProperties,
  }
}