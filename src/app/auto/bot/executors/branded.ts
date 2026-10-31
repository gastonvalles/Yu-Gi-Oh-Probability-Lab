import type { AskOf, CardLoc, CoreAsk } from '../../protocol'
import type { Bot, BotReason, BotView } from '../bot'
import { BRANDED as B, BRANDED_DECK } from '../decks/branded'
import { turnBot, type CardFacts } from '../turn'
import {
  ATTACK_TIMING,
  atkOf,
  attackPlan,
  atPlace,
  cardsOf,
  executorBot,
  firstOf,
  isMine,
  isType,
  lastAttack,
  LOC,
  monstersOf,
  PHASE,
  ranked,
  threatOf,
  type DeckDecision,
  type DeckExecutor,
  type Play,
  type Scene,
} from './executor'

/**
 * El ejecutor de Despia Branded (etapa 2 del bot): juega la lista fija de `decks/branded.ts` con prioridades escritas a partir del texto impreso y los scripts (CardScripts al commit
 * de `testedWith`). La idea del mazo: Branded Fusion manda del Deck a Fallen of Albaz (o una carta con su nombre) y un monstruo OSCURIDAD para Lubellion, que con su efecto vuelve a
 * Fusionar desde el cementerio a Mirrorjade (destierra un monstruo en tu turno). En tu turno interrumpe con lo que armó y con lo colocado.
 *
 * Main Phase, en orden (la primera que el núcleo ofrece y conviene):
 * 1. Gold Sarcophagus (destierra a Tri-Brigade Mercourier, que busca a Albaz) y Branded Opening (descarta y trae a Aluber en defensa).
 * 2. Invocar de modo Normal a Aluber (busca Branded Fusion o la Branded que falta), Fallen of the White Dragon desde la mano (trae a una Ecclesia) y Blazing Cartesia (con Albaz en el
 *    campo o el cementerio; si hace falta, Invoca a Albaz para eso).
 * 3. Branded Fusion: Lubellion (Albaz y un OSCURIDAD del Deck); Lubellion Fusiona a Mirrorjade o Despian Quaeritis desde el cementerio. La Fusión rápida de Cartesia (Granguignol),
 *    High Spirits (busca a Albaz o a White Dragon) y Albion (roba). Sin Branded Fusion: White Dragon y su Ecclesia a una Sincronía de Nivel 8 (The Three Champions of Swordsoul
 *    busca a Cartesia).
 * 4. En tu campo con monstruos: Fallen of Albaz (o Incredible Ecclesia, que la trae) Fusiona usando tu monstruo; The Fallen & The Virtuous destruye tu carta más peligrosa; Quaeritis
 *    y Mirrorjade abren el ataque.
 * 5. Una Invocación Normal (Quem, que manda a Albaz al cementerio; si no queda otra jugada, el monstruo que ataque), Nadir Servant al final (después no Invoca del Extra Deck),
 *    recuperar Branded Fusion con Branded Retribution y, antes de terminar, colocar Super Polymerization, The Fallen & The Virtuous y Branded Retribution.
 * En tu turno: Mirrorjade destierra tu monstruo y Quaeritis deja tus ATK en 0 (en tu Main Phase); Super Polymerization Fusiona con tus monstruos; The Fallen & The Virtuous destruye a tu
 * atacante; Branded Retribution, Rindbrumm y Mercourier niegan lo tuyo; Incredible Ecclesia trae a Albaz para Fusionar con tu monstruo. Sus handtraps (Ash, Ghost Ogre, Droll & Lock
 * Bird, Mulcharmy Fuwalos, Bystial Saronir), como el rival de handtraps (`turnBot`).
 */

