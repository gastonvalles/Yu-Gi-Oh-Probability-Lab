import { applyLocale, loadLocale, t } from '../i18n'
import type { CardRef, Side } from '../app/auto/adapter'
import { askView, effectAskText, itemsInto, listOrder, namesList, openAsk, pickStatsOf, pickTitle, placeLabel, respondOffer, step, type AskCard, type CardPick, type AskContext, type AskGesture, type AskQueries, type AskState } from '../app/auto/ask-ui'
import { ASK_SHAPES, LOCATION as L, parseAnswer, type CoreAnswer, type CoreAsk, type Seat } from '../app/auto/protocol'
import { createMatState, listCardActions, TOKEN_KIND, type MatCardKind, type MatPile, type MatPos, type MatState } from '../app/practice-mat'
import { PLAY_PLACE, inMenuBlocks, menuPlaceOf } from '../app/mat-menu-order'
import { gesturesOf, legal, playAsk, seeded } from './support/ask-ui-player'

/** Una carta de la mesa falsa: de qué lado, dónde la tiene el núcleo y (en el campo) en qué posición. */
interface Spot {
  side: Side
  id: string
  code: number
  location: number
  sequence: number
  pos?: MatPos
  overlay?: number
}

const PILE: Partial<Record<number, MatPile>> = { [L.DECK]: 'deck', [L.HAND]: 'hand', [L.GRAVE]: 'gy', [L.REMOVED]: 'banished', [L.EXTRA]: 'extra' }

/** El adaptador falso: las dos mesas y `idAt` / `codeOf` sobre la lista. Con `bag`, el deck es una bolsa: `idAt` da siempre la de arriba. */
function mesa(cards: Spot[], { bag = false, seat = 0 as Seat } = {}): AskQueries {
  const states: Record<Side, MatState> = { mine: createMatState([], [], 0), theirs: createMatState([], [], 0) }

  for (const card of cards) {
    const state = states[card.side]
    const placed = { id: card.id, pos: card.pos ?? 'atk', counters: 0, materials: [] }

    if (card.overlay !== undefined) continue
    if (card.location === L.MZONE) (card.sequence < 5 ? state.mz : state.emz)[card.sequence % 5] = placed
    else if (card.location === L.SZONE) {
      if (card.sequence < 5) state.st[card.sequence] = placed
      else state.field = placed
    } else state[PILE[card.location]!].push(card.id)
  }
  const sideOf = (controller: Seat): Side => (controller === seat ? 'mine' : 'theirs')

  return {
    mine: states.mine,
    theirs: { state: states.theirs },
    idAt: (place) => {
      const side = sideOf(place.controller)

      if (bag && place.location === L.DECK) return states[side].deck.at(-1) ?? null
      return cards.find((card) => card.side === side && card.location === place.location && card.sequence === place.sequence && card.overlay === place.overlay_sequence)?.id ?? null
    },
    codeOf: (ref) => cards.find((card) => card.side === ref.side && card.id === ref.id)?.code ?? 0,
  }
}

const SPELL = 0x2
const ctx = (queries: AskQueries, extra: Partial<AskContext> = {}): AskContext => ({ queries, prefs: { chainMode: 'ask', placeMode: 'ask' }, typeOf: (code) => (code >= 900 ? SPELL : 1), ...extra })
const open = (ask: CoreAsk, context: AskContext, askId = 7) => openAsk({ askId, ask, title: '500' }, context)
/** Toca en orden; devuelve el último estado y la respuesta, si la hubo. */
function tap(state: AskState, ...gestures: AskGesture[]): { state: AskState; answer?: CoreAnswer } {
  let result: { state: AskState; answer?: CoreAnswer } = { state }

  for (const gesture of gestures) {
    expect(result.answer).toBeUndefined()
    result = step(result.state, gesture)
  }

  return result
}
const mine = (id: string): CardRef => ({ side: 'mine', id })
const loc = (code: number, location: number, sequence: number, controller: Seat = 0) => ({ code, controller, location, sequence })
const pos = (code: number, location: number, sequence: number, position: number, controller: Seat = 0) => ({ ...loc(code, location, sequence, controller), position })
const act = (code: number, location: number, sequence: number, description = '0') => ({ ...loc(code, location, sequence), description, client_mode: 0 })
/** El `desc` de un texto de una carta, como lo arma `aux.Stringid(code, n)` en los scripts. */
const stringId = (code: number, n: number) => String((BigInt(code) << 20n) | BigInt(n))

// Mi mano: 100 (monstruo), 900 (Mágica), 300 (Péndulo); mi campo: 200 en ataque (mz 0), 201 boca abajo (mz 1), 202 en defensa (mz 2), 950 una Trampa colocada (st 1), 960 la escala (st 0);
// mi cementerio: 400; mi Extra: 500. El rival: 700 en su mz 0 y una colocada (st 2).
const CARDS: Spot[] = [
  { side: 'mine', id: 'card-100-1', code: 100, location: L.HAND, sequence: 0 },
  { side: 'mine', id: 'card-900-1', code: 900, location: L.HAND, sequence: 1 },
  { side: 'mine', id: 'card-300-1', code: 300, location: L.HAND, sequence: 2 },
  { side: 'mine', id: 'card-200-1', code: 200, location: L.MZONE, sequence: 0, pos: 'atk' },
  { side: 'mine', id: 'card-201-1', code: 201, location: L.MZONE, sequence: 1, pos: 'set' },
  { side: 'mine', id: 'card-202-1', code: 202, location: L.MZONE, sequence: 2, pos: 'def' },
  { side: 'mine', id: 'card-950-1', code: 950, location: L.SZONE, sequence: 1, pos: 'set' },
  { side: 'mine', id: 'card-960-1', code: 960, location: L.SZONE, sequence: 0, pos: 'atk' },
  { side: 'mine', id: 'card-400-1', code: 400, location: L.GRAVE, sequence: 0 },
  { side: 'mine', id: 'card-500-1', code: 500, location: L.EXTRA, sequence: 0 },
  { side: 'theirs', id: 'c1', code: 700, location: L.MZONE, sequence: 0, pos: 'atk' },
  { side: 'theirs', id: 'c2', code: 0, location: L.SZONE, sequence: 2, pos: 'set' },
]
const MESA = mesa(CARDS)

/** Una pregunta de cada uno de los 21 tipos, sobre la mesa de arriba. */
const ASKS: CoreAsk[] = [
  { type: 'select_battlecmd', player: 0, chains: [act(200, L.MZONE, 0)], attacks: [{ ...loc(200, L.MZONE, 0), can_direct: false }], to_m2: true, to_ep: true },
  {
    type: 'select_idlecmd',
    player: 0,
    summons: [loc(100, L.HAND, 0)],
    special_summons: [loc(500, L.EXTRA, 0), loc(960, L.SZONE, 0)],
    pos_changes: [loc(200, L.MZONE, 0), loc(201, L.MZONE, 1), loc(202, L.MZONE, 2)],
    monster_sets: [loc(100, L.HAND, 0)],
    spell_sets: [loc(900, L.HAND, 1)],
    activates: [act(900, L.HAND, 1), act(950, L.SZONE, 1), act(400, L.GRAVE, 0, stringId(400, 1)), act(400, L.GRAVE, 0, stringId(400, 2)), act(300, L.HAND, 2, '1160')],
    to_bp: true,
    to_ep: true,
    shuffle: true,
  },
  { type: 'select_effectyn', player: 0, ...pos(400, L.GRAVE, 0, 5), description: stringId(400, 0) },
  { type: 'select_yesno', player: 0, description: '31' },
  { type: 'select_option', player: 0, options: [stringId(400, 0), stringId(400, 1), '573'] },
  { type: 'select_card', player: 0, can_cancel: true, min: 1, max: 2, selects: [pos(100, L.HAND, 0, 10), pos(200, L.MZONE, 0, 1), pos(700, L.MZONE, 0, 1, 1)] },
  { type: 'select_chain', player: 0, spe_count: 1, forced: false, hint_timing: 0, hint_timing_other: 0, selects: [{ ...pos(950, L.SZONE, 1, 10), description: '0', client_mode: 0 }] },
  { type: 'select_place', player: 0, count: 1, field_mask: ~(0b11 | (1 << 5) | (1 << 13)) >>> 0 },
  { type: 'select_position', player: 0, code: 100, positions: 1 | 4 | 8 },
  { type: 'select_tribute', player: 0, can_cancel: true, min: 2, max: 2, selects: [{ ...loc(200, L.MZONE, 0), release_param: 1 }, { ...loc(201, L.MZONE, 1), release_param: 1 }, { ...loc(202, L.MZONE, 2), release_param: 2 }] },
  { type: 'sort_chain', player: 0, cards: [loc(200, L.MZONE, 0), loc(950, L.SZONE, 1)] },
  { type: 'select_counter', player: 0, counter_type: 1, count: 3, cards: [{ ...loc(200, L.MZONE, 0), count: 1 }, { ...loc(960, L.SZONE, 0), count: 5 }] },
  {
    type: 'select_sum',
    player: 0,
    select_max: 0,
    amount: 8,
    min: 1,
    max: 3,
    selects_must: [{ ...loc(202, L.MZONE, 2), amount: 2 }],
    selects: [{ ...loc(200, L.MZONE, 0), amount: 4 }, { ...loc(201, L.MZONE, 1), amount: 3 }, { ...loc(100, L.HAND, 0), amount: 0x10002 }, { ...loc(500, L.EXTRA, 0), amount: 7 }],
  },
  { type: 'select_disfield', player: 0, count: 1, field_mask: 0xff_ff_ff_fe },
  { type: 'sort_card', player: 0, cards: [loc(100, L.HAND, 0), loc(900, L.HAND, 1), loc(300, L.HAND, 2)] },
  { type: 'select_unselect_card', player: 0, can_finish: true, can_cancel: false, min: 1, max: 3, select_cards: [pos(100, L.HAND, 0, 10), pos(400, L.GRAVE, 0, 5)], unselect_cards: [pos(200, L.MZONE, 0, 1)] },
  { type: 'announce_race', player: 0, count: 2, available: String((1n << 40n) | 4n | 1n) },
  { type: 'announce_attrib', player: 0, count: 1, available: 0b0110010 },
  { type: 'announce_card', player: 0, opcodes: ['46986414', '1073741840'], cards: [46986414, 89631139] },
  { type: 'announce_number', player: 0, options: ['1', '2', '4'] },
  { type: 'rock_paper_scissors', player: 0 },
]


