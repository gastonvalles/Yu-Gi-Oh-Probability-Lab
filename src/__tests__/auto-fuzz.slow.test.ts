import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { cardMatchesOpcode, OcgDuelMode, OcgLocation as L, OcgQueryFlags as Q, ocgMessageTypeStrings, type OcgCoreSync, type OcgDuelHandle, type OcgMessage } from 'ocgcore-wasm'
import { createAdapter, type Adapter } from '../app/auto/adapter'
import { createAutoHost } from '../app/auto/core-host'
import { teamOrder } from '../app/auto/deck-map'
import { handtrapPolicy, randomLegalPolicy, type CardPicker } from '../app/auto/policies'
import { parseAutoEvent, type AutoCommand, type AutoEvent, type CoreAnswer, type CoreAsk, type Seat } from '../app/auto/protocol'
import { autoRival, HANDTRAP_CATALOG, MAX_RIVAL_HAND } from '../app/handtraps'
import { CORE_DATA_DIR, hasCoreData, loadCards, metaDecks, nodeSource, runDuel, scriptStore, wasmBinary } from './support/core-data'

/**
 * El fuzz del núcleo (lento: fuera de `npm test`, se corre con `npm run test:auto`). Dos bots al azar legal juegan duelos con decks del
 * meta y se cuentan los invariantes de F1: 0 RETRY, 0 mensajes sin manejar, 0 eventos que del otro lado no se leen, 0 errores del núcleo (salvo `KNOWN_SCRIPT_ERRORS`), 0
 * cuelgues; el asiento filtrado nunca ve lo oculto (un oráculo aparte, con el estado real que da `duelQueryLocation`); `rewind` reproduce
 * los eventos y un duelo con semilla fija se repite igual. Lo mismo con el rival de handtraps en el asiento 1 (`Rival`). Escribe el
 * informe por carta y el de lentitud en CORE_DATA_DIR (nunca en el repo). Parámetros: FUZZ_DECKS (20), FUZZ_DUELS por deck (4),
 * FUZZ_HANDTRAP_DUELS por deck contra el rival de handtraps (2), FUZZ_SEED (1), FUZZ_CAP preguntas por duelo (2000), FUZZ_DUEL_S
 * segundos por duelo (120: un duelo más largo se corta y queda en el informe de lentitud, no cuenta como cuelgue). El avance va a
 * fuzz-progress.log (y fuzz-progress-handtraps.log).
 */
const DECKS = Number(process.env.FUZZ_DECKS ?? 20)
const DUELS = Number(process.env.FUZZ_DUELS ?? 4)
const HANDTRAP_DUELS = Number(process.env.FUZZ_HANDTRAP_DUELS ?? 2)
const SEED = Number(process.env.FUZZ_SEED ?? 1)
const CAP = Number(process.env.FUZZ_CAP ?? 2000)
const DUEL_MS = Number(process.env.FUZZ_DUEL_S ?? 120) * 1000
const MR5 = String(OcgDuelMode.MODE_MR5)
const PLAYERS = [
  { lp: 8000, hand: 5, draw: 1 },
  { lp: 8000, hand: 5, draw: 1 },
]
const FACEUP = 5
const IDLE_LISTS = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'] as const
/**
 * Lista blanca: errores de scripts de Project Ignis comprobados con el núcleo (ni del anfitrión ni de la política: todas las respuestas
 * fueron legales, sin `RETRY`). Se cuentan aparte (`knownScriptErrors`); cualquier otro error de script sigue contando en `coreErrors`.
 */
