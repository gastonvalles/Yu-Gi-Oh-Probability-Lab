import type { TurnRule } from '../../handtraps'
import { passiveAnswer, ruleOf, tributePick, turnRuleOf } from '../policies'
import type { AskOf, CardLoc, CoreAsk } from '../protocol'
import type { Bot, BotCard, BotDecision, BotReason, BotView } from './bot'
import { handtrapBot } from './rivals'

/**
 * «El rival juega su turno» (beta): el rival de handtraps que además juega su Main Phase y su Battle Phase con lo que le ofrece el núcleo (que ya filtra lo legal). Decide sólo con su
 * vista (`BotView`) y con los datos impresos de las cartas (`factsOf`, del `.cdb`: lo sabe cualquiera que lea la carta). En cada `select_idlecmd`, la primera que conviene de:
 * 1. traer a Ra con Sphere Mode que volvió a su campo (si el núcleo se lo ofrece, tiene a Ra en la mano o el Deck);
 * 2. un barrido (`sweepMonsters` / `sweepSpells`) si se lleva al menos una carta tuya (el bot no tiene un plan donde valga más después y abre el ataque directo);
 * 3. las que Tributan tus monstruos, de la que más te saca a la que menos: Sphere Mode (3, con su campo vacío), Gallant Bandit con 2 de los tuyos, Lava Golem (2; antes de la
 *    Invocación Normal, porque después ya no se puede) y Gallant Bandit con uno tuyo y relleno de su mano (sólo con su relleno, no: se juega para sacarte monstruos);
 * 4. Invocar de modo Normal su monstruo de más ATK (sin Tributar salvo que el nuevo valga más), o colocarlo si tenés uno boca arriba con más ATK;
 * 5. colocar sus negaciones (`counter`);
 * 6. la Battle Phase si tiene un ataque seguro: directo sin monstruos tuyos, o contra uno boca arriba que destruye sin perder el suyo (ATK contra ATK o DEF). Lo boca abajo no lo ataca;
 * 7. terminar el turno.
 * Los Tributos que elige: tus monstruos de más ATK primero (boca abajo, al final), después lo suyo de menos valor, y nunca primero una handtrap con regla. En tus turnos responde como el de
 * handtraps; además niega con sus `counter` colocadas (contra tu eslabón o tu Invocación) y usa los dos efectos de Gallant Bandit. Un tope de `MAX_IDLE` jugadas por turno evita
 * un turno eterno; el núcleo rechaza lo ilegal y la sesión contesta entonces con la de reserva.
 */

/** Lo impreso de una carta (`.cdb`): `type` con los bits del núcleo (`TYPE_MONSTER` 0x1). */
export interface CardFacts {
  type: number
  attack: number
  defense: number
  level: number
}

const HAND = 0x02
const MZONE = 0x04
const SZONE = 0x08
const MONSTER = 0x1
/** `PHASE_BATTLE_START` … `PHASE_BATTLE` (como en `policies.ts`). */
const BATTLE_PHASES = 0x08 | 0x10 | 0x20 | 0x40 | 0x80
const RA = 10000010
/** Las jugadas de `select_idlecmd` de un turno que el bot contesta como mucho: pasado el tope, termina el turno. ponytail: un tope fijo; si un mazo de verdad juega más, se sube. */
export const MAX_IDLE = 30

type Pending = { play: TurnRule | 'summon' } | { play: 'attack'; attacker: number; target: number }
type IdleAsk = AskOf<'select_idlecmd'>

const NO_FACTS = () => undefined

