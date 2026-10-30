import { freePlaces, passiveAnswer } from '../../policies'
import type { AskOf, CardLoc, CoreAnswer, CoreAsk } from '../../protocol'
import type { Bot, BotCard, BotDecision, BotReason, BotView } from '../bot'
import { MAX_IDLE, type CardFacts } from '../turn'

/**
 * El marco de un ejecutor por mazo (etapa 2 del bot, «un ejecutor por mazo»): el mazo da sus reglas como datos (`DeckExecutor`) y el marco las corre como un `Bot` puro.
 * - **Main Phase** (`select_idlecmd` en su turno): gana la primera `Play` cuya carta está en la lista que ofrece el núcleo (que ya filtra lo legal) y cuyo `when` da verdadero. Si
 *   ninguna gana: la Battle Phase si hay un ataque que conviene (`attackPlan`); si no, terminar el turno.
 * - **Lo que sigue** (costos, objetivos, búsquedas, materiales, sí/no, opciones, casillas): `choose` del mazo con `Scene.current`, el efecto que se está jugando (el eslabón suyo que
 *   se resuelve o, al activarlo, la jugada que acaba de elegir). Las casillas de lo que sale del Extra Deck van a la Zona de Monstruos Extra.
 * - **Cadenas** (`select_chain`): `chain` del mazo; lo que no decide, el de reserva (`fallback`: las handtraps y Called by the Grave de `turnBot`).
 * - **Battle Phase**: el ataque directo si puede, o contra tu monstruo boca arriba que destruye sin perder el suyo; después, a la Main Phase 2 (ahí coloca sus Mágicas Rápidas).
 * Invariantes: un tope de `MAX_IDLE` jugadas por turno; una jugada que se repite con la mesa igual queda afuera ese turno (sin bucles); toda respuesta pasa por `legal` y, si no
 * pasa, contesta el de reserva (el núcleo rechaza lo ilegal con `RETRY`). Decide sólo con su vista y lo impreso de las cartas (`facts`, del `.cdb`, público).
 */

export const LOC = { DECK: 0x01, HAND: 0x02, MZONE: 0x04, SZONE: 0x08, GRAVE: 0x10, REMOVED: 0x20, EXTRA: 0x40 } as const
export const TYPE = { MONSTER: 0x1, SPELL: 0x2, TRAP: 0x4, EFFECT: 0x20, TOKEN: 0x4000, QUICKPLAY: 0x10000, LINK: 0x4000000 } as const
/** `PHASE_*` del núcleo. */
export const PHASE = { DRAW: 0x1, STANDBY: 0x2, MAIN1: 0x4, BATTLE: 0x08 | 0x10 | 0x20 | 0x40 | 0x80, MAIN2: 0x100, END: 0x200 } as const
/** `TIMING_ATTACK`: en `hint_timing_other`, la ventana que abre una declaración de ataque. */
export const ATTACK_TIMING = 0x1000
/** Las respuestas seguidas a preguntas que no son jugadas (costos, objetivos…) que contesta el mazo antes de pasarle la posta al de reserva: un efecto que pregunta sin fin no traba el duelo. */
const MAX_ASKS = 60

type IdleAsk = AskOf<'select_idlecmd'>
type IdleList = 'summons' | 'special_summons' | 'pos_changes' | 'monster_sets' | 'spell_sets' | 'activates'
const LIST: Record<Play['kind'], { list: IdleList; action: number }> = {
  summon: { list: 'summons', action: 0 },
  special: { list: 'special_summons', action: 1 },
  reposition: { list: 'pos_changes', action: 2 },
  mset: { list: 'monster_sets', action: 3 },
  set: { list: 'spell_sets', action: 4 },
  activate: { list: 'activates', action: 5 },
}

/** El efecto en juego: qué carta y qué regla. */
export interface Intent {
  id: string
  code: number
}

/** Lo que ve el mazo al decidir: la vista, lo impreso de las cartas, lo que ya hizo este turno y el efecto en juego. */
export interface Scene {
  view: BotView
  facts: (code: number) => CardFacts | undefined
  /** Las reglas (`Play.id` y las de cadena) que ya usó este turno. */
  done: ReadonlySet<string>
  /** El efecto en juego: el eslabón suyo que se está resolviendo o, si no hay, el último que eligió (al activarlo se eligen costos y objetivos antes del eslabón). */
  current: Intent | null
}

