// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { SAVE_TTL_MS, clearDuelSave, findPausedDuel, parseSave, readDuelLog, readDuelSave, readSidingSave, saveOf, savedRole, writeDuelLog, writeDuelSave, writeSidingSave } from '../app/duel-save'
import { createDuel } from '../app/duel-session'
import { createMatState } from '../app/practice-mat'
import { createMemoryRoom } from './support/memory-room'

const table = createMatState(Array.from({ length: 20 }, (_, index) => `card-${1000 + index}-1`), ['card-1900-1'], 5)
const NOW = 1_700_000_000_000

/** Un anfitrión con la mesa repartida y unas jugadas hechas (el invitado se llama Beto). */
function playing(role: 'host' | 'guest' = 'host') {
  const room = createMemoryRoom()
  const host = createDuel(room.join(), { role: 'host', name: 'Ana', sid: 'host-1' })
  const guest = createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'guest-1' })
  const me = role === 'host' ? host : guest

  room.flush()
  me.start(table)
  me.play({ type: 'draw', count: 1 })
  me.changeLife(-1500)
  room.flush()
  return me
}

afterEach(() => localStorage.clear())

describe('lo guardado para recargar o para volver', () => {
  it('no hay nada que guardar hasta que se reparte la mesa', () => {
    const room = createMemoryRoom()
    const host = createDuel(room.join(), { role: 'host', name: 'Ana' })

    expect(saveOf(host.getSnapshot(), NOW)).toBeNull()
  })

  it('guarda la mesa de arranque, las jugadas, mis vidas, el reloj, quién empezó, cuándo y contra quién', () => {
    const save = saveOf(playing().getSnapshot(), NOW)

    expect(save).toMatchObject({ v: 1, role: 'host', initial: table, actions: [{ type: 'draw', count: 1 }], lp: 6500, starter: 0, savedAt: NOW, rival: 'Beto' })
    expect(save?.timer).toEqual({ running: false, startedAt: 0, elapsedMs: 0 })
  })

  it('se escribe y se vuelve a leer por sala y por rol, y se borra', () => {
    const snapshot = playing().getSnapshot()

    writeDuelSave('ROOM1234', snapshot, NOW)
    expect(readDuelSave('ROOM1234', 'host', NOW)).toEqual(saveOf(snapshot, NOW))
    // Otra sala, o el otro rol, no ven nada.
    expect(readDuelSave('OTHER123', 'host', NOW)).toBeNull()
    expect(readDuelSave('ROOM1234', 'guest', NOW)).toBeNull()

    clearDuelSave('ROOM1234')
    expect(readDuelSave('ROOM1234', 'host', NOW)).toBeNull()
  })

  it('guardar un duelo sin mesa (una revancha que arranca de cero) borra lo anterior', () => {
    const host = playing()

    writeDuelSave('ROOM1234', host.getSnapshot(), NOW)
    expect(readDuelSave('ROOM1234', 'host', NOW)).not.toBeNull()

    const fresh = createDuel(createMemoryRoom().join(), { role: 'host', name: 'Ana' })
    writeDuelSave('ROOM1234', fresh.getSnapshot(), NOW)
    expect(readDuelSave('ROOM1234', 'host', NOW)).toBeNull()
  })

  it('lo que no tiene la forma de una mesa guardada, o ya venció, se descarta', () => {
    const good = JSON.stringify(saveOf(playing().getSnapshot(), NOW))
    const mangled = (change: (data: Record<string, unknown>) => void) => {
      const data = JSON.parse(good) as Record<string, unknown>
      change(data)
      return JSON.stringify(data)
    }

    expect(parseSave(good, 'host', NOW)).not.toBeNull()
    expect(parseSave(null, 'host', NOW)).toBeNull()
    expect(parseSave('{no es json', 'host', NOW)).toBeNull()
    expect(parseSave('3', 'host', NOW)).toBeNull()
    expect(parseSave(good, 'guest', NOW)).toBeNull()
    expect(parseSave(mangled((data) => void (data.v = 2)), 'host', NOW)).toBeNull()
    expect(parseSave(mangled((data) => void delete data.initial), 'host', NOW)).toBeNull()
    expect(parseSave(mangled((data) => void (data.actions = 'x')), 'host', NOW)).toBeNull()
    // Un archivo hecho a propósito no puede traer cientos de miles de jugadas para rejugar al abrir la página.
    expect(parseSave(mangled((data) => void (data.actions = Array.from({ length: 5001 }, () => ({ type: 'draw', count: 0 })))), 'host', NOW)).toBeNull()
    expect(parseSave(mangled((data) => void (data.actions = Array.from({ length: 5000 }, () => ({ type: 'draw', count: 0 })))), 'host', NOW)).not.toBeNull()
    expect(parseSave(mangled((data) => void (data.lp = 'mucho')), 'host', NOW)).toBeNull()
    expect(parseSave(mangled((data) => void (data.timer = { running: true })), 'host', NOW)).toBeNull()
    expect(parseSave(mangled((data) => void (data.starter = 2)), 'host', NOW)).toBeNull()
    expect(parseSave(mangled((data) => void (data.savedAt = 'ayer')), 'host', NOW)).toBeNull()
    expect(parseSave(mangled((data) => void (data.rival = 7)), 'host', NOW)).toBeNull()
    // El orden de las jugadas: opcional (los guardados de antes no lo traen), sólo `me` / `peer` y con tope.
    expect(parseSave(mangled((data) => void delete data.order), 'host', NOW)).not.toBeNull()
    expect(parseSave(mangled((data) => void (data.order = ['me', 'yo'])), 'host', NOW)).toBeNull()
    expect(parseSave(mangled((data) => void (data.order = Array.from({ length: 10_001 }, () => 'peer'))), 'host', NOW)).toBeNull()

    // Vence a las dos horas: pasado ese tiempo nadie espera ya a quien salió.
    expect(SAVE_TTL_MS).toBe(2 * 60 * 60 * 1000)
    expect(parseSave(good, 'host', NOW + SAVE_TTL_MS)).not.toBeNull()
    expect(parseSave(good, 'host', NOW + SAVE_TTL_MS + 1)).toBeNull()
  })

  it('con qué rol se jugaba una sala: el de su duelo guardado', () => {
    writeDuelSave('ROOM1234', playing('guest').getSnapshot(), NOW)

    expect(savedRole('ROOM1234', NOW)).toBe('guest')
    expect(savedRole('OTHER123', NOW)).toBeNull()
    expect(savedRole('ROOM1234', NOW + SAVE_TTL_MS + 1)).toBeNull()
  })

  it('el duelo en pausa de este navegador es el último que se guardó; los vencidos y los rotos se borran de paso', () => {
    expect(findPausedDuel(NOW)).toBeNull()

    writeDuelSave('ABCDEFG2', playing().getSnapshot(), NOW - 1000)
    writeDuelSave('HJKMNPQ3', playing('guest').getSnapshot(), NOW)
    localStorage.setItem('ygo-lab:duel-save:RSTUVWX4:host', '{roto')
    writeDuelSave('YZ23456A', playing().getSnapshot(), NOW - SAVE_TTL_MS - 5000)

    // Una sala que no es un código de sala (algo escrito a mano en el almacenamiento) no se ofrece ni se deja.
    writeDuelSave('<img src=x>', playing().getSnapshot(), NOW + 1000)
    writeDuelSave('SALA/../X', playing().getSnapshot(), NOW + 2000)

    expect(findPausedDuel(NOW)).toEqual({ room: 'HJKMNPQ3', role: 'guest', rival: 'Ana' })
    expect(localStorage.getItem('ygo-lab:duel-save:<img src=x>:host')).toBeNull()
    expect(localStorage.getItem('ygo-lab:duel-save:SALA/../X:host')).toBeNull()
    expect(localStorage.getItem('ygo-lab:duel-save:RSTUVWX4:host')).toBeNull()
    expect(localStorage.getItem('ygo-lab:duel-save:YZ23456A:host')).toBeNull()
    expect(localStorage.getItem('ygo-lab:duel-save:ABCDEFG2:host')).not.toBeNull()
  })
})

