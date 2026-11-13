import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'

import type { ChainStep } from '../../app/auto/chain-feed'
import { medalsOf } from '../../app/card-glow'
import { duelReplayAt, replayChainSteps, walkReplay, type DuelReplay, type ReplaySide } from '../../app/duel-replay'
import { matEffects } from '../../app/mat-effects'
import { isToken } from '../../app/practice-mat'
import { shuffleDeck } from '../../app/shuffle-fx'
import { useCardFlights } from '../../app/use-card-flights'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { ChainStage, chainDwell, chainFeed, nextShown, outcomeLabel, stepsUpTo } from '../auto/ChainNotice'
import { artOfDrawId } from '../duel/duel-art'
import { DuelTable, TheirHand, type DuelSideView } from '../duel/DuelTable'
import { LifeBadge } from '../duel/LifeScore'
import { PhaseBand, type PhaseCue } from '../duel/PhaseBand'
import { TheirHandSize } from '../duel/their-hand'
import { COMPACT_FIELD_MEDIA_QUERY, HAND_TOP_ROOM, PHONE_DUEL_BAR, PHONE_DUEL_BOTTOM, matDuelLayout, phoneFieldStyle } from '../probability/compact-field'
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
 * muestra. Con la cadena guardada (el duelo automático), no: la dice la escena de la cadena.
 */
function activationAt(replay: DuelReplay, shots: Parameters<typeof duelReplayAt>[2], from: number, to: number): Activation | null {
  const step = to === from + 1 && !replay.chain ? replay.steps[to - 1] : undefined
  const spotlight = step ? matEffects(duelReplayAt(replay, from, shots).states[step[0]], step[1]).spotlight : undefined

  return step && spotlight?.kind === 'activate' ? { key: to, side: step[0], id: spotlight.id } : null
}

/** Los mensajes de la cadena que se muestran: los de la jugada `at` (desde `from`, los que ya se veían antes de ella), de a uno hasta `seen`. */
interface ChainShown {
  at: number
  from: number
  seen: number
}

/**
 * La cadena al avanzar un paso (reproducir o «Siguiente»): sus mensajes de esa jugada, de a uno con el ritmo de la mesa (`chainDwell`), como en el repaso de «Jugar solo». Saltar
 * no la muestra (null).
 */
function chainAt(steps: readonly ChainStep[], from: number, to: number): ChainShown | null {
  if (to !== from + 1 || steps.length === 0) return null
  const before = stepsUpTo(steps, from)

  return { at: to, from: before, seen: nextShown(steps, before, stepsUpTo(steps, to)) }
}

/** Quién barajó su Deck al avanzar un paso (la jugada, o una de un lote, es barajar), como en la mesa (`shuffleDeck`); saltar no lo muestra. */
function shuffleAt(replay: DuelReplay, from: number, to: number): ReplaySide | null {
  const step = to === from + 1 ? replay.steps[to - 1] : undefined
  const action = step?.[1]
  const parts = action?.type === 'batch' ? action.actions : action ? [action] : []

  return step && parts.some((part) => part.type === 'shuffle') ? step[0] : null
}

/**
 * Las cartas vuelan de donde estaban a donde quedan al avanzar de a un paso o reproducir, con el movimiento de la mesa (`useCardFlights`), como para quien mira un duelo: las de abajo
 * con las marcas propias y las de arriba con las del rival (los ids de cada lado no cambian de un paso a otro). Al saltar o dar vuelta la mesa se monta de nuevo (`key`): nada vuela,
 * sólo se mide.
 */
function ReplayFlights({ containerRef, bottom, top, layout }: { containerRef: RefObject<HTMLElement | null>; bottom: DuelSideView; top: DuelSideView; layout: string }) {
  useCardFlights(containerRef, bottom.state, bottom.artOf, layout)
  useCardFlights(containerRef, top.state, top.artOf, layout, 'theirs')

  return null
}