const KNOWN_SCRIPT_ERRORS = [
  // Haggard Lizardose (9763474): su costo exige que quede un monstruo boca arriba con otro ATK que el del desterrado, pero desterrar
  // cambia ese ATK si depende de lo desterrado (Vidolia del rival: −100 por carta desterrada; desterrar Droll & Lock Bird, de 0, deja a
  // la propia Lizardose de 100 en 0). `atktg` no lo vuelve a mirar, el núcleo no pregunta un objetivo que no hay y `atkop` indexa el
  // `nil` de `GetFirstTarget()`. Visto con FUZZ_SEED=1 (duelo 9/80: 733111 contra 737998) y CardScripts 532d283: sacarlo cuando el
  // script lo chequee.
  /"c9763474\.lua"\]:50: attempt to index a nil value \(local 'tc'\)/,
]

const name = (message: OcgMessage) => ocgMessageTypeStrings.get(message.type as never) as string

// ── El oráculo de la información oculta: escrito aparte del árbitro, con las reglas del juego y el estado real ─────────────────────

/** Si `seat` puede ver la carta en ese lugar, por las reglas: el cementerio y los materiales; lo boca arriba fuera del deck y la mano; lo propio menos el deck. */
const gameKnows = (seat: Seat, card: { controller: number; location: number; position?: number }) =>
  (card.location & (L.GRAVE | L.OVERLAY)) !== 0 || ((card.location & (L.DECK | L.HAND)) === 0 && ((card.position ?? 0) & FACEUP) !== 0) || (card.controller === seat && (card.location & L.DECK) === 0)

/** Los códigos que `seat` ve en el estado real, y todos los suyos (para las preguntas: buscar es mirar el propio deck). */
function visible(lib: OcgCoreSync, handle: OcgDuelHandle) {
  const seen: [Set<number>, Set<number>] = [new Set(), new Set()]
  const own: [Set<number>, Set<number>] = [new Set(), new Set()]

  for (const controller of [0, 1] as const) {
    for (const location of [L.DECK, L.HAND, L.MZONE, L.SZONE, L.GRAVE, L.REMOVED, L.EXTRA]) {
      for (const card of lib.duelQueryLocation(handle, { flags: (Q.CODE | Q.POSITION | Q.IS_PUBLIC | Q.OVERLAY_CARD) as Q, controller, location })) {
        if (!card?.code) continue
        own[controller].add(card.code)
        for (const seat of [0, 1] as const) {
          card.overlayCards?.forEach((code) => seen[seat].add(code))
          if (card.isPublic || gameKnows(seat, { controller, location, position: card.position })) seen[seat].add(card.code)
        }
      }
    }
  }

  return { seen, own }
}

/** Lo que `seat` ve pasar dentro de la tanda aunque al final ya no esté a la vista (lo que se excava, se roba, se activa o pasa por un lugar suyo). */
function revealed(seat: Seat, raw: OcgMessage[], into: Set<number>) {
  for (const message of raw) {
    const m = message as unknown as Record<string, never> & { cards: { code: number; controller: number; location: number }[] }

    switch (name(message)) {
      case 'confirm_decktop':
      case 'confirm_extratop':
        m.cards.forEach((card) => into.add(card.code))
        break
      case 'confirm_cards':
        m.cards.forEach((card) => (m.player === seat || gameKnows(seat, card)) && into.add(card.code))
        break
      case 'draw':
        ;(m.drawn as { code: number; position: number }[]).forEach((card) => (m.player === seat || (card.position & FACEUP) !== 0) && into.add(card.code))
        break
      case 'shuffle_hand':
      case 'shuffle_extra':
        if (m.player === seat) (m.cards as unknown as number[]).forEach((code) => into.add(code))
        break
      case 'chaining':
        into.add(m.code)
        break
      case 'move':
        if (gameKnows(seat, m.to as never)) into.add(m.card)
        break
      case 'set':
      case 'summoning':
      case 'spsummoning':
      case 'flipsummoning':
      case 'pos_change':
      case 'missed_effect':
        if (gameKnows(seat, m as never)) into.add(m.code)
        break
      case 'swap':
        for (const card of [m.card1, m.card2] as { code: number; controller: number; location: number; position: number }[]) if (gameKnows(seat, card)) into.add(card.code)
        break
    }
  }
}

