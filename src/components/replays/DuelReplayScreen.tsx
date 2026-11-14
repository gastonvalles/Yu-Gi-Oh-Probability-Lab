import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'

import type { ChainStep } from '../../app/auto/chain-feed'
import { medalsOf } from '../../app/card-glow'
import { lineCell, railsCell, railsField } from '../../app/duel-rails'
import { duelReplayAt, replayChainSteps, walkReplay, type DuelReplay, type ReplaySide } from '../../app/duel-replay'
import { impactOn, sacrificeAt, shakeOf } from '../../app/field-impact'
import { matEffects, type MatEffects } from '../../app/mat-effects'
import { prefersReducedMotion } from '../../app/motion'
import { isToken } from '../../app/practice-mat'
import { growHand } from '../../app/practice-hand-layout'
import { shuffleDeck } from '../../app/shuffle-fx'
import { UNKNOWN_SUMMON, entranceAllowed, entranceOf, landingToneOf, playEntrance } from '../../app/summon-entrance'
import { useCardFlights } from '../../app/use-card-flights'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, DUEL_DETAIL_DOCK_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { ChainStage, chainDwell, chainFeed, nextShown, outcomeLabel, stepsUpTo } from '../auto/ChainNotice'
import { artOfDrawId } from '../duel/duel-art'
import { DuelTable, TheirHand, type DuelSideView } from '../duel/DuelTable'
import { LifeBadge } from '../duel/LifeScore'
import { PhaseBand, type PhaseCue } from '../duel/PhaseBand'
import { THEIR_HAND, TheirHandSize } from '../duel/their-hand'
import { COMPACT_FIELD_MEDIA_QUERY, HAND_ROOM, HAND_TOP_ROOM, PHONE_DUEL_BAR, PHONE_DUEL_BOTTOM, matDuelLayout, phoneFieldStyle } from '../probability/compact-field'
import { MatScene } from '../probability/MatArena'
import { AttackFx, measureStrike, type Strike } from '../probability/AttackFx'
import { Spotlight, landingDelay } from '../probability/MatFx'
import { DESKTOP_AUTO_HAND, DESKTOP_HAND_GAP, MAT_GAP } from '../probability/PracticeMat'
import { ReplayTimeline, ReplayTransport, type ReplayMark, type ReplaySpeed } from '../probability/ReplayBar'
import { stepTone } from '../probability/step-tone'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { OverflowMenu, type OverflowItem } from '../ui/OverflowMenu'
import { cardName, playerName, realOf, replayResultText, stepText, titleOf } from './duel-replay-text'

/**
 * El replay de un duelo, de sólo lectura: las dos mesas como las vería un espectador (lo que nadie mostró, de dorso; con «mi mano», la de quien grabó boca arriba), las vidas, de quién
 * es el turno y qué pasó en cada jugada, con la línea de tiempo y los botones de la práctica (`ReplayTimeline`, `ReplayTransport`: los turnos marcados con una línea). Quien grabó va
 * abajo; se puede dar vuelta la mesa como quien mira un duelo. Lo que vino de otro (los nombres, el de cada carta) se dibuja como texto.
 * Se ve como la mesa del duelo y el repaso de un combo (Gastón, 2026-11-12: «todas las replays y videos deberian compartir una misma estetica»; 2026-11-13: «los replays y campos de video deben ser
 * iguales al campo de duelo»): el remolino, el campo y las manos en el lugar y del tamaño del duelo (`matDuelLayout` hasta 1100 px, `deskLayout` en escritorio), la caja de la fase al medio, las chapas
 * de vidas y los controles donde el duelo tiene sus barras o sus laterales, sin sacarle lugar al campo. No monta `PracticeMat`: esa mesa es la
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

/**
 * El impacto de un paso (`field-impact.ts`), con la misma regla que la mesa: una carta que cae en una zona de monstruo (`matEffects`: la Invocación, con el tono que da la escala de la
 * sacudida) o un ataque (la espada de la mesa, `AttackFx`, que trae su pausa, su anillo y su sacudida). `mine`: lo hizo el lado de abajo (sus cartas llevan `data-card-id`; las de arriba,
 * `data-rival-card-id`). Sólo al avanzar de a un paso: saltar no lo trae.
 */