describe('namesList: los nombres de una línea del registro', () => {
  it('junta las copias de la misma carta con cuántas son y respeta el orden en que aparecen', () => {
    expect(namesList(['Kirin', 'Ponix', 'Kirin', 'Kirin'])).toBe('Kirin ×3, Ponix')
    expect(namesList(['Ponix'])).toBe('Ponix')
    expect(namesList([])).toBe('')
  })
})

describe('listOrder: una lista de candidatas no regala el orden del deck', () => {
  // El nombre de cada carta es su código en esta lista: `NAMES[code]`.
  const shown = (names: readonly string[], cards: readonly AskCard[]) => listOrder(cards, (card) => names[card.code]!).map((i) => names[cards[i]!.code]!)
  const card = (code: number, place: AskCard['place'], pile?: MatPile): AskCard => ({ ref: null, code, place, ...(pile ? { pile } : {}) })

  it('las del deck (tuyo o del rival) van por nombre en los lugares que ocupaban; el resto, donde estaba', () => {
    const names = ['Zeta', 'Mima', 'Alfa', 'Beta', 'Zulú', 'Dos']
    const cards = [card(0, 'hand'), card(1, 'pile', 'deck'), card(2, 'pile', 'deck'), card(3, 'pile', 'gy'), card(4, 'none', 'deck'), card(5, 'field')]

    expect(listOrder(cards, (c) => names[c.code]!)).toEqual([0, 2, 1, 3, 4, 5])
    expect(shown(names, cards)).toEqual(['Zeta', 'Alfa', 'Mima', 'Beta', 'Zulú', 'Dos'])
  })

  it('es una permutación (la respuesta sigue siendo el índice del núcleo) y no depende del orden en que llegan las del deck', () => {
    const names = ['Ceres', 'Argos', 'Bruma', 'Argos']
    const deck = names.map((_, code) => card(code, 'pile', 'deck'))

    expect([...listOrder(deck, (c) => names[c.code]!)].sort()).toEqual([0, 1, 2, 3])
    expect(shown(names, deck)).toEqual(['Argos', 'Argos', 'Bruma', 'Ceres'])
    expect(shown(names, [...deck].reverse())).toEqual(shown(names, deck))
  })

  it('sin cartas del deck no cambia nada', () => {
    const names = ['Zeta', 'Alfa', 'Beta']
    const cards = [card(0, 'hand'), card(1, 'pile', 'gy'), card(2, 'material')]

    expect(listOrder(cards, (c) => names[c.code]!)).toEqual([0, 1, 2])
  })
})

