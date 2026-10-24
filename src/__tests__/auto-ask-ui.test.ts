import { t } from '../i18n'
import type { CardRef, Side } from '../app/auto/adapter'
import { askView, openAsk, step, type AskContext, type AskGesture, type AskQueries, type AskState } from '../app/auto/ask-ui'
import { ASK_SHAPES, LOCATION as L, parseAnswer, type CoreAnswer, type CoreAsk, type Seat } from '../app/auto/protocol'
import { createMatState, type MatPile, type MatPos, type MatState } from '../app/practice-mat'
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
    activates: [act(900, L.HAND, 1), act(950, L.SZONE, 1), act(400, L.GRAVE, 0, '6401'), act(400, L.GRAVE, 0, '6402'), act(300, L.HAND, 2, '1160')],
    to_bp: true,
    to_ep: true,
    shuffle: true,
  },
  { type: 'select_effectyn', player: 0, ...pos(400, L.GRAVE, 0, 5), description: '6400' },
  { type: 'select_yesno', player: 0, description: '31' },
  { type: 'select_option', player: 0, options: ['6400', '6401', '1190'] },
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
  { type: 'announce_card', player: 0, opcodes: ['46986414', '1073741840'] },
  { type: 'announce_number', player: 0, options: ['1', '2', '4'] },
  { type: 'rock_paper_scissors', player: 0 },
]

const NO_UI = ['select_counter', 'select_disfield', 'sort_chain', 'announce_card', 'rock_paper_scissors']