/** Una jugada de su Main Phase, en orden de prioridad. `effect`: el `n` del `desc` de la carta, si tiene varios efectos. */
export interface Play {
  id: string
  kind: 'summon' | 'special' | 'reposition' | 'mset' | 'set' | 'activate'
  code: number
  /** Desde dónde (máscara de `LOC`): sin esto, de cualquier lado. */
  from?: number
  effect?: number
  when?: (s: Scene, card: CardLoc) => boolean
  reason?: (s: Scene, card: CardLoc) => BotReason | undefined
}

/** Una decisión del mazo con la que sigue: `intent` queda como el efecto en juego (sus costos y objetivos). */
export type DeckDecision = BotDecision & { intent?: Intent }

export interface DeckExecutor {
  plays: readonly Play[]
  /** Los suyos que pueden atacar directo aunque tengas monstruos (para decidir si entra a la Battle Phase). */
  direct?: readonly number[]
  /** Una ventana de cadena (su turno o el tuyo): activar algo suyo, o `null` (el de reserva). */
  chain: (ask: AskOf<'select_chain'>, s: Scene) => DeckDecision | null
  /** Lo demás que pregunta el núcleo (costos, objetivos, búsquedas, materiales, sí/no, opciones): `null` es del de reserva. */
  choose: (ask: CoreAsk, s: Scene) => DeckDecision | null
}

// ── Lo que sirve a cualquier mazo ──────────────────────────────────────────────────────────────────────────────────────────

export const cardsOf = (side: BotView['me']) => [...side.monsters, ...side.spells].filter((card): card is BotCard => card !== null)
export const monstersOf = (side: BotView['me']) => side.monsters.filter((card): card is BotCard => card !== null)
/** Su Zona de Monstruos Principal vacía: la condición de casi todas las Mágicas de Sky Striker. */
export const mainZonesEmpty = (view: BotView) => view.me.monsters.slice(0, 5).every((card) => card === null)
export const countIn = (cards: readonly BotCard[], code: number) => cards.filter((card) => card.code === code).length
export const isType = (s: Pick<Scene, 'facts'>, code: number, type: number) => ((s.facts(code)?.type ?? 0) & type) !== 0
export const spellsInGrave = (s: Pick<Scene, 'facts' | 'view'>) => s.view.me.grave.filter((card) => isType(s, card.code, TYPE.SPELL)).length
export const atkOf = (s: Pick<Scene, 'facts'>, card: Pick<BotCard, 'code' | 'stats'> | null | undefined) => card?.stats?.attack ?? s.facts(card?.code ?? 0)?.attack ?? 0
/** La carta de la vista en ese lugar del campo. */
export const atPlace = (view: BotView, card: Pick<CardLoc, 'controller' | 'location' | 'sequence'>) => {
  const side = card.controller === view.seat ? view.me : view.them

  return (card.location === LOC.MZONE ? side.monsters[card.sequence] : card.location === LOC.SZONE ? side.spells[card.sequence] : undefined) ?? null
}
export const isMine = (view: BotView, card: Pick<CardLoc, 'controller'>) => card.controller === view.seat
/**
 * Cuánto vale una carta tuya para sacártela (lo que se ve): un monstruo boca arriba, su ATK (más si salió del Extra Deck: suele ser el que arma tu jugada); boca abajo, poco;
 * una Mágica o Trampa boca arriba (Continua, de Campo) más que una colocada. Nunca una suya: −1.
 */
export function threatOf(s: Scene, card: Pick<CardLoc, 'controller' | 'location' | 'sequence' | 'code'>): number {
  if (isMine(s.view, card)) return -1
  const seen = atPlace(s.view, card)
  const code = seen?.code ?? card.code

  if (card.location === LOC.MZONE) {
    if (!seen || seen.pos === 'set' || code === 0) return 400
    return 1000 + atkOf(s, seen) + (card.sequence >= 5 ? 500 : 0)
  }
  if (card.location === LOC.SZONE) return !seen || seen.pos === 'set' || code === 0 ? 800 : 1500

  return 100 + (s.facts(code)?.attack ?? 0) / 10
}
/** Los índices de una lista ordenados de mayor a menor por `score` (a igual puntaje, el orden del núcleo). */
export const ranked = <T>(list: readonly T[], score: (item: T) => number) =>
  list
    .map((item, index) => ({ index, value: score(item) }))
    .sort((a, b) => b.value - a.value || a.index - b.index)
    .map((item) => item.index)