describe('lo guardado para volver al siding', () => {
  const deck = { main: ['card-1-1', 'card-2-1'], extra: ['card-3-1'], side: ['card-4-1'] }
  const draft = { lists: { main: ['card-1-1'], extra: ['card-3-1'], side: ['card-4-1', 'card-2-1'] }, deadline: NOW + 60_000 }

  it('se escribe y se lee por sala y por rol: el deck, si la pantalla está abierta, lo que se armaba y cuándo se acaba el tiempo', () => {
    writeSidingSave('ROOM1234', 'host', { deck, open: true, draft }, NOW)

    expect(readSidingSave('ROOM1234', 'host', NOW)).toEqual({ v: 1, role: 'host', deck, open: true, draft, savedAt: NOW })
    expect(readSidingSave('ROOM1234', 'guest', NOW)).toBeNull()
    expect(readSidingSave('OTHER123', 'host', NOW)).toBeNull()
  })

  it('cerrada la pantalla no se guarda lo que se armaba; sin deck ni pantalla abierta no queda nada', () => {
    writeSidingSave('ROOM1234', 'host', { deck, open: false, draft }, NOW)
    expect(readSidingSave('ROOM1234', 'host', NOW)).toMatchObject({ deck, open: false, draft: null })

    writeSidingSave('ROOM1234', 'host', { deck: null, open: false }, NOW)
    expect(readSidingSave('ROOM1234', 'host', NOW)).toBeNull()
  })

  it('vence con el duelo y lo que no tiene la forma de un deck no se usa', () => {
    writeSidingSave('ROOM1234', 'host', { deck, open: true, draft }, NOW)
    expect(readSidingSave('ROOM1234', 'host', NOW + SAVE_TTL_MS + 1)).toBeNull()

    const key = 'ygo-lab:duel-siding:ROOM1234:host'
    for (const wrong of ['{roto', JSON.stringify({ v: 1, role: 'host', deck: { main: ['<img>'], extra: [], side: [] }, open: true, savedAt: NOW }), JSON.stringify({ v: 1, role: 'host', deck: null, open: true, draft: { lists: { main: [], extra: [], side: [] }, deadline: 'ya' }, savedAt: NOW })]) {
      localStorage.setItem(key, wrong)
      expect(readSidingSave('ROOM1234', 'host', NOW)).toBeNull()
    }
  })

  it('salir de la sala y dejarla terminada también borra el siding', () => {
    writeSidingSave('ROOM1234', 'host', { deck, open: true }, NOW)
    writeSidingSave('ROOM1234', 'guest', { deck, open: true }, NOW)
    clearDuelSave('ROOM1234')

    expect(readSidingSave('ROOM1234', 'host', NOW)).toBeNull()
    expect(readSidingSave('ROOM1234', 'guest', NOW)).toBeNull()
  })

  it('un duelo que terminó rindiéndose y la revancha ya pedida se guardan y se retoman: sin eso, recargar borraba el resultado y el pedido', () => {
    const room = createMemoryRoom()
    const host = createDuel(room.join(), { role: 'host', name: 'Ana', sid: 'host-1' })
    const guest = createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'guest-1' })

    room.flush()
    host.start(table)
    room.flush()
    guest.concede()
    host.rematch()
    room.flush()

    const save = saveOf(host.getSnapshot(), NOW)

    expect(save).toMatchObject({ conceded: 1, rematch: true })

    const again = createDuel(createMemoryRoom().join(), { role: 'host', name: 'Ana', sid: 'host-2', restore: save! })

    expect(again.getSnapshot().conceded).toBe(1)
    expect(again.getSnapshot().rematch).toEqual({ mine: true, theirs: false })
    // Un guardado de antes (sin estos datos) se sigue entendiendo.
    expect(parseSave(JSON.stringify({ ...save, conceded: undefined, rematch: undefined }), 'host', NOW)).not.toBeNull()
    expect(parseSave(JSON.stringify({ ...save, conceded: 7 }), 'host', NOW)).toBeNull()
  })
})