export function turnBot(priority: readonly number[], extra: readonly number[] = [], aliasOf: (code: number) => number = () => 0, attributeOf?: (code: number) => number, factsOf: (code: number) => CardFacts | undefined = NO_FACTS): Bot {
  const reacts = handtrapBot(priority, extra, aliasOf, attributeOf)
  const turnRule = (code: number) => turnRuleOf(code, aliasOf)
  /** Lo que no conviene gastar como Tributo ni Invocar de relleno: lo que el bot usa con una regla. */
  const keeps = (code: number) => ruleOf(code, aliasOf) !== undefined || turnRule(code) !== undefined
  const atkOf = (card: Pick<BotCard, 'code' | 'stats'> | null | undefined) => card?.stats?.attack ?? factsOf(card?.code ?? 0)?.attack ?? 0
  /** Lo que vale uno de tus monstruos para sacártelo: su ATK si está boca arriba; boca abajo no se sabe (al final). */
  const worth = (card: BotCard | null | undefined) => (card && card.code !== 0 && card.pos !== 'set' ? atkOf(card) : -1)
  let pending: Pending | null = null
  let idle = { turn: -1, history: 0, count: 0 }

  /** La carta de la vista en ese lugar del campo (tuya o suya). */
  const onField = (view: BotView, card: CardLoc) => (card.location === MZONE ? (card.controller === view.seat ? view.me : view.them).monsters[card.sequence] : undefined) ?? null

  /** El mejor ataque seguro: directo sin monstruos tuyos, o contra el tuyo boca arriba de más ATK que destruye sin perder el suyo. */
  function bestAttack(view: BotView, attackers: readonly { atk: number; code: number; direct: boolean }[]) {
    const yours = view.them.monsters.filter((card): card is BotCard => card !== null)
    let best: { i: number; target: number | null; value: number } | null = null

    attackers.forEach((attacker, i) => {
      if (yours.length === 0) {
        if (attacker.direct && (!best || attacker.atk > best.value)) best = { i, target: null, value: attacker.atk }
        return
      }
      view.them.monsters.forEach((card, sequence) => {
        if (!card || card.code === 0 || card.pos === 'set' || !card.stats) return
        const safe = card.pos === 'atk' ? card.stats.attack < attacker.atk : card.stats.defense < attacker.atk

        if (safe && (!best || (best.target !== null && card.stats.attack > best.value))) best = { i, target: sequence, value: card.stats.attack }
      })
    })

    return best as { i: number; target: number | null; value: number } | null
  }

  /** Sus monstruos boca arriba en ataque (los que pueden atacar). */
  const attackersOf = (view: BotView) => view.me.monsters.filter((card): card is BotCard => card !== null && card.pos === 'atk').map((card) => ({ atk: atkOf(card), code: card.code, direct: true }))

  /** Terminar el turno, y por qué: sin ataque seguro teniendo con qué atacar, o porque no le queda nada que convenga. */
  function end(view: BotView, answer: BotDecision['answer']): BotDecision {
    const attackers = attackersOf(view)
    const yours = view.them.monsters.filter((card): card is BotCard => card !== null)

    pending = null
    if (view.turn > 1 && attackers.length > 0 && yours.length > 0 && !bestAttack(view, attackers)) {
      const strongest = attackers.reduce((top, card) => (card.atk > top.atk ? card : top))
      const threat = yours.reduce((top, card) => (worth(card) > worth(top) ? card : top))

      if (worth(threat) < 0) return { answer, reason: { key: 'auto.bot.reason.end.faceDown', cards: [strongest.code] }, rule: 'turn.end.faceDown' }
      return { answer, reason: { key: 'auto.bot.reason.end.noSafeAttack', cards: [strongest.code, threat.code] }, rule: 'turn.end.noSafeAttack' }
    }
    return { answer, reason: { key: 'auto.bot.reason.end.done' }, rule: 'turn.end' }
  }

  function idleTurn(ask: IdleAsk, view: BotView): BotDecision {
    if (view.turn !== idle.turn || view.history.length < idle.history) idle = { turn: view.turn, history: 0, count: 0 }
    idle.history = view.history.length
    idle.count += 1
    const play = (action: number, index: number, reason: BotReason, rule: string, next: Pending | null = null): BotDecision => {
      pending = next
      return { answer: { type: ask.type, action, index }, reason, rule }
    }
    const find = (list: readonly CardLoc[], test: (card: CardLoc) => boolean) => list.findIndex(test)
    const yours = view.them.monsters.filter((card): card is BotCard => card !== null)
    const own = view.me.monsters.filter((card): card is BotCard => card !== null)

    if (idle.count > MAX_IDLE) return ask.to_ep ? end(view, { type: ask.type, action: 7, index: null }) : { answer: passiveAnswer(ask, () => 0) }

    // 1. Sphere Mode volvió: Tributarla trae a Ra (el núcleo la ofrece sólo con Ra en la mano o el Deck).
    const sphere = find(ask.activates, (card) => card.location === MZONE && turnRule(card.code) === 'sphere')

    if (sphere >= 0) return play(5, sphere, { key: 'auto.bot.reason.play.ra', cards: [ask.activates[sphere]!.code, RA] }, 'turn.ra')

    // 2. Un barrido que se lleva algo tuyo (los de monstruos, con más tuyos que suyos: Dark Hole también se lleva los suyos).
    const yourSpells = view.them.spells.filter((card) => card !== null).length

    for (const [i, card] of ask.activates.entries()) {
      const rule = card.location === HAND || card.location === SZONE ? turnRule(card.code) : undefined
      const hits = rule === 'sweepMonsters' && yours.length > own.length ? yours.length : rule === 'sweepSpells' ? yourSpells : 0

      if (hits > 0) return play(5, i, { key: 'auto.bot.reason.play.sweep', cards: [card.code], params: { count: hits } }, `turn.sweep`)
    }

    // 3. Lo que Tributa tus monstruos, de lo que más te saca a lo que menos.
    const fodder = view.me.hand.filter((card) => card.code !== 0 && ((factsOf(card.code)?.type ?? 0) & MONSTER) !== 0 && !keeps(card.code))
    const sphereSummon = own.length === 0 && yours.length >= 3 ? find(ask.summons, (card) => turnRule(card.code) === 'sphere') : -1
    const bandit = find(ask.summons, (card) => turnRule(card.code) === 'bandit')
    const golem = find(ask.special_summons, (card) => turnRule(card.code) === 'golem')

    if (sphereSummon >= 0) return play(0, sphereSummon, { key: 'auto.bot.reason.play.sphere', cards: [ask.summons[sphereSummon]!.code] }, 'turn.sphere', { play: 'sphere' })
    if (bandit >= 0 && yours.length >= 2) return play(0, bandit, { key: 'auto.bot.reason.play.bandit', cards: [ask.summons[bandit]!.code] }, 'turn.bandit', { play: 'bandit' })
    if (golem >= 0) return play(1, golem, { key: 'auto.bot.reason.play.golem', cards: [ask.special_summons[golem]!.code] }, 'turn.golem', { play: 'golem' })
    if (bandit >= 0 && yours.length >= 1 && yours.length + fodder.length >= 2) return play(0, bandit, { key: 'auto.bot.reason.play.bandit', cards: [ask.summons[bandit]!.code] }, 'turn.bandit', { play: 'bandit' })

    // 4. Su monstruo de más ATK: sin Tributar, o Tributando lo suyo de menos ATK si el nuevo vale más.
    const cheapest = own.map(atkOf).sort((a, b) => a - b)
    const best = ask.summons
      .map((card, index) => ({ card, index, facts: factsOf(card.code) }))
      .filter(({ card, facts }) => {
        if (!facts || (facts.type & MONSTER) === 0 || keeps(card.code)) return false
        const need = facts.level >= 7 ? 2 : facts.level >= 5 ? 1 : 0

        return need === 0 || (cheapest.length >= need && cheapest.slice(0, need).reduce((sum, atk) => sum + atk, 0) < facts.attack)
      })
      .reduce<{ card: CardLoc; index: number; facts: CardFacts | undefined } | null>((top, item) => (!top || item.facts!.attack > top.facts!.attack ? item : top), null)

    if (best) {
      const threat = yours.filter((card) => card.pos === 'atk' && card.code !== 0).reduce<BotCard | null>((top, card) => (!top || atkOf(card) > atkOf(top) ? card : top), null)
      const set = threat && atkOf(threat) > best.facts!.attack ? find(ask.monster_sets, (card) => card.code === best.card.code) : -1

      if (set >= 0) return play(3, set, { key: 'auto.bot.reason.play.set', cards: [best.card.code, threat!.code] }, 'turn.set')
      return play(0, best.index, { key: 'auto.bot.reason.play.summon', cards: [best.card.code] }, 'turn.summon', { play: 'summon' })
    }

    // 5. Sus negaciones, colocadas.
    const counter = find(ask.spell_sets, (card) => turnRule(card.code) === 'counter')

    if (counter >= 0) return play(4, counter, { key: 'auto.bot.reason.play.setCounter', cards: [ask.spell_sets[counter]!.code] }, 'turn.setCounter')

    // 6. La Battle Phase, si tiene un ataque seguro.
    if (ask.to_bp && bestAttack(view, attackersOf(view))) {
      pending = null
      return { answer: { type: ask.type, action: 6, index: null }, rule: 'turn.battle' }
    }

    // 7. Terminar.
    return ask.to_ep ? end(view, { type: ask.type, action: 7, index: null }) : { answer: passiveAnswer(ask, () => 0) }
  }

  function battle(ask: AskOf<'select_battlecmd'>, view: BotView): BotDecision {
    const attack = bestAttack(
      view,
      ask.attacks.map((card) => ({ atk: atkOf(onField(view, card)), code: card.code, direct: card.can_direct })),
    )

    if (attack) {
      const attacker = ask.attacks[attack.i]!

      if (attack.target === null) {
        pending = null
        return { answer: { type: ask.type, action: 1, index: attack.i }, reason: { key: 'auto.bot.reason.battle.direct', cards: [attacker.code] }, rule: 'turn.attack.direct' }
      }
      // El objetivo lo pregunta el núcleo después (`select_card`): el motivo va ahí, con las dos cartas.
      pending = { play: 'attack', attacker: attacker.code, target: attack.target }
      return { answer: { type: ask.type, action: 1, index: attack.i }, rule: 'turn.attack' }
    }

    return end(view, { type: ask.type, action: ask.to_ep ? 3 : 2, index: null })
  }

  /** El orden de preferencia para Tributar: tus monstruos de más valor; después lo suyo, lo de menos ATK primero y lo que usa con una regla al final. */
  const tributeOrder = (view: BotView, cards: readonly CardLoc[]) => {
    const rank = (card: CardLoc) => (card.controller !== view.seat ? [0, -worth(onField(view, card))] : [keeps(card.code) ? 2 : 1, atkOf(onField(view, card) ?? card)])

    return cards.map((_, i) => i).sort((a, b) => {
      const [x, y] = [rank(cards[a]!), rank(cards[b]!)]

      return x[0]! - y[0]! || x[1]! - y[1]! || a - b
    })
  }
  /** El motivo de Tributar uno de tus monstruos boca arriba (lo boca abajo no lo nombra). */
  const tributeReason = (view: BotView, card: CardLoc | undefined): Pick<BotDecision, 'reason' | 'rule'> => {
    const seen = card && card.controller !== view.seat ? onField(view, card) : null

    return seen && seen.code !== 0 && seen.pos !== 'set' ? { reason: { key: 'auto.bot.reason.target.threat', cards: [seen.code] }, rule: 'turn.tribute' } : { rule: 'turn.tribute' }
  }

  return (ask: CoreAsk, view: BotView, context) => {
    const mine = view.turnPlayer === 'me'

    if (mine && ask.type === 'select_idlecmd') return idleTurn(ask, view)
    if (mine && ask.type === 'select_battlecmd') return battle(ask, view)
    if (mine && ask.type === 'select_tribute' && pending && pending.play !== 'attack') {
      const indices = tributePick(ask, tributeOrder(view, ask.selects), () => false)

      return { answer: { type: ask.type, indices }, ...tributeReason(view, ask.selects[indices[0]!]) }
    }
    if (mine && ask.type === 'select_unselect_card' && pending && (pending.play === 'golem' || pending.play === 'bandit') && !ask.can_finish && ask.select_cards.length > 0) {
      const index = tributeOrder(view, ask.select_cards)[0]!

      return { answer: { type: ask.type, index }, ...tributeReason(view, ask.select_cards[index]) }
    }
    if (mine && ask.type === 'select_card' && pending?.play === 'attack') {
      const { attacker, target } = pending
      const index = ask.selects.findIndex((card) => card.controller !== view.seat && card.location === MZONE && card.sequence === target)

      pending = null
      if (index >= 0) return { answer: { type: ask.type, indices: [index] }, reason: { key: 'auto.bot.reason.battle.safe', cards: [attacker, view.them.monsters[target]?.code ?? 0] }, rule: 'turn.attack.safe' }
    }

    const decision = reacts(ask, view, context)

    if (ask.type !== 'select_chain' || ask.forced || decision.answer.type !== 'select_chain' || decision.answer.index !== null) return decision
    // Lo de su campo: sus negaciones colocadas y los dos efectos de Gallant Bandit (`n` del `desc`: 1 niega, 2 te pasa a defensa en tu Battle Phase).
    const top = view.chain.at(-1)
    const yours = top?.card?.ref.side === 'theirs' && top.state === 'chained'

    for (const [index, card] of ask.selects.entries()) {
      const rule = card.location === MZONE || card.location === SZONE ? turnRule(card.code) : undefined
      const n = Number(BigInt(card.description) & 0xfffffn)
      const use = (reason: BotReason, id: string): BotDecision => ({ answer: { type: ask.type, index }, reason, rule: id })

      if (rule === 'counter' && yours) return use({ key: 'auto.bot.reason.handtrap.respond', cards: [card.code, top.code] }, 'turn.counter')
      if (rule === 'counter' && !mine && view.chain.length === 0) return use({ key: 'auto.bot.reason.play.counterSummon', cards: [card.code] }, 'turn.counter.summon')
      if (rule === 'bandit' && n === 1 && yours) return use({ key: 'auto.bot.reason.handtrap.respond', cards: [card.code, top.code] }, 'turn.bandit.negate')
      if (rule === 'bandit' && n === 2 && !mine && view.chain.length === 0 && (view.phase & BATTLE_PHASES) !== 0 && view.them.monsters.some((monster) => monster?.pos === 'atk')) {
        return use({ key: 'auto.bot.reason.play.banditDefense', cards: [card.code] }, 'turn.bandit.defense')
      }
    }
    return decision
  }
}