/** El primero de `prefer` (códigos, en orden) que está en la lista; si no hay, -1. */
export const firstOf = (list: readonly Pick<CardLoc, 'code'>[], prefer: readonly number[], test: (card: CardLoc, index: number) => boolean = () => true) => {
  for (const code of prefer) {
    const index = (list as CardLoc[]).findIndex((card, i) => card.code === code && test(card, i))

    if (index >= 0) return index
  }

  return -1
}

/** Tu ataque recién declarado (el último del historial, tuyo), si lo hay. */
export function lastAttack(view: BotView) {
  const last = [...view.history].reverse().find((event) => event.kind === 'attack' || event.kind === 'phase')

  return last?.kind === 'attack' && last.side === 'them' ? last : null
}

/** El mejor ataque: directo (sin monstruos tuyos, o con uno que puede atacar directo), o contra tu monstruo boca arriba que destruye sin perder el suyo (el de más ATK). */
export function attackPlan(s: Scene, attackers: readonly { atk: number; direct: boolean }[]): { i: number; target: number | null } | null {
  const yours = monstersOf(s.view.them)
  let best: { i: number; target: number | null; value: number } | null = null

  attackers.forEach((attacker, i) => {
    if (yours.length === 0 || attacker.direct) {
      const value = 100_000 + attacker.atk

      if (attacker.direct && (!best || value > best.value)) best = { i, target: null, value }
      if (yours.length === 0) return
    }
    s.view.them.monsters.forEach((card, sequence) => {
      if (!card || card.code === 0 || card.pos === 'set' || !card.stats) return
      const safe = card.pos === 'atk' ? card.stats.attack < attacker.atk : card.stats.defense < attacker.atk
      const value = card.stats.attack + (card.pos === 'atk' ? attacker.atk - card.stats.attack : 0)

      if (safe && (!best || (best.target !== null && value > best.value))) best = { i, target: sequence, value }
    })
  })

  return best ? { i: (best as { i: number }).i, target: (best as { target: number | null }).target } : null
}

/** Que la respuesta sea una que el núcleo acepta (índices en rango, cantidades entre `min` y `max`): si no, contesta el de reserva. */
export function legal(ask: CoreAsk, answer: CoreAnswer): boolean {
  if (answer.type !== ask.type) return false
  const inRange = (index: number, length: number) => Number.isInteger(index) && index >= 0 && index < length

  switch (ask.type) {
    case 'select_idlecmd': {
      const a = answer as AskAnswer<'select_idlecmd'>
      const lists: IdleList[] = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates']

      if (a.action <= 5) return a.index !== null && inRange(a.index, ask[lists[a.action]!].length)
      return a.action === 6 ? ask.to_bp : a.action === 7 ? ask.to_ep : a.action === 8 && ask.shuffle
    }
    case 'select_battlecmd': {
      const a = answer as AskAnswer<'select_battlecmd'>

      if (a.action === 0) return a.index !== null && inRange(a.index, ask.chains.length)
      if (a.action === 1) return a.index !== null && inRange(a.index, ask.attacks.length)
      return a.action === 2 ? ask.to_m2 : a.action === 3 && ask.to_ep
    }
    case 'select_chain': {
      const { index } = answer as AskAnswer<'select_chain'>

      return index === null ? !ask.forced : inRange(index, ask.selects.length)
    }
    case 'select_card': {
      const { indices } = answer as AskAnswer<'select_card'>

      if (indices === null) return ask.can_cancel
      return new Set(indices).size === indices.length && indices.every((i) => inRange(i, ask.selects.length)) && indices.length >= ask.min && indices.length <= ask.max
    }
    case 'select_unselect_card': {
      const { index } = answer as AskAnswer<'select_unselect_card'>

      return index === null ? ask.can_finish || ask.can_cancel : inRange(index, ask.select_cards.length + ask.unselect_cards.length)
    }
    case 'select_option':
      return inRange((answer as AskAnswer<'select_option'>).index, ask.options.length)
    case 'select_place':
    case 'select_disfield': {
      const free = freePlaces(ask)
      const { places } = answer as AskAnswer<'select_place'>

      return places.length === ask.count && places.every((place) => free.some((other) => other.player === place.player && other.location === place.location && other.sequence === place.sequence))
    }
    default:
      return true
  }
}
type AskAnswer<K extends CoreAnswer['type']> = Extract<CoreAnswer, { type: K }>

