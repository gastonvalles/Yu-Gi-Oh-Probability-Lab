import type { AskOf, CardLoc, CoreAsk } from '../../protocol'
import type { Bot, BotCard, BotReason, BotView } from '../bot'
import { SKY, SKY_STRIKER_DECK } from '../decks/sky-striker'
import { turnBot, type CardFacts } from '../turn'
import {
  ATTACK_TIMING,
  atkOf,
  attackPlan,
  atPlace,
  cardsOf,
  countIn,
  executorBot,
  firstOf,
  isMine,
  isType,
  lastAttack,
  LOC,
  mainZonesEmpty,
  monstersOf,
  PHASE,
  ranked,
  spellsInGrave,
  threatOf,
  TYPE,
  type DeckDecision,
  type DeckExecutor,
  type Play,
  type Scene,
} from './executor'

/**
 * El ejecutor de Sky Striker (etapa 2 del bot): juega la lista fija de `decks/sky-striker.ts` con prioridades escritas a partir del texto impreso y los scripts (CardScripts al
 * commit de `testedWith`). La idea del mazo: un solo monstruo (Raye o Roze) que pasa a la Zona de Monstruos Extra como un Sky Striker Ace de Enlace, así la Zona Principal queda
 * vacía y se pueden activar las Mágicas (todas piden «si no controlás monstruos en tu Zona Principal»). Sus Mágicas Rápidas se colocan para tu turno.
 *
 * Main Phase, en orden (la primera que el núcleo ofrece y conviene):
 * 1. Pot of Desires (con 12 o más en el Deck) y Radiant Typhoon Vision (robar 2, con otra Mágica Rápida en la mano para descartar).
 * 2. Engage! (busca Raye si no tiene a quién Invocar; si no, la Mágica que le falta) y Reinforcement of the Army (Raye o Roze).
 * 3. Sky Striker Ace = Zero por Enlace apenas tiene dos Sky Striker Ace (Raye y Roze, o un Enlace con la Ficha de Hornet Drones): busca una Mágica y en tu turno vuelve a traer
 *    a Raye y Roze. Zeke con un monstruo tuyo que se llevó Widow Anchor.
 * 4. El efecto de Raye (Tributarse: un Sky Striker Ace a la Zona Extra) y, si no, Invocar de modo Normal a Raye (o a Roze sin Raye): Roze se Invoca sola de la mano cuando llega otro.
 * 5. Un Enlace 1 con lo que quede en la Zona Principal (Kagari si hay una Mágica que recuperar, Hayate si puede atacar, Shizuku).
 * 6. Hornet Drones si con la Ficha arma a Zero; Widow Anchor para llevarse tu monstruo con efecto (con 3 Mágicas en el cementerio); The Fallen & The Virtuous y Mystical Space
 *    Typhoon contra tu carta más peligrosa; Triple Tactics Talent (robar 2).
 * 7. La Battle Phase si hay un ataque seguro (Hayate ataca directo) y, antes de terminar (en la Main Phase 2 si atacó), colocar las Mágicas Rápidas para tu turno.
 * En tu turno: Widow Anchor o Forbidden Crown contra el efecto de tu monstruo en el campo; Shark Cannon contra el que activás en el cementerio (si no tiene Called by the Grave);
 * Zero y Raye responden a tu eslabón; al declarar un ataque, The Fallen & The Virtuous o Zero destruyen al atacante y Hornet Drones pone una Ficha si el ataque es directo; en tu End
 * Phase, Linkage! (manda su Enlace al cementerio y trae a Shizuku, que busca), Hornet Drones y Mystical Space Typhoon contra lo que colocaste. Sus handtraps (Ash, Ghost Ogre, Ghost
 * Belle, Droll & Lock Bird) y Called by the Grave, como el rival de handtraps (`turnBot`).
 */

