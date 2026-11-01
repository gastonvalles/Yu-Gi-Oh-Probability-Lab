import { freePlaces } from '../../policies'
import type { AskOf, CardLoc, CoreAsk } from '../../protocol'
import type { Bot, BotReason, BotView } from '../bot'
import { ANGELECHY as A, ANGELECHY_DECK } from '../../../bot-deck-lists'
import { withSwapCards } from '../../../handtraps'
import { mayInterrupt } from '../interrupt'
import { turnBot, type CardFacts } from '../turn'
import { atPlace, attackPlan, atkOf, cardsOf, executorBot, firstOf, isMine, LOC, monstersOf, PHASE, ranked, threatOf, type DeckDecision, type DeckExecutor, type Play, type Scene } from './executor'

/**
 * El ejecutor de Angelechy: juega la lista fija de `bot-deck-lists.ts` con prioridades escritas a partir del texto impreso y los scripts (CardScripts al commit de `testedWith`).
 * La idea del mazo: sus Sincronías no se Invocan con materiales, las sacan sus Mágicas y Trampas, que además ponen otra del Extra Deck en la Zona de Mágicas y Trampas como Mágica
 * Continua; cada una, al quedar ahí, trae algo (Destrier una Mágica Angelechy, Shatranga una Trampa, Castellan manda una al cementerio, Bastion pone a Shatranga).
 *
 * Main Phase, en orden (la primera que el núcleo ofrece y conviene):
 * 1. Pot of Desires; buscar la Mágica de Campo (Terraforming, Rainbow Bridge Bifrost, que destierra del Extra Deck las Sincronías de Nivel 10 que no son Angelechy) y Strategy Score.
 * 2. Foolish Burial Goods (manda Disturbance o Verdict, que rinden en el cementerio) y la búsqueda de Disturbance desde el cementerio.
 * 3. Angelechy Problem (o Endgame Problem sin Problem): su efecto descarta una Mágica o Trampa, Invoca a Enlisted y pone otra Angelechy como Continua; Opening to e4 si se puede
 *    activar (Invoca en la Zona de Monstruos Extra); Opposition (le da a tu campo la más floja y pone la otra como Continua).
 * 4. Verdict desde el cementerio (manda una Angelechy de la mano y pone otra como Continua), Endgame Problem con 5 (Invoca), Strategy Score desde el cementerio (en su turno 2 en
 *    adelante, para tener con qué atacar) y los destierros de sus Sincronías en el campo.
 * 5. Antes de terminar, coloca Opening to e4 y Verdict.
 * En tu turno: Opening to e4 apenas puede (en tu Standby Phase, o desde la mano si empezaste vos); Verdict niega tu carta que activa un efecto en el campo o, con 5 Angelechy en el
 * campo, destierra todo lo tuyo. Sus handtraps (Ash, Ghost Ogre, Droll & Lock Bird, Mulcharmy Fuwalos y las Dominus), como el rival de handtraps (`turnBot`).
 * Sin regla: Disturbance (sólo su búsqueda desde el cementerio), Bastion en el campo (destierra en su columna, también lo suyo) y las Sincronías que no son Angelechy (son el costo
 * de Bifrost).
 */

