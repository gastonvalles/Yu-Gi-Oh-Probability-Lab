import { freePlaces, passiveAnswer, ruleOf, turnRuleOf } from '../../policies'
import type { AskOf, CardLoc, CoreAnswer, CoreAsk } from '../../protocol'
import type { Bot, BotCard, BotDecision, BotReason, BotView } from '../bot'
import { activationClass, createPunishments, type ActionClass } from '../punish'
import { MAX_IDLE, pendulumAnswer, pendulumIndex, type CardFacts } from '../turn'

/**
 * El marco de un ejecutor por mazo (etapa 2 del bot, «un ejecutor por mazo»): el mazo da sus reglas como datos (`DeckExecutor`) y el marco las corre como un `Bot` puro.
 * - **Main Phase** (`select_idlecmd` en su turno): gana la primera `Play` cuya carta está en la lista que ofrece el núcleo (que ya filtra lo legal) y cuyo `when` da verdadero. Si
 *   ninguna gana: la regla general con lo que el mazo no tiene en su lista (`spare`: robar o buscar, después Invocar); la Invocación por Péndulo si suma monstruos
 *   (`pendulumIndex`, una vez por turno); la Battle Phase si hay un ataque que conviene (`attackPlan`); si no, terminar el turno. Antes de la Battle Phase, las posiciones de sus
 *   monstruos (`executor.position.*`).
 * - **Lo que sigue** (costos, objetivos, búsquedas, materiales, sí/no, opciones, casillas): `choose` del mazo con `Scene.current`, el efecto que se está jugando (el eslabón suyo que
 *   se resuelve o, al activarlo, la jugada que acaba de elegir). Las casillas de lo que sale del Extra Deck van a la Zona de Monstruos Extra.
 * - **Cadenas** (`select_chain`): `chain` del mazo; en tu End Phase, la regla general con lo que colocó (`spareChain`); lo que no decide, el de reserva (`fallback`: las handtraps
 *   y Called by the Grave de `turnBot`).
 * - **Battle Phase**: los ataques de `attackPlan` (directo, seguro, a ciegas contra lo boca abajo, el empate que conviene); después, a la Main Phase 2 (ahí coloca sus Mágicas Rápidas).
 * - **Letal** (`lethalPlan`): si lo que ataca alcanza tus vidas, va a la batalla y ordena los ataques (primero lo que limpia, después lo directo); con un precio aprendido, antes de
 *   su línea y sin pagar, y paga por encima del tope la jugada que le da el letal (`closesLethal`) mientras no lo deje en 0.
 * Invariantes: un tope de `MAX_IDLE` jugadas por turno; una jugada que se repite con la mesa igual queda afuera ese turno (sin bucles); toda respuesta pasa por `legal` y, si no
 * pasa, contesta el de reserva (el núcleo rechaza lo ilegal con `RETRY`). Decide sólo con su vista y lo impreso de las cartas (`facts`, del `.cdb`, público).
 */