const SS_SPELLS = new Set<number>([SKY.engage, SKY.linkage, SKY.hornet, SKY.lemnisgate, SKY.shark, SKY.widow])
const QUICK = [SKY.widow, SKY.crown, SKY.fallen, SKY.called, SKY.hornet, SKY.linkage, SKY.shark, SKY.mst, SKY.lemnisgate] as const
/** Lo que descarta primero (Radiant Typhoon Vision): lo que menos le sirve. */
const DISCARD: number[] = [SKY.vision, SKY.mst, SKY.lemnisgate, SKY.shark, SKY.linkage, SKY.talent, SKY.hornet, SKY.called, SKY.crown, SKY.fallen, SKY.widow]
const LINKS = new Set<number>([SKY.kagari, SKY.shizuku, SKY.hayate, SKY.zero, SKY.zeke, SKY.camellia, SKY.azalea, SKY.amatsu, SKY.engageZero])
const OWN = new Set<number>([...SKY_STRIKER_DECK.main, ...SKY_STRIKER_DECK.extra].map(([code]) => code).concat(SKY.token))
/** Sus handtraps (Ash Blossom, Ghost Ogre, Ghost Belle, Droll & Lock Bird), en ese orden de preferencia: las usa como el rival de handtraps. */
const HANDTRAPS = [14558127, 59438930, 73642296, 94145021]

const handCodes = (view: BotView) => view.me.hand.map((card) => card.code)
const inHand = (view: BotView, code: number) => handCodes(view).includes(code)
const onMyField = (view: BotView, code: number) => countIn(monstersOf(view.me), code) > 0
const extraLeft = (view: BotView, code: number) => view.me.extraLeft?.[code] ?? 0
const deckLeft = (view: BotView, code: number) => view.me.deckLeft?.[code] ?? 0
const ssSpellsInGrave = (view: BotView) => view.me.grave.filter((card) => SS_SPELLS.has(card.code)).length
const emzMine = (view: BotView) => view.me.monsters.slice(5).filter((card): card is BotCard => card !== null)
const emzFree = (view: BotView) => emzMine(view).length === 0
/** Tus monstruos boca arriba con efecto (lo que Widow Anchor puede apuntar). */
const yourEffectMonsters = (s: Scene) => monstersOf(s.view.them).filter((card) => card.code !== 0 && card.pos !== 'set' && isType(s, card.code, TYPE.EFFECT))
const yourCards = (view: BotView) => cardsOf(view.them).length
/** Si va a atacar en esta Main Phase 1 (entonces coloca sus Mágicas después, en la Main Phase 2). */
const battleAhead = (s: Scene) =>
  s.view.turn > 1 &&
  (s.view.phase & PHASE.MAIN1) !== 0 &&
  attackPlan(
    s,
    monstersOf(s.view.me)
      .filter((card) => card.pos === 'atk')
      .map((card) => ({ atk: atkOf(s, card), direct: monstersOf(s.view.them).length === 0 || card.code === SKY.hayate })),
  ) !== null

/** Qué busca con Engage! (cualquier Sky Striker): Raye si no tiene a quién Invocar; si no, la Mágica que le falta. */
function engageWants(s: Scene): number[] {
  const { view } = s
  const needAce = !inHand(view, SKY.raye) && !inHand(view, SKY.roze) && !onMyField(view, SKY.raye) && !s.done.has('normal-raye') && !s.done.has('normal-roze')
  const missing = [SKY.widow, SKY.hornet, SKY.linkage].filter((code) => !inHand(view, code))

  return [...(needAce ? [SKY.raye] : []), ...missing, SKY.widow, SKY.lemnisgate, SKY.shark, SKY.hornet, SKY.linkage, SKY.raye, SKY.roze]
}
/** Qué Mágica de Sky Striker suma (Zero del Deck o el cementerio, Shizuku del Deck, Kagari del cementerio): la que le falta en la mano. */
const spellWants = (s: Scene) => [...[SKY.widow, SKY.hornet, SKY.engage, SKY.linkage].filter((code) => !inHand(s.view, code)), SKY.widow, SKY.engage, SKY.hornet, SKY.linkage, SKY.lemnisgate, SKY.shark]
/** Qué Sky Striker Ace trae del Extra Deck (Raye, Linkage!, Lemnisgate!): Kagari si tiene una Mágica que recuperar; Hayate si ataca este turno; Shizuku (busca en la End Phase). */
function linkWants(s: Scene): number[] {
  const mine = s.view.turnPlayer === 'me'
  // La Mágica de Sky Striker que se está resolviendo (Linkage!) llega al cementerio antes que el disparo de Kagari.
  const kagari = ssSpellsInGrave(s.view) + (SS_SPELLS.has(s.current?.code ?? 0) ? 1 : 0) > 0 ? [SKY.kagari] : []
  const hayate = mine && s.view.turn > 1 ? [SKY.hayate] : []

  return mine ? [...kagari, ...hayate, SKY.shizuku, SKY.kagari, SKY.hayate, SKY.zeke, SKY.camellia] : [SKY.shizuku, ...kagari, SKY.hayate, SKY.kagari, SKY.zeke]
}
/** Qué usa primero de material de Enlace: lo tuyo que se llevó (vuelve en la End Phase), la Ficha, los Enlace que ya usaron su efecto, Roze y Raye al final. */
const materialScore = (s: Scene, card: CardLoc) => {
  const seen = atPlace(s.view, card)
  const code = seen?.code ?? card.code

  if (!OWN.has(code)) return 100
  if (code === SKY.token) return 90
  if (LINKS.has(code)) return 80

  return code === SKY.roze ? 50 : code === SKY.raye ? 40 : 30
}