describe('ask-ui: las 21 preguntas del núcleo en la mesa de siempre', () => {
  it('cada tipo tiene su gesto: tocando al azar lo ofrecido, siempre llega una respuesta que el núcleo acepta, y ningún toque ofrecido queda muerto', () => {
    expect(new Set(ASKS.map((ask) => ask.type))).toEqual(new Set(Object.keys(ASK_SHAPES)))

    for (const ask of ASKS) {
      const random = seeded(ask.type.length)
      const context = ctx(MESA)

      for (let run = 0; run < 60; run += 1) {
        const played = playAsk(open(ask, context), random)

        expect({ type: ask.type, stuck: played.stuck, dead: played.dead }).toEqual({ type: ask.type, stuck: false, dead: 0 })
        expect(parseAnswer(played.answer)).toEqual(played.answer)
        expect(legal(ask, played.answer!)).toBe(true)
        expect(played.auto?.why).not.toBe('none')
      }
    }
  })

  it('las jugadas del turno: cada carta con sus palabras de siempre, «¿cuál efecto?» en un segundo paso, todo lo legal a un toque (menos barajar la mano) y sólo brilla lo que se activa', () => {
    const view = askView(open(ASKS[1]!, ctx(MESA)))
    const labels = (id: string) => view.items.get(id)?.map((item) => item.label)

    expect(labels('card-100-1')).toEqual([t('practice.menu.normalSummon'), t('practice.menu.set')])
    expect(labels('card-900-1')).toEqual([t('practice.menu.activate'), t('practice.menu.set')])
    expect(labels('card-300-1')).toEqual([t('practice.menu.asScale')])
    expect(labels('card-500-1')).toEqual([t('practice.menu.specialSummon')])
    expect(labels('card-960-1')).toEqual([t('practice.menu.pendulumSummon')])
    expect(labels('card-200-1')).toEqual([t('practice.menu.toDefense')])
    expect(labels('card-201-1')).toEqual([t('practice.menu.flipSummon')])
    expect(labels('card-202-1')).toEqual([t('practice.menu.toAttack')])
    expect(labels('card-950-1')).toEqual([t('practice.menu.activate')])
    // Dos efectos del cementerio: una sola opción que pregunta cuál; sin texto, cada uno con la palabra de su activación (sin un número que no es el de la carta).
    const [grave] = view.items.get('card-400-1')!

    expect(grave).toMatchObject({ label: t('practice.menu.activateEffect') })
    expect(grave!.answer).toBeUndefined()
    expect(grave!.children?.map((child) => [child.label, child.answer])).toEqual([
      [t('practice.menu.activateEffect'), { type: 'select_idlecmd', action: 5, index: 2 }],
      [t('practice.menu.activateEffect'), { type: 'select_idlecmd', action: 5, index: 3 }],
    ])
    // Lo que el núcleo acepta, menos barajar la mano (la mesa no la ofrece), está a un toque.
    const offered = new Set(gesturesOf(view).map((gesture) => JSON.stringify(gesture.kind === 'item' ? gesture.answer : null)))
    const lists = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'] as const
    const ask = ASKS[1] as Extract<CoreAsk, { type: 'select_idlecmd' }>
    const legalOnes = [...lists.flatMap((key, action) => ask[key].map((_, index) => ({ type: ask.type, action, index }))), { type: ask.type, action: 6, index: null }, { type: ask.type, action: 7, index: null }]

    expect(legalOnes.filter((answer) => !offered.has(JSON.stringify(answer)))).toEqual([])
    // Brilla lo que se invoca de forma especial (también por Péndulo) y lo que se activa (la Mágica, la Trampa colocada, los efectos del cementerio, la escala); lo que sólo se invoca de forma
    // normal, se coloca o cambia de posición, no.
    expect(view.respond).toEqual(['card-500-1', 'card-960-1', 'card-900-1', 'card-950-1', 'card-400-1', 'card-300-1'].map(mine))
    // La frase de cada efecto la pone la pantalla (la costura); nunca queda vacía.
    const named = askView(open(ASKS[1]!, ctx(MESA, { effectLabel: (code, description) => (description === stringId(400, 1) ? `${code}:1` : '') })))

    expect(named.items.get('card-400-1')![0]!.children!.map((child) => child.label)).toEqual(['400:1', t('practice.menu.activateEffect')])
    // Sin texto, la escala de un Péndulo dice «Activar como escala» también entre otros efectos.
    const pendulum = { ...(ASKS[1] as Extract<CoreAsk, { type: 'select_idlecmd' }>), activates: [act(300, L.HAND, 2, stringId(300, 0)), act(300, L.HAND, 2, '1160')] }

    expect(askView(open(pendulum, ctx(MESA))).items.get('card-300-1')![0]!.children!.map((child) => child.label)).toEqual([t('practice.menu.activateEffect'), t('practice.menu.asScale')])
  })

  it('el mismo efecto dos veces (un disparo por cada Juego Rápido de la cadena) es una sola fila, la primera; dos efectos distintos de la carta siguen siendo dos', () => {
    const chain = (descriptions: string[]): CoreAsk => ({
      type: 'select_chain',
      player: 0,
      spe_count: 1,
      forced: false,
      hint_timing: 0,
      hint_timing_other: 0,
      selects: descriptions.map((description) => ({ ...pos(200, L.MZONE, 0, 1), description, client_mode: 0 })),
    })
    const once = askView(open(chain([stringId(200, 2), stringId(200, 2)]), ctx(MESA))).items.get('card-200-1')!

    expect(once.map((item) => [item.children, item.answer])).toEqual([[undefined, { type: 'select_chain', index: 0 }]])
    const two = askView(open(chain([stringId(200, 2), stringId(200, 1), stringId(200, 2)]), ctx(MESA))).items.get('card-200-1')!

    expect(two[0]!.children!.map((child) => child.answer)).toEqual([0, 1].map((index) => ({ type: 'select_chain', index })))
    // Dos efectos sin texto propio (descripción 0) no se pueden distinguir: ninguno se pierde.
    const bare = askView(open(chain(['0', '0']), ctx(MESA))).items.get('card-200-1')!

    expect(bare[0]!.children!.map((child) => child.answer)).toEqual([0, 1].map((index) => ({ type: 'select_chain', index })))
  })

  it('las fases: Battle Phase y End Phase en Main 1; Main Phase 2 y End Phase en batalla; la de ahora marcada y las demás apagadas; terminar el turno es la End Phase', () => {
    const idle = askView(open(ASKS[1]!, ctx(MESA, { phase: 'main1' })))

    expect(idle.phaseItems.map((item) => [item.label, item.current ?? false, item.disabled ?? false, item.answer?.type === 'select_idlecmd' ? item.answer.action : null])).toEqual([
      ['Draw Phase', false, true, null],
      ['Standby Phase', false, true, null],
      ['Main Phase 1', true, false, null],
      ['Battle Phase', false, false, 6],
      ['Main Phase 2', false, true, null],
      ['End Phase', false, false, 7],
    ])
    expect(idle.endTurn).toEqual({ type: 'select_idlecmd', action: 7, index: null })
    const battle = askView(open(ASKS[0]!, ctx(MESA, { phase: 'battle' })))

    expect(battle.phaseItems.filter((item) => item.answer).map((item) => item.label)).toEqual(['Main Phase 2', 'End Phase'])
    expect(battle.endTurn).toEqual({ type: 'select_battlecmd', action: 3, index: null })
    // Otra pregunta (una cadena) deja el botón de fase sin jugadas.
    expect(askView(open(ASKS[6]!, ctx(MESA))).phaseItems.every((item) => !item.answer)).toBe(true)
  })

  it('la batalla: «Atacar» si el rival tiene monstruos (a cuál lo pregunta el núcleo después) y «Ataque directo» si no tiene y se puede', () => {
    const attack = (cards: Spot[]) => askView(open({ ...(ASKS[0] as Extract<CoreAsk, { type: 'select_battlecmd' }>), attacks: [{ ...loc(200, L.MZONE, 0), can_direct: true }] }, ctx(mesa(cards)))).items.get('card-200-1')!

    expect(attack(CARDS).map((item) => item.label)).toEqual([t('practice.menu.battleAttack'), t('practice.menu.activateEffect')])
    expect(attack(CARDS.filter((card) => card.id !== 'c1'))[0]).toMatchObject({ label: t('practice.menu.attackDirectly'), answer: { type: 'select_battlecmd', action: 1, index: 0 } })
  })

  it('un ítem que no es de la pregunta no contesta; uno que sí, contesta tal cual', () => {
    const state = open(ASKS[1]!, ctx(MESA))

    expect(step(state, { kind: 'item', answer: { type: 'select_idlecmd', action: 8, index: null } })).toEqual({ state })
    expect(step(state, { kind: 'item', answer: { type: 'select_chain', index: 0 } })).toEqual({ state })
    expect(step(state, { kind: 'cancel' })).toEqual({ state })
    expect(step(state, { kind: 'item', answer: { type: 'select_idlecmd', action: 0, index: 0 } }).answer).toEqual({ type: 'select_idlecmd', action: 0, index: 0 })
  })

  it('la cadena: brilla lo que puede responder, «No responder» sólo si no es obligatoria, y sin nada con qué responder (o con «Nunca») se contesta sola', () => {
    const chain = ASKS[6] as Extract<CoreAsk, { type: 'select_chain' }>
    const view = askView(open(chain, ctx(MESA)))

    expect(view.respond).toEqual([mine('card-950-1')])
    expect(view.items.get('card-950-1')).toEqual([{ label: t('practice.menu.activate'), answer: { type: 'select_chain', index: 0 }, effect: { code: 950, description: '0' }, at: 'st' }])
    expect(view.cancelable).toBe(true)
    expect(step(open(chain, ctx(MESA)), { kind: 'cancel' }).answer).toEqual({ type: 'select_chain', index: null })
    expect(askView(open({ ...chain, forced: true }, ctx(MESA))).cancelable).toBe(false)
    expect(step(open({ ...chain, forced: true }, ctx(MESA)), { kind: 'cancel' }).answer).toBeUndefined()

    expect(askView(open({ ...chain, selects: [] }, ctx(MESA))).auto).toEqual({ answer: { type: 'select_chain', index: null }, why: 'forced' })
    const never = ctx(MESA, { prefs: { chainMode: 'never', placeMode: 'ask' } })

    expect(askView(open(chain, never)).auto).toEqual({ answer: { type: 'select_chain', index: null }, why: 'setting' })
    expect(askView(open({ ...chain, forced: true }, never)).auto).toEqual({ answer: { type: 'select_chain', index: 0 }, why: 'setting' })
    // Contestada sola, ningún toque hace nada.
    expect(gesturesOf(askView(open(chain, never)))).toEqual([])
    // Sin nada que responda de verdad a este momento (`spe_count` 0: una Trampa colocada en cada paso del propio turno) «Preguntar» no pregunta; forzada, sí.
    expect(askView(open({ ...chain, spe_count: 0 }, ctx(MESA))).auto).toEqual({ answer: { type: 'select_chain', index: null }, why: 'setting' })
    expect(askView(open({ ...chain, spe_count: 0, forced: true }, ctx(MESA))).auto).toBeNull()
    // «Siempre» pregunta igual (el «Always chain» de EDOPro); sin nada que activar, se contesta sola.
    const always = ctx(MESA, { prefs: { chainMode: 'always', placeMode: 'ask' } })

    expect(askView(open({ ...chain, spe_count: 0 }, always)).auto).toBeNull()
    expect(askView(open({ ...chain, spe_count: 0, selects: [] }, always)).auto).toEqual({ answer: { type: 'select_chain', index: null }, why: 'forced' })
  })

  it('la banda de responder (`respondOffer`): a qué eslabón, el número de tu respuesta y las candidatas con su lugar; una con varios efectos no contesta de un toque', () => {
    const select = (code: number, location: number, sequence: number, description = '0') => ({ ...pos(code, location, sequence, 10), description, client_mode: 0 })
    const chain: Extract<CoreAsk, { type: 'select_chain' }> = {
      type: 'select_chain',
      player: 0,
      spe_count: 1,
      forced: false,
      hint_timing: 0,
      hint_timing_other: 0,
      selects: [select(950, L.SZONE, 1), select(900, L.HAND, 1, stringId(900, 0)), select(400, L.GRAVE, 0, stringId(400, 1)), select(400, L.GRAVE, 0, stringId(400, 2))],
    }
    const link = { card: { side: 'theirs' as const, id: 'c1' }, code: 700, description: '0', state: 'chained' as const }
    const offer = respondOffer(askView(open(chain, ctx(MESA))), [link])!

    expect(offer.to).toEqual({ link, number: 1 })
    expect(offer.link).toBe(2)
    expect(offer.candidates.map(({ key, at, answer, effect }) => ({ key, at, answer, effect }))).toEqual([
      { key: 'mine:card-950-1', at: 'st', answer: { type: 'select_chain', index: 0 }, effect: { code: 950, description: '0' } },
      { key: 'mine:card-900-1', at: 'hand', answer: { type: 'select_chain', index: 1 }, effect: { code: 900, description: stringId(900, 0) } },
      { key: 'mine:card-400-1', at: 'gy', answer: null, effect: null },
    ])
    expect(offer.candidates[2]!.items[0]!.children).toHaveLength(2)
    expect([placeLabel('st'), placeLabel('hand'), placeLabel('gy'), placeLabel('material')]).toEqual([t('practice.mat.field'), t('practice.place.hand'), t('practice.place.gy'), null])
    // Sin cadena todavía, tu respuesta la abre (CL1).
    expect(respondOffer(askView(open(chain, ctx(MESA))), [])).toMatchObject({ to: null, link: 1 })
    // La obligatoria, la ventana de una fase tuya y lo que no es una cadena no van en la banda.
    expect(respondOffer(askView(open({ ...chain, forced: true }, ctx(MESA))), [])).toBeNull()
    expect(respondOffer(askView(open({ ...chain, spe_count: 0, hint_timing: 0x1 }, ctx(MESA))), [])).toBeNull()
    expect(respondOffer(askView(open(ASKS[0]!, ctx(MESA))), [])).toBeNull()
  })

  it('una obligatoria de una carta que controla el rival (Camellia, del oráculo: pregunta el asiento 1) también se ofrece: se toca en su campo y todo lo legal está a un toque', () => {
    const forced: CoreAsk = {
      type: 'select_chain',
      player: 1,
      spe_count: 0,
      forced: true,
      hint_timing: 32,
      hint_timing_other: 0,
      selects: [
        { ...pos(63013339, L.MZONE, 3, 1, 0), description: '0', client_mode: 1 },
        { ...pos(98338152, L.SZONE, 4, 10, 1), description: '103115026071552', client_mode: 0 },
        { ...pos(76072561, L.MZONE, 6, 1, 1), description: '79767861723137', client_mode: 0 },
      ],
    }
    const queries = mesa(
      [
        { side: 'theirs', id: 'c9', code: 63013339, location: L.MZONE, sequence: 3 },
        { side: 'mine', id: 'card-98338152-1', code: 98338152, location: L.SZONE, sequence: 4, pos: 'set' },
        { side: 'mine', id: 'card-76072561-1', code: 76072561, location: L.MZONE, sequence: 6 },
      ],
      { seat: 1 },
    )
    const state = open(forced, ctx(queries))
    const view = askView(state)
    const offered = new Set(gesturesOf(view).flatMap((gesture) => (gesture.kind === 'item' ? [JSON.stringify(gesture.answer)] : [])))

    expect([0, 1, 2].filter((index) => !offered.has(JSON.stringify({ type: 'select_chain', index })))).toEqual([])
    expect(view.theirs.get('c9')).toEqual([{ label: t('practice.menu.activateEffect'), answer: { type: 'select_chain', index: 0 }, effect: { code: 63013339, description: '0' }, at: 'mz' }])
    // Brilla (late en su campo) y no se mezcla con las tuyas.
    expect(view.respond).toContainEqual({ side: 'theirs', id: 'c9' })
    expect(view.items.has('c9')).toBe(false)
    expect(step(state, { kind: 'item', answer: { type: 'select_chain', index: 0 } }).answer).toEqual({ type: 'select_chain', index: 0 })
  })

  it('sí o no: el efecto con su carta (que brilla) y el sí o no a secas, cada uno con sus dos respuestas', () => {
    const effect = askView(open(ASKS[2]!, ctx(MESA)))

    expect(effect.prompt).toEqual({ card: { ref: mine('card-400-1'), code: 400, place: 'pile', pile: 'gy' }, at: 'gy', description: stringId(400, 0), yes: { type: 'select_effectyn', yes: true }, no: { type: 'select_effectyn', yes: false } })
    expect(effect.respond).toEqual([mine('card-400-1')])
    expect(step(open(ASKS[2]!, ctx(MESA)), { kind: 'item', answer: { type: 'select_effectyn', yes: true } }).answer).toEqual({ type: 'select_effectyn', yes: true })
    expect(askView(open(ASKS[3]!, ctx(MESA))).prompt).toMatchObject({ card: null, description: '31' })
    expect(askView(open(ASKS[3]!, ctx(MESA))).title).toBe('500')
  })

  it('opciones, números y posiciones: un toque contesta; una opción con su texto (o, si es «a la mano» del sistema, la palabra de la mesa); la posición con las palabras de la mesa y, si hay una sola, sola', () => {
    const options = askView(open(ASKS[4]!, ctx(MESA, { effectLabel: (_, description) => (description === stringId(400, 1) ? 'Destroy a monster' : null) })))

    expect(options.options).toEqual({
      of: 'option',
      count: 1,
      options: [
        { value: 0, description: stringId(400, 0) },
        { value: 1, description: stringId(400, 1), label: 'Destroy a monster' },
        { value: 2, description: '573', label: t('practice.menu.toHand') },
      ],
      chosen: [],
    })
    expect(step(open(ASKS[4]!, ctx(MESA)), { kind: 'option', value: 2 }).answer).toEqual({ type: 'select_option', index: 2 })
    expect(step(open(ASKS[4]!, ctx(MESA)), { kind: 'option', value: 3 }).answer).toBeUndefined()
    expect(askView(open(ASKS[19]!, ctx(MESA))).options?.options.map((option) => option.label)).toEqual(['1', '2', '4'])
    expect(step(open(ASKS[19]!, ctx(MESA)), { kind: 'option', value: 1 }).answer).toEqual({ type: 'announce_number', index: 1 })

    const position = askView(open(ASKS[8]!, ctx(MESA)))

    expect(position.options?.options).toEqual([
      { value: 1, label: t('practice.menu.attack') },
      { value: 4, label: t('practice.menu.defense') },
      { value: 8, label: t('practice.menu.banishFaceDown') },
    ])
    expect(step(open(ASKS[8]!, ctx(MESA)), { kind: 'option', value: 8 }).answer).toEqual({ type: 'select_position', position: 8 })
    expect(step(open(ASKS[8]!, ctx(MESA)), { kind: 'option', value: 2 }).answer).toBeUndefined()
    expect(askView(open({ type: 'select_position', player: 0, code: 100, positions: 4 }, ctx(MESA))).auto).toEqual({ answer: { type: 'select_position', position: 4 }, why: 'forced' })
  })

  it('Tipos y Atributos: se eligen `count` (tocar otra vez suelta) y al completar contesta la máscara', () => {
    const races = open(ASKS[16]!, ctx(MESA))

    expect(askView(races).options).toMatchObject({ of: 'race', count: 2, options: [{ value: 0 }, { value: 2 }, { value: 40 }] })
    expect(tap(races, { kind: 'option', value: 40 }, { kind: 'option', value: 40 }, { kind: 'option', value: 0 }, { kind: 'option', value: 40 }).answer).toEqual({ type: 'announce_race', races: String((1n << 40n) | 1n) })
    expect(step(open(ASKS[17]!, ctx(MESA)), { kind: 'option', value: 4 }).answer).toEqual({ type: 'announce_attrib', attributes: 16 })
    expect(step(open(ASKS[17]!, ctx(MESA)), { kind: 'option', value: 0 }).answer).toBeUndefined()
  })

  it('elegir cartas: con `max = 1` el primer toque contesta; si no, al llegar al tope o con «Listo»; cancelar sólo si se puede; tocar otra carta no hace nada', () => {
    const one = open({ ...(ASKS[5] as Extract<CoreAsk, { type: 'select_card' }>), min: 1, max: 1 }, ctx(MESA))

    expect(askView(one).cardPick).toMatchObject({ surface: 'mat', eligible: [0, 1, 2], chosen: [], done: false })
    expect(step(one, { kind: 'card', ref: { side: 'theirs', id: 'c1' } }).answer).toEqual({ type: 'select_card', indices: [2] })

    const two = open(ASKS[5]!, ctx(MESA))

    expect(step(two, { kind: 'card', ref: mine('card-400-1') })).toEqual({ state: two })
    const first = tap(two, { kind: 'card', ref: mine('card-100-1') })

    expect(askView(first.state).cardPick).toMatchObject({ chosen: [0], done: true, count: { now: 1, need: 2 } })
    expect(step(first.state, { kind: 'done' }).answer).toEqual({ type: 'select_card', indices: [0] })
    expect(tap(two, { kind: 'card', ref: mine('card-100-1') }, { kind: 'card', ref: mine('card-200-1') }).answer).toEqual({ type: 'select_card', indices: [0, 1] })
    // Tocar una elegida la suelta.
    expect(askView(tap(two, { kind: 'pick', index: 0 }, { kind: 'pick', index: 0 }).state).cardPick?.chosen).toEqual([])
    expect(step(two, { kind: 'cancel' }).answer).toEqual({ type: 'select_card', indices: null })
    expect(step(open({ ...(ASKS[5] as Extract<CoreAsk, { type: 'select_card' }>), can_cancel: false }, ctx(MESA)), { kind: 'cancel' }).answer).toBeUndefined()
  })

  it('elegir casi todas (A Bao A Qu: 9 de las 10 de la mano, sin cancelar): están todas a un toque y el jugador al azar siempre termina', () => {
    const codes = [24461358, 45171524, 33599853, 40543231, 94145021, 45171524, 42141493, 94145021, 24461358, 82782870]
    const hand = mesa(codes.map((code, i) => ({ side: 'mine', id: `card-${code}-${i}`, code, location: L.HAND, sequence: i })))
    const ask: CoreAsk = { type: 'select_card', player: 0, can_cancel: false, min: 9, max: 9, selects: codes.map((code, i) => pos(code, L.HAND, i, 10)) }
    const random = seeded(9)

    expect(askView(open(ask, ctx(hand))).cardPick).toMatchObject({ surface: 'mat', eligible: codes.map((_, i) => i), done: false })
    for (let run = 0; run < 60; run += 1) {
      const played = playAsk(open(ask, ctx(hand)), random)

      expect({ stuck: played.stuck, dead: played.dead }).toEqual({ stuck: false, dead: 0 })
      expect(legal(ask, played.answer!)).toBe(true)
    }
  })

  it('elegir cartas: en la mesa, en una sola pila mía (el deck barajado da cada una con su código, sin repetir) o en una lista aparte', () => {
    const deck: Spot[] = [100, 100, 300, 900].map((code, i) => ({ side: 'mine', id: `card-${code}-${i + 11}`, code, location: L.DECK, sequence: i }))
    const queries = mesa([...CARDS, ...deck], { bag: true })
    const search = askView(open({ type: 'select_card', player: 0, can_cancel: false, min: 1, max: 1, selects: [pos(100, L.DECK, 3, 10), pos(100, L.DECK, 0, 10), pos(300, L.DECK, 1, 10)] }, ctx(queries))).cardPick!

    expect(search.surface).toBe('pile')
    expect(search.pile).toBe('deck')
    // `idAt` en la bolsa da siempre la de arriba (otra carta): va otra de esa pila con el código de la pregunta, sin repetir.
    expect(search.cards.map((card) => card.ref?.id)).toEqual(['card-100-11', 'card-100-12', 'card-300-13'])
    const mixed = askView(open({ type: 'select_card', player: 0, can_cancel: false, min: 1, max: 1, selects: [pos(400, L.GRAVE, 0, 5), pos(100, L.HAND, 0, 10), { code: 46986414, controller: 0, location: 0, sequence: 0, position: 0 }] }, ctx(queries))).cardPick!

    expect(mixed.surface).toBe('list')
    expect(mixed.cards.map((card) => [card.place, card.ref?.id ?? null])).toEqual([['pile', 'card-400-1'], ['hand', 'card-100-1'], ['none', null]])
    expect(step(open({ type: 'select_card', player: 0, can_cancel: false, min: 1, max: 1, selects: mixed.cards.map(() => pos(46986414, 0, 0, 0)) }, ctx(queries)), { kind: 'pick', index: 1 }).answer).toEqual({ type: 'select_card', indices: [1] })
  })

  it('elegir y soltar de a una: cada toque contesta su índice (las ya elegidas, después de las elegibles); «Listo» sólo si se puede terminar', () => {
    const state = open(ASKS[15]!, ctx(MESA))
    const pick = askView(state).cardPick!

    expect(pick).toMatchObject({ chosen: [2], locked: [], done: true, count: { now: 1, need: 3 } })
    expect(pick.cards.map((card) => card.ref?.id)).toEqual(['card-100-1', 'card-400-1', 'card-200-1'])
    expect(step(state, { kind: 'pick', index: 1 }).answer).toEqual({ type: 'select_unselect_card', index: 1 })
    expect(step(state, { kind: 'card', ref: mine('card-200-1') }).answer).toEqual({ type: 'select_unselect_card', index: 2 })
    expect(step(state, { kind: 'done' }).answer).toEqual({ type: 'select_unselect_card', index: null })
    const unfinished = open({ ...(ASKS[15] as Extract<CoreAsk, { type: 'select_unselect_card' }>), can_finish: false, can_cancel: true }, ctx(MESA))

    expect(step(unfinished, { kind: 'done' }).answer).toBeUndefined()
    expect(step(unfinished, { kind: 'cancel' }).answer).toEqual({ type: 'select_unselect_card', index: null })
  })

  it('Sacrificios: cuenta lo que vale cada uno («2 de 2») y contesta al completar; uno que vale 2 deja «Listo» sin pasar de `max` cartas', () => {
    const state = open(ASKS[9]!, ctx(MESA))

    expect(tap(state, { kind: 'pick', index: 0 }, { kind: 'pick', index: 1 }).answer).toEqual({ type: 'select_tribute', indices: [0, 1] })
    const double = tap(state, { kind: 'pick', index: 2 }).state

    expect(askView(double).cardPick).toMatchObject({ count: { now: 2, need: 2 }, done: true, eligible: [2, 0, 1] })
    expect(step(double, { kind: 'done' }).answer).toEqual({ type: 'select_tribute', indices: [2] })
    // `min = 2` con `max = 1`: sólo sirve el que vale 2.
    expect(askView(open({ ...(ASKS[9] as Extract<CoreAsk, { type: 'select_tribute' }>), max: 1 }, ctx(MESA))).cardPick?.eligible).toEqual([2])
  })

  it('sumas: las fijas ya elegidas, los niveles en la cuenta, sólo se encienden las que todavía cierran la suma, y «al menos» (Ritual) con su regla', () => {
    const state = open(ASKS[12]!, ctx(MESA))
    const start = askView(state).cardPick!

    // Fija la de nivel 2; quedan 6: 4 + 2 (la de 2 o 1), 3 + … no cierra solo; la de 7 pasa.
    expect(start).toMatchObject({ chosen: [4], locked: [4], count: { now: 2, need: 8 }, done: false, atLeast: false })
    expect(start.eligible).toEqual([0, 2])
    expect(step(state, { kind: 'pick', index: 3 })).toEqual({ state })
    expect(step(state, { kind: 'pick', index: 4 })).toEqual({ state })
    expect(tap(state, { kind: 'pick', index: 0 }, { kind: 'pick', index: 2 }).answer).toEqual({ type: 'select_sum', indices: [0, 2] })

    const ritual = open({ type: 'select_sum', player: 0, select_max: 1, amount: 8, min: 0, max: 0, selects_must: [], selects: [{ ...loc(200, L.MZONE, 0), amount: 4 }, { ...loc(201, L.MZONE, 1), amount: 6 }, { ...loc(100, L.HAND, 0), amount: 1 }] }, ctx(MESA))
    const six = tap(ritual, { kind: 'pick', index: 1 }).state

    // 6: falta; con la de 4 cierra (10, y sin la de 4 quedan 6 < 8); con la de 1 no: 7 no llega y, sumando la de 4, la de 1 sobra.
    expect(askView(six).cardPick).toMatchObject({ done: false, atLeast: true, eligible: [1, 0] })
    expect(step(six, { kind: 'pick', index: 0 }).answer).toEqual({ type: 'select_sum', indices: [1, 0] })
  })

  it('una suma con muchas candidatas (30 de nivel 1) se arma enseguida, exacta y «al menos»', () => {
    const selects = Array.from({ length: 30 }, (_, i) => ({ ...loc(100 + i, L.HAND, i), amount: 1 }))
    const started = performance.now()

    for (const select_max of [0, 1]) {
      const view = askView(open({ type: 'select_sum', player: 0, select_max, amount: 12, min: 1, max: 12, selects_must: [], selects }, ctx(mesa([]))))

      expect(view.cardPick?.eligible).toHaveLength(30)
    }
    expect(performance.now() - started).toBeLessThan(200)
  })

  it('casillas: el mapa de `field_mask` a las de la mesa (Zonas Extra y de Campo incluidas), varias se acumulan, no se cancela y con una sola libre se contesta sola', () => {
    const view = askView(open({ type: 'select_place', player: 1, count: 2, field_mask: ~(0b1 | (1 << 4) | (1 << 5) | (1 << 6) | (1 << 7) | (1 << 8) | (1 << 12) | (1 << 13) | (1 << 14) | (1 << 16) | (1 << 29)) >>> 0 }, ctx(MESA)))

    expect(view.zonePick?.targets).toEqual([
      { side: 'mine', zone: 'mz', index: 0 },
      { side: 'mine', zone: 'mz', index: 4 },
      { side: 'mine', zone: 'emz', index: 0 },
      { side: 'mine', zone: 'emz', index: 1 },
      { side: 'mine', zone: 'st', index: 0 },
      { side: 'mine', zone: 'st', index: 4 },
      { side: 'mine', zone: 'field', index: 0 },
      { side: 'theirs', zone: 'mz', index: 0 },
      { side: 'theirs', zone: 'field', index: 0 },
    ])
    expect(view.cancelable).toBe(false)
    const state = open({ type: 'select_place', player: 1, count: 2, field_mask: ~(0b11 | (1 << 13)) >>> 0 }, ctx(MESA))
    const once = tap(state, { kind: 'zone', side: 'mine', zone: 'mz', index: 1 })

    expect(askView(once.state).zonePick?.chosen).toEqual([{ side: 'mine', zone: 'mz', index: 1 }])
    expect(step(once.state, { kind: 'zone', side: 'mine', zone: 'mz', index: 2 })).toEqual({ state: once.state })
    expect(step(once.state, { kind: 'zone', side: 'mine', zone: 'field', index: 0 }).answer).toEqual({ type: 'select_place', places: [{ player: 1, location: L.MZONE, sequence: 1 }, { player: 1, location: L.SZONE, sequence: 5 }] })
    expect(step(state, { kind: 'cancel' })).toEqual({ state })

    expect(askView(open({ type: 'select_place', player: 0, count: 1, field_mask: ~(1 << 2) >>> 0 }, ctx(MESA))).auto).toEqual({ answer: { type: 'select_place', places: [{ player: 0, location: L.MZONE, sequence: 2 }] }, why: 'forced' })
    expect(askView(open(ASKS[7]!, ctx(MESA, { prefs: { chainMode: 'ask', placeMode: 'auto' } }))).auto).toEqual({ answer: { type: 'select_place', places: [{ player: 0, location: L.MZONE, sequence: 0 }] }, why: 'setting' })
  })

  it('ordenar: se tocan en el orden deseado, «Ordenar así» con todas y «Dejar como está» siempre', () => {
    const state = open(ASKS[14]!, ctx(MESA))
    const all = tap(state, { kind: 'card', ref: mine('card-300-1') }, { kind: 'pick', index: 0 }, { kind: 'pick', index: 1 })

    expect(askView(all.state).sort).toMatchObject({ order: [2, 0, 1], done: true })
    // La respuesta da, por carta, su lugar en el orden nuevo.
    expect(step(all.state, { kind: 'done' }).answer).toEqual({ type: 'sort_card', order: [1, 2, 0] })
    expect(step(tap(state, { kind: 'pick', index: 0 }).state, { kind: 'done' }).answer).toBeUndefined()
    expect(step(state, { kind: 'cancel' }).answer).toEqual({ type: 'sort_card', order: null })
  })

  it('piedra, papel o tijera (Transmission Gear, medido con el núcleo): tres botones en ese orden, con los números del núcleo (gana el que sigue al otro: 3 a 2, 2 a 1, 1 a 3)', () => {
    const state = open({ type: 'rock_paper_scissors', player: 0 }, ctx(MESA))
    const view = askView(state)

    expect(view.auto).toBeNull()
    expect(view.options).toEqual({
      of: 'rps',
      count: 1,
      options: [
        { value: 2, label: t('duel.games.rps.rock') },
        { value: 3, label: t('duel.games.rps.paper') },
        { value: 1, label: t('duel.games.rps.scissors') },
      ],
      chosen: [],
    })
    expect(step(state, { kind: 'option', value: 3 }).answer).toEqual({ type: 'rock_paper_scissors', value: 3 })
  })

  it('una cadena obligatoria cuyas cartas la mesa no ubica (el espejo del rival no la tiene donde dice la pregunta) no queda sin nada que tocar: se contesta sola con la primera', () => {
    const forced: CoreAsk = { type: 'select_chain', player: 1, spe_count: 0, forced: true, hint_timing: 32, hint_timing_other: 0, selects: [{ ...pos(63013339, L.MZONE, 3, 1, 0), description: '0', client_mode: 1 }] }

    expect(askView(open(forced, ctx(mesa([], { seat: 1 })))).auto).toEqual({ answer: { type: 'select_chain', index: 0 }, why: 'forced' })
    // Con la carta en su campo, se ofrece (se toca ahí).
    expect(askView(open(forced, ctx(mesa([{ side: 'theirs', id: 'c9', code: 63013339, location: L.MZONE, sequence: 3 }], { seat: 1 })))).auto).toBeNull()
  })
})