describe('el chat y el registro guardados', () => {
  it('el chat de los dos se guarda y vuelve al recargar; lo que se escribe después sigue la cuenta', () => {
    const room = createMemoryRoom()
    const host = createDuel(room.join(), { role: 'host', name: 'Ana', sid: 'host-1' })
    const guest = createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'guest-1' })

    room.flush()
    host.start(table)
    guest.sendChat('hola')
    room.flush()
    host.sendChat('¿arrancamos?')

    const save = saveOf(host.getSnapshot(), NOW)!
    const back = createMemoryRoom()
    const again = createDuel(back.join(), { role: 'host', name: 'Ana', sid: 'host-2', restore: save })

    expect(again.getSnapshot().chat.map(({ from, text }) => [from, text])).toEqual([
      [1, 'hola'],
      [0, '¿arrancamos?'],
    ])
    createDuel(back.join(), { role: 'guest', name: 'Beto', sid: 'guest-1' })
    back.flush()
    again.sendChat('sigo')
    expect(new Set(again.getSnapshot().chat.map((line) => line.id)).size).toBe(3)
    // Un guardado de antes (sin chat) se sigue entendiendo; uno con un chat roto, no.
    expect(parseSave(JSON.stringify({ ...save, chat: undefined }), 'host', NOW)).not.toBeNull()
    expect(parseSave(JSON.stringify({ ...save, chat: [{ id: 1, from: 2, text: 'x' }] }), 'host', NOW)).toBeNull()
  })

  it('el registro va en su clave: se borra al salir, con la revancha (sin mesa) y si su duelo guardado venció', () => {
    const host = playing()

    writeDuelSave('ROOM1234', host.getSnapshot(), NOW)
    writeDuelLog('ROOM1234', 'host', [{ id: 'e0', kind: 'turn', text: 'Turno 1 · Ana' }])
    expect(readDuelLog('ROOM1234', 'host')).toHaveLength(1)
    clearDuelSave('ROOM1234')
    expect(readDuelLog('ROOM1234', 'host')).toBeNull()

    writeDuelLog('ROOM1234', 'host', [])
    writeDuelSave('ROOM1234', createDuel(createMemoryRoom().join(), { role: 'host', name: 'Ana' }).getSnapshot(), NOW)
    expect(readDuelLog('ROOM1234', 'host')).toBeNull()

    writeDuelSave('ROOM1234', host.getSnapshot(), NOW - SAVE_TTL_MS - 1)
    writeDuelLog('ROOM1234', 'host', [])
    findPausedDuel(NOW)
    expect(readDuelLog('ROOM1234', 'host')).toBeNull()
  })
})