const reasonOf = (key: string, ...cards: number[]): BotReason => ({ key: `auto.bot.reason.${key}`, cards })
/** Sin con qué arrancar: ni Raye ni Roze para Invocar, ningún monstruo suyo y la Zona Extra libre. */
const noStarter = (s: Scene) => emzFree(s.view) && monstersOf(s.view.me).length === 0 && !inHand(s.view, SKY.raye) && !inHand(s.view, SKY.roze) && !inHand(s.view, SKY.engage) && !s.done.has('normal-raye') && !s.done.has('normal-roze')
/** Lo que coloca para mandarlo con Linkage!: lo que menos le sirve. */
const FODDER = DISCARD.filter((code) => code !== SKY.linkage && code !== SKY.talent)

const PLAYS: Play[] = [
  { id: 'desires', kind: 'activate', code: SKY.desires, from: LOC.HAND, when: (s) => s.view.me.deckCount >= 12, reason: () => reasonOf('play.draw', SKY.desires) },
  {
    id: 'vision',
    kind: 'activate',
    code: SKY.vision,
    when: (s) => s.view.me.hand.filter((card) => isType(s, card.code, TYPE.QUICKPLAY)).length >= 2,
    reason: () => reasonOf('play.draw', SKY.vision),
  },
  { id: 'engage', kind: 'activate', code: SKY.engage, from: LOC.HAND | LOC.SZONE, reason: () => reasonOf('play.starter', SKY.engage) },
  { id: 'rota', kind: 'activate', code: SKY.rota, when: (s) => deckLeft(s.view, SKY.raye) + deckLeft(s.view, SKY.roze) > 0, reason: () => reasonOf('play.starter', SKY.rota) },
  { id: 'link-zero', kind: 'special', code: SKY.zero, from: LOC.EXTRA, reason: () => reasonOf('play.link', SKY.zero) },
  { id: 'link-zeke', kind: 'special', code: SKY.zeke, from: LOC.EXTRA, when: (s) => monstersOf(s.view.me).some((card) => !OWN.has(card.code)), reason: () => reasonOf('play.link', SKY.zeke) },
  { id: 'raye', kind: 'activate', code: SKY.raye, from: LOC.MZONE, effect: 0, reason: () => reasonOf('play.extra', SKY.raye) },
  { id: 'normal-raye', kind: 'summon', code: SKY.raye, reason: () => reasonOf('play.normal', SKY.raye) },
  { id: 'normal-roze', kind: 'summon', code: SKY.roze, when: (s) => !inHand(s.view, SKY.raye), reason: () => reasonOf('play.normal', SKY.roze) },
  // Sin Raye ni Roze: Hornet Drones (su Ficha es material de un Enlace 1) o Linkage! (manda otra carta suya y trae un Sky Striker Ace); para Linkage!, antes coloca lo que menos le sirve.
  { id: 'hornet-starter', kind: 'activate', code: SKY.hornet, when: (s) => noStarter(s), reason: () => reasonOf('play.token', SKY.hornet) },
  ...FODDER.map((code): Play => ({ id: `fodder-${code}`, kind: 'set', code, when: (s) => noStarter(s) && inHand(s.view, SKY.linkage) && cardsOf(s.view.me).length === 0, reason: () => reasonOf('play.fodder', code, SKY.linkage) })),
  { id: 'linkage-starter', kind: 'activate', code: SKY.linkage, from: LOC.HAND, when: (s) => noStarter(s) && cardsOf(s.view.me).length > 0, reason: () => reasonOf('play.starter', SKY.linkage) },
  // Un Enlace 1 sólo a la Zona Extra libre: así vacía la Principal (con Zero en la Extra iría a una Principal y taparía sus Mágicas).
  { id: 'link-kagari', kind: 'special', code: SKY.kagari, from: LOC.EXTRA, when: (s) => emzFree(s.view) && ssSpellsInGrave(s.view) > 0, reason: () => reasonOf('play.link', SKY.kagari) },
  { id: 'link-hayate', kind: 'special', code: SKY.hayate, from: LOC.EXTRA, when: (s) => emzFree(s.view) && s.view.turn > 1, reason: () => reasonOf('play.link', SKY.hayate) },
  { id: 'link-shizuku', kind: 'special', code: SKY.shizuku, from: LOC.EXTRA, when: (s) => emzFree(s.view), reason: () => reasonOf('play.link', SKY.shizuku) },
  {
    id: 'hornet-zero',
    kind: 'activate',
    code: SKY.hornet,
    when: (s) => extraLeft(s.view, SKY.zero) > 0 && !s.done.has('link-zero') && emzMine(s.view).some((card) => card.code === SKY.kagari || card.code === SKY.shizuku || card.code === SKY.hayate) && mainZonesEmpty(s.view),
    reason: () => reasonOf('play.token', SKY.hornet),
  },
  { id: 'widow-steal', kind: 'activate', code: SKY.widow, when: (s) => spellsInGrave(s) >= 3 && yourEffectMonsters(s).length > 0 },
  { id: 'fallen', kind: 'activate', code: SKY.fallen, when: (s) => cardsOf(s.view.them).some((card) => card.code !== 0 && card.pos !== 'set') },
  { id: 'mst', kind: 'activate', code: SKY.mst, when: (s) => s.view.them.spells.some((card) => card !== null) },
  { id: 'talent', kind: 'activate', code: SKY.talent, reason: () => reasonOf('play.draw', SKY.talent) },
  // Lo que usa en tu turno, colocado al final (después de atacar).
  ...QUICK.map((code): Play => ({ id: `set-${code}`, kind: 'set', code, when: (s) => !battleAhead(s), reason: () => reasonOf('play.setQuick', code) })),
]