export const LOC = { DECK: 0x01, HAND: 0x02, MZONE: 0x04, SZONE: 0x08, GRAVE: 0x10, REMOVED: 0x20, EXTRA: 0x40 } as const
export const TYPE = { MONSTER: 0x1, SPELL: 0x2, TRAP: 0x4, EFFECT: 0x20, FUSION: 0x40, SYNCHRO: 0x2000, TOKEN: 0x4000, QUICKPLAY: 0x10000, XYZ: 0x800000, LINK: 0x4000000 } as const
/** `PHASE_*` del núcleo. */
export const PHASE = { DRAW: 0x1, STANDBY: 0x2, MAIN1: 0x4, BATTLE: 0x08 | 0x10 | 0x20 | 0x40 | 0x80, MAIN2: 0x100, END: 0x200 } as const
/** `TIMING_ATTACK`: en `hint_timing_other`, la ventana que abre una declaración de ataque. */
export const ATTACK_TIMING = 0x1000
/** Las respuestas seguidas a preguntas que no son jugadas (costos, objetivos…) que contesta el mazo antes de pasarle la posta al de reserva: un efecto que pregunta sin fin no traba el duelo. */
const MAX_ASKS = 60
/** La Invocación por Péndulo (`pendulumIndex`): su id en `done` y como efecto en juego. */
const PENDULUM = 'pendulum'
/** Lo que no Invoca por Péndulo desde la mano ni usa la regla general: lo que usa con una regla (sus handtraps). */
const keeps = (code: number) => ruleOf(code) !== undefined || turnRuleOf(code) !== undefined
/** Las categorías de búsqueda del `.cdb` (`CardRow.category`) de lo que roba (Draw) o busca en el Deck (Search). */
const DRAWS = 0x100 | 0x200
/** La categoría de lo que Invoca de modo Especial. */
const SUMMONS = 0x100000
/** Las de lo que se lleva cartas (destruir, mandar al cementerio, desterrar, devolver, daño, control): pueden llevarse lo suyo, y la regla general no lo activa. */
const TAKES = 0xff | 0x40000 | 0x40000000
/** Las de lo que puede sacarte una carta: destruir, devolver a la mano o al Deck, desterrar, negar, tomar el control. */
const REMOVES = 0x1 | 0x2 | 0x20 | 0x40 | 0x80 | 0x10000 | 0x20000 | 0x40000000
const IDLE_LISTS = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'] as const
const nOf = (description: string) => Number(BigInt(description) & 0xfffffn)

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

const LIST_ACTION = Object.fromEntries(Object.values(LIST).map(({ list, action }) => [list, action])) as Record<IdleList, number>
/** La jugada del mazo habla de esa entrada de la lista (la carta, desde ese lugar y con ese efecto), sin mirar su `when`. */
const covers = (play: Play, list: IdleList, card: CardLoc) =>
  LIST[play.kind].list === list && card.code === play.code && (play.from === undefined || (card.location & play.from) !== 0) && (play.effect === undefined || !('description' in card) || nOf((card as { description: string }).description) === play.effect)

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

export interface Attacker {
  /** Para saber si salió del Extra Deck (el empate que conviene); sin esto, cuenta como del Main Deck. */
  code?: number
  atk: number
  direct: boolean
}
export type AttackKind = 'direct' | 'safe' | 'blind' | 'trade'
/** A un monstruo boca abajo se lo ataca a ciegas desde este ATK: con menos, lo probable es comerse el rebote de su DEF. ponytail: umbral fijo; afinarlo si se mide el DEF típico. */
export const BLIND_MIN = 1000
const EXTRA_TYPES = TYPE.FUSION | TYPE.SYNCHRO | TYPE.XYZ | TYPE.LINK
/** Algún monstruo tuyo boca arriba tiene más ATK que eso (aunque esté en defensa: en tu turno lo podés cambiar). */
export const outclassed = (s: Scene, atk: number) => monstersOf(s.view.them).some((card) => card.code !== 0 && card.pos !== 'set' && atkOf(s, card) > atk)

/**
 * El mejor ataque, en este orden:
 * - **Directo** (sin monstruos tuyos, o con uno que puede atacar directo): el más fuerte.
 * - **Seguro**: tu monstruo boca arriba de más ATK que destruye sin perder el suyo, con el más débil que alcanza (los fuertes quedan para lo que sigue: si te vacía el campo, atacan directo).
 * - **A ciegas**: tu monstruo boca abajo, con el más fuerte (desde `BLIND_MIN`): en defensa no destruye al suyo y, si sobrevive, queda boca arriba y se sabe qué es.
 * - **Empate** de ATK (se destruyen los dos): si tu monstruo vale más (salió del Extra Deck y el suyo no) o si es el último que tenés y los demás suman tus vidas (letal).
 */