const DOMINUS: number[] = [A.purge, A.spark, A.impulse]
/** Sus handtraps, en ese orden de preferencia (con las que se le pueden poner, «Cambiar cartas»): las Dominus al final e Impulse la última (desde la mano le prohíbe los efectos de sus Angelechy, que son LUZ). */
const HANDTRAPS: number[] = [...withSwapCards([A.ash, A.ogre, A.droll, A.fuwalos]).filter((code) => !DOMINUS.includes(code)), ...DOMINUS]
const OWN = new Set<number>([...ANGELECHY_DECK.main, ...ANGELECHY_DECK.extra].map(([code]) => code).concat(HANDTRAPS))
/** Lo que niega tu eslabón desde su campo (cuenta para `mayInterrupt`). */
const RESPONDERS = new Set<number>([A.verdict])
/** Las Angelechy del Extra Deck. */
const MONSTERS = new Set<number>([A.shatranga, A.enlisted, A.castellan, A.seneschal, A.bastion, A.destrier])
/** Qué pone como Continua, en orden: Bastion (pone además a Shatranga), Destrier (busca una Mágica), Shatranga (busca una Trampa), Castellan (manda una Angelechy al cementerio). */
const PLACE: number[] = [A.bastion, A.destrier, A.shatranga, A.castellan, A.seneschal, A.enlisted]
/** Qué Invoca en su campo, en orden (Opening to e4: Nivel 2 o 7; Endgame Problem y Strategy Score: cualquiera). */
const SUMMON: number[] = [A.shatranga, A.destrier, A.bastion, A.castellan, A.seneschal, A.enlisted]
/** Qué le da a tu campo Opposition: la más floja. */
const GIVE: number[] = [A.enlisted, A.castellan, A.destrier, A.shatranga, A.bastion, A.seneschal]
/** Lo que descarta o manda primero (el costo de Problem, lo que manda Verdict): lo que rinde en el cementerio (Disturbance, Verdict) y lo repetido; las Dominus y Opening to e4, al final. */
const DISCARD: number[] = [A.disturbance, A.verdict, A.bifrost, A.terraforming, A.desires, A.burial, A.endgame, A.problem, A.score, A.spark, A.purge, A.impulse, A.opposition, A.e4]
/** El costo de Bifrost: las Sincronías de Nivel 10 o más que no son Angelechy (con una LUZ). */
const BIFROST_COST: number[] = [A.hyperion, A.legatia, A.chaosAngel, A.assaultDragon, A.seneschal, A.shatranga]

const handCodes = (view: BotView) => view.me.hand.map((card) => card.code)
const inHand = (view: BotView, code: number) => handCodes(view).includes(code)
const deckLeft = (view: BotView, code: number) => view.me.deckLeft?.[code] ?? 0
const deckSize = (view: BotView) => Object.values(view.me.deckLeft ?? {}).reduce((sum, copies) => sum + copies, 0)
const reasonOf = (key: string, ...cards: number[]): BotReason => ({ key: `auto.bot.reason.${key}`, cards })
const nOf = (description: string) => Number(BigInt(description) & 0xfffffn)
const codeOfDesc = (description: string) => Number(BigInt(description) >> 20n)
/** Su Mágica de Campo boca arriba. */
const fieldOf = (view: BotView) => (view.me.spells[5]?.pos === 'set' ? 0 : (view.me.spells[5]?.code ?? 0))
/** Tiene Mágica de Campo (en la zona o en la mano). */
const hasField = (view: BotView) => fieldOf(view) !== 0 || inHand(view, A.problem) || inHand(view, A.endgame)
/** Las Angelechy boca arriba en el campo (de los dos lados, también las Continuas): con 5, Verdict destierra todo lo tuyo. */
const angelechyOnField = (view: BotView) => [...cardsOf(view.me), ...cardsOf(view.them)].filter((card) => MONSTERS.has(card.code) && card.pos !== 'set').length
const yours = (view: BotView) => cardsOf(view.them).length
/** Algo de la mano que puede mandar Verdict desde el cementerio (una Angelechy de la lista de descarte). */
const spareAngelechy = (view: BotView) => view.me.hand.some((card) => [A.disturbance, A.verdict, A.endgame, A.problem, A.score, A.opposition].includes(card.code as never)) && view.me.hand.length > 1
/** Qué busca Strategy Score (o Disturbance desde el cementerio): la Mágica de Campo si no tiene; si no, Opposition, Opening to e4 y Verdict. */
const searchWants = (s: Scene) => [...(hasField(s.view) ? [] : [A.problem, A.endgame]), ...(s.done.has('opposition') || inHand(s.view, A.opposition) ? [] : [A.opposition]), A.e4, A.verdict, A.opposition, A.problem, A.endgame, A.disturbance]
/** Si va a atacar en esta Main Phase 1 (entonces coloca después, en la Main Phase 2). */
const battleAhead = (s: Scene) =>
  s.view.turn > 1 &&
  (s.view.phase & PHASE.MAIN1) !== 0 &&
  attackPlan(s, monstersOf(s.view.me).filter((card) => card.pos === 'atk').map((card) => ({ code: card.code, atk: atkOf(s, card), direct: monstersOf(s.view.them).length === 0 }))) !== null