/** Sus efectos que se activan solos (disparos), y si conviene: los que suman cartas o monstruos, sí; los que destruyen, sólo si tenés algo. */
const TRIGGERS: Record<number, (s: Scene, n: number) => boolean> = {
  [SKY.roze]: () => true,
  [SKY.raye]: (_, n) => n === 1,
  [SKY.kagari]: (s) => ssSpellsInGrave(s.view) > 0,
  [SKY.zero]: (_, n) => n === 0,
  [SKY.shizuku]: () => true,
  [SKY.hayate]: () => true,
  [SKY.lemnisgate]: (_, n) => n === 1,
  [SKY.zeke]: (s, n) => n === 0 && monstersOf(s.view.them).some((card) => card.pos !== 'set'),
  [SKY.azalea]: (s, n) => (n === 0 ? yourCards(s.view) > 0 : true),
  [SKY.camellia]: (s, n) => n === 1 && monstersOf(s.view.them).length > 0,
  [SKY.engageZero]: (s, n) => n === 0 && monstersOf(s.view.them).some((card) => atkOf(s, card) >= 2500),
}
/** Cuál de sus efectos es el disparo, cuando la pregunta no lo dice. */
const TRIGGER_N: Record<number, (view: BotView) => number> = {
  [SKY.raye]: () => 1,
  [SKY.lemnisgate]: () => 1,
  [SKY.camellia]: () => 1,
  [SKY.azalea]: (view) => ((view.phase & PHASE.BATTLE) !== 0 ? 1 : 0),
  [SKY.engageZero]: (view) => ((view.phase & PHASE.BATTLE) !== 0 ? 1 : 0),
}
const nOf = (description: string) => Number(BigInt(description) & 0xfffffn)
const codeOfDesc = (description: string) => Number(BigInt(description) >> 20n)

