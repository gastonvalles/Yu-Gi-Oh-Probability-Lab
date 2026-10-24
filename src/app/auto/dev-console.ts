import decklists from '../../data/meta-decklists.json'
import type { MatState, Placed } from '../practice-mat'
import { createDataLoader, httpSource } from './auto-data'
import { createAutoSession, workerTransport, type AutoSession, type AutoSnapshot } from './auto-session'
import type { DeckList } from './deck-map'
import { freePlaces, passivePolicy, randomLegalPolicy } from './policies'
import type { AutoEvent, CoreAnswer, CoreAsk } from './protocol'

/**
 * Consola de pruebas de los duelos automáticos: `/__auto/`, sólo con `vite serve` (la sirve el plugin `auto-data-dev` de vite.config.ts).
 * No es una pantalla del producto: muestra la sesión como texto, para ver el Worker andando en un navegador (o en un celular de la red
 * local, con `--host`). `?deck=<id>&seed=<n>&autostart` arranca sola; `window.__auto` deja medirla por CDP. En inglés: es una
 * herramienta de desarrollo, como los mensajes del núcleo.
 */

const decks = decklists as unknown as Record<string, DeckList>
const params = new URLSearchParams(location.search)
const loader = createDataLoader(httpSource())
const random = randomLegalPolicy(Date.now() >>> 0)
const IDLE = ['Summon', 'Special Summon', 'Change position', 'Set monster', 'Set', 'Activate'] as const
const IDLE_LISTS = ['summons', 'special_summons', 'pos_changes', 'monster_sets', 'spell_sets', 'activates'] as const
const POSITIONS: [number, string][] = [
  [1, 'Face-up ATK'],
  [2, 'Face-down ATK'],
  [4, 'Face-up DEF'],
  [8, 'Face-down DEF'],
]

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', css = '') {
  const node = document.createElement(tag)

  node.textContent = text
  node.style.cssText = css
  return node
}
const marks: Record<string, number> = {}
const log: string[] = []
let session: AutoSession | null = null
let snapshot: AutoSnapshot | null = null

document.body.style.cssText = 'font: 13px/1.4 ui-monospace, monospace; margin: 12px; background: #150a24; color: #eee'
const deckSelect = el('select')
const seedInput = Object.assign(el('input'), { value: params.get('seed') ?? String(Date.now() >>> 0), size: 10 })
const controls = el('div', '', 'display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px')
const status = el('div', '', 'margin: 6px 0; color: #f7cb15')
const askBox = el('div', '', 'margin: 6px 0; display: flex; flex-wrap: wrap; gap: 4px')
const table = el('pre', '', 'white-space: pre-wrap; margin: 6px 0')
const faults = el('pre', '', 'white-space: pre-wrap; color: #ff8080; margin: 6px 0')
const events = el('pre', '', 'white-space: pre-wrap; opacity: 0.7; max-height: 40vh; overflow: auto')

for (const id of Object.keys(decks)) deckSelect.append(Object.assign(el('option', `${id} (${decks[id]!.main.reduce((sum, [, copies]) => sum + copies, 0)})`), { value: id }))
deckSelect.value = params.get('deck') ?? Object.keys(decks)[0]!

const button = (label: string, action: () => void) => Object.assign(el('button', label), { onclick: action })

controls.append(
  deckSelect,
  seedInput,
  button('Start', start),
  button('Undo', () => session?.undo()),
  button('Cancel', () => session?.cancel()),
  button('Restart (same seed)', () => session?.restart()),
  button('New seed', () => session?.restart(Date.now() >>> 0)),
)
document.body.append(controls, status, askBox, table, faults, events)

const nameOf = (code: number) => (code === 0 ? 'hidden card' : (snapshot?.names[code] ?? String(code)))
const nameOfId = (id: string) => {
  const real = /card-(\d+)-/.exec(id)

  return real ? nameOf(Number(real[1])) : id.includes('token-') ? 'Token' : `? ${id}`
}
/** Un `desc`: del sistema (`!system` de strings.conf) o el texto `str<n>` de una carta (carta = desc >> 4). */
const describe = (desc: string) => (BigInt(desc) < 10000n ? `system ${desc}` : `${nameOf(Number(BigInt(desc) >> 4n))} #${Number(BigInt(desc) & 15n)}`)