const theirMonsters = (s: Scene) => monstersOf(s.view.them).length > 0

const PLAYS: Play[] = [
  { id: 'desires', kind: 'activate', code: A.desires, when: (s) => deckSize(s.view) >= 20, reason: () => reasonOf('play.draw', A.desires) },
  { id: 'terraforming', kind: 'activate', code: A.terraforming, when: (s) => !hasField(s.view), reason: () => reasonOf('play.starter', A.terraforming) },
  { id: 'bifrost', kind: 'activate', code: A.bifrost, when: (s) => !hasField(s.view), reason: () => reasonOf('play.starter', A.bifrost) },
  { id: 'score', kind: 'activate', code: A.score, from: LOC.HAND | LOC.SZONE, reason: () => reasonOf('play.starter', A.score) },
  { id: 'disturbance-gy', kind: 'activate', code: A.disturbance, from: LOC.GRAVE, reason: () => reasonOf('play.starter', A.disturbance) },
  { id: 'burial', kind: 'activate', code: A.burial, when: (s) => deckLeft(s.view, A.disturbance) + deckLeft(s.view, A.verdict) > 0, reason: () => reasonOf('play.starter', A.burial) },
  { id: 'field-problem', kind: 'activate', code: A.problem, from: LOC.HAND, when: (s) => fieldOf(s.view) === 0, reason: () => reasonOf('play.starter', A.problem) },
  { id: 'field-endgame', kind: 'activate', code: A.endgame, from: LOC.HAND, when: (s) => fieldOf(s.view) === 0 && !inHand(s.view, A.problem), reason: () => reasonOf('play.starter', A.endgame) },
  { id: 'problem', kind: 'activate', code: A.problem, from: LOC.SZONE, reason: () => reasonOf('play.trigger', A.problem) },
  { id: 'e4', kind: 'activate', code: A.e4, reason: () => reasonOf('play.starter', A.e4) },
  { id: 'opposition', kind: 'activate', code: A.opposition, from: LOC.HAND | LOC.SZONE, reason: () => reasonOf('play.starter', A.opposition) },
  { id: 'verdict-gy', kind: 'activate', code: A.verdict, from: LOC.GRAVE, when: (s) => spareAngelechy(s.view), reason: () => reasonOf('play.trigger', A.verdict) },
  { id: 'endgame', kind: 'activate', code: A.endgame, from: LOC.SZONE, reason: () => reasonOf('play.trigger', A.endgame) },
  // Con 5 Angelechy en el campo, Verdict destierra todo lo tuyo.
  { id: 'verdict', kind: 'activate', code: A.verdict, from: LOC.SZONE, when: (s) => angelechyOnField(s.view) >= 5 && yours(s.view) > 0 },
  { id: 'score-gy', kind: 'activate', code: A.score, from: LOC.GRAVE, when: (s) => s.view.turn > 1 && (s.view.phase & PHASE.MAIN1) !== 0, reason: () => reasonOf('play.trigger', A.score) },
  ...[A.shatranga, A.destrier, A.castellan, A.enlisted].map((code): Play => ({ id: `banish-${code}`, kind: 'activate', code, from: LOC.MZONE, when: theirMonsters, reason: () => reasonOf('play.trigger', code) })),
  // Lo que usa en tu turno, colocado al final (después de atacar).
  ...[A.e4, A.verdict].map((code): Play => ({ id: `set-${code}`, kind: 'set', code, from: LOC.HAND, when: (s) => !battleAhead(s), reason: () => reasonOf('play.setQuick', code) })),
]

/** Sus efectos que se activan solos (disparos), por código y `n` del `desc`, y si conviene: lo que trae cada Angelechy al quedar como Continua, el robo y el destierro de Endgame. */
const TRIGGERS: Record<number, (s: Scene, n: number) => boolean> = {
  [A.castellan]: (_, n) => n === 1,
  [A.bastion]: (_, n) => n === 1,
  [A.destrier]: (_, n) => n === 1,
  [A.shatranga]: (_, n) => n === 1,
  [A.problem]: (_, n) => n === 1,
  [A.endgame]: (_, n) => n === 0 || n === 2,
}