const OWN = new Set<number>([...BRANDED_DECK.main, ...BRANDED_DECK.extra].map(([code]) => code))
/** Sus handtraps, en ese orden de preferencia: las usa como el rival de handtraps. */
const HANDTRAPS: number[] = [B.ash, B.ogre, B.droll, B.fuwalos, B.saronir]
/** Lo que descarta o manda primero (costos de Opening, Lubellion, Albaz, Super Polymerization): lo que menos le sirve, o lo que hace algo en el cementerio (Kitt, Saronir). */
const DISCARD: number[] = [B.kitt, B.fuwalos, B.cocatorium, B.saronir, B.albion, B.sarcophagus, B.nadir, B.mercourier, B.dogmatika, B.quem, B.incredible, B.droll, B.ogre, B.cartesia, B.spirits, B.whiteDragon, B.retribution, B.superPoly, B.virtuous, B.ash, B.opening, B.aluber, B.albaz, B.fusion]
/** Lo que manda del Extra Deck como costo (White Dragon, Mirrorjade, The Fallen & The Virtuous, High Spirits, Nadir): Titaniklad y Dogma buscan en la End Phase. */
const COST_EXTRA: number[] = [B.titaniklad, B.dogma, B.rindbrumm, B.granguignol, B.secreterion, B.mixousia, B.wingman, B.aeon, B.quaeritis, B.lubellion, B.mirrorjade]
/** Qué Fusiona cada efecto que Fusiona, en orden. */
const FUSE: Record<number, number[]> = {
  [B.fusion]: [B.lubellion, B.titaniklad, B.rindbrumm, B.mirrorjade, B.dogma],
  [B.lubellion]: [B.mirrorjade, B.quaeritis, B.titaniklad, B.rindbrumm, B.granguignol, B.dogma],
  [B.albaz]: [B.mirrorjade, B.dogma, B.titaniklad, B.lubellion, B.rindbrumm, B.quaeritis, B.granguignol],
  [B.superPoly]: [B.mirrorjade, B.dogma, B.quaeritis, B.lubellion, B.titaniklad, B.rindbrumm, B.granguignol, B.secreterion, B.mixousia, B.wingman, B.aeon],
  [B.cartesia]: [B.granguignol, B.quaeritis, B.mixousia, B.secreterion, B.titaniklad],
}
/** Lo que manda del Deck como material, en orden (así raleo el Deck y guardo la Albaz de verdad, que Fusiona con tus monstruos). */
const MATERIAL_DECK: number[] = [B.whiteDragon, B.aluber, B.mercourier, B.albion, B.kitt, B.saronir, B.cocatorium, B.quem, B.cartesia, B.albaz]
/**
 * Qué busca de las que nombran a Albaz (Mercourier, High Spirits): Albaz si tenés monstruos (Fusiona con ellos) o si tiene a Cartesia (que se Invoca con Albaz en el campo); si no,
 * Fallen of the White Dragon, que se Invoca sola y trae a una Ecclesia (una vez por turno: si ya se Invocó, Albaz).
 */
const albazWants = ({ view, done }: Scene) =>
  yourFaceUp(view).length > 0 || (inHand(view, B.cartesia) && !inHand(view, B.albaz)) || inHand(view, B.whiteDragon) || done.has('white-dragon') ? [B.albaz, B.whiteDragon, B.cartesia, B.albion, B.quem] : [B.whiteDragon, B.albaz, B.cartesia, B.albion, B.quem]

const handCodes = (view: BotView) => view.me.hand.map((card) => card.code)
const inHand = (view: BotView, code: number) => handCodes(view).includes(code)
const deckLeft = (view: BotView, code: number) => view.me.deckLeft?.[code] ?? 0
const inGrave = (view: BotView, code: number) => view.me.grave.some((card) => card.code === code)
const reasonOf = (key: string, ...cards: number[]): BotReason => ({ key: `auto.bot.reason.${key}`, cards })
const nOf = (description: string) => Number(BigInt(description) & 0xfffffn)
const codeOfDesc = (description: string) => Number(BigInt(description) >> 20n)
const isFusion = (s: Pick<Scene, 'facts'>, code: number) => isType(s, code, 0x40)
/** Tus monstruos boca arriba (lo que Albaz, Super Polymerization, Mirrorjade y The Fallen & The Virtuous pueden usar o sacar). */
const yourFaceUp = (view: BotView) => monstersOf(view.them).filter((card) => card.code !== 0 && card.pos !== 'set')
/** Algo que descartar que no sea lo que arranca la jugada. */
const fodder = (view: BotView, keep: number) => view.me.hand.filter((card) => card.code !== keep && card.code !== B.fusion).length > 0
/** Lo suyo que ataca (sus Fusiones de Nivel 8 no pierden ATK con Quaeritis). */
const myAttackers = (s: Scene) => monstersOf(s.view.me).filter((card) => card.pos === 'atk')
const bestAtk = (s: Scene) => Math.max(0, ...myAttackers(s).map((card) => atkOf(s, card)))
/** Tu monstruo boca arriba que frena su ataque (más ATK, o DEF, que su mejor atacante). */
const blocks = (s: Scene) =>
  s.view.turn > 1 &&
  (s.view.phase & PHASE.MAIN1) !== 0 &&
  myAttackers(s).length > 0 &&
  yourFaceUp(s.view).some((card) => (card.pos === 'atk' ? atkOf(s, card) : (card.stats?.defense ?? 0)) >= bestAtk(s))
/** Si va a atacar en esta Main Phase 1 (entonces coloca después, en la Main Phase 2). */
const battleAhead = (s: Scene) =>
  s.view.turn > 1 && (s.view.phase & PHASE.MAIN1) !== 0 && attackPlan(s, myAttackers(s).map((card) => ({ atk: atkOf(s, card), direct: monstersOf(s.view.them).length === 0 }))) !== null