function choices(ask: CoreAsk): [string, CoreAnswer][] {
  switch (ask.type) {
    case 'select_idlecmd':
      return [
        ...IDLE_LISTS.flatMap((key, action) => ask[key].map((card, index): [string, CoreAnswer] => [`${IDLE[action]}: ${nameOf(card.code)}`, { type: ask.type, action, index }])),
        ...(ask.to_bp ? [['Battle Phase', { type: ask.type, action: 6, index: null }] as [string, CoreAnswer]] : []),
        ...(ask.to_ep ? [['End Phase', { type: ask.type, action: 7, index: null }] as [string, CoreAnswer]] : []),
      ]
    case 'select_battlecmd':
      return [
        ...ask.chains.map((card, index): [string, CoreAnswer] => [`Activate: ${nameOf(card.code)}`, { type: ask.type, action: 0, index }]),
        ...ask.attacks.map((card, index): [string, CoreAnswer] => [`Attack: ${nameOf(card.code)}${card.can_direct ? ' (direct)' : ''}`, { type: ask.type, action: 1, index }]),
        ...(ask.to_m2 ? [['Main Phase 2', { type: ask.type, action: 2, index: null }] as [string, CoreAnswer]] : []),
        ...(ask.to_ep ? [['End Phase', { type: ask.type, action: 3, index: null }] as [string, CoreAnswer]] : []),
      ]
    case 'select_effectyn':
    case 'select_yesno':
      return [
        [`Yes (${describe(ask.description)})`, { type: ask.type, yes: true }],
        ['No', { type: ask.type, yes: false }],
      ]
    case 'select_option':
      return ask.options.map((desc, index) => [describe(desc), { type: ask.type, index }])
    case 'select_chain':
      return [...ask.selects.map((card, index): [string, CoreAnswer] => [`Chain: ${nameOf(card.code)}`, { type: ask.type, index }]), ...(ask.forced ? [] : [['Do not chain', { type: ask.type, index: null }] as [string, CoreAnswer]])]
    case 'select_card':
    case 'select_tribute':
      return [...(ask.max === 1 ? ask.selects.map((card, index): [string, CoreAnswer] => [nameOf(card.code), { type: ask.type, indices: [index] }]) : []), ...(ask.can_cancel ? [['Cancel', { type: ask.type, indices: null }] as [string, CoreAnswer]] : [])]
    case 'select_unselect_card':
      return [
        ...ask.select_cards.map((card, index): [string, CoreAnswer] => [nameOf(card.code), { type: ask.type, index }]),
        ...ask.unselect_cards.map((card, index): [string, CoreAnswer] => [`Unselect ${nameOf(card.code)}`, { type: ask.type, index: ask.select_cards.length + index }]),
        ...(ask.can_finish || ask.can_cancel ? [['Finish', { type: ask.type, index: null }] as [string, CoreAnswer]] : []),
      ]
    case 'select_place':
    case 'select_disfield':
      return ask.count === 1 ? freePlaces(ask).map((place) => [`Zone ${place.player === ask.player ? 'mine' : 'theirs'} ${place.location === 4 ? 'M' : 'S/T'}${place.sequence}`, { type: ask.type, places: [place] }]) : []
    case 'select_position':
      return POSITIONS.filter(([bit]) => (ask.positions & bit) !== 0).map(([position, label]) => [label, { type: ask.type, position }])
    case 'announce_number':
      return ask.options.map((value, index) => [value, { type: ask.type, index }])
    default:
      return []
  }
}

const placed = (slot: Placed | null) => (slot ? `[${slot.pos} ${nameOfId(slot.id)}${slot.materials.length ? ` +${slot.materials.length}` : ''}${slot.counters ? ` c${slot.counters}` : ''}]` : '[ ]')
const mat = (state: MatState, own: boolean) =>
  [
    `Hand (${state.hand.length}): ${own ? state.hand.map(nameOfId).join(', ') : ''}`,
    `Monsters: ${[...state.mz, ...state.emz].map(placed).join(' ')}`,
    `S/T: ${state.st.map(placed).join(' ')}  Field: ${placed(state.field)}`,
    `GY ${state.gy.length} · Banished ${state.banished.length} · Deck ${state.deck.length} · Extra ${state.extra.length}${own && state.gy.length ? `\nGY: ${state.gy.map(nameOfId).join(', ')}` : ''}`,
  ].join('\n')

function render() {
  const now = session?.getSnapshot()

  if (!now || now === snapshot) return
  snapshot = now
  if (Object.keys(now.names).length > 0) marks.dataLoaded ??= performance.now()
  if (now.status === 'ready') marks.firstAsk ??= performance.now()
  const { overlay } = now

  status.textContent = `${now.status}${now.replaying ? ' (replaying)' : ''} · data ${now.progress.done}/${now.progress.total} · turn ${overlay.turn} (${overlay.turnPlayer === 0 ? 'mine' : overlay.turnPlayer === 1 ? 'theirs' : '-'}) · phase ${overlay.phase} · LP ${overlay.lp[0]} / ${overlay.lp[1]} · chain ${overlay.chain.length} · answers ${now.answers.length} · seed ${now.seed}${overlay.end ? ` · winner ${overlay.end.winner}` : ''}`
  askBox.replaceChildren()
  if (now.ask) {
    const { ask } = now.ask

    askBox.append(el('div', `${ask.type}${now.ask.title ? ` — ${describe(now.ask.title)}` : ''}:`, 'width: 100%'))
    for (const [label, answer] of choices(ask)) askBox.append(button(label, () => session?.answer(answer)))
    askBox.append(
      button('(passive)', () => session?.answer(passivePolicy()(ask))),
      button('(random)', () => session?.answer(random(ask))),
    )
  }
  table.textContent = `MINE\n${mat(now.mine, true)}\n\nTHEIRS\n${mat(now.theirs, false)}`
  faults.textContent = [now.fault, ...now.faults].filter(Boolean).map((fault) => `${fault!.kind}: ${fault!.message}${fault!.cards.length ? ` [${fault!.cards.map(nameOf).join(', ')}]` : ''}`).join('\n')
}

function record(event: AutoEvent) {
  const line = event.t === 'events' ? `events s${event.seat} n${event.n}: ${event.events.map((item) => item.type).join(' ')}` : event.t === 'ask' ? `ask s${event.seat} #${event.askId} ${event.ask.type}` : JSON.stringify(event).slice(0, 200)

  log.unshift(line)
  log.length = Math.min(log.length, 300)
  events.textContent = log.join('\n')
}

function start() {
  session?.destroy()
  for (const key of Object.keys(marks)) delete marks[key]
  marks.start = performance.now()
  snapshot = null
  log.length = 0
  session = createAutoSession({ loader, deck: decks[deckSelect.value]!, transport: workerTransport(), seed: Number(seedInput.value) >>> 0, onEvent: record })
  session.subscribe(render)
  render()
  Object.assign(window, { __auto: { session, marks, log } })
}

// Después del primer pintado de la consola (la lista de 696 decks), así lo que se mida desde `start` es de la sesión.
if (params.has('autostart')) setTimeout(start, 500)