function chain(ask: AskOf<'select_chain'>, s: Scene): DeckDecision | null {
  const { view } = s
  const top = view.chain.at(-1)
  const theirs = top?.card?.ref.side === 'theirs' && top.state === 'chained'
  const pick = (code: number, test: (card: CardLoc & { description: string }) => boolean = () => true) => ask.selects.findIndex((card) => card.code === code && test(card))
  const activate = (index: number, id: string, reason?: BotReason): DeckDecision => ({ answer: { type: ask.type, index }, ...(reason ? { reason } : {}), rule: `angelechy.${id}`, intent: { id, code: ask.selects[index]!.code } })

  for (const [index, card] of ask.selects.entries()) {
    const n = nOf(card.description)
    const trigger = TRIGGERS[card.code]

    if (trigger && trigger(s, n) && !s.done.has(`trigger.${card.code}.${n}`)) return activate(index, `trigger.${card.code}.${n}`, reasonOf('play.trigger', card.code))
  }
  if (ask.forced) return null
  // Enlisted que te pasó con su efecto: su disparo (vuelve a su Extra Deck y le Invoca otra Angelechy) es suyo aunque esté en tu campo; sus handtraps no responden.
  if (theirs && top.code === A.enlisted && s.done.has(`banish-${A.enlisted}`)) return { answer: { type: ask.type, index: null }, rule: 'angelechy.pass.enlisted' }
  if (view.turnPlayer === 'me') return null

  // En tu turno: Opening to e4 apenas puede (Invoca y pone otra Continua); Verdict contra tu carta que activa un efecto en el campo (si vale gastarla: `mayInterrupt`) o, con 5
  // Angelechy, contra todo.
  const e4 = pick(A.e4)

  if (e4 >= 0 && !s.done.has('quick.e4')) return activate(e4, 'quick.e4', reasonOf('play.starter', A.e4))
  const verdict = pick(A.verdict, (card) => card.location === LOC.SZONE)

  if (verdict >= 0 && !s.done.has('quick.verdict')) {
    if (angelechyOnField(view) >= 5 && yours(view) > 1) return activate(verdict, 'quick.verdict')
    const place = theirs ? top.card?.place : null

    if (place && (place.location === LOC.MZONE || place.location === LOC.SZONE) && atPlace(view, place)?.pos !== 'set' && mayInterrupt(view, s.facts, RESPONDERS)) {
      return activate(verdict, 'quick.verdict', reasonOf('handtrap.respond', A.verdict, top!.code))
    }
  }
  return null
}

/** El índice de la lista con la mejor carta tuya (la más peligrosa a la vista); -1 si no hay ninguna tuya. */
const bestOfYours = (s: Scene, list: readonly CardLoc[]) => {
  const order = ranked(list, (card) => (isMine(s.view, card) ? -Infinity : threatOf(s, card)))

  return order.length > 0 && !isMine(s.view, list[order[0]!]!) ? order[0]! : -1
}
/** Las que tienen otro Nivel que 2 y 7: la lista es de las que pone como Continua, no de las que Invoca Opening to e4. */
const placing = (s: Scene, list: readonly CardLoc[]) => list.some((card) => ![2, 7].includes(s.facts(card.code)?.level ?? 0))