function chain(ask: AskOf<'select_chain'>, s: Scene): DeckDecision | null {
  const { view } = s
  const mine = view.turnPlayer === 'me'
  const top = view.chain.at(-1)
  const yours = top?.card?.ref.side === 'theirs' && top.state === 'chained'
  const pick = (code: number, test: (card: CardLoc & { description: string }) => boolean = () => true) => ask.selects.findIndex((card) => card.code === code && test(card))
  const activate = (index: number, id: string, reason?: BotReason): DeckDecision => ({ answer: { type: ask.type, index }, ...(reason ? { reason } : {}), rule: `sky.${id}`, intent: { id, code: ask.selects[index]!.code } })

  // Sus disparos (Roze de la mano, Kagari, Zero, Shizuku, Lemnisgate! del cementerio…).
  for (const [index, card] of ask.selects.entries()) {
    const n = nOf(card.description)
    const trigger = TRIGGERS[card.code]
    const quick = (card.code === SKY.raye && n === 0) || (card.code === SKY.zero && n === 1)

    if (trigger && !quick && card.location !== LOC.SZONE && trigger(s, n)) return activate(index, `trigger.${card.code}.${n}`, reasonOf('play.trigger', card.code))
  }
  if (ask.forced) return null

  // Contra tu eslabón: el efecto de tu monstruo en el campo (Widow Anchor, Forbidden Crown), el de tu cementerio (Shark Cannon, si no está Called by the Grave).
  if (yours && top.card) {
    const place = top.card.place
    const yourMonster = place?.location === LOC.MZONE && isType(s, top.code, TYPE.EFFECT) && atPlace(view, place)?.pos !== 'set'

    for (const code of yourMonster ? [SKY.widow, SKY.crown] : []) {
      const index = pick(code)

      if (index >= 0 && !s.done.has(`respond.${code}`)) return activate(index, `respond.${code}`)
    }
    if (place?.location === LOC.GRAVE && isType(s, top.code, TYPE.MONSTER) && pick(SKY.called) < 0) {
      const index = pick(SKY.shark)

      if (index >= 0 && !s.done.has('respond.shark')) return activate(index, 'respond.shark')
    }
    // En tu turno, Zero y Raye responden a lo tuyo (así no los alcanza y, de paso, Zero destruye).
    if (!mine) {
      const zero = pick(SKY.zero, (card) => nOf(card.description) === 1)

      if (zero >= 0 && !s.done.has('zero.quick')) return activate(zero, 'zero.quick', reasonOf('play.zero', SKY.zero))
      const raye = pick(SKY.raye, (card) => card.location === LOC.MZONE && nOf(card.description) === 0)

      if (raye >= 0 && !s.done.has('raye.quick')) return activate(raye, 'raye.quick', reasonOf('play.extra', SKY.raye))
    }
  }
  if (mine || view.chain.length > 0) return null

  // Tu ataque recién declarado: destruir al atacante (The Fallen & The Virtuous, Zero) o, si es directo, una Ficha que lo frene (Hornet Drones).
  const attack = (ask.hint_timing_other & ATTACK_TIMING) !== 0 ? lastAttack(view) : null

  if (attack) {
    const fallen = pick(SKY.fallen, (card) => card.location === LOC.SZONE)

    if (fallen >= 0 && !s.done.has('attack.fallen')) return activate(fallen, 'attack.fallen')
    const zero = pick(SKY.zero, (card) => nOf(card.description) === 1)

    if (zero >= 0 && !s.done.has('zero.quick')) return activate(zero, 'zero.quick', reasonOf('play.zero', SKY.zero))
    const hornet = pick(SKY.hornet)

    if (attack.target === null && hornet >= 0 && !s.done.has('attack.hornet')) return activate(hornet, 'attack.hornet', reasonOf('play.blocker', SKY.hornet))
  }
  // Tu End Phase: Linkage! (su Enlace al cementerio, Shizuku que busca), Hornet Drones (una Ficha para su turno), Mystical Space Typhoon contra lo que colocaste y Zero (trae a Raye y Roze).
  if ((view.phase & PHASE.END) !== 0) {
    const linkage = pick(SKY.linkage)

    if (linkage >= 0 && extraLeft(view, SKY.shizuku) > 0 && emzMine(view).length > 0 && !s.done.has('end.linkage')) return activate(linkage, 'end.linkage', reasonOf('play.endPhase', SKY.linkage))
    const hornet = pick(SKY.hornet)

    if (hornet >= 0 && !s.done.has('end.hornet')) return activate(hornet, 'end.hornet', reasonOf('play.endPhase', SKY.hornet))
    const mst = pick(SKY.mst)

    if (mst >= 0 && view.them.spells.some((card) => card?.pos === 'set') && !s.done.has('end.mst')) return activate(mst, 'end.mst')
    const zero = pick(SKY.zero, (card) => nOf(card.description) === 1)

    if (zero >= 0 && !s.done.has('zero.quick')) return activate(zero, 'zero.quick', reasonOf('play.zero', SKY.zero))
  }

  return null
}