/** La casilla de lo que Invoca: la Zona de Monstruos Extra si está libre (deja vacía la Principal), si no, la primera suya. */
export function placeOf(ask: AskOf<'select_place'>, view: BotView): CoreAnswer {
  const free = freePlaces(ask)
  const mine = free.filter((place) => place.player === view.seat)
  const order = [...mine.filter((place) => place.location === LOC.MZONE && place.sequence >= 5), ...mine, ...free]

  return { type: ask.type, places: order.slice(0, ask.count) }
}

/**
 * El `Bot` de un mazo: `deck` con sus reglas; `fallback`, el que contesta lo que el mazo no decide (sus handtraps, Called by the Grave y, si no, como el pasivo); `facts`, lo
 * impreso de cada carta.
 */
export function executorBot(deck: DeckExecutor, facts: (code: number) => CardFacts | undefined, fallback: Bot): Bot {
  let turn = -1
  let history = 0
  let idleCount = 0
  let asks = 0
  let done = new Set<string>()
  let intent: Intent | null = null
  /** La mesa (por códigos) la última vez que eligió cada jugada: la misma jugada con la misma mesa no vuelve este turno. */
  let seen = new Map<string, string>()
  let blocked = new Set<string>()
  let attackTarget: { attacker: number; target: number } | null = null

  const boardKey = (view: BotView) =>
    JSON.stringify([view.me.hand.map((card) => card.code), cardsOf(view.me).map((card) => [card.code, card.pos]), view.me.grave.length, view.me.banished.length, cardsOf(view.them).length, view.lp, view.chain.length])

  const sceneOf = (view: BotView): Scene => {
    const solving = view.chain.findLast((link) => link.state === 'solving')
    const current = solving ? (solving.card?.ref.side === 'mine' ? { id: intent?.code === solving.code ? intent.id : `chain.${solving.code}`, code: solving.code } : null) : intent

    return { view, facts, done, current }
  }

  function idle(ask: IdleAsk, s: Scene): DeckDecision {
    idleCount += 1
    intent = null
    attackTarget = null
    const end = (reason: BotReason, rule: string): DeckDecision => (ask.to_ep ? { answer: { type: ask.type, action: 7, index: null }, reason, rule } : { answer: passiveAnswer(ask, () => 0), rule })

    if (idleCount > MAX_IDLE) return end({ key: 'auto.bot.reason.end.done' }, 'executor.cap')
    const key = boardKey(s.view)

    for (const play of deck.plays) {
      if (blocked.has(play.id)) continue
      const { list, action } = LIST[play.kind]
      const index = ask[list].findIndex(
        (card) => card.code === play.code && (play.from === undefined || (card.location & play.from) !== 0) && (play.effect === undefined || !('description' in card) || Number(BigInt((card as { description: string }).description) & 0xfffffn) === play.effect) && (play.when?.(s, card) ?? true),
      )

      if (index < 0) continue
      // La misma jugada con la mesa igual: la anterior no hizo nada (la cancelaron o no se pudo); no se repite este turno.
      if (seen.get(play.id) === key) {
        blocked.add(play.id)
        continue
      }
      seen.set(play.id, key)
      done.add(play.id)
      intent = { id: play.id, code: play.code }
      const card = ask[list][index]!
      const reason = play.reason?.(s, card)

      return { answer: { type: ask.type, action, index }, ...(reason ? { reason } : {}), rule: play.id }
    }

    const empty = monstersOf(s.view.them).length === 0
    const plan = ask.to_bp ? attackPlan(s, monstersOf(s.view.me).filter((card) => card.pos === 'atk').map((card) => ({ atk: atkOf(s, card), direct: empty || (deck.direct?.includes(card.code) ?? false) }))) : null

    if (plan) return { answer: { type: ask.type, action: 6, index: null }, rule: 'executor.battle' }

    return end(endReason(s), 'executor.end')
  }

  function endReason(s: Scene): BotReason {
    const own = monstersOf(s.view.me).filter((card) => card.pos === 'atk')
    const yours = monstersOf(s.view.them)

    if (s.view.turn > 1 && own.length > 0 && yours.length > 0 && (s.view.phase & PHASE.MAIN1) !== 0) {
      const strongest = own.reduce((top, card) => (atkOf(s, card) > atkOf(s, top) ? card : top))
      const threat = yours.reduce((top, card) => (card.code !== 0 && card.pos !== 'set' && atkOf(s, card) > atkOf(s, top) ? card : top))

      if (threat.code === 0 || threat.pos === 'set') return { key: 'auto.bot.reason.end.faceDown', cards: [strongest.code] }
      return { key: 'auto.bot.reason.end.noSafeAttack', cards: [strongest.code, threat.code] }
    }
    const set = s.view.me.spells.filter((card) => card !== null && card.pos === 'set').length

    return set > 0 ? { key: 'auto.bot.reason.end.set', params: { count: set } } : { key: 'auto.bot.reason.end.done' }
  }

  function battle(ask: AskOf<'select_battlecmd'>, s: Scene): DeckDecision {
    intent = null
    const plan = attackPlan(
      s,
      ask.attacks.map((card) => ({ atk: atkOf(s, atPlace(s.view, card)), direct: card.can_direct })),
    )

    if (plan) {
      const attacker = ask.attacks[plan.i]!

      if (plan.target === null) {
        const reason: BotReason = monstersOf(s.view.them).length === 0 ? { key: 'auto.bot.reason.battle.direct', cards: [attacker.code] } : { key: 'auto.bot.reason.battle.directOver', cards: [attacker.code] }

        return { answer: { type: ask.type, action: 1, index: plan.i }, reason, rule: 'executor.attack.direct' }
      }
      attackTarget = { attacker: attacker.code, target: plan.target }
      return { answer: { type: ask.type, action: 1, index: plan.i }, rule: 'executor.attack' }
    }

    return { answer: { type: ask.type, action: ask.to_m2 ? 2 : ask.to_ep ? 3 : 2, index: null }, rule: 'executor.battle.end' }
  }

  /** El objetivo del ataque que eligió: tu monstruo en esa casilla. */
  function attackTargetOf(ask: AskOf<'select_card'>, s: Scene): DeckDecision | null {
    if (!attackTarget) return null
    const { attacker, target } = attackTarget
    const index = ask.selects.findIndex((card) => !isMine(s.view, card) && card.location === LOC.MZONE && card.sequence === target)

    attackTarget = null
    return index >= 0 ? { answer: { type: ask.type, indices: [index] }, reason: { key: 'auto.bot.reason.battle.safe', cards: [attacker, s.view.them.monsters[target]?.code ?? 0] }, rule: 'executor.attack.safe' } : null
  }

  return (ask, view, context) => {
    if (view.turn !== turn || view.history.length < history) {
      turn = view.turn
      idleCount = 0
      done = new Set()
      seen = new Map()
      blocked = new Set()
      intent = null
      attackTarget = null
    }
    history = view.history.length
    const s = sceneOf(view)
    const mine = view.turnPlayer === 'me'
    let decision: DeckDecision | null = null

    if (ask.type === 'select_idlecmd' || ask.type === 'select_battlecmd' || ask.type === 'select_chain') asks = 0
    else asks += 1

    if (mine && ask.type === 'select_idlecmd') decision = idle(ask, s)
    else if (mine && ask.type === 'select_battlecmd') decision = battle(ask, s)
    else if (ask.type === 'select_chain') decision = deck.chain(ask, s)
    else if (asks <= MAX_ASKS) {
      decision = (mine && ask.type === 'select_card' ? attackTargetOf(ask, s) : null) ?? deck.choose(ask, s)
      if (!decision && ask.type === 'select_place' && view.turnPlayer !== null) decision = { answer: placeOf(ask, view) }
    }

    if (decision && legal(ask, decision.answer)) {
      const { intent: next, ...rest } = decision

      if (next) {
        intent = next
        done.add(next.id)
      }
      return rest
    }
    // Lo que el mazo no decide (o no le salió legal): en su Main y Battle Phase, terminar; lo demás, el de reserva.
    if (mine && (ask.type === 'select_idlecmd' || ask.type === 'select_battlecmd')) return { answer: passiveAnswer(ask, context.random), rule: 'executor.fallback' }
    return fallback(ask, view, context)
  }
}