function choose(ask: CoreAsk, s: Scene): DeckDecision | null {
  const { view } = s
  const current = s.current?.code ?? 0
  const one = (index: number, rule: string, reason?: BotReason): DeckDecision | null =>
    index < 0 || ask.type !== 'select_card' ? null : { answer: { type: ask.type, indices: [index] }, ...(reason ? { reason } : {}), rule: `angelechy.${rule}` }
  const picked = (index: number) => (ask.type === 'select_card' ? (ask.selects[index]?.code ?? 0) : 0)

  switch (ask.type) {
    case 'select_effectyn': {
      const trigger = TRIGGERS[ask.code]

      if (!OWN.has(ask.code) || !trigger) return null
      const n = codeOfDesc(ask.description) === ask.code ? nOf(ask.description) : ask.code === A.endgame ? 0 : 1
      const yes = trigger(s, n)

      return { answer: { type: ask.type, yes }, ...(yes ? { reason: reasonOf('play.trigger', ask.code), intent: { id: `trigger.${ask.code}.${n}`, code: ask.code } } : {}), rule: `angelechy.trigger.${yes ? 'yes' : 'no'}` }
    }
    case 'select_yesno': {
      // Lo que ofrecen sus cartas (Invocar lo que volvió al Extra Deck, poner otra Continua, la Invocación de Seneschal): sí.
      const code = codeOfDesc(ask.description)

      return OWN.has(code) && !HANDTRAPS.includes(code) ? { answer: { type: ask.type, yes: true }, rule: `angelechy.yesno.${code}` } : null
    }
    case 'select_unselect_card': {
      // Opposition: primero la que te da (la más floja), después la que pone como Continua. Bifrost: su costo.
      if (current === A.opposition) {
        if (ask.can_finish && ask.unselect_cards.length >= 2) return { answer: { type: ask.type, index: null }, rule: 'angelechy.opposition.done' }
        const prefer = ask.unselect_cards.length === 0 ? GIVE : PLACE
        const index = firstOf(ask.select_cards, prefer)

        return index < 0 ? null : { answer: { type: ask.type, index }, rule: 'angelechy.opposition.pick' }
      }
      if (current === A.bifrost) {
        if (ask.can_finish && ask.unselect_cards.length >= ask.min) return { answer: { type: ask.type, index: null }, rule: 'angelechy.bifrost.done' }
        const index = firstOf(ask.select_cards, BIFROST_COST)

        return { answer: { type: ask.type, index: Math.max(0, index) }, rule: 'angelechy.cost.bifrost' }
      }
      return null
    }
    case 'select_place': {
      // Lo que Invoca en su campo (sin Opening to e4), al centro de la Zona de Monstruos Principal: la Extra queda libre para Opening to e4 y las columnas de al lado, para Enlisted
      // y Castellan. Lo que te da Opposition, en una columna al lado de un monstruo suyo (Enlisted lo destierra y vuelve).
      const free = freePlaces(ask).filter((place) => place.location === LOC.MZONE && place.sequence < 5)
      const mine = free.filter((place) => place.player === view.seat)
      const columns = new Set(view.me.monsters.slice(0, 5).flatMap((card, sequence) => (card ? [4 - sequence - 1, 4 - sequence + 1] : [])))
      const order = mine.length > 0 ? ranked(mine, (place) => -Math.abs(place.sequence - 2)).map((i) => mine[i]!) : ranked(free, (place) => (columns.has(place.sequence) ? 1 : 0)).map((i) => free[i]!)

      return current !== A.e4 && order.length >= ask.count ? { answer: { type: ask.type, places: order.slice(0, ask.count) }, rule: 'angelechy.place.zone' } : null
    }
    case 'select_card':
      break
    default:
      return null
  }

  const list = ask.selects
  const from = (location: number) => list.every((card) => (card.location & location) !== 0)
  const want = (prefer: readonly number[], rule: string, key?: string) => {
    const index = Math.max(0, firstOf(list, prefer))

    return one(index, rule, key ? reasonOf(key, current, picked(index)) : undefined)
  }
  const discard = (rule: string) => {
    // Lo repetido primero; después, en el orden de DISCARD.
    const copies = (code: number) => list.filter((card) => card.code === code).length
    const index = ranked(list, (card) => (copies(card.code) > 1 ? 1 : 0) - (DISCARD.indexOf(card.code) < 0 ? DISCARD.length : DISCARD.indexOf(card.code)) / 100)[0]!

    return one(index, rule, reasonOf('target.cost', current, picked(index)))
  }

  if (list.every((card) => isMine(view, card))) {
    if (from(LOC.EXTRA)) {
      switch (current) {
        case A.opposition:
          return want(GIVE, 'give.opposition')
        case A.bifrost: {
          const indices = ranked(list, (card) => -(BIFROST_COST.indexOf(card.code) < 0 ? 99 : BIFROST_COST.indexOf(card.code))).slice(0, Math.max(1, ask.min))

          return { answer: { type: ask.type, indices }, rule: 'angelechy.cost.bifrost' }
        }
        case A.problem:
        case A.e4:
        case A.verdict:
          return placing(s, list) ? want(PLACE, `place.${current}`, 'play.extraTo') : want([A.destrier, A.castellan, A.enlisted], `summon.${current}`, 'play.extraTo')
        case A.bastion:
          return want([A.shatranga], 'place.bastion', 'play.extraTo')
        default:
          // Endgame Problem, Strategy Score, Seneschal y Enlisted desde tu campo (su disparo, sin carta suya en juego): la de más ATK que destierra.
          return current ? want(SUMMON, `summon.${current}`, 'play.extraTo') : want(SUMMON, 'summon.enlisted')
      }
    }
    if (from(LOC.DECK | LOC.GRAVE | LOC.HAND)) {
      switch (current) {
        case A.terraforming:
        case A.bifrost:
          return want(inHand(view, A.problem) ? [A.endgame, A.problem] : [A.problem, A.endgame], `search.${current}`, 'play.search')
        case A.score:
        case A.disturbance:
          return want(searchWants(s), `search.${current}`, 'play.search')
        case A.burial:
          return want([A.disturbance, A.verdict, A.score, A.opposition], 'send.burial')
        case A.castellan:
          return want([A.disturbance, A.verdict, A.score, A.opposition, A.e4], 'send.castellan')
        case A.destrier:
          return want([...(hasField(view) ? [] : [A.problem]), A.opposition, A.score, A.endgame, A.problem], 'search.destrier', 'play.search')
        case A.shatranga:
          return want([A.e4, A.verdict, A.disturbance], 'search.shatranga', 'play.search')
        case A.e4:
          // La Mágica de Campo que pone: Endgame Problem si ya tiene Problem en la zona.
          return want(fieldOf(view) === A.problem ? [A.endgame, A.problem] : [A.problem, A.endgame], 'field.e4')
        case A.problem:
          return from(LOC.HAND) ? discard('discard.problem') : null
        case A.verdict:
          return from(LOC.HAND) ? discard('send.verdict') : null
      }
    }
    // Lo que vuelve de la Zona de Mágicas y Trampas al Extra Deck (Strategy Score, Problem): la de más ATK. Lo que manda Verdict del campo: lo que menos vale.
    if (from(LOC.SZONE | LOC.MZONE | LOC.HAND)) {
      if (current === A.verdict) {
        const index = ranked(list, (card) => (card.location === LOC.HAND ? 100 - DISCARD.indexOf(card.code) : -atkOf(s, card)))[0]!

        return one(index, 'send.verdict')
      }
      if (current === A.score || current === A.problem) return one(ranked(list, (card) => atkOf(s, card))[0]!, `return.${current}`)
    }
    return null
  }

  // Lo que destierra o niega lo tuyo (Verdict y los destierros de sus Sincronías): tu carta más peligrosa.
  if ([A.verdict, A.shatranga, A.destrier, A.castellan, A.enlisted, A.bastion].includes(current as never) && ask.min <= 1) {
    const index = bestOfYours(s, list)

    if (index >= 0) return one(index, `target.${current}`, reasonOf(current === A.verdict ? 'target.negate' : 'target.banish', current, picked(index)))
  }
  return null
}

export const ANGELECHY_EXECUTOR: DeckExecutor = { plays: PLAYS, chain, choose }

/** El bot de Angelechy: el ejecutor y, para lo que no decide, sus handtraps como el rival que juega su turno (`turnBot`). */
export function angelechyBot(facts: (code: number) => CardFacts | undefined, aliasOf: (code: number) => number = () => 0, attributeOf?: (code: number) => number): Bot {
  const reacts = turnBot(HANDTRAPS, [], aliasOf, attributeOf, facts, (view) => mayInterrupt(view, facts, RESPONDERS, aliasOf))
  // Sus Mágicas y Trampas tienen regla (`chain`): si no la usó, no era el momento, y no se cuenta como «no sé cuándo conviene».
  const fallback: Bot = (ask, view, context) => {
    const decision = reacts(ask, view, context)
    const held = decision.rule === 'handtrap.hold.noRule' ? (decision.reason?.cards?.[0] ?? 0) : 0

    return held && OWN.has(held) && !HANDTRAPS.includes(held) ? { answer: decision.answer, rule: 'angelechy.hold' } : decision
  }

  return executorBot(ANGELECHY_EXECUTOR, facts, fallback)
}
