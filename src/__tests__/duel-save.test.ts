// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { SAVE_TTL_MS, clearDuelSave, findPausedDuel, parseSave, readDuelSave, saveOf, savedRole, writeDuelSave } from '../app/duel-save'
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
    expect(parseSave(mangled((data) => void (data.lp = 'mucho')), 'host', NOW)).toBeNull()
    expect(parseSave(mangled((data) => void (data.timer = { running: true })), 'host', NOW)).toBeNull()
    expect(parseSave(mangled((data) => void (data.starter = 2)), 'host', NOW)).toBeNull()
    expect(parseSave(mangled((data) => void (data.savedAt = 'ayer')), 'host', NOW)).toBeNull()
    expect(parseSave(mangled((data) => void (data.rival = 7)), 'host', NOW)).toBeNull()

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

    writeDuelSave('OLDROOM1', playing().getSnapshot(), NOW - 1000)
    writeDuelSave('NEWROOM2', playing('guest').getSnapshot(), NOW)
    localStorage.setItem('ygo-lab:duel-save:BROKEN03:host', '{roto')
    writeDuelSave('EXPIRED4', playing().getSnapshot(), NOW - SAVE_TTL_MS - 5000)

    expect(findPausedDuel(NOW)).toEqual({ room: 'NEWROOM2', role: 'guest', rival: 'Ana' })
    expect(localStorage.getItem('ygo-lab:duel-save:BROKEN03:host')).toBeNull()
    expect(localStorage.getItem('ygo-lab:duel-save:EXPIRED4:host')).toBeNull()
    expect(localStorage.getItem('ygo-lab:duel-save:OLDROOM1:host')).not.toBeNull()
  })
})