/** Ya Fusionó con Branded Fusion, o no tiene con qué: lo que corta el Extra Deck (Nadir Servant, la búsqueda de Dogmatika Ecclesia) ya no le quita nada. */
/** Sin Branded Fusion en la mano ni usada: lo que no es una Fusión del Extra Deck no la corta. */
const noFusion = (s: Scene) => !inHand(s.view, B.fusion) && !s.done.has('fusion')
const synchroOk = (s: Scene) => noFusion(s) && !monstersOf(s.view.me).some((card) => card.code === B.cartesia)
const fusedOrStuck = (s: Scene) => s.done.has('fusion') || (!inHand(s.view, B.fusion) && !s.done.has('opening') && deckLeft(s.view, B.fusion) === 0)

const PLAYS: Play[] = [
  { id: 'sarcophagus', kind: 'activate', code: B.sarcophagus, when: (s) => deckLeft(s.view, B.mercourier) > 0, reason: () => reasonOf('play.starter', B.sarcophagus) },
  {
    id: 'opening',
    kind: 'activate',
    code: B.opening,
    when: (s) => deckLeft(s.view, B.aluber) + deckLeft(s.view, B.quem) > 0 && !s.done.has('normal-aluber') && fodder(s.view, B.opening),
    reason: () => reasonOf('play.starter', B.opening),
  },
  { id: 'normal-aluber', kind: 'summon', code: B.aluber, when: (s) => !s.done.has('opening') && !s.done.has(`trigger.${B.aluber}.0`), reason: () => reasonOf('play.normalEffect', B.aluber) },
  { id: 'white-dragon', kind: 'activate', code: B.whiteDragon, from: LOC.HAND, reason: () => reasonOf('play.special', B.whiteDragon) },
  // Albaz sin tus monstruos sólo para que Cartesia se pueda Invocar (y Fusionar con ella).
  { id: 'normal-albaz-cartesia', kind: 'summon', code: B.albaz, when: (s) => inHand(s.view, B.cartesia) && noFusion(s), reason: () => reasonOf('play.normalEffect', B.albaz) },
  { id: 'cartesia', kind: 'activate', code: B.cartesia, from: LOC.HAND, reason: () => reasonOf('play.special', B.cartesia) },
  { id: 'fusion', kind: 'activate', code: B.fusion, reason: () => reasonOf('play.starter', B.fusion) },
  // La Fusión rápida de Cartesia con un compañero que no sea una Fusión (no gasta a Mirrorjade ni a Lubellion).
  {
    id: 'cartesia-fusion',
    kind: 'activate',
    code: B.cartesia,
    from: LOC.MZONE,
    effect: 1,
    when: (s) => monstersOf(s.view.me).some((card) => card.code !== B.cartesia && card.code !== B.cocatorium && !isFusion(s, card.code)),
    reason: () => reasonOf('play.trigger', B.cartesia),
  },
  { id: 'spirits', kind: 'activate', code: B.spirits, from: LOC.HAND | LOC.SZONE, when: (s) => !inHand(s.view, B.albaz) && deckLeft(s.view, B.albaz) + deckLeft(s.view, B.whiteDragon) > 0, reason: () => reasonOf('play.starter', B.spirits) },
  { id: 'albion', kind: 'activate', code: B.albion, from: LOC.HAND, when: (s) => !inHand(s.view, B.fusion), reason: () => reasonOf('play.draw', B.albion) },
  // Sin Branded Fusion (que no deja Invocar del Extra Deck otra cosa que Fusiones) ni Cartesia en el campo: White Dragon y la Ecclesia que trajo, a una Sincronía de Nivel 8. The Three
  // Champions of Swordsoul busca a Cartesia; Ecclesia and the Dark Dragon la trae del Deck.
  { id: 'synchro-champions', kind: 'special', code: B.champions, from: LOC.EXTRA, when: (s) => synchroOk(s), reason: () => reasonOf('play.synchro', B.champions) },
  { id: 'synchro-dark-dragon', kind: 'special', code: B.darkDragon, from: LOC.EXTRA, when: (s) => synchroOk(s), reason: () => reasonOf('play.synchro', B.darkDragon) },
  { id: 'dark-dragon', kind: 'activate', code: B.darkDragon, from: LOC.MZONE, effect: 0, when: (s) => deckLeft(s.view, B.cartesia) + deckLeft(s.view, B.albaz) > 0, reason: () => reasonOf('play.trigger', B.darkDragon) },
  // Con tus monstruos boca arriba: Albaz (o Incredible Ecclesia, que la trae) los usa de material.
  { id: 'normal-albaz', kind: 'summon', code: B.albaz, when: (s) => yourFaceUp(s.view).length > 0 && fodder(s.view, B.albaz), reason: () => reasonOf('play.normalEffect', B.albaz) },
  {
    id: 'incredible-albaz',
    kind: 'activate',
    code: B.incredible,
    from: LOC.MZONE,
    when: (s) => yourFaceUp(s.view).length > 0 && (deckLeft(s.view, B.albaz) > 0 || inHand(s.view, B.albaz)) && s.view.me.hand.length > 0,
    reason: () => reasonOf('play.trigger', B.incredible),
  },
  { id: 'champions', kind: 'activate', code: B.champions, from: LOC.MZONE, when: (s) => cardsOf(s.view.them).some((card) => card.code !== 0 && card.pos !== 'set') },
  { id: 'virtuous', kind: 'activate', code: B.virtuous, when: (s) => cardsOf(s.view.them).some((card) => card.code !== 0 && card.pos !== 'set') },
  { id: 'quaeritis', kind: 'activate', code: B.quaeritis, from: LOC.MZONE, when: (s) => blocks(s), reason: () => reasonOf('play.zeroAtk', B.quaeritis) },
  { id: 'mirrorjade', kind: 'activate', code: B.mirrorjade, from: LOC.MZONE, when: (s) => blocks(s) },
  { id: 'normal-quem', kind: 'summon', code: B.quem, reason: () => reasonOf('play.normalEffect', B.quem) },
  { id: 'normal-aluber-late', kind: 'summon', code: B.aluber, when: (s) => !s.done.has(`trigger.${B.aluber}.0`), reason: () => reasonOf('play.normalEffect', B.aluber) },
  { id: 'normal-dogmatika', kind: 'summon', code: B.dogmatika, when: (s) => fusedOrStuck(s), reason: () => reasonOf('play.normalEffect', B.dogmatika) },
  { id: 'incredible-special', kind: 'special', code: B.incredible, from: LOC.HAND, reason: () => reasonOf('play.special', B.incredible) },
  { id: 'nadir', kind: 'activate', code: B.nadir, when: (s) => fusedOrStuck(s) && deckLeft(s.view, B.albaz) + deckLeft(s.view, B.dogmatika) + (inGrave(s.view, B.albaz) ? 1 : 0) > 0, reason: () => reasonOf('play.starter', B.nadir) },
  // Sin otra jugada: un monstruo que ataque (Saronir, 2500, desterrando un LUZ u OSCURIDAD de un cementerio; Albion desde la mano) o que quede en el campo.
  { id: 'saronir', kind: 'activate', code: B.saronir, from: LOC.HAND, when: (s) => s.view.turn > 1, reason: () => reasonOf('play.special', B.saronir) },
  ...[B.aluber, B.albaz, B.kitt, B.cartesia, B.quem, B.incredible, B.dogmatika, B.mercourier].map((code): Play => ({ id: `beater-${code}`, kind: 'summon', code, reason: () => reasonOf('play.beater', code) })),
  { id: 'retribution-recover', kind: 'activate', code: B.retribution, from: LOC.GRAVE, when: (s) => inGrave(s.view, B.fusion) && !inHand(s.view, B.fusion) },
  // Lo que usa en tu turno, colocado al final (después de atacar).
  ...[B.superPoly, B.virtuous, B.retribution].map((code): Play => ({ id: `set-${code}`, kind: 'set', code, from: LOC.HAND, when: (s) => !battleAhead(s), reason: () => reasonOf('play.setQuick', code) })),
]

