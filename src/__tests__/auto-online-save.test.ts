import { describe, expect, it, onTestFinished } from 'vitest'
import { cardData, type CardRow, type DataLoader, type DataSource } from '../app/auto/auto-data'
import { autoSaveStore, parseAutoSave, type AutoSave } from '../app/auto/auto-save'
import type { AutoSession } from '../app/auto/auto-session'
import type { DeckList } from '../app/auto/deck-map'
import { isDuelKey } from '../app/auto/duel-key'
import { createGuestLink, createHostLink, type OnlineLink } from '../app/auto/online'
import { GUEST_ACCEPTS, isAutoText, parseAutoMessage } from '../app/auto/online-protocol'
import type { AutoCommand } from '../app/auto/protocol'
import { DEFAULT_SETTINGS } from '../app/duel-protocol'
import { SAVE_TTL_MS } from '../app/duel-save'
import { createDuel } from '../app/duel-session'
import { END, fakeHost, PASS } from './support/auto-core-fake'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'

/** El guardado del anfitrión del duelo automático por enlace: su forma, y que el anfitrión que recarga la página rearma el duelo y el invitado vuelve a la misma mesa. */

const HOST_DECK: DeckList = { main: [[1, 5]] }
const GUEST_DECK: DeckList = { main: [[2, 5]] }
const row = (id: number): CardRow => ({ id, alias: 0, setcode: '0', type: 0x21, atk: 0, def: 0, level: 4, race: '1', attribute: 1, name: `Carta ${id}` })
const expand = (rows: DeckList['main'] = []) => rows.flatMap(([code, copies]) => Array<number>(copies).fill(code))
const loader: DataLoader = {
  manifest: async () => ({ version: 't', tokens: [], filler: [] }),
  async load(lists) {
    const decks = lists.map((list) => ({ main: expand(list.main), extra: expand(list.extra), missing: [], noRules: [] }))
    const codes = [...new Set(decks.flatMap((deck) => deck.main))]

    return { decks, cards: codes.map((code) => cardData(row(code))), scripts: {}, names: {}, version: 't' }
  },
}
const source: DataSource = { manifest: async () => ({ version: 't', tokens: [], filler: [] }), cards: async (codes) => codes.map(row), script: async () => null }
const tick = () => new Promise((resolve) => setImmediate(resolve))
async function settle(room: MemoryRoom) {
  for (let i = 0; i < 30; i += 1) {
    room.flush()
    await tick()
  }
}
/** Un `localStorage` en memoria. */
function memoryStorage() {
  const items = new Map<string, string>()

  return { items, getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value), removeItem: (key: string) => void items.delete(key) }
}

const KEY = '0123456789abcdef'.repeat(4)
const SAVE: AutoSave = { v: 2, key: KEY, seat: 1, hand: 5, decks: { mine: HOST_DECK, theirs: GUEST_DECK }, answers: [{ seat: 0, answer: END }], savedAt: 1000 }
/** Lo guardado de antes de la clave (con la semilla de 32 bits; `JSON.stringify` no escribe la clave `undefined`). */
const V1 = { ...SAVE, v: 1, key: undefined, seed: 7 }