describe('ask-ui: las 21 preguntas del núcleo en la mesa de siempre', () => {
  it('cada tipo tiene su gesto: tocando al azar lo ofrecido, siempre llega una respuesta que el núcleo acepta, y ningún toque ofrecido queda muerto', () => {
    expect(new Set(ASKS.map((ask) => ask.type))).toEqual(new Set(Object.keys(ASK_SHAPES)))

    for (const ask of ASKS) {
      const random = seeded(ask.type.length)
      const context = ctx(MESA, { announceCard: () => 46986414 })

      for (let run = 0; run < 60; run += 1) {
        const played = playAsk(open(ask, context), random)

        expect({ type: ask.type, stuck: played.stuck, dead: played.dead }).toEqual({ type: ask.type, stuck: false, dead: 0 })
        expect(parseAnswer(played.answer)).toEqual(played.answer)
        expect(legal(ask, played.answer!)).toBe(true)
        expect(played.auto?.why === 'none').toBe(NO_UI.includes(ask.type))
      }
    }
  })

  it('las jugadas del turno: cada carta con sus palabras de siempre, «¿cuál efecto?» en un segundo paso y todo lo legal a un toque (menos barajar la mano)', () => {
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
    // Dos efectos del cementerio: una sola opción que pregunta cuál, cada uno con su número.
    const [grave] = view.items.get('card-400-1')!

    expect(grave).toMatchObject({ label: t('practice.menu.activateEffect') })
    expect(grave!.answer).toBeUndefined()
    expect(grave!.children?.map((child) => [child.lead, child.label, child.answer])).toEqual([
      [t('practice.menu.effectLead', { n: 1 }), t('practice.menu.activateEffect'), { type: 'select_idlecmd', action: 5, index: 2 }],
      [t('practice.menu.effectLead', { n: 2 }), t('practice.menu.activateEffect'), { type: 'select_idlecmd', action: 5, index: 3 }],
    ])
    // Lo que el núcleo acepta, menos barajar la mano (la mesa no la ofrece), está a un toque.
    const offered = new Set(gesturesOf(view).map((gesture) => JSON.stringify(gesture.kind === 'item' ? gesture.answer : null)))
    const lists = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'] as const
    const ask = ASKS[1] as Extract<CoreAsk, { type: 'select_idlecmd' }>
    const legalOnes = [...lists.flatMap((key, action) => ask[key].map((_, index) => ({ type: ask.type, action, index }))), { type: ask.type, action: 6, index: null }, { type: ask.type, action: 7, index: null }]

    expect(legalOnes.filter((answer) => !offered.has(JSON.stringify(answer)))).toEqual([])
    expect(view.respond).toHaveLength(view.items.size)
    // La frase de cada efecto la pone la pantalla (la costura); nunca queda vacía.
    const named = askView(open(ASKS[1]!, ctx(MESA, { effectLabel: (code, description) => (description === '6401' ? `${code}:1` : '') })))

    expect(named.items.get('card-400-1')![0]!.children!.map((child) => child.label)).toEqual(['400:1', t('practice.menu.activateEffect')])
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
    expect(view.items.get('card-950-1')).toEqual([{ label: t('practice.menu.activate'), answer: { type: 'select_chain', index: 0 }, effect: { code: 950, description: '0' } }])
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
  })

  it('sí o no: el efecto con su carta (que brilla) y el sí o no a secas, cada uno con sus dos respuestas', () => {
    const effect = askView(open(ASKS[2]!, ctx(MESA)))

    expect(effect.prompt).toEqual({ card: { ref: mine('card-400-1'), code: 400, place: 'pile', pile: 'gy' }, description: '6400', yes: { type: 'select_effectyn', yes: true }, no: { type: 'select_effectyn', yes: false } })
    expect(effect.respond).toEqual([mine('card-400-1')])
    expect(step(open(ASKS[2]!, ctx(MESA)), { kind: 'item', answer: { type: 'select_effectyn', yes: true } }).answer).toEqual({ type: 'select_effectyn', yes: true })
    expect(askView(open(ASKS[3]!, ctx(MESA))).prompt).toMatchObject({ card: null, description: '31' })
    expect(askView(open(ASKS[3]!, ctx(MESA))).title).toBe('500')
  })

  it('opciones, números y posiciones: un toque contesta; la posición con las palabras de la mesa y, si hay una sola, sola', () => {
    const options = askView(open(ASKS[4]!, ctx(MESA, { effectLabel: (_, description) => (description === '1190' ? 'A la mano' : null) })))

    expect(options.options).toEqual({ of: 'option', count: 1, options: [{ value: 0, description: '6400' }, { value: 1, description: '6401' }, { value: 2, description: '1190', label: 'A la mano' }], chosen: [] })
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
    // Sólo casillas del rival (la mesa todavía no las enciende): la primera, sola.
    expect(askView(open({ type: 'select_place', player: 0, count: 1, field_mask: ~((1 << 16) | (1 << 17)) >>> 0 }, ctx(MESA))).auto).toEqual({ answer: { type: 'select_place', places: [{ player: 1, location: L.MZONE, sequence: 0 }] }, why: 'none' })
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

  it('sin pantalla todavía: contadores, casillas del rival, ordenar la cadena, anunciar una carta y piedra, papel o tijera se contestan solos con una respuesta legal (anunciar, sólo con catálogo)', () => {
    const autos = Object.fromEntries(ASKS.filter((ask) => NO_UI.includes(ask.type)).map((ask) => [ask.type, askView(open(ask, ctx(MESA))).auto]))

    expect(autos).toEqual({
      select_counter: { answer: { type: 'select_counter', counters: [1, 2] }, why: 'none' },
      select_disfield: { answer: { type: 'select_disfield', places: [{ player: 0, location: L.MZONE, sequence: 0 }] }, why: 'none' },
      sort_chain: { answer: { type: 'sort_chain', order: null }, why: 'none' },
      announce_card: { answer: null, why: 'none' },
      rock_paper_scissors: { answer: { type: 'rock_paper_scissors', value: 1 }, why: 'none' },
    })
    expect(askView(open(ASKS[18]!, ctx(MESA, { announceCard: () => 46986414 }))).auto).toEqual({ answer: { type: 'announce_card', code: 46986414 }, why: 'none' })
  })
})