/** Sus efectos que se activan solos (disparos), por código y `n` del `desc`, y si conviene. */
const TRIGGERS: Record<number, (s: Scene, n: number, card: CardLoc) => boolean> = {
  [B.aluber]: () => true,
  [B.albaz]: (s, n) => n === 0 && yourFaceUp(s.view).length > 0 && s.view.me.hand.length > 0,
  [B.whiteDragon]: (_, n) => n === 1,
  [B.quem]: () => true,
  [B.kitt]: (_, n) => n === 1,
  [B.mercourier]: (_, n) => n === 1,
  [B.saronir]: (_, n) => n === 1,
  [B.dogmatika]: (s, n) => n === 1 && fusedOrStuck(s),
  [B.cartesia]: (_, n, card) => n === 2 && card.location === LOC.GRAVE,
  [B.incredible]: (_, __, card) => card.location === LOC.GRAVE,
  [B.spirits]: (_, n, card) => n === 1 && card.location === LOC.GRAVE,
  [B.lubellion]: (s) => s.view.me.hand.length > 0,
  [B.granguignol]: () => true,
  [B.titaniklad]: () => true,
  [B.dogma]: (s, n) => n === 1 || s.view.them.grave.length + s.view.them.banished.length > 0,
  [B.quaeritis]: (_, n) => n === 1,
  [B.mirrorjade]: (_, n) => n === 1,
  [B.wingman]: (_, n) => n === 0,
  [B.aeon]: (_, n) => n === 0,
  [B.champions]: (_, n) => n === 0,
}
const QUICK_ONLY = new Set<number>([B.virtuous, B.superPoly, B.retribution, B.rindbrumm])
/** Cuál de sus efectos es el disparo, cuando la pregunta (`select_effectyn`) no lo dice: el `desc` suele ser el texto del sistema. */
const TRIGGER_N: Record<number, number> = { [B.whiteDragon]: 1, [B.kitt]: 1, [B.mercourier]: 1, [B.saronir]: 1, [B.dogmatika]: 1, [B.cartesia]: 2, [B.incredible]: 1, [B.spirits]: 1, [B.quaeritis]: 1, [B.mirrorjade]: 1 }