describe('el guardado del duelo automático por enlace', () => {
  it('lee lo que escribió, si tiene forma de duelo y no venció', () => {
    const storage = memoryStorage()
    const store = autoSaveStore('ABCDEFGH', storage, () => 2000)

    expect(store.read()).toBeNull()
    store.write(SAVE)
    expect([...storage.items.keys()]).toEqual(['ygo-lab:auto-save:ABCDEFGH'])
    expect(store.read()).toEqual(SAVE)
    expect(autoSaveStore('ABCDEFGH', storage, () => 1000 + SAVE_TTL_MS + 1).read()).toBeNull()
    // La versión 1 (con semilla, aunque no haya vencido) no se lee, ni una clave que no sea de 64 hex en minúscula.
    for (const bad of [V1, { ...V1, key: KEY }, { ...SAVE, v: 1 }, { ...SAVE, v: 3 }, { ...SAVE, key: undefined }, { ...SAVE, key: KEY.slice(1) }, { ...SAVE, key: KEY.toUpperCase() }, { ...SAVE, key: `${KEY.slice(1)}g` }, { ...SAVE, key: 7 }, { ...SAVE, seat: 2 }, { ...SAVE, answers: [{ seat: 0, answer: { type: 'nada' } }] }, { ...SAVE, decks: { mine: { main: [[0, 1]] }, theirs: GUEST_DECK } }]) {
      expect(parseAutoSave(JSON.stringify(bad), 2000)).toBeNull()
    }
    expect(parseAutoSave('{', 2000)).toBeNull()
    // El corte del pase a manual viaja con lo guardado; uno de antes (sin la marca) o con la marca rota se lee sin ella.
    expect(parseAutoSave(JSON.stringify({ ...SAVE, cut: { dropped: true } }), 2000)).toEqual({ ...SAVE, cut: { dropped: true } })
    expect(parseAutoSave(JSON.stringify({ ...SAVE, cut: 'sí' }), 2000)).toEqual(SAVE)
    // La versión de los datos también; una que no es texto se lee sin ella.
    expect(parseAutoSave(JSON.stringify({ ...SAVE, data: 'abc' }), 2000)).toEqual({ ...SAVE, data: 'abc' })
    expect(parseAutoSave(JSON.stringify({ ...SAVE, data: 7 }), 2000)).toEqual(SAVE)
    // Una activación elegida queda marcada (deshacer vuelve ahí también después de recargar); otra marca no pasa.
    const marked = { ...SAVE, answers: SAVE.answers.map((item, i) => (i === 0 ? { ...item, activation: true } : item)) }

    expect(parseAutoSave(JSON.stringify(marked), 2000)).toEqual(marked)
    expect(parseAutoSave(JSON.stringify({ ...SAVE, answers: SAVE.answers.map((item) => ({ ...item, activation: 1 })) }), 2000)).toEqual(SAVE)
    store.clear()
    expect(store.read()).toBeNull()
    // Sin almacenamiento, no se recuerda nada (y no se rompe).
    const none = autoSaveStore('ABCDEFGH', null)

    none.write(SAVE)
    expect(none.read()).toBeNull()
  })

  it('al entrar a una sala se barren los guardados de todas que ya no sirven (vencidos, v1 o rotos); uno vigente y lo que no es del duelo automático quedan', () => {
    const storage = memoryStorage()
    const keyed = { ...storage, get length() { return storage.items.size }, key: (i: number) => [...storage.items.keys()][i] ?? null }
    const at = (room: string) => `ygo-lab:auto-save:${room}`
    const now = () => SAVE.savedAt + SAVE_TTL_MS
    const fill = () => {
      storage.items.set(at('VENCIDO1'), JSON.stringify({ ...SAVE, savedAt: 0 }))
      storage.items.set(at('VIGENTE1'), JSON.stringify(SAVE))
      storage.items.set(at('VIEJO001'), JSON.stringify(V1))
      storage.items.set(at('ROTO0001'), '{')
      storage.items.set('ygo-lab:duel-save:VENCIDO1', '{')
      storage.items.set('otra-cosa', '{')
    }

    fill()
    autoSaveStore('NUEVA001', keyed, now)
    expect([...storage.items.keys()]).toEqual([at('VIGENTE1'), 'ygo-lab:duel-save:VENCIDO1', 'otra-cosa'])
    // Un almacenamiento sin `key` ni `length` (o que no deja leer) no se barre, y no se rompe.
    fill()
    autoSaveStore('NUEVA001', storage, now)
    autoSaveStore('NUEVA001', { ...keyed, key: () => { throw new Error('denied') } }, now)
    expect(storage.items.size).toBe(6)
  })

  it('el anfitrión que recarga la página rearma el duelo con lo guardado y el invitado vuelve a la misma mesa y a la misma pregunta', async () => {
    const storage = memoryStorage()
    const room = createMemoryRoom()
    const hostEnd = room.join()
    const guestEnd = room.join()
    const settings = { ...DEFAULT_SETTINGS, auto: true }
    const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', settings })
    const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })
    // Beto va primero (asiento 0): las preguntas 0 y 1 son suyas, la 2 de Ana, la 3 de Beto.
    const core = fakeHost(undefined, undefined, 2)
    const hostLink = createHostLink({ transport: hostEnd, loader, deck: HOST_DECK, handSize: 5, makeTransport: core.factory, enabled: async () => true, save: autoSaveStore('ROOM0001', storage) })
    const guestLink = createGuestLink({ transport: guestEnd, source, deck: GUEST_DECK })
    const sessionOf = (link: OnlineLink) => link.getSnapshot().session!

    host.subscribe(() => hostLink.observe(host.getSnapshot()))
    guest.subscribe(() => guestLink.observe(guest.getSnapshot()))
    await settle(room)
    host.setReady(true)
    guest.setReady(true)
    await settle(room)
    host.chooseMethod('rps')
    await settle(room)
    host.pickRps('rock')
    guest.pickRps('scissors')
    await settle(room)
    host.chooseFirst(1)
    await settle(room)
    sessionOf(guestLink).answer(END)
    await settle(room)
    sessionOf(guestLink).answer(END)
    await settle(room)
    sessionOf(hostLink).answer(PASS)
    await settle(room)
    const before = sessionOf(guestLink).getSnapshot()

    expect(before).toMatchObject({ status: 'ready', ask: { seat: 0 } })
    const saved = JSON.parse(storage.items.get('ygo-lab:auto-save:ROOM0001')!) as AutoSave
    const create = core.commands.find((command) => command.t === 'create') as Extract<AutoCommand, { t: 'create' }>

    // Lo guardado lleva la clave del duelo (la que recibió el núcleo), no la semilla.
    expect(saved).toMatchObject({ v: 2, seat: 1, hand: 5, answers: [{ seat: 0 }, { seat: 0 }, { seat: 1, answer: PASS }], data: 't' })
    expect(isDuelKey(saved.key)).toBe(true)
    expect(saved.key).toBe(create.key)
    expect(saved).not.toHaveProperty('seed')

    // Ana recarga: otra sala (que se entera por Beto de quién empezaba), otro enlace, otro núcleo; lo guardado sigue ahí.
    hostLink.destroy()
    hostEnd.close()
    const mark = room.sent.length
    const hostEnd2 = room.join()
    const host2 = createDuel(hostEnd2, { role: 'host', name: 'Ana', sid: 'host-2', settings })
    const core2 = fakeHost(undefined, undefined, 2)
    const hostLink2 = createHostLink({ transport: hostEnd2, loader, deck: HOST_DECK, handSize: 5, makeTransport: core2.factory, enabled: async () => true, save: autoSaveStore('ROOM0001', storage) })

    host2.subscribe(() => hostLink2.observe(host2.getSnapshot()))
    hostLink2.observe(host2.getSnapshot())
    await settle(room)
    const hosted: AutoSession = sessionOf(hostLink2)
    const after = sessionOf(guestLink).getSnapshot()

    expect(hostLink2.getSnapshot()).toMatchObject({ phase: 'playing', seat: 1 })
    // El mismo duelo: el núcleo rearmado recibe el mismo `create` (la misma clave), con las respuestas de antes.
    expect(core2.commands[0]).toEqual({ ...create, answers: [END, END, PASS] })
    expect(hosted.getSnapshot()).toMatchObject({ status: 'waiting', remoteAsk: { seat: 0 } })
    expect(hosted.getSnapshot().answers).toHaveLength(3)
    expect(guestLink.getSnapshot().phase).toBe('playing')
    expect(after).toMatchObject({ status: 'ready', replaying: false, ask: { seat: 0, ask: { type: 'select_idlecmd' } } })
    expect({ mine: after.mine, theirs: after.theirs, overlay: after.overlay }).toEqual({ mine: before.mine, theirs: before.theirs, overlay: before.overlay })
    expect(after.ask!.askId).toBe(hosted.getSnapshot().remoteAsk!.askId)
    // El invitado recibió el duelo de nuevo: cómo empieza, y que sus 2 preguntas ya estaban contestadas.
    const toGuest = room.sent.filter(isAutoText).map((text) => parseAutoMessage(text)!)

    expect(toGuest.filter((message) => message.t === 'autoInit')).toHaveLength(2)
    expect(toGuest.filter((message) => message.t === 'autoReplay').at(-1)).toMatchObject({ t: 'autoReplay', skip: 2 })
    // Lo que re-simula el núcleo rearmado le llega en lotes, detrás de cómo empieza y de cuántas saltar: ni un `autoEvent` suelto. Su pregunta llega detrás del último lote (la
    // re-emisión ya la cerró el `waiting` de Ana).
    const rebuilt = room.sent.slice(mark).filter(isAutoText).flatMap((text) => {
      const message = parseAutoMessage(text)!

      return GUEST_ACCEPTS.includes(message.t) ? [message] : []
    })
    const kinds = rebuilt.map((message) => message.t)

    expect(kinds.indexOf('autoInit')).toBeLessThan(kinds.indexOf('autoReplay'))
    expect(kinds.indexOf('autoReplay')).toBeLessThan(kinds.indexOf('autoBatch'))
    expect(kinds.slice(kinds.lastIndexOf('autoBatch') + 1)).toEqual(['autoEvent'])
    expect(rebuilt.filter((message) => message.t === 'autoEvent')).toEqual([{ t: 'autoEvent', s: expect.any(Number), event: expect.objectContaining({ t: 'ask', seat: 0, askId: hosted.getSnapshot().remoteAsk!.askId }) }])
    // Y sigue: Beto contesta (la pregunta 4 también es suya) y el núcleo lo cuenta a partir de lo rearmado.
    expect(sessionOf(guestLink).answer(END)).toBe(true)
    await settle(room)
    expect(hosted.getSnapshot()).toMatchObject({ status: 'waiting', remoteAsk: { seat: 0 } })
    expect(hosted.getSnapshot().answers.map((answer) => answer.seat)).toEqual([0, 0, 1, 0])

    // Termina por rendición: lo guardado se borra.
    guest.concede()
    await settle(room)
    expect(hostLink2.getSnapshot().phase).toBe('ended')
    expect(storage.items.size).toBe(0)
    hostLink2.destroy()
    guestLink.destroy()
  })

  /** Beto (asiento 0) contesta su primera pregunta y Ana recarga la página con lo guardado cambiado por `edit` (lo que escribió otra página u otro despliegue). */
  async function reloadWith(edit: (saved: AutoSave) => object) {
    const storage = memoryStorage()
    const room = createMemoryRoom()
    const hostEnd = room.join()
    const guestEnd = room.join()
    const settings = { ...DEFAULT_SETTINGS, auto: true }
    const host = createDuel(hostEnd, { role: 'host', name: 'Ana', sid: 'host-1', settings })
    const guest = createDuel(guestEnd, { role: 'guest', name: 'Beto', sid: 'guest-1' })
    const hostLink = createHostLink({ transport: hostEnd, loader, deck: HOST_DECK, handSize: 5, makeTransport: fakeHost(undefined, undefined, 2).factory, enabled: async () => true, save: autoSaveStore('ROOM0002', storage) })
    const guestLink = createGuestLink({ transport: guestEnd, source, deck: GUEST_DECK })

    host.subscribe(() => hostLink.observe(host.getSnapshot()))
    guest.subscribe(() => guestLink.observe(guest.getSnapshot()))
    await settle(room)
    host.setReady(true)
    guest.setReady(true)
    await settle(room)
    host.chooseMethod('rps')
    await settle(room)
    host.pickRps('rock')
    guest.pickRps('scissors')
    await settle(room)
    host.chooseFirst(1)
    await settle(room)
    guestLink.getSnapshot().session!.answer(END)
    await settle(room)
    hostLink.destroy()
    hostEnd.close()
    const saved = JSON.parse(storage.items.get('ygo-lab:auto-save:ROOM0002')!) as AutoSave

    storage.items.set('ygo-lab:auto-save:ROOM0002', JSON.stringify(edit(saved)))
    const hostEnd2 = room.join()
    const host2 = createDuel(hostEnd2, { role: 'host', name: 'Ana', sid: 'host-2', settings })
    const core2 = fakeHost(undefined, undefined, 2)
    const hostLink2 = createHostLink({ transport: hostEnd2, loader, deck: HOST_DECK, handSize: 5, makeTransport: core2.factory, enabled: async () => true, save: autoSaveStore('ROOM0002', storage) })

    host2.subscribe(() => hostLink2.observe(host2.getSnapshot()))
    hostLink2.observe(host2.getSnapshot())
    await settle(room)
    onTestFinished(() => {
      hostLink2.destroy()
      guestLink.destroy()
    })

    return { saved, hostLink: hostLink2, guestLink, core: core2 }
  }

  it('el anfitrión que recarga con un guardado de antes de la clave (v1, sin vencer) no lo rearma: el duelo se pierde y la sala sigue', async () => {
    // La página de antes de la clave había escrito su versión (con la semilla) y Ana recarga con la de ahora.
    const game = await reloadWith(() => ({ ...V1, savedAt: Date.now() }))

    expect(game.hostLink.getSnapshot()).toMatchObject({ phase: 'lost', problems: { reason: 'lost' }, session: null })
    expect(game.guestLink.getSnapshot()).toMatchObject({ phase: 'lost', problems: { reason: 'lost' } })
    expect(game.core.commands).toEqual([])
  })

  it('lo guardado anota la versión de los datos: si el despliegue trae otra, el duelo se pierde sin re-simularlo; la misma, o un guardado de antes sin anotarla, se rearma', async () => {
    const other = await reloadWith((saved) => ({ ...saved, data: 'otra' }))

    expect(other.saved.data).toBe('t')
    expect(other.hostLink.getSnapshot()).toMatchObject({ phase: 'lost', problems: { reason: 'lost' }, session: null })
    expect(other.guestLink.getSnapshot()).toMatchObject({ phase: 'lost', problems: { reason: 'lost' } })
    expect(other.core.commands).toEqual([])
    for (const edit of [(saved: AutoSave) => saved, (saved: AutoSave) => ({ ...saved, data: undefined })]) {
      const game = await reloadWith(edit)

      expect(game.hostLink.getSnapshot()).toMatchObject({ phase: 'playing', seat: 1 })
      expect(game.core.commands[0]).toMatchObject({ t: 'create', answers: [END] })
    }
  })
})