/** Las cartas que nombran las pistas de efecto y de carta (`HINT_EFFECT`, `HINT_CARD`): no dicen dónde está la carta, así que se miden contra todo lo que ese asiento vio en el duelo. */
const hintCodes = (events: unknown[]) =>
  events.flatMap((event) => {
    const hint = event as { type?: string; hint_type?: number; hint?: string }

    return hint.type === 'hint' && (hint.hint_type === 5 || hint.hint_type === 10) ? [Number(hint.hint)] : []
  })

/** Los códigos de carta que lleva lo que recibió un asiento, cada uno con su lugar (un nombre anunciado no cuenta). */
function codesIn(value: unknown, out: number[] = []): number[] {
  if (Array.isArray(value)) value.forEach((item) => codesIn(item, out))
  else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>

    for (const [key, item] of Object.entries(record)) {
      if ((key === 'code' || key === 'card') && typeof item === 'number') out.push(item)
      else if ((key === 'cards' || key === 'returned_to_extra') && Array.isArray(item) && item.every((x) => typeof x === 'number')) out.push(...(item as number[]))
      else codesIn(item, out)
    }
  }

  return out
}

/** Con qué carta se jugó una respuesta (la acción del turno, de batalla, la cadena o el sí a un efecto). */
function cardOf(ask: CoreAsk, answer: CoreAnswer): number | null {
  if (ask.type === 'select_idlecmd' && answer.type === ask.type && answer.action <= 5 && answer.index !== null) return ask[IDLE_LISTS[answer.action]!][answer.index]?.code ?? null
  if (ask.type === 'select_battlecmd' && answer.type === ask.type && answer.action <= 1 && answer.index !== null) return (answer.action === 0 ? ask.chains : ask.attacks)[answer.index]?.code ?? null
  if (ask.type === 'select_chain' && answer.type === ask.type && answer.index !== null) return ask.selects[answer.index]?.code ?? null
  if (ask.type === 'select_effectyn' && answer.type === ask.type && answer.yes) return ask.code

  return null
}

/** Las cartas que una pregunta ofrece jugar. */
function offeredBy(ask: CoreAsk): number[] {
  if (ask.type === 'select_idlecmd') return IDLE_LISTS.flatMap((key) => ask[key].map((card) => card.code))
  if (ask.type === 'select_battlecmd') return [...ask.chains, ...ask.attacks].map((card) => card.code)
  if (ask.type === 'select_chain') return ask.selects.map((card) => card.code)

  return ask.type === 'select_effectyn' ? [ask.code] : []
}

/** Los lotes de eventos de un duelo, para comparar dos corridas tal cual (el anfitrión ya ordena las pistas seguidas: `canonical`). */
const normalized = (events: AutoEvent[]) => events.filter((event) => event.t === 'events').map((event) => `${event.seat}|${event.n}|${JSON.stringify(event.events)}`)

/**
 * Contra quién juega el asiento 1: otro bot al azar con un deck del meta, o el rival de handtraps de la pantalla (`handtrapPolicy`, con lo que ve
 * su adaptador): las 15 del catálogo, una copia de cada una, 5 en la mano repartidas con la semilla del duelo y el relleno de Normales.
 */
type Rival = 'random' | 'handtraps'