function chain(ask: AskOf<'select_chain'>, s: Scene): DeckDecision | null {
  const { view } = s
  const mine = view.turnPlayer === 'me'
  const top = view.chain.at(-1)
  const yours = top?.card?.ref.side === 'theirs' && top.state === 'chained'
  const pick = (code: number, test: (card: CardLoc & { description: string }) => boolean = () => true) => ask.selects.findIndex((card) => card.code === code && test(card))
  const activate = (index: number, id: string, reason?: BotReason): DeckDecision => ({ answer: { type: ask.type, index }, ...(reason ? { reason } : {}), rule: `branded.${id}`, intent: { id, code: ask.selects[index]!.code } })

  // Sus disparos (Aluber, Lubellion, Titaniklad en la End Phase…).
  for (const [index, card] of ask.selects.entries()) {
    const n = nOf(card.description)
    const trigger = TRIGGERS[card.code]
    const quick = (card.code === B.mirrorjade || card.code === B.quaeritis) && n === 0

    if (trigger && !quick && !QUICK_ONLY.has(card.code) && card.location !== LOC.SZONE && trigger(s, n, card)) return activate(index, `trigger.${card.code}.${n}`, reasonOf('play.trigger', card.code))
  }
  if (ask.forced) return null

  // Contra tu eslabón: Branded Retribution (una Invocación Especial), Rindbrumm (el efecto de tu Fusión, Sincronía, Xyz o Enlace), Mercourier (tu efecto de monstruo).
  if (yours && top.card) {
    for (const code of [B.retribution, B.rindbrumm, B.mercourier]) {
      const index = pick(code, (card) => code !== B.retribution || card.location !== LOC.GRAVE)

      if (index >= 0 && !s.done.has(`respond.${code}`)) return activate(index, `respond.${code}`, reasonOf('handtrap.respond', code, top.code))
    }
    // The Fallen & The Virtuous contra tu monstruo en el campo que activa su efecto.
    const place = top.card.place
    const virtuous = pick(B.virtuous, (card) => card.location === LOC.SZONE)

    if (!mine && virtuous >= 0 && place?.location === LOC.MZONE && atPlace(view, place)?.pos !== 'set' && !s.done.has('respond.virtuous')) return activate(virtuous, 'respond.virtuous')
  }
  if (mine) return null
  const free = view.chain.length === 0 || yours
  const faceUp = yourFaceUp(view)

  // Tu ataque recién declarado: destruir al atacante (The Fallen & The Virtuous) o desterrarlo (Mirrorjade).
  const attack = view.chain.length === 0 && (ask.hint_timing_other & ATTACK_TIMING) !== 0 ? lastAttack(view) : null

  if (attack) {
    const virtuous = pick(B.virtuous, (card) => card.location === LOC.SZONE)

    if (virtuous >= 0 && !s.done.has('attack.virtuous')) return activate(virtuous, 'attack.virtuous')
  }
  if (!free || faceUp.length === 0) return null
  // En tu turno, con tus monstruos boca arriba: Mirrorjade destierra, Super Polymerization los Fusiona, Incredible Ecclesia trae a Albaz; en tu Main Phase, Quaeritis deja tus ATK en 0 si
  // tenés uno de 2000 o más.
  const mirrorjade = pick(B.mirrorjade, (card) => nOf(card.description) === 0)

  if (mirrorjade >= 0 && !s.done.has('quick.mirrorjade')) return activate(mirrorjade, 'quick.mirrorjade')
  const superPoly = pick(B.superPoly)

  if (superPoly >= 0 && view.me.hand.length > 0 && !s.done.has('quick.superPoly')) return activate(superPoly, 'quick.superPoly', reasonOf('play.superPoly', B.superPoly))
  const incredible = pick(B.incredible, (card) => card.location === LOC.MZONE)

  if (incredible >= 0 && deckLeft(view, B.albaz) + (inHand(view, B.albaz) ? 1 : 0) > 0 && view.me.hand.length > 0 && !s.done.has('quick.incredible')) return activate(incredible, 'quick.incredible', reasonOf('play.trigger', B.incredible))
  const quaeritis = pick(B.quaeritis, (card) => nOf(card.description) === 0)

  if (quaeritis >= 0 && faceUp.some((card) => atkOf(s, card) >= 2000) && !s.done.has('quick.quaeritis')) return activate(quaeritis, 'quick.quaeritis', reasonOf('play.zeroAtk', B.quaeritis))

  return null
}