export function DuelReplayScreen({ replay, onClose, shared, actions, startAt, backLabel = t('meta.duels.back') }: DuelReplayScreenProps) {
  const total = replay.steps.length
  const [cursor, setCursor] = useState(startAt ?? total)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<ReplaySpeed>(1)
  const [flipped, setFlipped] = useState(false)
  const [banner, setBanner] = useState<PhaseCue | null>(null)
  const [activation, setActivation] = useState<Activation | null>(null)
  const [chain, setChain] = useState<ChainShown | null>(null)
  // Los vuelos se montan de nuevo al saltar (`ReplayFlights`): nada vuela, sólo se mide. El barajado, el del lado que barajó en este paso.
  const [flights, setFlights] = useState(0)
  const [shuffled, setShuffled] = useState<{ key: number; drop: 'data-drop' | 'data-rival-drop' } | null>(null)
  const bottom: ReplaySide = flipped ? 1 : 0
  const top: ReplaySide = flipped ? 0 : 1
  const chainSteps = useMemo(() => replayChainSteps(replay, bottom), [replay, bottom])
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
    // Hasta 1100 px el lugar es la pantalla entera (la geometría del duelo); en escritorio, lo que dejan la barra y los controles.
    const measure = () => setStage({ width: node.clientWidth || window.innerWidth, height: node.clientHeight || Math.max(0, window.innerHeight - (desktop ? 200 : 0)) })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [desktop])
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

  // Lo que se anuncia al avanzar de a un paso: la banda de la fase, la carta grande de lo que se activa y la cadena.
  const announce = useCallback(
    (from: number, to: number) => {
      setBanner(bannerAt(replay, from, to))
      setActivation(activationAt(replay, shots, from, to))
      setChain(chainAt(chainSteps, from, to))
      const side = shuffleAt(replay, from, to)
      setShuffled(side === null ? null : { key: to, drop: side === bottom ? 'data-drop' : 'data-rival-drop' })
    },
    [replay, shots, chainSteps, bottom],
  )
  useEffect(() => {
    if (shuffled) shuffleDeck(stageRef.current?.querySelectorAll(`[${shuffled.drop}="deck"] [data-layer]`) ?? [])
  }, [shuffled])
  useEffect(() => {
    if (!activation) return
    const timer = window.setTimeout(() => setActivation(null), ACTIVATION_MS)
    return () => window.clearTimeout(timer)
  }, [activation])
  // La cadena de la jugada, de a un mensaje con su tiempo (según la velocidad).
  const chainDue = chain ? stepsUpTo(chainSteps, chain.at) : 0
  const chainPending = chain !== null && chain.seen < chainDue
  useEffect(() => {
    if (!chain || chain.seen >= chainDue) return
    const timer = window.setTimeout(() => setChain((current) => (current === chain ? { ...chain, seen: nextShown(chainSteps, chain.seen, chainDue) } : current)), chainDwell(chainSteps, chain.seen - 1) / speed)
    return () => window.clearTimeout(timer)
  }, [chain, chainDue, chainSteps, speed])

  // Reproducir: una jugada cada `STEP_MS` (según la velocidad) hasta el final; la cadena de una jugada se cuenta entera antes de la siguiente.
  useEffect(() => {
    if (!playing || chainPending) return
    if (cursor >= total) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => {
      setCursor(cursor + 1)
      announce(cursor, cursor + 1)
    }, STEP_MS / speed)
    return () => window.clearTimeout(timer)
  }, [playing, chainPending, cursor, total, speed, replay, announce])
  const jump = (at: number) => {
    setPlaying(false)
    setBanner(null)
    setActivation(null)
    setChain(null)
    setShuffled(null)
    setFlights((current) => current + 1)
    setCursor(at)
  }
  // Lo que se ve de la cadena: la escena mientras se arma (y su salida, si terminó en esta jugada) y los medallones al resolver, en el lado donde se activó cada eslabón.
  const feed = useMemo(() => (chain ? chainFeed(chainSteps, chain.seen) : null), [chain, chainSteps])
  const medals = useMemo(() => medalsOf(feed), [feed])
  const chainStage = feed && chain && !(feed.done && chain.seen === chain.from) ? feed : null
  const chainRows = useMemo(
    () =>
      (chainStage?.rows ?? []).map((row) => ({
        number: row.number,
        mine: row.mine,
        name: replay.cards[String(row.code)] ?? t('practice.card.unknown'),
        art: row.code ? artOfDrawId(`card-${row.code}-1`) : null,
        state: row.state,
        ...(row.by ? { by: row.by } : {}),
        ...(row.outcome ? { outcome: outcomeLabel(row.outcome) } : {}),
      })),
    [chainStage, replay],
  )

  const view = (side: ReplaySide): DuelSideView => ({ state: frame.states[side], artOf: (id) => artOfDrawId(isToken(id) ? id : realOf(replay, frame, side, id)), handCount: frame.states[side].hand.length })
  const bottomView = { ...view(bottom), medals: medals.mine }
  const topView = { ...view(top), medals: medals.theirs }
  // Con «mi mano», la de quien grabó boca arriba (abajo; dada vuelta la mesa, de dorso como la del rival).
  const openHand = replay.view === 'mine' && bottom === 0 ? frame.states[0].hand.map((id) => ({ name: cardName(replay, frame, 0)(id), art: bottomView.artOf(id) })) : undefined
  const playLabel = playing ? t('practice.mat.pause') : cursor >= total ? t('practice.mat.watchAgain') : t('practice.mat.play')
  const title = titleOf(replay)
  const result = cursor >= total ? replayResultText(replay) : null

  // Las chapas de la mesa: hasta 1100 px, la del rival chica (en la barra) y la de abajo grande (en tu fila), como en el duelo; en escritorio, las dos grandes.
  const badge = (side: ReplaySide, place: 'top' | 'bottom') => (
    <LifeBadge name={names[side]} label={names[side]} life={frame.lp[side]} mine={place === 'bottom'} color={side === 0 ? 'mine' : 'theirs'} active={frame.turn === side} compact={!desktop && place === 'top'} />
  )
  const field = stage && desktop ? fieldLayout(stage.width, stage.height) : null
  // Hasta 1100 px, la geometría del duelo del celular y la tableta (`matDuelLayout`, con la barra y la fila de abajo de la mesa): el campo y las dos manos quedan donde están en el duelo, y los
  // controles van en esas dos franjas.
  const mat = stage && !desktop ? matDuelLayout(stage.width, stage.height, { tilted: false, bar: PHONE_DUEL_BAR, bottom: PHONE_DUEL_BOTTOM }) : null
  const viewLabel = replay.view === 'mine' ? t('meta.duels.withHand', { name: names[0] }) : t('meta.duels.public')
  const flip = () => setFlipped((current) => !current)
  const transport = {
    total,
    cursor,
    playing,
    playLabel,
    speed,
    onTogglePlay: () => {
      if (!playing && cursor >= total) setCursor(0)
      setPlaying((current) => !current)
    },
    onPrevious: () => jump(Math.max(0, cursor - 1)),
    onNext: () => {
      const next = Math.min(total, cursor + 1)

      setPlaying(false)
      setCursor(next)
      announce(cursor, next)
    },
    onSpeed: setSpeed,
  }

  // El número de la jugada en su renglón y la frase entera en hasta dos, con el alto de dos siempre reservado: ni una jugada más larga ni los nombres que llegan después mueven el campo.
  const stepLine = (
    <p data-testid="replay-step" className="m-0 grid min-w-0 flex-1 text-body text-foreground" aria-live={playing ? 'off' : 'polite'}>
      <span className="truncate text-micro font-semibold text-muted tabular-nums">{cursor === 0 ? t('meta.duels.start') : result ? `${t('meta.duels.step', { n: cursor, total })} · ${result}` : t('meta.duels.step', { n: cursor, total })}</span>
      <span data-testid="replay-step-text" className="line-clamp-2 min-h-[2lh] leading-tight">
        {cursor > 0 ? describe(cursor) : null}
      </span>
    </p>
  )
  const table = (style: CSSProperties | undefined) => (
    <DuelTable mine={bottomView} theirs={{ ...topView, handCount: undefined }} turn={frame.turn === bottom ? 'mine' : 'theirs'} centerPhase phoneStyle={style}>
      {/* La banda espera a que se vaya la carta grande (no se lee partida detrás), y la carta va sin cartel: el texto del paso está en los controles. */}
      <PhaseBand cue={banner} hold={activation !== null} />
      {activation ? (
        <Spotlight
          key={activation.key}
          kind="activate"
          cards={[{ id: activation.id, name: cardName(replay, frame, activation.side)(activation.id), art: view(activation.side).artOf(activation.id), back: realOf(replay, frame, activation.side, activation.id) === undefined }]}
          className="absolute inset-0 z-[120]"
        />
      ) : null}
      {/* La cadena en grande, sobre el campo como en el duelo (`ChainStage`: su velo tapa la pantalla). */}
      {chainStage ? (
        <div data-testid="replay-chain" className="pointer-events-none absolute inset-0 z-[125] flex items-center justify-center">
          <ChainStage key={chainStage.key} rows={chainRows} current={chainStage.current} done={chainStage.done} />
        </div>
      ) : null}
    </DuelTable>
  )
  const topHand = <TheirHand count={topView.handCount ?? 0} medals={topView.medals.get('hand') ?? null} label={t('meta.duels.hand', { name: names[top], count: topView.handCount ?? 0 })} />
  const bottomHand = <TheirHand below count={bottomView.handCount ?? 0} medals={bottomView.medals.get('hand') ?? null} label={openHand ? t('meta.duels.handShown', { name: names[bottom], cards: openHand.map((card) => card.name).join(', ') }) : t('meta.duels.hand', { name: names[bottom], count: bottomView.handCount ?? 0 })} {...(openHand ? { cards: openHand } : {})} />
  const back = (
    <IconButton tone="flat" size="sm" className="-ml-1 shrink-0" aria-label={backLabel} title={backLabel} onClick={onClose}>
      <Icon name="arrow-left" />
    </IconButton>
  )

  if (!desktop) {
    // Celular y tableta: la pantalla del duelo. Arriba, en la barra (58 px): volver, la jugada, el menú (dar vuelta la mesa; en el celular, volver al principio) y la chapa del rival a la derecha.
    // Abajo, en tu fila (68 px): tu chapa a la izquierda y, a su derecha, la línea de tiempo sobre los botones. El campo y las manos, en el lugar fijo de `matDuelLayout`; nada les saca alto.
    const items: OverflowItem[] = [
      { label: t('duel.watch.flip'), icon: 'swap', checked: flipped, onSelect: flip },
      ...(phone ? [{ label: t('practice.replay.restart'), icon: 'skip-back' as const, onSelect: () => jump(0) }] : []),
      ...actions,
    ]

    return (
      <div className="mat-square relative isolate h-full min-h-0 overflow-hidden bg-background **:rounded-none!" role="region" aria-label={t('meta.duels.viewer', { title })}>
        <MatScene className="absolute inset-0 -z-10" />
        <div className="absolute inset-x-0 top-0 z-20 flex min-w-0 items-center gap-1.5 px-2" style={{ height: PHONE_DUEL_BAR }}>
          {back}
          {stepLine}
          <span className="sr-only">{viewLabel}</span>
          {/* Compartido: guardarlo, en la barra (una franja más le sacaría alto al campo). Guardado, se queda en su lugar y lo dice. */}
          {shared || wasShared ? (
            <span role="region" aria-label={t('meta.duels.shared')} className="flex shrink-0">
              {shared ? (
                <IconButton tone="primary" size="sm" aria-label={t('meta.duels.saveShared')} title={t('meta.duels.saveShared')} onClick={shared.onSave}>
                  <Icon name="save" />
                </IconButton>
              ) : (
                <IconButton tone="raised" size="sm" aria-label={t('meta.duels.savedShared')} title={t('meta.duels.savedShared')} disabled>
                  <Icon name="check" />
                </IconButton>
              )}
            </span>
          ) : null}
          <OverflowMenu label={t('meta.duels.more', { title })} items={items} />
          <span className="-mr-1 flex shrink-0">{badge(top, 'top')}</span>
        </div>
        {/* Sin tocar (`pointer-events-none`): los controles de las franjas quedan por encima; el campo sí se toca. */}
        <div ref={stageRef} className="pointer-events-none absolute inset-0">
          {stage ? <ReplayFlights key={`${flights}:${bottom}`} containerRef={stageRef} bottom={bottomView} top={topView} layout={`${stage.width}x${stage.height}`} /> : null}
          {mat && stage ? (
            <>
              <div className="absolute inset-x-0 flex justify-center" style={{ top: mat.rivalTop }}>
                <TheirHandSize value={{ cardWidth: mat.rivalCard, maxWidth: mat.rivalWidth, room: mat.rivalRoom }}>{topHand}</TheirHandSize>
              </div>
              <div className="pointer-events-auto absolute inset-x-0 flex justify-center" style={{ top: mat.fieldTop }}>
                {table(phoneFieldStyle(mat))}
              </div>
              {/* Tu mano, como en la mesa (`PracticeHand`): sus cartas bajan `HAND_TOP_ROOM` desde su caja y se abren a lo ancho de la columna (sin su orilla de 4 px). */}
              <div className="absolute inset-x-0 flex justify-center" style={{ top: mat.handTop + HAND_TOP_ROOM }}>
                <TheirHandSize value={{ cardWidth: mat.handCard, maxWidth: stage.width - 8, room: mat.handHeight - HAND_TOP_ROOM }}>{bottomHand}</TheirHandSize>
              </div>
            </>
          ) : null}
        </div>
        {mat ? (
          <div className="absolute inset-x-0 bottom-0 z-20 flex items-start gap-1.5 px-1.5 pb-[env(safe-area-inset-bottom,0px)]" style={{ top: mat.bottomTop }}>
            {badge(bottom, 'bottom')}
            <div className="grid min-w-0 flex-1">
              <ReplayTimeline slim marks={marks} cursor={cursor} describe={describe} onSeek={jump} />
              <ReplayTransport {...transport} {...(phone ? {} : { onRestart: () => jump(0) })} />
            </div>
          </div>
        ) : null}
      </div>
    )
  }

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
      <div className="flex h-11 min-w-0 shrink-0 items-center gap-1.5 px-4">
        {back}
        <span className="min-w-0 flex-1 truncate text-body font-bold text-foreground">{title}</span>
        <span className="inline-flex min-w-0 shrink items-center gap-1 bg-tint/8 px-2 py-1 text-micro font-semibold text-muted" title={viewLabel}>
          <Icon name={replay.view === 'mine' ? 'hand' : 'eye'} size={14} className="shrink-0" />
          <span className="truncate">{viewLabel}</span>
        </span>
        <span className="-mr-1 flex shrink-0 items-center">
          <IconButton tone="flat" size="sm" aria-label={t('duel.watch.flip')} title={t('duel.watch.flip')} onClick={flip}>
            <Icon name="swap" />
          </IconButton>
          {actions.length > 0 ? <OverflowMenu label={t('meta.duels.more', { title })} items={actions} /> : null}
        </span>
      </div>

      {/* La mesa: las dos manos y el campo, que llena el alto que queda entre la barra y los controles. */}
      <div ref={stageRef} className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-1">
        {stage ? <ReplayFlights key={`${flights}:${bottom}`} containerRef={stageRef} bottom={bottomView} top={topView} layout={`${stage.width}x${stage.height}`} /> : null}
        {field ? (
          <div className="relative flex flex-col items-center" style={{ gap: field.gap }}>
            <div className="absolute left-full top-0 z-20 ml-3">{badge(top, 'top')}</div>
            <TheirHandSize value={field.top}>{topHand}</TheirHandSize>
            <div style={field.box}>{table(undefined)}</div>
            <TheirHandSize value={field.bottom}>{bottomHand}</TheirHandSize>
            <div className="absolute bottom-0 right-full z-20 mr-3">{badge(bottom, 'bottom')}</div>
          </div>
        ) : null}
      </div>

      {/* Abajo, como en el repaso de un combo: la jugada, los botones y la línea de tiempo. */}
      <div className="mx-auto grid w-full max-w-3xl shrink-0 gap-1 px-4 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex min-h-11 min-w-0 items-center gap-2">{stepLine}</div>
        <ReplayTransport {...transport} onRestart={() => jump(0)} />
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
/** En escritorio: el hueco entre casillas de la mesa (`min-[1101px]:gap-2`) y tu carta de la mano, en casillas. */
const DESK_GAP = 8
const DESK_HAND = 0.9