/** El índice de la lista con la mejor carta tuya (la más peligrosa a la vista); con `test`, sólo entre ésas. */
const bestOfYours = (s: Scene, list: readonly CardLoc[], test: (card: CardLoc) => boolean = () => true) => {
  const order = ranked(list, (card) => (isMine(s.view, card) || !test(card) ? -Infinity : threatOf(s, card)))

  return order.length > 0 && !isMine(s.view, list[order[0]!]!) && test(list[order[0]!]!) ? order[0]! : -1
}

/** El objetivo de Widow Anchor / Forbidden Crown: el monstruo de tu eslabón (si respondió) o tu monstruo boca arriba con efecto de más ATK. */
function negateTarget(s: Scene, list: readonly CardLoc[]) {
  const below = s.view.chain.findLast((link) => link.card?.ref.side === 'theirs' && link.state !== 'solved')?.card?.place
  const linked = below ? list.findIndex((card) => card.controller === below.controller && card.location === below.location && card.sequence === below.sequence) : -1

  return linked >= 0 ? linked : bestOfYours(s, list, (card) => card.location === LOC.MZONE)
}

function choose(ask: CoreAsk, s: Scene): DeckDecision | null {
  const { view } = s
  const current = s.current?.code ?? 0
  const one = (index: number, rule: string, reason?: BotReason): DeckDecision | null =>
    index < 0 || ask.type !== 'select_card' ? null : { answer: { type: ask.type, indices: [index] }, ...(reason ? { reason } : {}), rule: `sky.${rule}` }
  const picked = (index: number) => (ask.type === 'select_card' ? (ask.selects[index]?.code ?? 0) : 0)

  switch (ask.type) {
    case 'select_effectyn': {
      const trigger = TRIGGERS[ask.code]

      if (!OWN.has(ask.code) || !trigger) return null
      // El `desc` de la pregunta suele ser el texto del sistema («¿Activar el efecto de…?»), no el del efecto: entonces, su disparo (el del cementerio en Raye, Lemnisgate! y
      // Camellia; el de la Battle Phase en Azalea y Engage Zero).
      const n = codeOfDesc(ask.description) === ask.code ? nOf(ask.description) : (TRIGGER_N[ask.code]?.(view) ?? 0)
      const yes = trigger(s, n)

      return { answer: { type: ask.type, yes }, ...(yes ? { reason: reasonOf('play.trigger', ask.code), intent: { id: `trigger.${ask.code}.${n}`, code: ask.code } } : {}), rule: `sky.trigger.${yes ? 'yes' : 'no'}` }
    }
    case 'select_yesno': {
      const code = codeOfDesc(ask.description)
      const n = nOf(ask.description)
      const yes: Record<number, boolean | undefined> = {
        [SKY.engage]: true,
        [SKY.widow]: n === 1,
        [SKY.shark]: false,
        [SKY.roze]: n === 2 && monstersOf(view.them).length > 0,
        [SKY.zero]: n === 2 && yourCards(view) > 0,
        [SKY.lemnisgate]: n === 2 && yourCards(view) > 0,
      }
      const answer = yes[code]

      return answer === undefined ? null : { answer: { type: ask.type, yes: answer }, rule: `sky.yesno.${code}.${n}` }
    }
    case 'select_option': {
      // Radiant Typhoon Vision: robar 2 (`n` 2); The Fallen & The Virtuous: destruir (1); Triple Tactics Talent: robar 2 (1).
      const want: Record<number, number> = { [SKY.vision]: 2, [SKY.fallen]: 1, [SKY.talent]: 1 }
      const index = ask.options.findIndex((option) => want[codeOfDesc(option)] === nOf(option))

      return index >= 0 ? { answer: { type: ask.type, index }, rule: 'sky.option' } : null
    }
    case 'select_unselect_card': {
      // Materiales de Enlace: lo que menos vale primero; con lo justo, termina.
      if (!LINKS.has(current) || !ask.select_cards.every((card) => isMine(view, card) && card.location === LOC.MZONE)) return null
      if (ask.can_finish && ask.unselect_cards.length > 0) return { answer: { type: ask.type, index: null }, rule: 'sky.material.done' }
      const index = ranked(ask.select_cards, (card) => materialScore(s, card))[0]

      return index === undefined ? null : { answer: { type: ask.type, index }, rule: 'sky.material' }
    }
    case 'select_card':
      break
    default:
      return null
  }

  const list = ask.selects
  const from = (location: number) => list.every((card) => (card.location & location) !== 0)

  // Materiales de Enlace en un `select_card`.
  if (LINKS.has(current) && list.every((card) => isMine(view, card) && card.location === LOC.MZONE)) {
    const indices = ranked(list, (card) => materialScore(s, card)).slice(0, Math.max(1, ask.min))

    return { answer: { type: ask.type, indices }, rule: 'sky.material' }
  }
  // Buscar o mandar del Deck, recuperar del cementerio, traer del Extra Deck.
  if (from(LOC.DECK | LOC.GRAVE | LOC.EXTRA | LOC.HAND) && list.every((card) => isMine(view, card))) {
    switch (current) {
      case SKY.engage:
        return one(Math.max(0, firstOf(list, engageWants(s))), 'search.engage', reasonOf('play.search', SKY.engage, picked(Math.max(0, firstOf(list, engageWants(s))))))
      case SKY.rota: {
        const index = Math.max(0, firstOf(list, inHand(view, SKY.raye) ? [SKY.roze, SKY.raye] : [SKY.raye, SKY.roze]))

        return one(index, 'search.rota', reasonOf('play.search', SKY.rota, picked(index)))
      }
      case SKY.zero:
        if (from(LOC.DECK | LOC.GRAVE) && list.every((card) => SS_SPELLS.has(card.code))) {
          const index = Math.max(0, firstOf(list, spellWants(s), (card) => card.location === LOC.DECK), firstOf(list, spellWants(s)))

          return one(index, 'search.zero', reasonOf('play.search', SKY.zero, picked(index)))
        }
        // Su efecto rápido: Raye y Roze del Deck o del cementerio (las que pida).
        return { answer: { type: ask.type, indices: list.map((_, i) => i).slice(0, Math.max(1, ask.min)) }, rule: 'sky.zero.revive' }
      case SKY.shizuku: {
        const index = Math.max(0, firstOf(list, spellWants(s)))

        return one(index, 'search.shizuku', reasonOf('play.search', SKY.shizuku, picked(index)))
      }
      case SKY.kagari: {
        const index = Math.max(0, firstOf(list, spellWants(s)))

        return one(index, 'recover.kagari', reasonOf('play.recover', SKY.kagari, picked(index)))
      }
      case SKY.hayate: {
        const index = Math.max(0, firstOf(list, [SKY.engage, SKY.linkage, SKY.widow, SKY.hornet, SKY.shark]))

        return one(index, 'mill.hayate')
      }
      case SKY.raye:
      case SKY.linkage:
      case SKY.lemnisgate:
        if (from(LOC.EXTRA)) {
          const index = Math.max(0, firstOf(list, linkWants(s)))

          return one(index, `extra.${current}`, reasonOf('play.extraTo', current, picked(index)))
        }
        break
      case SKY.vision: {
        const index = Math.max(0, firstOf(list, DISCARD))

        return one(index, 'cost.vision', reasonOf('target.cost', SKY.vision, picked(index)))
      }
      case SKY.fallen:
        if (from(LOC.EXTRA)) return one(0, 'cost.fallen')
        break
    }
  }
  // Linkage!: lo suyo que manda al cementerio (su Enlace en la Zona Extra, la Ficha; nunca lo que tiene colocado si hay otra cosa).
  if (current === SKY.linkage && list.every((card) => isMine(view, card))) {
    const index = ranked(list, (card) => (card.location === LOC.MZONE ? materialScore(s, card) : 20 - Math.max(0, DISCARD.indexOf(atPlace(view, card)?.code ?? card.code))))[0]!

    return one(index, 'cost.linkage', reasonOf('target.cost', SKY.linkage, picked(index)))
  }
  if (list.some((card) => !isMine(view, card))) {
    // Widow Anchor y Forbidden Crown: tu monstruo (el de tu eslabón, o el de más ATK con efecto).
    if (current === SKY.widow || current === SKY.crown) {
      const index = negateTarget(s, list)

      return one(index, `target.${current}`, reasonOf(current === SKY.widow && spellsInGrave(s) >= 3 ? 'target.steal' : 'target.negate', current, picked(index)))
    }
    // Shark Cannon: el monstruo de tu eslabón en tu cementerio o el de más ATK.
    if (current === SKY.shark) {
      const below = view.chain.findLast((link) => link.card?.ref.side === 'theirs')?.card?.place
      const linked = below ? list.findIndex((card) => card.controller === below.controller && card.location === below.location && card.sequence === below.sequence) : -1
      const index = linked >= 0 ? linked : ranked(list, (card) => (isMine(view, card) ? -1 : (s.facts(card.code)?.attack ?? 0)))[0]!

      return one(index, 'target.shark', reasonOf('target.banish', SKY.shark, picked(index)))
    }
    // Lo que destruye o destierra lo tuyo (The Fallen & The Virtuous, Mystical Space Typhoon, Zero, Azalea, Zeke, Camellia, Engage Zero, Roze): tu carta más peligrosa; al
    // declarar un ataque, el atacante. Mystical Space Typhoon, lo colocado primero.
    if (OWN.has(current) && ask.min <= 1) {
      const attack = (view.phase & PHASE.BATTLE) !== 0 ? lastAttack(view) : null
      const attacker = attack ? list.findIndex((card) => !isMine(view, card) && card.location === LOC.MZONE && card.code === attack.code) : -1
      const index =
        attacker >= 0 ? attacker : current === SKY.mst ? ranked(list, (card) => (isMine(view, card) ? -1 : atPlace(view, card)?.pos === 'set' ? 2 : 1))[0]! : bestOfYours(s, list)

      if (index >= 0 && !isMine(view, list[index]!)) {
        const key = current === SKY.zeke ? 'target.banish' : current === SKY.roze || current === SKY.engageZero ? 'target.negate' : 'target.destroy'

        return one(index, `target.${current}`, reasonOf(key, current, picked(index)))
      }
    }
  }

  return null
}

export const SKY_STRIKER_EXECUTOR: DeckExecutor = { plays: PLAYS, chain, choose, direct: [SKY.hayate] }

/** El bot de Sky Striker: el ejecutor y, para lo que no decide, sus handtraps y Called by the Grave como el rival que juega su turno (`turnBot`). */
export function skyStrikerBot(facts: (code: number) => CardFacts | undefined, aliasOf: (code: number) => number = () => 0, attributeOf?: (code: number) => number): Bot {
  const reacts = turnBot(HANDTRAPS, [], aliasOf, attributeOf, facts)
  // «Tenía X y no la usé: todavía no sé cuándo conviene» es de las handtraps sin regla; sus Mágicas tienen regla (`chain`): si no la usó, no era el momento, y no se cuenta.
  const fallback: Bot = (ask, view, context) => {
    const decision = reacts(ask, view, context)
    const held = decision.rule === 'handtrap.hold.noRule' ? (decision.reason?.cards?.[0] ?? 0) : 0

    return held && OWN.has(held) && !HANDTRAPS.includes(held) ? { answer: decision.answer, rule: 'sky.hold' } : decision
  }

  return executorBot(SKY_STRIKER_EXECUTOR, facts, fallback)
}