describe('ask-ui: soltar una carta de la mano en una casilla', () => {
  const idle = ASKS[1] as Extract<CoreAsk, { type: 'select_idlecmd' }>

  it('cada jugada dice adónde saca la carta (`into`) y `itemsInto` deja sólo las de la casilla soltada; de un «¿cuál efecto?», los que van ahí (uno solo, sin preguntar)', () => {
    const view = askView(open(idle, ctx(MESA)))
    const into = (id: string) => view.items.get(id)?.map((item) => [item.label, item.into ?? null])

    expect(into('card-100-1')).toEqual([[t('practice.menu.normalSummon'), 'monster'], [t('practice.menu.set'), 'monster']])
    expect(into('card-900-1')).toEqual([[t('practice.menu.activate'), 'spell'], [t('practice.menu.set'), 'spell']])
    expect(into('card-300-1')).toEqual([[t('practice.menu.asScale'), 'spell']])
    // Lo que no sale de la mano a una casilla no lo tiene: cambiar de posición, una Trampa ya colocada, un efecto del cementerio.
    expect(into('card-200-1')).toEqual([[t('practice.menu.toDefense'), null]])
    expect(into('card-950-1')).toEqual([[t('practice.menu.activate'), null]])
    expect(view.items.get('card-400-1')![0]!.children!.map((child) => child.into ?? null)).toEqual([null, null])

    expect(itemsInto(view.items.get('card-100-1')!, 'spell')).toEqual([])
    expect(itemsInto(view.items.get('card-900-1')!, 'spell').map((item) => item.answer)).toEqual([
      { type: 'select_idlecmd', action: 5, index: 0 },
      { type: 'select_idlecmd', action: 4, index: 0 },
    ])
    // Un Péndulo con un efecto de la mano y la escala: abajo queda sólo la escala, sin el segundo paso; arriba, nada (Invocarlo es otra opción).
    const pendulum = askView(open({ ...idle, activates: [act(300, L.HAND, 2, stringId(300, 0)), act(300, L.HAND, 2, '1160')] }, ctx(MESA))).items.get('card-300-1')!

    expect(itemsInto(pendulum, 'spell')).toEqual([{ label: t('practice.menu.asScale'), answer: { type: 'select_idlecmd', action: 5, index: 1 }, effect: { code: 300, description: '1160' }, into: 'spell' }])
    expect(itemsInto(pendulum, 'monster')).toEqual([])
    // Una Rápida de la mano en una cadena también va abajo.
    const chain = { ...(ASKS[6] as Extract<CoreAsk, { type: 'select_chain' }>), selects: [{ ...pos(900, L.HAND, 1, 10), description: '0', client_mode: 0 }] }

    expect(askView(open(chain, ctx(MESA))).items.get('card-900-1')!.map((item) => item.into)).toEqual(['spell'])
  })

  it('la casilla soltada contesta la pregunta de una casilla sin mostrarla (también con «Casilla: automática»); ocupada, de otra clase o con varias casillas, se pregunta como siempre', () => {
    /** Libres: mi mz 1, 2 y 3 y mi st 1 (los bits en 0). */
    const place: CoreAsk = { type: 'select_place', player: 0, count: 1, field_mask: ~(0b1110 | (1 << 9)) >>> 0 }
    const prefer = (zone: 'mz' | 'st', index: number, extra: Partial<AskContext> = {}) => ctx(MESA, { prefer: { side: 'mine', zone, index }, ...extra })
    const auto = { prefs: { chainMode: 'ask' as const, placeMode: 'auto' as const } }
    const at = (location: number, sequence: number) => ({ type: 'select_place', places: [{ player: 0, location, sequence }] })

    expect(askView(open(place, prefer('mz', 2))).auto).toEqual({ answer: at(L.MZONE, 2), why: 'drop' })
    expect(askView(open(place, prefer('st', 1))).auto).toEqual({ answer: at(L.SZONE, 1), why: 'drop' })
    expect(askView(open(place, prefer('mz', 3, auto))).auto).toEqual({ answer: at(L.MZONE, 3), why: 'drop' })
    // Ocupada (o que la máscara no da): se pregunta; con «automática», la primera libre.
    expect(askView(open(place, prefer('mz', 0))).auto).toBeNull()
    expect(askView(open(place, prefer('st', 2))).auto).toBeNull()
    expect(askView(open(place, prefer('mz', 0, auto))).auto).toEqual({ answer: at(L.MZONE, 1), why: 'setting' })
    // Dos casillas: la soltada no alcanza.
    expect(askView(open({ ...place, count: 2 }, prefer('mz', 2))).auto).toBeNull()
    // La de las del rival no es la mía aunque tenga el mismo número.
    expect(askView(open(place, ctx(MESA, { prefer: { side: 'theirs', zone: 'mz', index: 2 } }))).auto).toBeNull()
  })
})