export function attackPlan(s: Scene, attackers: readonly Attacker[]): { i: number; target: number | null; kind: AttackKind } | null {
  const yours = monstersOf(s.view.them)
  const strongest = ranked(attackers, (attacker) => attacker.atk)
  const weakest = [...strongest].reverse()
  const direct = strongest.find((i) => yours.length === 0 || attackers[i]!.direct)

  if (direct !== undefined) return { i: direct, target: null, kind: 'direct' }
  const seen = s.view.them.monsters.flatMap((card, sequence) => (card && card.code !== 0 && card.pos !== 'set' && card.stats ? [{ card, stats: card.stats, sequence }] : []))

  for (const { card, stats, sequence } of [...seen].sort((a, b) => b.stats.attack - a.stats.attack)) {
    const guard = card.pos === 'atk' ? stats.attack : stats.defense
    const i = weakest.find((index) => attackers[index]!.atk > guard)

    if (i !== undefined) return { i, target: sequence, kind: 'safe' }
  }
  const hidden = s.view.them.monsters.findIndex((card) => card !== null && (card.code === 0 || card.pos === 'set'))
  const top = strongest[0]

  if (hidden >= 0 && top !== undefined && attackers[top]!.atk >= BLIND_MIN) return { i: top, target: hidden, kind: 'blind' }
  for (const { card, stats, sequence } of seen) {
    const i = card.pos === 'atk' && stats.attack > 0 ? weakest.find((index) => attackers[index]!.atk === stats.attack) : undefined

    if (i === undefined) continue
    const rest = attackers.reduce((sum, attacker, index) => (index === i ? sum : sum + attacker.atk), 0)
    const lethal = yours.length === 1 && rest >= s.view.lp.them
    const worthMore = isType(s, card.code, EXTRA_TYPES) && !isType(s, attackers[i]!.code ?? 0, EXTRA_TYPES)

    if (lethal || worthMore) return { i, target: sequence, kind: 'trade' }
  }

  return null
}

/**
 * Letal (la excepción de cualquier jugador): si lo que ataca este turno alcanza tus vidas con lo que se ve, el próximo ataque de esa línea; si no, `null`. Primero lo que limpia
 * (cada atacante contra un monstruo tuyo boca arriba que destruye: en ATK con más o igual ATK, en DEF con más ATK que su DEF; el reparto que deja el mayor daño), después lo
 * directo. Nunca un ataque que pierde su monstruo sin llevarse el tuyo, ni uno contra un DEF que no rompe. Lo boca abajo no se sabe: no se ataca ni se cuenta como limpio, así
 * que con uno tuyo boca abajo sólo suma lo que destruye en ATK y lo que ataca directo igual (`direct`). Tus Mágicas y Trampas colocadas no se cuentan (no se ven).
 */