type Impact = { key: number; mine: boolean } & ({ landing: NonNullable<MatEffects['landing']>; id: string } | { attack: { id: string; target?: string } })

function impactAt(replay: DuelReplay, shots: Parameters<typeof duelReplayAt>[2], from: number, to: number, bottom: ReplaySide): Impact | null {
  const step = to === from + 1 ? replay.steps[to - 1] : undefined
  if (!step) return null
  const [side, action] = step
  const mine = side === bottom
  if (action.type === 'attack') return { key: to, mine, attack: action }
  const landing = matEffects(duelReplayAt(replay, from, shots).states[side], action).landing
  if (!landing || landing.spot === 'field') return null
  const id = duelReplayAt(replay, to, shots).states[side][landing.spot][landing.index]?.id

  return id ? { key: to, mine, landing, id } : null
}

/**
 * Los Sacrificios de un paso, con la misma regla que la mesa (`matEffects`): su efecto (`sacrificeAt`) sale de cada carta que se sacrifica, medida antes de que se dibuje el paso (todavía
 * está en su casilla), mientras vuela al Cementerio. Sólo al avanzar de a un paso.
 */
function sacrificeStep(replay: DuelReplay, shots: Parameters<typeof duelReplayAt>[2], from: number, to: number, bottom: ReplaySide, root: Element | null) {
  const step = to === from + 1 ? replay.steps[to - 1] : undefined
  if (!step || step[1].type !== 'tribute' || !matEffects(duelReplayAt(replay, from, shots).states[step[0]], step[1]).sacrifice) return
  for (const id of step[1].tributes) {
    const rect = root?.querySelector(`[${step[0] === bottom ? 'data-card-id' : 'data-rival-card-id'}="${CSS.escape(id)}"]`)?.getBoundingClientRect()
    if (rect) sacrificeAt(rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width)
  }
}