describe('ask-ui: el menú de una carta, en el orden y los bloques de la mesa manual', () => {
  // Mi mano: 100 (monstruo de nivel 4 con efecto), 900 (Mágica); mi campo: 200 (monstruo con efecto, en ataque), 950 (Mágica colocada); mi Extra: 500 (Sincronía).
  const MONSTER: MatCardKind = { ...TOKEN_KIND, effect: true, level: 4 }
  const KINDS: Record<string, MatCardKind> = {
    'card-100-1': MONSTER,
    'card-200-1': MONSTER,
    'card-900-1': { ...TOKEN_KIND, monster: false, spell: true },
    'card-950-1': { ...TOKEN_KIND, monster: false, spell: true },
    'card-500-1': { ...MONSTER, extra: true, synchro: true, level: 6 },
  }
  const queries = mesa([
    { side: 'mine', id: 'card-100-1', code: 100, location: L.HAND, sequence: 0 },
    { side: 'mine', id: 'card-900-1', code: 900, location: L.HAND, sequence: 1 },
    { side: 'mine', id: 'card-200-1', code: 200, location: L.MZONE, sequence: 0, pos: 'atk' },
    { side: 'mine', id: 'card-950-1', code: 950, location: L.SZONE, sequence: 1, pos: 'set' },
    { side: 'mine', id: 'card-500-1', code: 500, location: L.EXTRA, sequence: 0 },
  ])
  const idle: CoreAsk = {
    type: 'select_idlecmd',
    player: 0,
    summons: [loc(100, L.HAND, 0)],
    special_summons: [loc(500, L.EXTRA, 0), loc(100, L.HAND, 0)],
    pos_changes: [loc(200, L.MZONE, 0)],
    monster_sets: [loc(100, L.HAND, 0)],
    spell_sets: [loc(900, L.HAND, 1)],
    activates: [act(950, L.SZONE, 1), act(200, L.MZONE, 0), act(900, L.HAND, 1), act(100, L.HAND, 0)],
    to_bp: false,
    to_ep: true,
    shuffle: false,
  }

  it('cada carta (mano, campo y Extra) ofrece lo legal en el mismo orden que la manual, también en los bloques de escritorio (sólo hay jugadas)', () => {
    const view = askView(open(idle, ctx(queries)))

    for (const id of Object.keys(KINDS)) {
      const auto = view.items.get(id)!.map((item) => item.label)
      const manual = listCardActions(queries.mine, id, (card) => KINDS[card]!, (card) => card)
      const legalOnly = (labels: string[]) => labels.filter((label) => auto.includes(label))
      const desktopManual = inMenuBlocks<{ label: string; divider?: boolean }>(manual.map((item) => ({ entry: { label: item.label }, place: menuPlaceOf(item, [id]) }))).map((entry) => entry.label)
      const desktopAuto = inMenuBlocks<{ label: string; divider?: boolean }>(auto.map((label) => ({ entry: { label }, place: PLAY_PLACE }))).map((entry) => entry.label)

      expect({ id, auto }).toEqual({ id, auto: legalOnly(manual.map((item) => item.label)) })
      expect({ id, desktop: desktopAuto }).toEqual({ id, desktop: legalOnly(desktopManual) })
    }
    expect(view.items.get('card-100-1')!.map((item) => item.label)).toEqual(['normalSummon', 'set', 'specialSummon', 'activateEffect'].map((key) => t(`practice.menu.${key}` as 'practice.menu.set')))
  })
})