export function lethalPlan(s: Pick<Scene, 'view'>, attackers: readonly Attacker[]): { i: number; target: number | null; kind: AttackKind } | null {
  const yours = s.view.them.monsters.flatMap((card, sequence) =>
    card ? [{ sequence, hidden: card.code === 0 || card.pos === 'set' || !card.stats, atk: card.pos === 'atk', guard: (card.pos === 'atk' ? card.stats?.attack : card.stats?.defense) ?? 0 }] : [],
  )
  const seen = yours.filter((card) => !card.hidden)
  const open = seen.length === yours.length
  // Por monstruo tuyo boca arriba, el atacante que lo limpia (o -1): pocos monstruos, así que se prueban todos los repartos (con 5 y 5, 1546).
  const by: number[] = []
  let best = { damage: 0, by: [] as number[] }
  const walk = (k: number, used: number) => {
    if (k === seen.length) {
      const cleared = open && by.every((i) => i >= 0)
      let damage = 0

      by.forEach((i, t) => (damage += i >= 0 && seen[t]!.atk ? attackers[i]!.atk - seen[t]!.guard : 0))
      attackers.forEach((attacker, i) => (damage += (used & (1 << i)) === 0 && (cleared || attacker.direct) ? attacker.atk : 0))
      if (damage > best.damage) best = { damage, by: [...by] }
      return
    }
    const card = seen[k]!

    by[k] = -1
    walk(k + 1, used)
    attackers.forEach((attacker, i) => {
      if ((used & (1 << i)) !== 0 || attacker.atk < card.guard || (attacker.atk === card.guard && (!card.atk || attacker.atk === 0))) return
      by[k] = i
      walk(k + 1, used | (1 << i))
    })
    by.length = k
  }

  walk(0, 0)
  if (best.damage < s.view.lp.them) return null
  const t = best.by.findIndex((i) => i >= 0)

  if (t >= 0) {
    const card = seen[t]!
    const i = best.by[t]!

    return { i, target: card.sequence, kind: card.atk && card.guard === attackers[i]!.atk ? 'trade' : 'safe' }
  }
  // Sin nada que limpiar: directo, el más fuerte de los que pueden.
  const direct = ranked(attackers, (attacker) => attacker.atk).find((i) => open && seen.length === 0 ? true : attackers[i]!.direct)!

  return { i: direct, target: null, kind: 'direct' }
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
  let attackTarget: { attacker: number; target: number; kind: AttackKind } | null = null
  const punish = createPunishments()
  /** Lo último que dejó de hacer en su Main Phase por un precio (el motivo de terminar el turno). */
  let priced: { code: number; lp: number } | null = null
  /** Lo que puede sacarte cartas (destruir, devolver, desterrar, negar, tomar el control): con tus cartas boca arriba, quizá la que lo castiga. */
  const removes = (view: BotView, code: number) => ((facts(code)?.category ?? 0) & REMOVES) !== 0 && cardsOf(view.them).some((card) => card.pos !== 'set')
  /** La clase de una jugada de su Main Phase: activar, Invocar de modo Normal o Especial; las demás no tienen precio. */
  const idleClass = (action: number, code: number): ActionClass | null => (action === 5 ? activationClass(facts(code)?.type ?? 0) : action === 0 ? 'summon' : action === 1 ? 'special' : null)
  /** Lo que pagó por encima de lo que deja `punish` porque con eso llega a tu 0 este turno (el motivo de esa jugada). */
  let lethalPaid: BotReason | null = null
  /** Si puede pagar la jugada (`punish`); si no, la anota en `priced`. Con letal a una jugada (`closes`), la paga igual mientras no lo deje en 0, y lo anota en `lethalPaid`. */
  const affordable = (view: BotView, kind: ActionClass | null, code: number, closes?: () => boolean) => {
    lethalPaid = null
    if (!kind || punish.allows(view, kind, removes(view, code))) return true
    if (view.lp.me - punish.price(kind) > 0 && closes?.()) {
      lethalPaid = { key: 'auto.bot.reason.play.lethalPrice', cards: [code], params: { lp: punish.price(kind) } }
      return true
    }
    priced = { code, lp: punish.price(kind) }
    return false
  }
  /** Lo suyo boca arriba en ataque, como atacantes (`direct`: sin monstruos tuyos, o uno de los que el mazo dice que atacan directo igual). */
  const attackerOf = (view: BotView, card: Pick<BotCard, 'code' | 'stats'>): Attacker => ({ code: card.code, atk: atkOf({ facts }, card), direct: monstersOf(view.them).length === 0 || (deck.direct?.includes(card.code) ?? false) })
  const attackersOf = (view: BotView) => monstersOf(view.me).filter((card) => card.pos === 'atk').map((card) => attackerOf(view, card))
  /**
   * Si esta jugada lo deja con letal (`lethalPlan`) antes de la Battle Phase: Invocar un monstruo de la mano o el cementerio (de modo Normal, de Nivel 4 o menos, sin Tributar) o
   * activar su efecto de Invocarse (`SUMMONS`) suma su ATK impreso a lo que ataca. ponytail: no cuenta lo que trae otra carta ni lo que sale del Extra Deck (gasta materiales).
   */
  const closesLethal = (ask: IdleAsk, view: BotView, action: number, card: CardLoc) => {
    const printed = facts(card.code)

    if (!ask.to_bp || !printed || (printed.type & TYPE.MONSTER) === 0 || (card.location & (LOC.HAND | LOC.GRAVE)) === 0) return false
    const adds = action === 0 ? printed.level <= 4 : action === 1 || (action === 5 && ((printed.category ?? 0) & SUMMONS) !== 0)

    return adds && lethalPlan({ view }, [...attackersOf(view), attackerOf(view, { code: card.code })]) !== null
  }

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
    priced = null

    /** La primera vez con esta mesa (la misma jugada con la mesa igual: la anterior no hizo nada, la cancelaron o no se pudo; no se repite este turno). */
    const fresh = (id: string) => {
      if (blocked.has(id)) return false
      if (seen.get(id) === key) {
        blocked.add(id)
        return false
      }
      seen.set(id, key)
      done.add(id)
      return true
    }

    // Letal con lo que ya tiene y un castigo tuyo a la vista: a la batalla antes que nada, sin pagar precios. Sin precios, su línea primero: un candado de ataque del campo (Elfnote
    // June Pride en el centro) no se ve hasta la Battle Phase, y saltear la línea por un letal que no era le costaba el duelo (la vara, Elfnote semillas 13 y 24).
    if (ask.to_bp && punish.any() && lethalPlan(s, attackersOf(s.view))) return { answer: { type: ask.type, action: 6, index: null }, reason: { key: 'auto.bot.reason.battle.lethal' }, rule: 'executor.lethal' }
    // Con un castigo tuyo a la vista (un precio aprendido): primero, lo que puede sacarte cartas y puede pagar.
    if (punish.any()) {
      for (const [index, card] of ask.activates.entries()) {
        const id = `price.remove.${card.code}`

        if (!removes(s.view, card.code) || !affordable(s.view, idleClass(5, card.code), card.code) || !fresh(id)) continue
        intent = { id, code: card.code }
        return { answer: { type: ask.type, action: 5, index }, reason: { key: 'auto.bot.reason.play.removePunisher', cards: [card.code] }, rule: 'executor.price.remove' }
      }
    }
    for (const play of deck.plays) {
      if (blocked.has(play.id)) continue
      const { list, action } = LIST[play.kind]
      const index = ask[list].findIndex((card) => covers(play, list, card) && (play.when?.(s, card) ?? true))

      if (index < 0 || !affordable(s.view, idleClass(action, play.code), play.code, () => closesLethal(ask, s.view, action, ask[list][index]!)) || !fresh(play.id)) continue
      intent = { id: play.id, code: play.code }
      const card = ask[list][index]!
      const reason = lethalPaid ?? play.reason?.(s, card)

      return { answer: { type: ask.type, action, index }, ...(reason ? { reason } : {}), rule: play.id }
    }
    const extra = spare(ask, s, fresh)

    if (extra) return extra
    // Sin otra jugada del mazo: la Invocación por Péndulo, una vez por turno, antes de la Battle Phase (después de las jugadas, para no cortarle una línea al mazo).
    const pendulum = done.has(PENDULUM) || !affordable(s.view, 'special', 0) ? -1 : pendulumIndex(ask, s.view, facts, keeps)

    if (pendulum >= 0) {
      const scale = ask.special_summons[pendulum]!.code

      done.add(PENDULUM)
      intent = { id: PENDULUM, code: scale }
      return { answer: { type: ask.type, action: 1, index: pendulum }, reason: { key: 'auto.bot.reason.play.pendulum', cards: [scale] }, rule: 'executor.pendulum' }
    }

    // Las posiciones, sólo con lo que ofrece el núcleo (no lo Invocado este turno, ni lo que ya atacó o cambió): antes de la Battle Phase, a ataque lo que tiene en defensa y ahora
    // tiene un ataque que conviene; al terminar, a defensa lo que quedó en ataque y es más débil que un monstruo tuyo (no te deja daño de combate).
    const reposition = (test: (card: BotCard) => boolean) =>
      ask.pos_changes.findIndex((loc) => {
        const card = atPlace(s.view, loc)

        return card !== null && card.code !== 0 && test(card)
      })
    // A ciegas no cuenta: ataca sólo el más fuerte y este quedaría en ataque sin atacar.
    const up = ask.to_bp ? reposition((card) => card.pos === 'def' && !outclassed(s, atkOf(s, card)) && (attackPlan(s, [attackerOf(s.view, card)])?.kind ?? 'blind') !== 'blind') : -1

    if (up >= 0) return { answer: { type: ask.type, action: 2, index: up }, reason: { key: 'auto.bot.reason.position.attack', cards: [atPlace(s.view, ask.pos_changes[up]!)?.code ?? 0] }, rule: 'executor.position.attack' }
    const lethal = ask.to_bp ? lethalPlan(s, attackersOf(s.view)) : null

    if (lethal) return { answer: { type: ask.type, action: 6, index: null }, reason: { key: 'auto.bot.reason.battle.lethal' }, rule: 'executor.lethal' }
    const plan = ask.to_bp ? attackPlan(s, attackersOf(s.view)) : null

    if (plan) return { answer: { type: ask.type, action: 6, index: null }, rule: 'executor.battle' }
    const down = reposition((card) => card.pos === 'atk' && outclassed(s, atkOf(s, card)))

    if (down >= 0) return { answer: { type: ask.type, action: 2, index: down }, reason: { key: 'auto.bot.reason.position.defense', cards: [atPlace(s.view, ask.pos_changes[down]!)?.code ?? 0] }, rule: 'executor.position.defense' }

    // `affordable` lo anota desde una función: TypeScript no lo ve.
    const skipped = priced as { code: number; lp: number } | null

    return skipped ? end({ key: 'auto.bot.reason.end.price', cards: [skipped.code], params: { lp: skipped.lp } }, 'executor.end.price') : end(endReason(s), 'executor.end')
  }

  /**
   * La regla general, para lo que el mazo no tiene en su lista (`covers`: ni la carta con ese efecto desde ese lugar): una jugada que el núcleo ofrece y no le cuesta más de lo
   * que le da, en este orden: 1. lo que roba o busca en el Deck (`DRAWS`), activado en su Main Phase (no una Mágica Rápida ni una Trampa, que tienen su momento en tu turno, ni lo
   * que guarda para una regla); 2. Invocar de modo Normal o Especial, de la mano o el cementerio, un monstruo con ATK que no guarda para una regla (uno más con qué atacar o
   * frenarte; de Nivel 4 o menos: sin Tributar lo suyo). Nunca del Extra Deck: eso gasta materiales, y qué materiales lo decide su mazo.
   */
  function spare(ask: IdleAsk, s: Scene, fresh: (id: string) => boolean): DeckDecision | null {
    const uncovered = (list: IdleList, card: CardLoc) => !keeps(card.code) && !deck.plays.some((play) => covers(play, list, card))
    const draws = (card: CardLoc) => ((facts(card.code)?.category ?? 0) & DRAWS) !== 0 && !isType({ facts }, card.code, TYPE.QUICKPLAY | TYPE.TRAP)
    const body = (card: CardLoc) => {
      const printed = facts(card.code)

      return !!printed && (printed.type & TYPE.MONSTER) !== 0 && printed.attack > 0 && printed.level <= 4 && (card.location & (LOC.HAND | LOC.GRAVE)) !== 0
    }
    const tiers: { list: IdleList; test: (card: CardLoc) => boolean; rule: string; key: BotReason['key'] }[] = [
      { list: 'activates', test: draws, rule: 'executor.spare.draw', key: 'auto.bot.reason.play.spare' },
      { list: 'special_summons', test: body, rule: 'executor.spare.summon', key: 'auto.bot.reason.play.beater' },
      { list: 'summons', test: body, rule: 'executor.spare.summon', key: 'auto.bot.reason.play.beater' },
    ]

    for (const { list, test, rule, key } of tiers) {
      for (const [index, card] of ask[list].entries()) {
        const id = `spare.${list}.${card.code}`

        const kind = idleClass(LIST_ACTION[list], card.code)

        // Lo de más no se paga: con precio, la regla general no lo hace (salvo que le dé letal).
        if (!uncovered(list, card) || !test(card)) continue
        const price = kind && s.view.turnPlayer === 'me' ? punish.price(kind) : 0
        const lethal = price > 0 && s.view.lp.me - price > 0 && closesLethal(ask, s.view, LIST_ACTION[list], card)

        if ((price > 0 && !lethal) || !fresh(id)) continue
        intent = { id, code: card.code }
        return { answer: { type: ask.type, action: LIST_ACTION[list], index }, reason: lethal ? { key: 'auto.bot.reason.play.lethalPrice', cards: [card.code], params: { lp: price } } : { key, cards: [card.code] }, rule }
      }
    }
    return null
  }

  /**
   * La regla general en tu End Phase (la última ventana antes de su turno), si el mazo no activó nada: lo que tiene colocado y roba, busca o Invoca (`DRAWS`, `SUMMONS`) sin llevarse
   * cartas (`TAKES`), una vez por carta. Lo que no usó en tu turno ya no frenó nada; en el suyo, lo que trae juega.
   */
  function spareChain(ask: AskOf<'select_chain'>, s: Scene): DeckDecision | null {
    if (ask.forced || s.view.turnPlayer !== 'them' || s.view.chain.length > 0 || (s.view.phase & PHASE.END) === 0) return null
    for (const [index, card] of ask.selects.entries()) {
      const category = facts(card.code)?.category ?? 0
      const id = `spare.end.${card.code}`

      if (card.location !== LOC.SZONE || !isMine(s.view, card) || keeps(card.code) || (category & (DRAWS | SUMMONS)) === 0 || (category & TAKES) !== 0 || done.has(id)) continue
      return { answer: { type: ask.type, index }, reason: { key: 'auto.bot.reason.play.endPhase', cards: [card.code] }, rule: 'executor.spare.end', intent: { id, code: card.code } }
    }
    return null
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
    const attackers = ask.attacks.map((card) => ({ code: card.code, atk: atkOf(s, atPlace(s.view, card)), direct: card.can_direct }))
    // Con letal, su orden (primero lo que limpia, después lo directo); si no, el mejor ataque de siempre.
    const plan = lethalPlan(s, attackers) ?? attackPlan(s, attackers)

    if (plan) {
      const attacker = ask.attacks[plan.i]!

      if (plan.target === null) {
        const reason: BotReason = monstersOf(s.view.them).length === 0 ? { key: 'auto.bot.reason.battle.direct', cards: [attacker.code] } : { key: 'auto.bot.reason.battle.directOver', cards: [attacker.code] }

        return { answer: { type: ask.type, action: 1, index: plan.i }, reason, rule: 'executor.attack.direct' }
      }
      attackTarget = { attacker: attacker.code, target: plan.target, kind: plan.kind }
      return { answer: { type: ask.type, action: 1, index: plan.i }, rule: 'executor.attack' }
    }

    return { answer: { type: ask.type, action: ask.to_m2 ? 2 : ask.to_ep ? 3 : 2, index: null }, rule: 'executor.battle.end' }
  }

  /** El objetivo del ataque que eligió: tu monstruo en esa casilla. */
  function attackTargetOf(ask: AskOf<'select_card'>, s: Scene): DeckDecision | null {
    if (!attackTarget) return null
    const { attacker, target, kind } = attackTarget
    const index = ask.selects.findIndex((card) => !isMine(s.view, card) && card.location === LOC.MZONE && card.sequence === target)

    attackTarget = null
    if (index < 0) return null
    const to = s.view.them.monsters[target]?.code ?? 0
    const reason: BotReason = kind === 'blind' ? { key: 'auto.bot.reason.battle.blind', cards: [attacker] } : { key: `auto.bot.reason.battle.${kind === 'trade' ? 'trade' : 'safe'}`, cards: [attacker, to] }

    return { answer: { type: ask.type, indices: [index] }, reason, rule: `executor.attack.${kind}` }
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
    punish.observe(view)
    const s = sceneOf(view)
    const mine = view.turnPlayer === 'me'
    let decision: DeckDecision | null = null

    if (ask.type === 'select_idlecmd' || ask.type === 'select_battlecmd' || ask.type === 'select_chain') asks = 0
    else asks += 1

    if (mine && ask.type === 'select_idlecmd') decision = idle(ask, s)
    else if (mine && ask.type === 'select_battlecmd') decision = battle(ask, s)
    else if (ask.type === 'select_chain') decision = deck.chain(ask, s) ?? spareChain(ask, s)
    else if (mine && intent?.id === PENDULUM && (ask.type === 'select_unselect_card' || ask.type === 'select_position')) decision = { answer: pendulumAnswer(ask, facts, keeps), rule: 'executor.pendulum.pick' }
    else if (asks <= MAX_ASKS) {
      decision = (mine && ask.type === 'select_card' ? attackTargetOf(ask, s) : null) ?? deck.choose(ask, s)
      if (!decision && ask.type === 'select_place' && view.turnPlayer !== null) decision = { answer: placeOf(ask, view) }
    }

    if (decision && legal(ask, decision.answer)) {
      const { intent: next, ...rest } = decision
      const held = priceHold(ask, view, rest)

      if (held) return held
      if (next) {
        intent = next
        done.add(next.id)
      }
      return paid(ask, view, rest)
    }
    // Lo que el mazo no decide (o no le salió legal): en su Main y Battle Phase, terminar; lo demás, el de reserva.
    if (mine && (ask.type === 'select_idlecmd' || ask.type === 'select_battlecmd')) return { answer: passiveAnswer(ask, context.random), rule: 'executor.fallback' }
    const reserve = fallback(ask, view, context)

    return priceHold(ask, view, reserve) ?? paid(ask, view, reserve)
  }

  /** La clase de lo que activa con esta respuesta (en una cadena o un «¿activar el efecto?»), o `null` si no activa nada. */
  function activated(ask: CoreAsk, answer: CoreAnswer): { kind: ActionClass; code: number } | null {
    if (ask.type === 'select_chain' && answer.type === 'select_chain' && answer.index !== null && !ask.forced) {
      const code = ask.selects[answer.index]!.code

      return { kind: activationClass(facts(code)?.type ?? 0), code }
    }
    if (ask.type === 'select_effectyn' && answer.type === 'select_effectyn' && answer.yes) return { kind: activationClass(facts(ask.code)?.type ?? 0), code: ask.code }
    return null
  }

  /** Una activación con precio que no puede pagar (`punish.allows`): no la hace, y dice por qué. */
  function priceHold(ask: CoreAsk, view: BotView, decision: BotDecision): BotDecision | null {
    const act = activated(ask, decision.answer)

    if (!act || punish.allows(view, act.kind, removes(view, act.code))) return null
    const reason: BotReason = { key: 'auto.bot.reason.hold.price', cards: [act.code], params: { lp: punish.price(act.kind) } }

    return ask.type === 'select_chain' ? { answer: { type: ask.type, index: null }, reason, rule: 'executor.price.hold' } : { answer: { type: 'select_effectyn', yes: false }, reason, rule: 'executor.price.hold' }
  }

  /** Anota lo que hizo (activar, Invocar) para ver si le cuesta vidas. */
  function paid(ask: CoreAsk, view: BotView, decision: BotDecision): BotDecision {
    const act = activated(ask, decision.answer)
    const idleKind = ask.type === 'select_idlecmd' && decision.answer.type === 'select_idlecmd' && decision.answer.index !== null ? idleClass(decision.answer.action, ask[IDLE_LISTS[decision.answer.action]!]?.[decision.answer.index]?.code ?? 0) : null
    const kind = act?.kind ?? idleKind

    if (kind) punish.acted(view, kind)
    return decision
  }
}