/**
 * El campo y las manos que entran en el lugar de la mesa en escritorio (`width` × `height`, medido): los de la mesa del duelo en escritorio (casillas cuadradas, `--cell`, sin `data-phone`) con huecos de
 * 8 px, tu mano de 0,9 casillas y la de arriba a 0,8 de ella; la casilla, la más grande que entra a lo ancho y a lo alto (5 filas, las dos manos con su abanico y los dos huecos).
 */
function fieldLayout(width: number, height: number) {
  const cell = Math.min((width - 8 - 6 * DESK_GAP) / 6.3714, (height - 4 * DESK_GAP - 2 * DESK_GAP - FAN_ROOM - 8) / (5 + (DESK_HAND + DESK_HAND * 0.8) * CARD_RATIO))
  const fieldWidth = cell * 6.3714 + 6 * DESK_GAP
  const hand = cell * DESK_HAND
  return {
    gap: DESK_GAP,
    top: { cardWidth: hand * 0.8, maxWidth: fieldWidth * 0.8, room: hand * 0.8 * CARD_RATIO + 8 },
    bottom: { cardWidth: hand, maxWidth: fieldWidth, room: hand * CARD_RATIO + FAN_ROOM },
    box: { width: fieldWidth, '--cell': `${cell}px` } as CSSProperties,
  }
}