describe('ask-ui: la pregunta de un efecto que se dispara, con lo mínimo para decidir', () => {
  const prompt = (code: number, at: 'mz' | 'gy' | 'hand' | 'material', trigger = true) => ({ card: { ref: mine(`card-${code}-1`), code, place: 'field' as const }, at, ...(trigger ? { trigger } : {}), description: trigger ? '221' : '0', yes: { type: 'select_effectyn' as const, yes: true }, no: { type: 'select_effectyn' as const, yes: false } })

  it('el núcleo pregunta por la carta en su lugar: `at` es su casilla o su pila y `trigger`, el `desc` 221', () => {
    const ask: CoreAsk = { type: 'select_effectyn', player: 0, ...pos(400, L.MZONE, 2, 1), description: '221' }

    expect(askView(open(ask, ctx(mesa([{ side: 'mine', id: 'card-400-1', code: 400, location: L.MZONE, sequence: 2 }])))).prompt).toMatchObject({ at: 'mz', trigger: true })
  })

  it('«¿Activás el efecto?» sin nombres: arriba qué pasó (la Invocación, la fase; sin saberlo, «Efecto que se dispara»), la pestaña dice el lugar; sin `trigger`, nada arriba', () => {
    const text = t('auto.ask.effect')

    expect(effectAskText(prompt(1, 'mz'), { kind: 'special', codes: [1] })).toEqual({ kicker: t('auto.ask.afterEvent', { event: t('auto.ask.event.special') }), text, place: t('practice.mat.field') })
    expect(effectAskText(prompt(2, 'gy'), { kind: 'normal', codes: [1, 3] })).toEqual({ kicker: t('auto.ask.afterEvent', { event: t('auto.ask.event.normal') }), text, place: t('practice.place.gy') })
    expect(effectAskText(prompt(1, 'hand'), { kind: 'phase', phase: 'end' })).toEqual({ kicker: t('auto.ask.inPhase', { phase: 'End Phase' }), text, place: t('practice.place.hand') })
    expect(effectAskText(prompt(2, 'gy'), null)).toMatchObject({ kicker: t('auto.ask.kicker') })
    expect(effectAskText(prompt(2, 'material', false), { kind: 'normal', codes: [2] })).toEqual({ kicker: null, text, place: null })
  })
})