/** El índice de la lista con la mejor carta tuya (la más peligrosa a la vista); con `test`, sólo entre ésas. */
const bestOfYours = (s: Scene, list: readonly CardLoc[], test: (card: CardLoc) => boolean = () => true) => {
  const order = ranked(list, (card) => (isMine(s.view, card) || !test(card) ? -Infinity : threatOf(s, card)))

  return order.length > 0 && !isMine(s.view, list[order[0]!]!) && test(list[order[0]!]!) ? order[0]! : -1
}

/** Cuánto conviene usar una carta de material de Fusión: lo tuyo primero (te lo saco), después lo del Deck, el cementerio, lo suyo que no es Fusión y lo de la mano; sus Fusiones, al final. */
function materialScore(s: Scene, card: CardLoc, chosen: readonly CardLoc[] = []): number {
  if (!isMine(s.view, card)) return 2000 + threatOf(s, card)
  const code = atPlace(s.view, card)?.code ?? card.code

  // Del Deck, en el orden de la lista; una segunda copia de lo que ya eligió, después (dos White Dragon gastan las dos).
  if (card.location === LOC.DECK) return 800 + (MATERIAL_DECK.length - Math.max(0, MATERIAL_DECK.indexOf(code))) - (chosen.some((other) => other.code === code) ? 50 : 0)
  if (card.location === LOC.GRAVE || card.location === LOC.REMOVED) return 700
  if (card.location === LOC.HAND) return 300 - DISCARD.indexOf(code)
  return isFusion(s, code) ? 50 : 500
}

const FUSERS = new Set(Object.keys(FUSE).map(Number))
const COST_FROM_EXTRA = new Set<number>([B.whiteDragon, B.mirrorjade, B.virtuous, B.spirits, B.nadir])
const DISCARDERS = new Set<number>([B.opening, B.lubellion, B.albaz, B.superPoly])
const REMOVERS = new Set<number>([B.virtuous, B.mirrorjade, B.aluber, B.rindbrumm, B.dogma, B.champions])

