import { appendFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { OcgDuelMode } from 'ocgcore-wasm'
import { createAdapter } from '../app/auto/adapter'
import { askView, openAsk, type AskContext, type AskView, type ZoneTarget } from '../app/auto/ask-ui'
import { createAutoHost } from '../app/auto/core-host'
import { teamOrder } from '../app/auto/deck-map'
import { randomLegalPolicy } from '../app/auto/policies'
import { parseAnswer, type AutoCommand, type AutoEvent, type CoreAnswer, type CoreAsk } from '../app/auto/protocol'
import { gesturesOf, playAsk, seeded } from './support/ask-ui-player'
import { CORE_DATA_DIR, hasCoreData, loadCards, metaDecks, scriptStore, wasmBinary } from './support/core-data'

/**
 * El oráculo de legalidad de `ask-ui.ts` (lento: `npm run test:auto`). Con el núcleo real y un adaptador por asiento, un jugador al azar
 * que sólo toca lo que la pantalla ofrece (`gesturesOf`: ítems, casillas, cartas elegibles, contadores, opciones, Listo, Cancelar; nunca una
 * respuesta cruda) juega los dos asientos de duelos con decks del meta. Cuenta: `retry` (el núcleo rechazó lo ofrecido: tiene que ser 0),
 * respuestas que `parseAnswer` rechaza, preguntas sin gesto, toques ofrecidos que no hacen nada, lo que se contestó solo (y por qué) y lo
 * legal que no se ofrece en las preguntas de menú. Parámetros: ORACLE_DUELS (50), ORACLE_SEED (1), ORACLE_CAP preguntas por duelo (2000),
 * ORACLE_DUEL_S segundos por duelo (60). El informe va a CORE_DATA_DIR (nunca al repo); el avance, a oracle-progress.log.
 */
const DUELS = Number(process.env.ORACLE_DUELS ?? 50)
/** Desde qué duelo (para repetir uno). */
const FROM = Number(process.env.ORACLE_FROM ?? 0)
const SEED = Number(process.env.ORACLE_SEED ?? 1)
const CAP = Number(process.env.ORACLE_CAP ?? 2000)
const DUEL_MS = Number(process.env.ORACLE_DUEL_S ?? 60) * 1000
const MR5 = String(OcgDuelMode.MODE_MR5)
const PLAYERS = [
  { lp: 8000, hand: 5, draw: 1 },
  { lp: 8000, hand: 5, draw: 1 },
]
/** Las casillas propias donde se puede soltar una carta de la mano. */
const DROPS: ZoneTarget[] = [...(['mz', 'st'] as const).flatMap((zone) => [0, 1, 2, 3, 4].map((index) => ({ side: 'mine' as const, zone, index }))), { side: 'mine', zone: 'field', index: 0 }]
const IDLE_LISTS = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'] as const

type Activation = { code: number; controller: number; location: number; sequence: number; description: string }
/** El mismo efecto de la misma carta que ya vino antes en la lista (un disparo por cada evento): la pantalla lo muestra una vez, con la primera. */
const repeated = (list: readonly Activation[], index: number) => list[index]!.description !== '0' && list.findIndex((other) => (['code', 'controller', 'location', 'sequence', 'description'] as const).every((key) => other[key] === list[index]![key])) !== index

/** Las respuestas legales de las preguntas de menú (las que se pueden enumerar), para ver qué no ofrece la pantalla (sin las repetidas). */
function legalAnswers(ask: CoreAsk): CoreAnswer[] | null {
  return allLegal(ask)?.filter((answer) => {
    if (answer.type === 'select_chain' && answer.index !== null && ask.type === 'select_chain') return !repeated(ask.selects, answer.index)
    if (answer.type === 'select_battlecmd' && answer.action === 0 && answer.index !== null && ask.type === 'select_battlecmd') return !repeated(ask.chains, answer.index)
    if (answer.type === 'select_idlecmd' && answer.action === 5 && answer.index !== null && ask.type === 'select_idlecmd') return !repeated(ask.activates, answer.index)
    return true
  }) ?? null
}

function allLegal(ask: CoreAsk): CoreAnswer[] | null {
  switch (ask.type) {
    case 'select_idlecmd':
      return [
        ...IDLE_LISTS.flatMap((key, action) => ask[key].map((_, index) => ({ type: ask.type, action, index }))),
        ...[6, 7, 8].filter((action) => (action === 6 ? ask.to_bp : action === 7 ? ask.to_ep : ask.shuffle)).map((action) => ({ type: ask.type, action, index: null })),
      ]
    case 'select_battlecmd':
      return [
        ...ask.chains.map((_, index) => ({ type: ask.type, action: 0, index })),
        ...ask.attacks.map((_, index) => ({ type: ask.type, action: 1, index })),
        ...[2, 3].filter((action) => (action === 2 ? ask.to_m2 : ask.to_ep)).map((action) => ({ type: ask.type, action, index: null })),
      ]
    case 'select_chain':
      return [...ask.selects.map((_, index) => ({ type: ask.type, index })), ...(ask.forced ? [] : [{ type: ask.type, index: null }])]
    case 'select_effectyn':
    case 'select_yesno':
      return [true, false].map((yes) => ({ type: ask.type, yes }))
    case 'select_option':
    case 'announce_number':
      return ask.options.map((_, index) => ({ type: ask.type, index }))
    case 'select_position':
      return [1, 2, 4, 8].filter((position) => (ask.positions & position) !== 0).map((position) => ({ type: ask.type, position }))
    default:
      return null
  }
}

/** Lo que la pantalla deja contestar de un toque (o con Cancelar) en una pregunta de menú. */
function offeredAnswers(view: AskView): string[] {
  return gesturesOf(view).flatMap((gesture) => {
    if (gesture.kind === 'item') return [JSON.stringify(gesture.answer)]
    if (gesture.kind === 'cancel' && view.type === 'select_chain') return [JSON.stringify({ type: view.type, index: null })]
    if (gesture.kind !== 'option') return []
    if (view.type === 'select_position') return [JSON.stringify({ type: view.type, position: gesture.value })]

    return view.type === 'select_option' || view.type === 'announce_number' ? [JSON.stringify({ type: view.type, index: gesture.value })] : []
  })
}

const bump = (record: Record<string, number>, key: string, by = 1) => void (record[key] = (record[key] ?? 0) + by)

describe.skipIf(!hasCoreData)('el oráculo de legalidad de ask-ui (npm run test:auto)', () => {
  it(`${DUELS} duelos: lo que la pantalla ofrece es lo que el núcleo acepta`, { timeout: 4 * 60 * 60 * 1000 }, async () => {
    const { cards, names } = loadCards()
    const store = scriptStore()
    const decks = metaDecks(cards, store)
    const typeOf = (code: number) => cards.get(code)?.type ?? 0
    const wasm = wasmBinary()
    const tally = {
      duels: 0,
      ends: {} as Record<string, number>,
      questions: {} as Record<string, number>,
      answeredByTaps: 0,
      taps: 0,
      auto: {} as Record<string, number>,
      retries: {} as Record<string, number>,
      faults: {} as Record<string, number>,
      stuck: {} as Record<string, number>,
      dead: 0,
      unparsed: 0,
      notOffered: {} as Record<string, number>,
      /** Lo que tarda `ask-ui` (abrir la pregunta y todos sus toques), en ms: en total y lo más lento por tipo. */
      uiMs: 0,
      uiMaxMs: {} as Record<string, number>,
      coreMs: 0,
    }
    const samples: { duel: number; kind: string; detail: string }[] = []
    const progress = path.join(CORE_DATA_DIR, 'oracle-progress.log')
    const started = performance.now()

    writeFileSync(progress, '')

    for (let d = FROM; d < FROM + DUELS; d += 1) {
      const a = decks[d % decks.length]!
      const other = (d * 7 + 3) % decks.length
      const b = decks[other === d % decks.length ? (other + 1) % decks.length : other]!
      const seed = (SEED * 100_003 + d) >>> 0
      const random = seeded(seed)
      const events: AutoEvent[] = []
      const host = createAutoHost({ core: { wasmBinary: wasm }, cardReader: (code) => cards.get(code) ?? null, scriptReader: store.read, emit: (event) => events.push(event) })
      const create: Extract<AutoCommand, { t: 'create' }> = { t: 'create', seed, flags: MR5, players: PLAYERS, decks: [{ main: a.main, extra: a.extra, hand: [] }, { main: b.main, extra: b.extra, hand: [] }] }
      const adapters = ([0, 1] as const).map((seat) =>
        createAdapter({ seat, mine: { deck: teamOrder(create, seat), extra: create.decks[seat]!.extra }, theirs: { deck: create.decks[1 - seat]!.main.length, extra: create.decks[1 - seat]!.extra.length }, lp: [8000, 8000], typeOf }),
      )
      // Uno de cada cinco, con los ajustes: «Respuestas: Nunca» y «Casilla: automática».
      const prefs: AskContext['prefs'] = d % 5 === 4 ? { chainMode: 'never', placeMode: 'auto' } : { chainMode: 'ask', placeMode: 'ask' }
      const fallback = randomLegalPolicy(seed)
      // La casilla donde «se soltó» la carta (`prefer`), al azar entre las propias, libres u ocupadas: la que la máscara da contesta sola (`drop`) y el núcleo nunca la rechaza.
      const drops = seeded(seed + 1)
      const duelStart = performance.now()
      let from = 0
      let end = 'cap'

      await host.handle(create)
      for (let q = 0; q < CAP; q += 1) {
        const fresh = events.slice(from)

        from = events.length
        for (const event of fresh) adapters.forEach((adapter) => adapter.apply(event))
        if (fresh.some((event) => event.t === 'end')) {
          end = 'win'
          break
        }
        const asked = fresh.findLast((event) => event.t === 'ask')

        if (!asked) {
          end = 'stuck'
          break
        }
        if (performance.now() - duelStart > DUEL_MS) {
          end = 'slow'
          break
        }
        const { ask } = asked
        const uiStart = performance.now()
        const state = openAsk(asked, { queries: adapters[asked.seat]!, prefs, typeOf, prefer: DROPS[Math.floor(drops() * DROPS.length)]! })
        const view = askView(state)
        const legalOnes = view.auto ? null : legalAnswers(ask)

        bump(tally.questions, ask.type)
        if (legalOnes) {
          const offered = new Set(offeredAnswers(view))

          for (const answer of legalOnes) {
            if (offered.has(JSON.stringify(answer))) continue
            bump(tally.notOffered, `${ask.type}${'action' in answer ? `:${answer.action}` : ''}`)
            if (ask.type !== 'select_idlecmd' && samples.length < 40) samples.push({ duel: d, kind: `not offered ${ask.type} ${JSON.stringify(answer)}`, detail: JSON.stringify({ ask, items: [...view.items.keys()], respond: view.respond }).slice(0, 1200) })
          }
        }
        const played = playAsk(state, random)
        const uiMs = performance.now() - uiStart

        tally.uiMs += uiMs
        tally.uiMaxMs[ask.type] = Math.max(tally.uiMaxMs[ask.type] ?? 0, Math.round(uiMs))
        if (uiMs > 50 && samples.length < 40) samples.push({ duel: d, kind: `slow ui ${ask.type} ${Math.round(uiMs)} ms, ${played.taps} taps`, detail: JSON.stringify(ask).slice(0, 900) })
        tally.taps += played.taps
        tally.dead += played.dead
        if (played.auto) bump(tally.auto, `${ask.type}:${played.auto.why}${played.auto.answer ? '' : ':null'}`)
        else if (played.answer) tally.answeredByTaps += 1
        let answer = played.answer

        if (played.stuck) {
          bump(tally.stuck, ask.type)
          if (samples.length < 40) samples.push({ duel: d, kind: `stuck ${ask.type}`, detail: JSON.stringify(ask).slice(0, 600) })
        }
        if (answer && !parseAnswer(answer)) tally.unparsed += 1
        if (!answer || !parseAnswer(answer)) answer = fallback(ask)
        const coreStart = performance.now()

        await host.handle({ t: 'answer', askId: asked.askId, answer })
        tally.coreMs += performance.now() - coreStart
        const rejected = events.slice(from).find((event) => event.t === 'fault' && event.kind === 'retry')

        if (rejected && samples.length < 40) samples.push({ duel: d, kind: `retry ${ask.type}`, detail: JSON.stringify({ ask, answer, auto: played.auto }).slice(0, 900) })
      }
      for (const event of events) {
        if (event.t !== 'fault') continue
        if (event.kind === 'retry') bump(tally.retries, event.message.replace(/^RETRY: the core rejected the answer to /, ''))
        else bump(tally.faults, event.kind)
      }
      tally.duels += 1
      bump(tally.ends, end)
      await host.handle({ t: 'destroy' })
      appendFileSync(progress, `${new Date().toISOString()} duelo ${d + 1}/${DUELS} ${a.id}-${b.id} ${end} ${Math.round((performance.now() - started) / 1000)} s\n`)
    }

    const report = { parameters: { duels: DUELS, seed: SEED, cap: CAP, seconds: Math.round((performance.now() - started) / 1000) }, tally, samples, names: Object.fromEntries([...new Set(samples.flatMap((sample) => sample.detail.match(/\d{5,}/g) ?? []))].map((code) => [code, names.get(Number(code)) ?? '?'])) }

    writeFileSync(path.join(CORE_DATA_DIR, `oracle-${DUELS}-s${SEED}.json`), JSON.stringify(report, null, 1))
    console.log(JSON.stringify(report.tally))

    // Nada se contesta solo «sin pantalla».
    const undeclared = Object.keys(tally.auto).filter((key) => key.split(':')[1] === 'none')

    expect({ retries: tally.retries, stuck: tally.stuck, dead: tally.dead, unparsed: tally.unparsed, undeclared, nullAnswers: Object.keys(tally.auto).filter((key) => key.endsWith(':null')) }).toEqual({ retries: {}, stuck: {}, dead: 0, unparsed: 0, undeclared: [], nullAnswers: [] })
    // Lo legal que la pantalla no ofrece en las preguntas de menú: sólo barajar la mano (la mesa no lo tiene).
    expect(Object.keys(tally.notOffered).filter((key) => key !== 'select_idlecmd:8')).toEqual([])
    expect(tally.duels).toBe(DUELS)
  })
})