describe.skipIf(!hasCoreData)('fuzz del núcleo (npm run test:auto)', () => {
  it(`${DECKS} decks × ${DUELS} duelos`, { timeout: 6 * 60 * 60 * 1000 }, () => fuzz('random', DUELS))
  it(`${DECKS} decks × ${HANDTRAP_DUELS} duelos contra el rival de handtraps`, { timeout: 6 * 60 * 60 * 1000 }, () => fuzz('handtraps', HANDTRAP_DUELS))

  async function fuzz(rival: Rival, duels: number) {
    const { cards, names } = loadCards()
    const store = scriptStore()
    const all = metaDecks(cards, store)
    const pool = Array.from({ length: Math.min(DECKS, all.length) }, (_, i) => all[Math.floor((i * all.length) / Math.min(DECKS, all.length))]!)
    const setup = autoRival({ enabled: true, picks: HANDTRAP_CATALOG.map((card) => ({ ...card, copies: 1 })), hand: MAX_RIVAL_HAND })!
    const own = setup.main.flatMap(([code, copies]) => Array<number>(copies).fill(code))
    const filler = rival === 'handtraps' ? (await nodeSource(undefined, store).manifest()).filler : []
    const handtraps = { id: 'handtraps', main: [...own, ...filler.slice(0, Math.max(0, filler.length - own.length))], extra: [] as number[], missing: [], noRules: [] }
    const suffix = rival === 'handtraps' ? '-handtraps' : ''
    const cardList = [...cards.values()]
    const pickCard: CardPicker = (ask, random) => {
      const opcodes = ask.opcodes.map(BigInt)
      const from = Math.floor(random() * cardList.length)

      for (let k = 0; k < cardList.length; k += 1) {
        const card = cardList[(from + k) % cardList.length]!

        if (cardMatchesOpcode(card, opcodes as never)) return card.code
      }

      return 0
    }
    const wasm = wasmBinary()
    const tally = { duels: 0, ends: {} as Record<string, number>, questions: {} as Record<string, number>, retries: 0, unhandled: 0, unparseable: 0, coreErrors: 0, knownScriptErrors: 0, exceptions: 0, otherFaults: 0, stuck: 0, leaks: 0, rewindChecked: 0, rewindMismatch: 0, repeatChecked: 0, repeatMismatch: 0, negations: 0, negationsBy: 0, badBy: 0, hotScripts: {} as Record<string, number> }
    const faults: { duel: number; message: string }[] = []
    const mismatches: { duel: number; kind: string; at: number; first: string; second: string }[] = []
    const differ = (duel: number, kind: string, first: string[], second: string[]) => {
      const at = first.findIndex((item, i) => item !== second[i])
      const index = at < 0 ? first.length : at

      if (index === first.length && first.length === second.length) return false
      const [x = '', y = ''] = [first[index], second[index]]
      let char = 0

      while (char < x.length && x[char] === y[char]) char += 1
      if (mismatches.length < 10) mismatches.push({ duel, kind, at: index, first: x.slice(Math.max(0, char - 300), char + 300), second: y.slice(Math.max(0, char - 300), char + 300) })

      return true
    }
    const leaks: { duel: number; seat: number; code: number; where: string }[] = []
    const perCard = new Map<number, { offered: number; played: number; faulted: number }>()
    /** Quién negó (`by`), por carta: para leer en el informe que sean cartas que niegan. */
    const negators = new Map<number, number>()
    const slow: { ms: number; card: number | null; ask: string; duel: number; decks: string[] }[] = []
    const times: number[] = []
    const slowDuels: { duel: number; decks: string[]; questions: number }[] = []
    const progress = path.join(CORE_DATA_DIR, `fuzz-progress${suffix}.log`)
    const stat = (code: number) => perCard.get(code) ?? (perCard.set(code, { offered: 0, played: 0, faulted: 0 }), perCard.get(code)!)
    const started = performance.now()

    mkdirSync(CORE_DATA_DIR, { recursive: true })
    writeFileSync(progress, '')

    const playOne = async (d: number, a: (typeof pool)[number], b: (typeof pool)[number], check: boolean) => {
      const events: AutoEvent[] = []
      let batch: OcgMessage[] = []
      // El adaptador del asiento 1, para el rival de handtraps: ve lo mismo que en la pantalla.
      let view: Adapter | null = null
      // Los eslabones de la cadena en curso, por los pasos que anota el adaptador (una tanda trae la cadena entera: el `overlay` ya terminó al mirarlo).
      const links: number[] = []
      const host = createAutoHost({
        core: { wasmBinary: wasm },
        cardReader: (code) => cards.get(code) ?? null,
        scriptReader: store.read,
        emit: (event) => {
          events.push(event)
          // Lo que no sobrevive al viaje (JSON y `parseAutoEvent`) del otro lado se perdería: una tanda partida de más, un texto largo.
          if (!parseAutoEvent(JSON.parse(JSON.stringify(event)))) tally.unparseable += 1
          // Quién negó (`ChainStep.by`, deducido por el adaptador): siempre otro eslabón de la cadena en curso, nunca el negado ni uno que no está.
          for (const step of view?.apply(event).chain ?? []) {
            if (step.kind === 'chain') {
              if (step.index === 0) links.length = 0
              links[step.index] = step.link?.code ?? 0
            }
            if (step.kind !== 'negated' && step.kind !== 'disabled') continue
            tally.negations += 1
            if (step.by === undefined) continue
            tally.negationsBy += 1
            if (step.by < 1 || step.by > links.length || step.by === step.index + 1) tally.badBy += 1
            else negators.set(links[step.by - 1]!, (negators.get(links[step.by - 1]!) ?? 0) + 1)
          }
        },
        tap: (message) => batch.push(message),
      })
      const seed = (SEED * 100_003 + d) >>> 0
      // Los duelos impares van con una clave de 256 bits (el camino del duelo por enlace), derivada de la semilla para que el fuzz siga siendo reproducible.
      const key = d % 2 === 1 ? seed.toString(16).padStart(8, '0').repeat(8) : undefined
      const hand = rival === 'handtraps' ? setup.hand(seed) : []
      const create: Extract<AutoCommand, { t: 'create' }> = { t: 'create', seed, ...(key ? { key } : {}), flags: MR5, players: [PLAYERS[0]!, { ...PLAYERS[1]!, hand: hand.length || PLAYERS[1]!.hand }], decks: [{ main: a.main, extra: a.extra, hand: [] }, { main: b.main, extra: b.extra, hand }] }
      // Con el Atributo de cada carta (público), como en la sesión: las Bystial sólo destierran LUZ u OSCURIDAD.
      const second = rival === 'handtraps' ? handtrapPolicy(setup.main.map(([code]) => code), undefined, [], undefined, (code) => cards.get(code)?.attribute ?? 0) : null

      if (second) view = createAdapter({ seat: 1, mine: { deck: teamOrder(create, 1), extra: b.extra }, theirs: { deck: a.main.length, extra: a.extra.length }, typeOf: (code) => cards.get(code)?.type ?? 0 })
      let before = [new Set<number>(), new Set<number>()]
      const history = [new Set<number>(), new Set<number>()]
      let mark = 0
      let lastCard: number | null = null
      const audit = () => {
        const fresh = events.slice(mark)

        mark = events.length
        if (check && host.live) {
          const now = visible(host.live.lib, host.live.handle)

          for (const seat of [0, 1] as const) {
            const allowed = new Set([...before[seat]!, ...now.seen[seat]])

            revealed(seat, batch, allowed)
            // Una pista nombra el script (`HINT_CARD` con el `id` de `GetID()`): un arte alternativo (Ghost Mourner 52038442) usa el del original (52038441).
            allowed.forEach((code) => history[seat]!.add(code).add(cards.get(code)?.alias || code))
            for (const event of fresh) {
              if (!('seat' in event) || event.seat !== seat) continue
              for (const code of event.t === 'events' ? hintCodes(event.events) : []) {
                if (code !== 0 && !history[seat]!.has(code)) {
                  tally.leaks += 1
                  if (leaks.length < 30) leaks.push({ duel: d, seat, code, where: `hint ${code}` })
                }
              }
              // Las que se ofrecen para declarar (`announce_card`) son las suyas (o el original de un arte alternativo suyo) y las que vio alguna vez en el duelo (`history`), aunque ahora no se vean.
              const declarable = (code: number) => history[seat]!.has(code) || [...now.own[seat]].some((own) => cards.get(own)?.alias === code)

              for (const code of codesIn(event.t === 'events' ? event.events : event.t === 'ask' ? event.ask : event.t === 'stats' ? event.cards : [])) {
                if (code !== 0 && !allowed.has(code) && !(event.t === 'ask' && (now.own[seat].has(code) || event.ask.type === 'select_position' || (event.ask.type === 'announce_card' && declarable(code))))) {
                  tally.leaks += 1
                  if (leaks.length < 30) leaks.push({ duel: d, seat, code, where: event.t === 'events' ? JSON.stringify(event.events.find((item) => codesIn(item).includes(code))).slice(0, 300) : event.t })
                }
              }
            }
          }
          before = now.seen
        }
        batch = []
        for (const event of fresh) {
          if (event.t === 'ask') {
            tally.questions[event.ask.type] = (tally.questions[event.ask.type] ?? 0) + 1
            offeredBy(event.ask).forEach((code) => code && (stat(code).offered += 1))
          }
          if (event.t !== 'fault') continue
          if (faults.length < 50) faults.push({ duel: d, message: event.message.slice(0, 300) })
          if (lastCard) stat(lastCard).faulted += 1
          if (event.kind === 'retry') tally.retries += 1
          else if (event.kind === 'unhandled') tally.unhandled += 1
          else if (event.kind === 'script') tally[KNOWN_SCRIPT_ERRORS.some((known) => known.test(event.message)) ? 'knownScriptErrors' : 'coreErrors'] += 1
          else if (event.kind === 'crash') tally.exceptions += 1
          else tally.otherFaults += 1
        }
      }

      await host.handle(create)
      audit()
      const result = await runDuel(host, events, [randomLegalPolicy(seed * 2 + 1, pickCard), second ? (ask) => second(ask, view!) : randomLegalPolicy(seed * 2 + 2, pickCard)], CAP, (ask, answer) => {
        lastCard = cardOf(ask.ask, answer)
        if (lastCard) stat(lastCard).played += 1
        const ms = host.timings.at(-1) ?? 0

        times.push(ms)
        if (ms > 100) slow.push({ ms: Math.round(ms), card: lastCard, ask: ask.ask.type, duel: d, decks: [a.id, b.id] })
        audit()
      }, DUEL_MS)

      host.hotScripts.forEach((script) => (tally.hotScripts[script] = (tally.hotScripts[script] ?? 0) + 1))

      return { events, host, result }
    }

    for (let d = 0; d < pool.length * duels; d += 1) {
      const a = pool[d % pool.length]!
      const other = (d * 7 + 3) % pool.length
      const b = rival === 'handtraps' ? handtraps : pool[other === d % pool.length ? (other + 1) % pool.length : other]!
      const { events, host, result } = await playOne(d, a, b, true)

      tally.duels += 1
      tally.ends[result.end] = (tally.ends[result.end] ?? 0) + 1
      if (result.end === 'stuck') tally.stuck += 1
      if (result.end === 'slow') slowDuels.push({ duel: d, decks: [a.id, b.id], questions: result.questions })
      const firstRun = normalized(events)

      // Deshacer: la mitad de las respuestas, re-simulada en una instancia nueva, da los mismos eventos.
      if (d % 5 === 0 && host.answers.length > 1) {
        const to = Math.floor(host.answers.length / 2)
        const original = normalized(events.filter((event) => event.t === 'events' && event.n <= to))
        const mark = events.length

        await host.handle({ t: 'rewind', to })
        tally.rewindChecked += 1
        if (differ(d, 'rewind', original, normalized(events.slice(mark)))) tally.rewindMismatch += 1
      }
      // Con la misma semilla, el mismo duelo.
      if (d < 3) {
        const again = await playOne(d, a, b, false)

        tally.repeatChecked += 1
        if (differ(d, 'repeat', firstRun, normalized(again.events))) tally.repeatMismatch += 1
      }
      appendFileSync(progress, `${new Date().toISOString()} duelo ${d + 1}/${pool.length * duels} ${a.id}-${b.id} ${result.end} ${result.questions} preguntas, ${Math.round((performance.now() - started) / 1000)} s
`)
    }

    const sorted = [...times].sort((x, y) => x - y)
    const pct = (p: number) => Math.round((sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0) * 100) / 100
    const deckCodes = new Set([...pool, ...(rival === 'handtraps' ? [handtraps] : [])].flatMap((deck) => [...deck.main, ...deck.extra]))
    const label = (code: number | null) => (code ? `${code} ${names.get(code) ?? '?'}` : '')
    const report = {
      parameters: { rival, decks: pool.length, duelsPerDeck: duels, seed: SEED, cap: CAP, seconds: Math.round((performance.now() - started) / 1000) },
      // Cuántas veces el rival activó cada handtrap (y cuántas se la ofreció el núcleo).
      ...(rival === 'handtraps' ? { handtraps: Object.fromEntries(setup.main.map(([code]) => [label(code), perCard.get(code) ?? { offered: 0, played: 0, faulted: 0 }])) } : {}),
      tally,
      msPerAnswer: { answers: sorted.length, median: pct(50), p95: pct(95), p99: pct(99), max: pct(100) },
      slowDuels,
      slowest: slow.sort((x, y) => y.ms - x.ms).slice(0, 40).map((entry) => ({ ...entry, card: label(entry.card) })),
      slowCards: Object.entries(slow.reduce<Record<string, number>>((acc, entry) => ({ ...acc, [label(entry.card) || entry.ask]: Math.max(acc[label(entry.card) || entry.ask] ?? 0, entry.ms) }), {}))
        .sort((x, y) => y[1] - x[1])
        .slice(0, 30),
      cards: {
        playedClean: [...perCard].filter(([code, s]) => deckCodes.has(code) && s.played > 0 && s.faulted === 0).length,
        playedWithFault: [...perCard].filter(([, s]) => s.faulted > 0).map(([code, s]) => ({ card: label(code), ...s })),
        neverOffered: [...deckCodes].filter((code) => !perCard.get(code)?.offered).map(label),
        offeredNeverPlayed: [...deckCodes].filter((code) => perCard.get(code)?.offered && !perCard.get(code)?.played).map(label),
      },
      negators: Object.fromEntries([...negators].map(([code, count]) => [label(code), count])),
      faults,
      leaks,
      mismatches,
    }

    writeFileSync(path.join(CORE_DATA_DIR, `fuzz-${pool.length}x${duels}-s${SEED}${suffix}.json`), JSON.stringify(report, null, 1))
    console.log(JSON.stringify({ ...report.parameters, ...report.tally, ms: report.msPerAnswer, cleanCards: report.cards.playedClean, neverOffered: report.cards.neverOffered.length, faultCards: report.cards.playedWithFault.length, ...('handtraps' in report ? { handtraps: report.handtraps } : {}) }))

    expect({ retries: tally.retries, unhandled: tally.unhandled, unparseable: tally.unparseable, coreErrors: tally.coreErrors, exceptions: tally.exceptions, stuck: tally.stuck, leaks: tally.leaks, rewindMismatch: tally.rewindMismatch, repeatMismatch: tally.repeatMismatch, badBy: tally.badBy }).toEqual({
      retries: 0,
      unhandled: 0,
      unparseable: 0,
      coreErrors: 0,
      exceptions: 0,
      stuck: 0,
      leaks: 0,
      rewindMismatch: 0,
      repeatMismatch: 0,
      badBy: 0,
    })
  }
})