function choose(ask: CoreAsk, s: Scene): DeckDecision | null {
  const { view } = s
  const current = s.current?.code ?? 0
  const one = (index: number, rule: string, reason?: BotReason): DeckDecision | null =>
    index < 0 || ask.type !== 'select_card' ? null : { answer: { type: ask.type, indices: [index] }, ...(reason ? { reason } : {}), rule: `branded.${rule}` }
  const picked = (index: number) => (ask.type === 'select_card' ? (ask.selects[index]?.code ?? 0) : 0)

  switch (ask.type) {
    case 'select_effectyn': {
      const trigger = TRIGGERS[ask.code]

      if (!OWN.has(ask.code) || !trigger) return null
      const n = codeOfDesc(ask.description) === ask.code ? nOf(ask.description) : (TRIGGER_N[ask.code] ?? 0)
      const yes = trigger(s, n, ask)

      return { answer: { type: ask.type, yes }, ...(yes ? { reason: reasonOf('play.trigger', ask.code), intent: { id: `trigger.${ask.code}.${n}`, code: ask.code } } : {}), rule: `branded.trigger.${yes ? 'yes' : 'no'}` }
    }
    case 'select_yesno': {
      const code = codeOfDesc(ask.description)
      // High Spirits: descartar lo revelado y buscar a Albaz, sí. Rindbrumm: devolver un monstruo, sí. Opening: desterrarse en vez de que destruyan su Fusión, sí.
      const yes: Record<number, boolean | undefined> = { [B.spirits]: true, [B.rindbrumm]: monstersOf(view.them).length > 0, [B.opening]: true }
      const answer = yes[code] ?? (code === 96 ? true : undefined)

      return answer === undefined ? null : { answer: { type: ask.type, yes: answer }, rule: `branded.yesno.${code}` }
    }
    case 'select_option': {
      // The Fallen & The Virtuous: destruir (`n` 1). Opening, Titaniklad y Quaeritis: «Invocar» si es para su campo; si no, a la mano (la primera).
      const destroy = ask.options.findIndex((option) => codeOfDesc(option) === B.virtuous && nOf(option) === 1)

      if (current === B.virtuous && destroy >= 0) return { answer: { type: ask.type, index: destroy }, rule: 'branded.option.destroy' }
      if (current === B.opening) {
        const summon = ask.options.findIndex((option) => codeOfDesc(option) === B.opening)

        return { answer: { type: ask.type, index: Math.max(0, summon) }, rule: 'branded.option.opening' }
      }
      return null
    }
    case 'select_unselect_card': {
      // Materiales de Fusión: lo tuyo primero, lo que menos vale después; con lo justo, termina.
      if (!FUSERS.has(current)) return null
      if (ask.can_finish && ask.unselect_cards.length > 0) return { answer: { type: ask.type, index: null }, rule: 'branded.material.done' }
      const index = ranked(ask.select_cards, (card) => materialScore(s, card, ask.unselect_cards))[0]

      if (index === undefined) return null
      const card = ask.select_cards[index]!

      return isMine(view, card) ? { answer: { type: ask.type, index }, rule: 'branded.material' } : { answer: { type: ask.type, index }, reason: reasonOf('play.fusionYours', current, card.code), rule: 'branded.material.yours' }
    }
    case 'select_card':
      break
    default:
      return null
  }

  const list = ask.selects
  const from = (location: number) => list.every((card) => (card.location & location) !== 0)
  const all = (codes: readonly number[]) => list.every((card) => codes.includes(card.code))
  const want = (prefer: readonly number[], rule: string, key?: string) => {
    const index = Math.max(0, firstOf(list, prefer))

    return one(index, rule, key ? reasonOf(key, current, picked(index)) : undefined)
  }

  if (list.every((card) => isMine(view, card))) {
    // Descartar (Opening, Lubellion, Albaz, Super Polymerization): lo que menos le sirve.
    if (from(LOC.HAND) && DISCARDERS.has(current)) {
      const index = ranked(list, (card) => -(DISCARD.indexOf(card.code) < 0 ? DISCARD.length / 2 : DISCARD.indexOf(card.code)))[0]!

      return one(index, `discard.${current}`, reasonOf('target.cost', current, picked(index)))
    }
    // Qué Fusiona.
    if (from(LOC.EXTRA) && FUSERS.has(current) && list.every((card) => isFusion(s, card.code))) {
      const index = Math.max(0, firstOf(list, FUSE[current]!))

      return one(index, `fuse.${current}`, reasonOf('play.fusion', current, picked(index)))
    }
    // Lo que manda del Extra Deck como costo.
    if (from(LOC.EXTRA) && COST_FROM_EXTRA.has(current)) return want(COST_EXTRA, `cost.${current}`, 'target.cost')
    if (from(LOC.DECK | LOC.GRAVE | LOC.EXTRA | LOC.HAND | LOC.REMOVED)) {
      switch (current) {
        case B.aluber: {
          const wants = [...(!inHand(view, B.fusion) && !s.done.has('fusion') ? [B.fusion] : []), B.virtuous, B.retribution, B.spirits, B.opening, B.fusion]

          return want(wants, 'search.aluber', 'play.search')
        }
        case B.opening:
          return want(!s.done.has(`trigger.${B.aluber}.0`) && !s.done.has('normal-aluber') ? [B.aluber, B.quem] : [B.quem, B.aluber], 'search.opening', 'play.search')
        case B.whiteDragon:
          return want([B.incredible, B.dogmatika], 'summon.whiteDragon', 'play.extraTo')
        case B.incredible:
          return want([B.albaz, B.whiteDragon], 'summon.incredible', 'play.extraTo')
        case B.nadir:
          return want(inHand(view, B.albaz) ? [B.dogmatika, B.albaz] : [B.albaz, B.dogmatika], 'search.nadir', 'play.search')
        case B.spirits:
          // High Spirits revela un monstruo de la mano (el que menos le sirve) y busca a Albaz.
          if (from(LOC.HAND)) return one(ranked(list, (card) => -Math.max(0, DISCARD.indexOf(card.code)))[0]!, 'reveal.spirits')
          return want(albazWants(s), 'search.spirits', 'play.search')
        case B.mercourier:
          return want(albazWants(s), 'search.mercourier', 'play.search')
        case B.titaniklad:
          return want([B.albaz, B.dogmatika, B.whiteDragon], 'search.titaniklad', 'play.search')
        case B.dogma:
          return from(LOC.DECK) ? want([B.virtuous, B.kitt, B.mercourier], 'search.dogma', 'play.search') : null
        case B.quaeritis:
          return want([B.albaz, B.aluber, B.quem, B.whiteDragon], 'search.quaeritis', 'play.search')
        case B.granguignol:
          return want([B.titaniklad, B.saronir, B.albion, B.dogma], 'send.granguignol')
        case B.quem:
          return want([B.albion, B.whiteDragon, B.cartesia, B.albaz, B.lubellion, B.mirrorjade], 'quem')
        case B.kitt:
          return want([B.albion, B.whiteDragon, B.albaz, B.cartesia, B.quem], 'revive.kitt')
        case B.saronir:
          return want([B.retribution, B.spirits, B.opening], 'send.saronir')
        case B.sarcophagus:
          return want([B.mercourier, ...(!inHand(view, B.fusion) ? [B.fusion] : []), B.albaz, B.whiteDragon], 'banish.sarcophagus')
        case B.retribution:
          // Recuperar: Branded Fusion primero. Negar: devolver dos Fusiones del cementerio antes que la del campo.
          if (from(LOC.GRAVE) && list.some((card) => card.code === B.fusion)) return want([B.fusion, B.opening, B.spirits, B.virtuous], 'recover.retribution', 'play.recover')
          if (from(LOC.GRAVE | LOC.MZONE)) {
            const indices = ranked(list, (card) => (card.location === LOC.GRAVE ? 1 : 0)).slice(0, Math.max(1, ask.min))

            return { answer: { type: ask.type, indices }, rule: 'branded.cost.retribution' }
          }
          break
        case B.albion: {
          // Del Deck (Albion vuelve al Deck y roba): Albaz al cementerio si tiene a Cartesia, que se Invoca con ella ahí.
          const prefer = inHand(view, B.cartesia) ? [B.albaz, B.whiteDragon, B.spirits] : [B.spirits, B.whiteDragon, B.albaz, B.retribution, B.opening]
          const index = Math.max(0, firstOf(list, prefer, (card) => card.location === LOC.DECK))

          return one(index, 'cost.albion', reasonOf('target.cost', current, picked(index)))
        }
        case B.champions:
          return want([B.cartesia, B.incredible, B.quem, B.dogmatika], 'search.champions', 'play.search')
        case B.darkDragon:
          return want([B.cartesia, B.quem, B.whiteDragon, B.albaz, B.kitt], 'summon.darkDragon', 'play.extraTo')
      }
      if (all([B.albaz, B.whiteDragon, B.albion, B.cartesia, B.quem, B.mercourier])) return want(albazWants(s), 'albaz')
    }
    // Materiales de Fusión en un `select_card`.
    if (FUSERS.has(current) && !from(LOC.EXTRA)) {
      const indices = ranked(list, (card) => materialScore(s, card)).slice(0, Math.max(1, ask.min))

      return { answer: { type: ask.type, indices }, rule: 'branded.material' }
    }
    return null
  }

  // Saronir destierra de un cementerio: lo tuyo; si no hay, lo suyo que menos le sirve.
  if (current === B.saronir && from(LOC.GRAVE)) {
    const index = ranked(list, (card) => (isMine(view, card) ? -Math.max(0, DISCARD.indexOf(card.code)) : 100))[0]!

    return one(index, 'target.saronir')
  }
  // Materiales de Fusión con tus monstruos (Albaz, Super Polymerization): los tuyos primero.
  if (FUSERS.has(current) && list.some((card) => !isMine(view, card))) {
    const indices = ranked(list, (card) => materialScore(s, card)).slice(0, Math.max(1, ask.min))

    return { answer: { type: ask.type, indices }, reason: reasonOf('play.fusionYours', current, ask.selects[indices[0]!]!.code), rule: 'branded.material.yours' }
  }
  // Lo que destruye, destierra o devuelve lo tuyo (The Fallen & The Virtuous, Mirrorjade, Aluber, Rindbrumm): al declarar un ataque, el atacante; si no, tu carta más peligrosa.
  if (REMOVERS.has(current) && ask.min <= 1) {
    if (current === B.dogma) {
      const indices = ranked(list, (card) => (isMine(view, card) ? -1 : 1)).slice(0, Math.max(ask.min, Math.min(ask.max, list.filter((card) => !isMine(view, card)).length)))

      return indices.length > 0 ? { answer: { type: ask.type, indices }, rule: 'branded.shuffle.dogma' } : null
    }
    const attack = (view.phase & PHASE.BATTLE) !== 0 ? lastAttack(view) : null
    const attacker = attack ? list.findIndex((card) => !isMine(view, card) && card.location === LOC.MZONE && card.code === attack.code) : -1
    const index = attacker >= 0 ? attacker : bestOfYours(s, list, (card) => card.location === LOC.MZONE || current === B.virtuous)

    if (index >= 0) {
      const key = current === B.mirrorjade ? 'target.banish' : current === B.aluber ? 'target.negate' : 'target.destroy'

      return one(index, `target.${current}`, reasonOf(key, current, picked(index)))
    }
  }
  return null
}

export const BRANDED_EXECUTOR: DeckExecutor = { plays: PLAYS, chain, choose }

/** El bot de Despia Branded: el ejecutor y, para lo que no decide, sus handtraps como el rival que juega su turno (`turnBot`). */
export function brandedBot(facts: (code: number) => CardFacts | undefined, aliasOf: (code: number) => number = () => 0, attributeOf?: (code: number) => number): Bot {
  const reacts = turnBot(HANDTRAPS, [], aliasOf, attributeOf, facts)
  // Sus Mágicas y Trampas tienen regla (`chain`): si no la usó, no era el momento, y no se cuenta como «no sé cuándo conviene».
  const fallback: Bot = (ask, view, context) => {
    const decision = reacts(ask, view, context)
    const held = decision.rule === 'handtrap.hold.noRule' ? (decision.reason?.cards?.[0] ?? 0) : 0

    return held && OWN.has(held) && !HANDTRAPS.includes(held) ? { answer: decision.answer, rule: 'branded.hold' } : decision
  }

  return executorBot(BRANDED_EXECUTOR, facts, fallback)
}