/** Los mensajes de la cadena que se muestran:los de la jugada `at` (desde `from`, los que ya se veían antes de ella), de a uno hasta `seen`. */
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
  const [impact, setImpact] = useState<Impact | null>(null)
  // La entrada larga de lo que sale del Extra Deck (la de la mesa): mientras dura, reproducir no avanza (la dice su velo, `onDone`).
  const [entering, setEntering] = useState(false)
  const entrance = useRef<Animation | null>(null)
  const [strike, setStrike] = useState<Strike | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  // Lo que sacude un impacto: el campo (como en la mesa, `data-field`); las chapas, las manos y los controles, no.
  const fieldRef = useRef<HTMLDivElement | null>(null)
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
  // Desde 1440 px el duelo lleva el panel del detalle y su campo es el de sin laterales (lineCell): el replay toma esa casilla.
  const dock = useMediaQuery(DUEL_DETAIL_DOCK_MEDIA_QUERY)
  // El lugar de la mesa, medido: de él sale el tamaño del campo y de las manos (sin ResizeObserver, como en las pruebas, la ventana menos la barra y los controles).
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const node = stageRef.current
    if (!node) return
    const measure = () => setStage({ width: node.clientWidth || window.innerWidth, height: node.clientHeight || window.innerHeight })
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
      setImpact(impactAt(replay, shots, from, to, bottom))
      sacrificeStep(replay, shots, from, to, bottom, stageRef.current)
    },
    [replay, shots, chainSteps, bottom],
  )
  useEffect(() => {
    if (shuffled) shuffleDeck(stageRef.current?.querySelectorAll(`[${shuffled.drop}="deck"] [data-layer]`) ?? [])
  }, [shuffled])
  // El impacto, ya dibujado el paso (se mide en pantalla): la Invocación, desde su casilla cuando la carta la toca (`landingDelay`, el del vuelo de la mesa); el ataque, la espada de la mesa.
  // Con movimiento reducido, nada (`impactOn` tampoco dibuja).
  useEffect(() => {
    if (!impact) return
    const card = (mine: boolean, id: string) => `[${mine ? 'data-card-id' : 'data-rival-card-id'}="${id}"]`
    if ('attack' in impact) {
      const { id, target } = impact.attack
      if (!prefersReducedMotion()) setStrike(measureStrike({ from: card(impact.mine, id), ...(target === undefined ? {} : { to: card(!impact.mine, target) }), direct: impact.mine ? 'theirs' : 'mine', bounds: rootRef.current }))
      return
    }
    const landed = stageRef.current?.querySelector(card(impact.mine, impact.id))
    const cell = landed?.parentElement ?? null
    const tone = landingToneOf(impact.landing, UNKNOWN_SUMMON)
    // Lo que sale del Extra Deck, con la entrada larga de la mesa (`playEntrance`): reproducir espera a que termine (`entering`). Con «Livianos» o movimiento reducido, la llegada de siempre.
    const kind = entranceOf(tone)
    if (kind && cell && landed instanceof HTMLElement && entranceAllowed()) {
      entrance.current?.cancel()
      const box = cell.getBoundingClientRect()
      const [w, h] = [Math.min(box.width, landed.offsetWidth || box.width), Math.min(box.height, landed.offsetHeight || box.height)]
      const side = impact.mine ? bottom : bottom === 0 ? 1 : 0
      const played = playEntrance({
        kind,
        cell: new DOMRect(box.left + (box.width - w) / 2, box.top + (box.height - h) / 2, w, h),
        art: artOfDrawId(realOf(replay, frame, side, impact.id) ?? impact.id),
        materials: frame.states[side][impact.landing.spot === 'emz' ? 'emz' : 'mz'][impact.landing.index]?.materials.length ?? 0,
        hide: [landed, ...document.querySelectorAll(`[data-flight-ghost="${impact.id}"]`)],
        field: fieldRef.current,
        onDone: () => {
          if (entrance.current !== played) return
          entrance.current = null
          setEntering(false)
        },
      })
      if (played) {
        entrance.current = played
        setEntering(true)
        return
      }
    }
    impactOn(cell, fieldRef.current, shakeOf({ landing: impact.landing.tone }), landingDelay(impact.landing.flies, false), tone)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- una vez por paso (`impact`): la carta y su arte, del cuadro de ese paso
  }, [impact])
  useEffect(() => () => entrance.current?.cancel(), [])
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
    if (!playing || chainPending || entering) return
    if (cursor >= total) {
      setPlaying(false)
      return
    }
    const timer = window.setTimeout(() => {
      setCursor(cursor + 1)
      announce(cursor, cursor + 1)
    }, STEP_MS / speed)
    return () => window.clearTimeout(timer)
  }, [playing, chainPending, entering, cursor, total, speed, replay, announce])
  const jump = (at: number) => {
    // Saltar, sin entrada: la que estaba en curso se corta.
    entrance.current?.cancel()
    setPlaying(false)
    setBanner(null)
    setActivation(null)
    setChain(null)
    setShuffled(null)
    setImpact(null)
    setStrike(null)
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
  // El lugar fijo del campo y de las dos manos, el de la mesa del duelo: hasta 1100 px, la del celular y la tableta (`matDuelLayout`, con la barra y la fila de abajo de la mesa); en escritorio, la
  // del duelo automático con laterales (`deskLayout`). Los controles van en las franjas o los laterales del duelo: nada le saca lugar al campo.
  const mat = stage && !desktop ? matDuelLayout(stage.width, stage.height, { tilted: false, bar: PHONE_DUEL_BAR, bottom: PHONE_DUEL_BOTTOM }) : null
  const desk = stage && desktop ? deskLayout(stage.width, stage.height, dock) : null
  const viewLabel = replay.view === 'mine' ? t('meta.duels.withHand', { name: names[0] }) : t('meta.duels.public')
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
  // Volver al principio va en la fila de los botones sólo en la tableta; en el celular y en los laterales de escritorio no entra con los demás y va en el menú (o Inicio en la línea de tiempo).
  const restartInRow = !phone && !desktop
  const items: OverflowItem[] = [
    { label: t('duel.watch.flip'), icon: 'swap', checked: flipped, onSelect: () => setFlipped((current) => !current) },
    ...(restartInRow ? [] : [{ label: t('practice.replay.restart'), icon: 'skip-back' as const, onSelect: () => jump(0) }]),
    ...actions,
  ]

  // El número de la jugada en su renglón y la frase entera en hasta dos, con el alto de dos siempre reservado: ni una jugada más larga ni los nombres que llegan después mueven el campo.
  const stepLine = (
    <p data-testid="replay-step" className="m-0 grid min-w-0 flex-1 text-body text-foreground" aria-live={playing ? 'off' : 'polite'}>
      <span className="truncate text-micro font-semibold text-muted tabular-nums">{cursor === 0 ? t('meta.duels.start') : result ? `${t('meta.duels.step', { n: cursor, total })} · ${result}` : t('meta.duels.step', { n: cursor, total })}</span>
      <span data-testid="replay-step-text" className="line-clamp-2 min-h-[2lh] leading-tight">
        {cursor > 0 ? describe(cursor) : null}
      </span>
    </p>
  )
  const back = (
    <IconButton tone="flat" size="sm" className="-ml-1 shrink-0" aria-label={backLabel} title={backLabel} onClick={onClose}>
      <Icon name="arrow-left" />
    </IconButton>
  )
  const menu = <OverflowMenu label={t('meta.duels.more', { title })} items={items} />
  // Compartido: guardarlo. Guardado, se queda en su lugar y lo dice (nada se corre).
  const sharedSave = shared || wasShared ? (
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
  ) : null

  // El campo y las dos manos, cada uno en su lugar fijo (sin tocar, `pointer-events-none`: los controles de las franjas y los laterales quedan por encima; el campo sí se toca).
  const place = (top: number, child: ReactNode, touch = false) => (
    <div className={cx('absolute inset-x-0 flex justify-center', touch && 'pointer-events-auto')} style={{ top }}>
      {child}
    </div>
  )
  const geometry = mat
    ? { rivalTop: mat.rivalTop, rival: { cardWidth: mat.rivalCard, maxWidth: mat.rivalWidth, room: mat.rivalRoom }, fieldTop: mat.fieldTop, box: undefined, style: phoneFieldStyle(mat), handTop: mat.handTop, hand: { cardWidth: mat.handCard, maxWidth: (stage?.width ?? 0) - 8, room: mat.handHeight - HAND_TOP_ROOM } }
    : desk
      ? { rivalTop: desk.rivalTop, rival: THEIR_HAND.desktop, fieldTop: desk.fieldTop, box: { width: desk.fieldWidth, '--cell': `${desk.cell}px` } as CSSProperties, style: undefined, handTop: desk.handTop, hand: { cardWidth: desk.handCard, maxWidth: desk.handWidth, room: desk.handCard * CARD_RATIO + HAND_ROOM - HAND_TOP_ROOM } }
      : null
  const stageNode = (
    <div ref={stageRef} className="pointer-events-none absolute inset-0">
      {stage ? <ReplayFlights key={`${flights}:${bottom}`} containerRef={stageRef} bottom={bottomView} top={topView} layout={`${stage.width}x${stage.height}`} /> : null}
      {geometry ? (
        <>
          {place(geometry.rivalTop, <TheirHandSize value={geometry.rival}><TheirHand count={topView.handCount ?? 0} medals={topView.medals.get('hand') ?? null} label={t('meta.duels.hand', { name: names[top], count: topView.handCount ?? 0 })} /></TheirHandSize>)}
          {place(
            geometry.fieldTop,
            // La carta grande y la cadena, encima del campo y fuera de lo que sacude un impacto (como en la mesa); la banda de la fase va en su fila del campo y se sacude con él.
            <div className="relative isolate" style={geometry.box}>
              <div ref={fieldRef} data-field="">
                <DuelTable mine={bottomView} theirs={{ ...topView, handCount: undefined }} turn={frame.turn === bottom ? 'mine' : 'theirs'} centerPhase phoneStyle={geometry.style}>
                  {/* La banda espera a que se vaya la carta grande (no se lee partida detrás), y la carta va sin cartel: el texto del paso está en los controles. */}
                  <PhaseBand cue={banner} hold={activation !== null} />
                </DuelTable>
              </div>
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
            </div>,
            true,
          )}
          {/* Tu mano, como en la mesa (`PracticeHand`): sus cartas bajan `HAND_TOP_ROOM` desde su caja y se abren a lo ancho que tiene la tuya. */}
          {place(
            geometry.handTop + HAND_TOP_ROOM,
            <TheirHandSize value={geometry.hand}>
              <TheirHand below count={bottomView.handCount ?? 0} medals={bottomView.medals.get('hand') ?? null} label={openHand ? t('meta.duels.handShown', { name: names[bottom], cards: openHand.map((card) => card.name).join(', ') }) : t('meta.duels.hand', { name: names[bottom], count: bottomView.handCount ?? 0 })} {...(openHand ? { cards: openHand } : {})} />
            </TheirHandSize>,
          )}
        </>
      ) : null}
    </div>
  )

  return (
    <div ref={rootRef} className="mat-square relative isolate h-full min-h-0 overflow-hidden bg-background **:rounded-none!" role="region" aria-label={t('meta.duels.viewer', { title })}>
      {strike ? <AttackFx key={strike.key} strike={strike} onDone={() => setStrike(null)} /> : null}
      {/* El fondo de la mesa (el remolino), como en el duelo y en el repaso de un combo. */}
      <MatScene className="absolute inset-0 -z-10" />
      {desktop ? (
        // Escritorio: los laterales del duelo. A la izquierda, arriba volver y el título (y guardar, si llegó compartido) y abajo tu chapa; a la derecha, arriba el menú y la chapa del rival y abajo,
        // donde el duelo tiene sus botones, la jugada, la línea de tiempo y los botones.
        <>
          <div className="absolute inset-y-0 left-0 z-20 flex flex-col justify-between gap-3 p-4" style={{ width: desk?.railWidth }}>
            <div className="grid min-w-0 gap-2">
              <div className="flex min-w-0 items-center gap-1.5">
                {back}
                <span className="min-w-0 flex-1 truncate text-body font-bold text-foreground">{title}</span>
                {sharedSave}
              </div>
              <span className="inline-flex min-w-0 items-center gap-1 justify-self-start bg-tint/8 px-2 py-1 text-micro font-semibold text-muted" title={viewLabel}>
                <Icon name={replay.view === 'mine' ? 'hand' : 'eye'} size={14} className="shrink-0" />
                <span className="truncate">{viewLabel}</span>
              </span>
            </div>
            <span className="flex">{badge(bottom, 'bottom')}</span>
          </div>
          <div className="absolute inset-y-0 right-0 z-20 flex flex-col justify-between gap-3 p-4" style={{ width: desk?.railWidth }}>
            <div className="flex items-start justify-end gap-1.5">
              {menu}
              {badge(top, 'top')}
            </div>
            <div className="grid min-w-0 gap-1">
              {stepLine}
              <ReplayTimeline marks={marks} cursor={cursor} describe={describe} onSeek={jump} />
              <ReplayTransport {...transport} className="flex-wrap" />
            </div>
          </div>
          {stageNode}
        </>
      ) : (
        // Celular y tableta: la pantalla del duelo. Arriba, en la barra (58 px): volver, la jugada, el menú (dar vuelta la mesa; en el celular, volver al principio) y la chapa del rival a la
        // derecha. Abajo, en tu fila (68 px): tu chapa a la izquierda y, a su derecha, la línea de tiempo sobre los botones.
        <>
          <div className="absolute inset-x-0 top-0 z-20 flex min-w-0 items-center gap-1.5 px-2" style={{ height: PHONE_DUEL_BAR }}>
            {back}
            {stepLine}
            <span className="sr-only">{viewLabel}</span>
            {sharedSave}
            {menu}
            <span className="-mr-1 flex shrink-0">{badge(top, 'top')}</span>
          </div>
          {stageNode}
          {mat ? (
            <div className="absolute inset-x-0 bottom-0 z-20 flex items-start gap-1.5 px-1.5 pb-[env(safe-area-inset-bottom,0px)]" style={{ top: mat.bottomTop }}>
              {badge(bottom, 'bottom')}
              <div className="grid min-w-0 flex-1">
                <ReplayTimeline slim marks={marks} cursor={cursor} describe={describe} onSeek={jump} />
                <ReplayTransport {...transport} {...(restartInRow ? { onRestart: () => jump(0) } : {})} />
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

/** Una carta: 1 : 1,4612. */
const CARD_RATIO = 1.4612
/** En escritorio: el hueco entre casillas de la mesa (`min-[1101px]:gap-2`), el aire de arriba y abajo de su columna (`pt-2`, `pb-2`) y el ancho de una pila (0,6857 de una casilla). */
const DESK_GAP = 8
const DESK_PAD = 8
const PILE = 0.6857

/**
 * El campo y las manos del replay en escritorio: los del duelo automático, con las mismas cuentas. La casilla, la del duelo a ese alto: con laterales (`railsCell`, `--cell-h`) o, desde 1440 px (`dock`:
 * ahí el duelo lleva el panel del detalle y va sin laterales), la de sin laterales (`lineCell`); a lo ancho, lo que dejan los laterales (`railsField`, `--cell`), donde el replay pone sus controles.
 * Arriba la mano del rival (`THEIR_HAND.desktop`, a `DESKTOP_HAND_GAP` del campo) y debajo tu mano, de `DESKTOP_AUTO_HAND`, entre tu Extra Deck y tu Deck (`handInset`: el ancho de una pila y
 * `MAT_GAP`); con laterales crece con lo que sobra debajo (`growHand`), sin ellos no (el duelo tiene su fila de abajo). El grupo (la mano del rival, el campo y tu mano sin crecer) va centrado en el alto.
 */
function deskLayout(width: number, height: number, dock: boolean) {
  const { cell, width: fieldWidth } = railsField(width, dock ? lineCell(height) : railsCell(height))
  const fieldHeight = 5 * cell + 4 * DESK_GAP
  const rival = THEIR_HAND.desktop
  const stack = rival.room + DESKTOP_HAND_GAP + fieldHeight + DESKTOP_AUTO_HAND * CARD_RATIO + HAND_ROOM
  const top = DESK_PAD + Math.max(0, (height - 2 * DESK_PAD - stack) / 2)
  const fieldTop = top + rival.room + DESKTOP_HAND_GAP
  const handWidth = fieldWidth - 2 * Math.ceil(PILE * cell + MAT_GAP)
  const hand = growHand({ base: DESKTOP_AUTO_HAND, below: dock ? 0 : height - DESK_PAD - (top + stack), cell, width: handWidth, slots: 5 })

  return { cell, fieldWidth, fieldTop, rivalTop: fieldTop - DESKTOP_HAND_GAP - rival.room, handTop: fieldTop + fieldHeight, handCard: hand.cardWidth, handWidth, railWidth: (width - fieldWidth) / 2 }
}