describe('ask-ui: el título de una elección de cartas dice para qué', () => {
  const pick = (over: Partial<CardPick> = {}): CardPick => ({ type: 'select_card', cards: [], chosen: [], locked: [], eligible: [], surface: 'list', pile: null, min: 2, max: 2, count: { now: 1, need: 2 }, done: false, ...over })

  afterEach(() => applyLocale('es'))

  it('con un código de pista comprobado, para qué; con la cuenta de lo elegido si se eligen varias; sin código (o uno sin comprobar), el genérico', () => {
    expect(pickTitle(pick(), '503')).toBe('Elegí 2 cartas para desterrar · 1/2')
    expect(pickTitle(pick({ min: 1, max: 1, count: { now: 0, need: 1 } }), '509')).toBe('Elegí 1 carta para Invocar de forma Especial')
    expect(pickTitle(pick({ min: 1, max: 3, count: { now: 0, need: 3 } }), '504')).toBe('Elegí de 1 a 3 cartas para enviar al Cementerio · 0/3')
    expect(pickTitle(pick({ type: 'select_unselect_card' }), '533')).toBe('Elegí 2 cartas como Material de Enlace · 1/2')
    // 575 (negar) y 514 (boca arriba) no se comprobaron; un texto de carta (`aux.Stringid`) tampoco.
    expect(pickTitle(pick(), '575')).toBe('Elegí 2 cartas · 1/2')
    expect(pickTitle(pick(), '514')).toBe('Elegí 2 cartas · 1/2')
    expect(pickTitle(pick(), String((12345n << 20n) | 1n))).toBe('Elegí 2 cartas · 1/2')
    expect(pickTitle(pick())).toBe('Elegí 2 cartas · 1/2')
  })

  it('a qué atacar, los Sacrificios y las sumas siguen con su título', () => {
    expect(pickTitle(pick({ min: 1, max: 1 }), '549')).toBe('Elegí a qué monstruo atacar')
    expect(pickTitle(pick({ type: 'select_tribute', count: { now: 1, need: 2 } }), '500')).toBe('Sacrificios: 1 de 2')
    expect(pickTitle(pick({ type: 'select_sum', count: { now: 3, need: 8 } }), '500')).toBe('Niveles: 3 de 8')
  })

  it('en inglés', async () => {
    await loadLocale('en')
    applyLocale('en')
    expect(pickTitle(pick(), '503')).toBe('Choose 2 cards to banish · 1/2')
    expect(pickTitle(pick({ min: 1, max: 1 }), '506')).toBe('Choose 1 card to add to your hand')
    expect(pickTitle(pick(), '511')).toBe('Choose 2 cards as Fusion Material · 1/2')
    expect(pickTitle(pick(), '575')).toBe('Choose 2 cards · 1/2')
  })
})

describe('ask-ui: declarar una carta (`announce_card`)', () => {
  const announce = (cards?: number[]): CoreAsk => ({ type: 'announce_card', player: 0, opcodes: ['46986414', '1073741840'], ...(cards ? { cards } : {}) })

  it('es una elección de una carta de una lista aparte, por código: el toque la declara', () => {
    const state = open(announce([46986414, 89631139]), ctx(MESA))
    const pick = askView(state).cardPick!

    expect(askView(state).auto).toBeNull()
    expect(pick).toMatchObject({ type: 'announce_card', surface: 'list', min: 1, max: 1, eligible: [0, 1], done: false })
    expect(pick.cards).toEqual([{ ref: null, code: 46986414, place: 'none' }, { ref: null, code: 89631139, place: 'none' }])
    expect(askView(state).cancelable).toBe(false)
    expect(step(state, { kind: 'pick', index: 1 }).answer).toEqual({ type: 'announce_card', code: 89631139 })
    expect(step(state, { kind: 'pick', index: 2 }).answer).toBeUndefined()
    expect(pickTitle(pick)).toBe('Declará el nombre de una carta')
  })

  it('sin cartas que ofrecer (un anfitrión de antes, o ninguna cumple el filtro), no hay respuesta segura: la línea avisa', () => {
    expect(askView(open(announce(), ctx(MESA))).auto).toEqual({ answer: null, why: 'none' })
    expect(askView(open(announce([]), ctx(MESA))).auto).toEqual({ answer: null, why: 'none' })
  })

  it('las que se declaran van por nombre (el orden del anfitrión es por código)', () => {
    const names: Record<number, string> = { 1: 'Zeta', 2: 'Alfa', 3: 'Mima' }
    const cards = [1, 2, 3].map((code): AskCard => ({ ref: null, code, place: 'none' }))

    expect(listOrder(cards, (card) => names[card.code]!)).toEqual([1, 2, 0])
  })
})

describe('ask-ui: las preguntas que antes se contestaban solas (contadores, casillas del rival, ordenar la cadena)', () => {
  const byType = <T extends CoreAsk['type']>(type: T) => ASKS.find((ask) => ask.type === type) as Extract<CoreAsk, { type: T }>

  it('sacar contadores: de a uno por carta, sin pasar los que tiene cada una ni el total; «Listo» con el total justo', () => {
    const state = open(byType('select_counter'), ctx(MESA))
    const view = askView(state)

    expect(view.auto).toBeNull()
    expect(view.counters).toMatchObject({ now: [0, 0], need: 3, done: false })
    expect(view.counters?.cards.map((card) => card.value)).toEqual([1, 5])
    expect(view.respond).toEqual([mine('card-200-1'), mine('card-960-1')])
    // La primera tiene uno solo: el segundo toque no hace nada.
    const one = tap(state, { kind: 'pick', index: 0 })

    expect(step(one.state, { kind: 'pick', index: 0 })).toEqual({ state: one.state })
    expect(step(one.state, { kind: 'done' })).toEqual({ state: one.state })
    const full = tap(one.state, { kind: 'pick', index: 1 }, { kind: 'pick', index: 1 })

    expect(askView(full.state).counters).toMatchObject({ now: [1, 2], done: true })
    expect(step(full.state, { kind: 'pick', index: 1 })).toEqual({ state: full.state })
    expect(step(full.state, { kind: 'done' }).answer).toEqual({ type: 'select_counter', counters: [1, 2] })
    expect(tap(state, { kind: 'pick', index: 1 }, { kind: 'pick', index: 1 }, { kind: 'pick', index: 1 }, { kind: 'done' }).answer).toEqual({ type: 'select_counter', counters: [0, 3] })
    expect(step(state, { kind: 'cancel' })).toEqual({ state })
  })

  it('sacar contadores con una sola manera (una carta con contadores, o todos los que hay) se contesta sola', () => {
    const ask = byType('select_counter')

    expect(askView(open({ ...ask, cards: [{ ...ask.cards[0]!, count: 0 }, ask.cards[1]!] }, ctx(MESA))).auto).toEqual({ answer: { type: 'select_counter', counters: [0, 3] }, why: 'forced' })
    expect(askView(open({ ...ask, count: 6 }, ctx(MESA))).auto).toEqual({ answer: { type: 'select_counter', counters: [1, 5] }, why: 'forced' })
  })

  it('inutilizar casillas: las tuyas y las del rival se encienden y se tocan (también con «Casilla: la primera libre»); con una sola manera, sola', () => {
    // Libres: mi mz 0, la mz 1 y la st 2 del rival.
    const ask: CoreAsk = { type: 'select_disfield', player: 0, count: 1, field_mask: ~(1 | (1 << 17) | (1 << 26)) >>> 0 }
    const state = open(ask, ctx(MESA, { prefs: { chainMode: 'ask', placeMode: 'auto' } }))

    expect(askView(state).zonePick?.targets).toEqual([
      { side: 'mine', zone: 'mz', index: 0 },
      { side: 'theirs', zone: 'mz', index: 1 },
      { side: 'theirs', zone: 'st', index: 2 },
    ])
    expect(step(state, { kind: 'zone', side: 'theirs', zone: 'st', index: 2 }).answer).toEqual({ type: 'select_disfield', places: [{ player: 1, location: L.SZONE, sequence: 2 }] })
    expect(step(state, { kind: 'zone', side: 'theirs', zone: 'mz', index: 0 })).toEqual({ state })
    expect(askView(open({ ...ask, count: 3 }, ctx(MESA))).auto?.why).toBe('forced')
  })

  it('una casilla del rival (un Kaiju que va a su campo): se ofrecen las suyas y tocar una contesta con su lado', () => {
    const state = open({ type: 'select_place', player: 0, count: 1, field_mask: ~((1 << 16) | (1 << 17)) >>> 0 }, ctx(MESA))

    expect(askView(state).auto).toBeNull()
    expect(askView(state).zonePick?.targets).toEqual([
      { side: 'theirs', zone: 'mz', index: 0 },
      { side: 'theirs', zone: 'mz', index: 1 },
    ])
    expect(step(state, { kind: 'zone', side: 'theirs', zone: 'mz', index: 1 }).answer).toEqual({ type: 'select_place', places: [{ player: 1, location: L.MZONE, sequence: 1 }] })
  })

  it('ordenar la cadena: como ordenar cartas, con su tipo; «Dejar como está» deja el orden del núcleo', () => {
    const state = open(byType('sort_chain'), ctx(MESA))

    expect(askView(state).sort?.cards.map((card) => card.ref)).toEqual([mine('card-200-1'), mine('card-950-1')])
    expect(askView(state).respond).toEqual([mine('card-200-1'), mine('card-950-1')])
    expect(tap(state, { kind: 'card', ref: mine('card-950-1') }, { kind: 'pick', index: 0 }, { kind: 'done' }).answer).toEqual({ type: 'sort_chain', order: [1, 0] })
    expect(step(state, { kind: 'cancel' }).answer).toEqual({ type: 'sort_chain', order: null })
  })
})

describe('pickStatsOf: el ATK/DEF de ahora al elegir en el campo', () => {
  it('sólo los monstruos de las zonas de monstruos con lo consultado; nivel 0 y DEF 0 (un Link) va sin DEF', () => {
    const mat = createMatState([], [], 0)
    const at = (id: string) => ({ id, pos: 'atk' as const, counters: 0, materials: [] })

    mat.mz[0] = at('a')
    mat.mz[1] = at('set')
    mat.emz[0] = at('link')
    mat.st[0] = at('spell')
    mat.hand.push('hand')
    const stats = { a: { attack: 2400, defense: 200, level: 4 }, link: { attack: 2300, defense: 0, level: 0 }, spell: { attack: 0, defense: 0, level: 0 }, hand: { attack: 1, defense: 1, level: 1 } }

    expect([...pickStatsOf(mat, ['a', 'set', 'link', 'spell', 'hand', 'nope'], stats)]).toEqual([
      ['a', { attack: 2400, defense: 200 }],
      ['link', { attack: 2300, defense: null }],
    ])
    expect(pickStatsOf(mat, [], stats).size).toBe(0)
  })
})
