// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'

import { clearDuelSave, parseSave, readDuelSave, saveOf, writeDuelSave } from '../app/duel-save'
import { createDuel } from '../app/duel-session'
import { createMatState } from '../app/practice-mat'
import { createMemoryRoom } from './support/memory-room'

const table = createMatState(Array.from({ length: 20 }, (_, index) => `card-${1000 + index}-1`), ['card-1900-1'], 5)

/** Un anfitrión con la mesa repartida y unas jugadas hechas. */
function playing() {
  const room = createMemoryRoom()
  const host = createDuel(room.join(), { role: 'host', name: 'Ana', sid: 'host-1' })
  createDuel(room.join(), { role: 'guest', name: 'Beto', sid: 'guest-1' })

  room.flush()
  host.start(table)
  host.play({ type: 'draw', count: 1 })
  host.changeLife(-1500)
  return host
}

afterEach(() => sessionStorage.clear())

describe('lo guardado para recargar', () => {
  it('no hay nada que guardar hasta que se reparte la mesa', () => {
    const room = createMemoryRoom()
    const host = createDuel(room.join(), { role: 'host', name: 'Ana' })

    expect(saveOf(host.getSnapshot())).toBeNull()
  })

  it('guarda la mesa de arranque, las jugadas, mis vidas, el reloj y quién empezó', () => {
    const save = saveOf(playing().getSnapshot())

    expect(save).toMatchObject({ v: 1, role: 'host', initial: table, actions: [{ type: 'draw', count: 1 }], lp: 6500, starter: 0 })
    expect(save?.timer).toEqual({ running: false, startedAt: 0, elapsedMs: 0 })
  })

  it('se escribe y se vuelve a leer por sala y por rol, y se borra', () => {
    const snapshot = playing().getSnapshot()

    writeDuelSave('ROOM1234', snapshot)
    expect(readDuelSave('ROOM1234', 'host')).toEqual(saveOf(snapshot))
    // Otra sala, o el otro rol, no ven nada.
    expect(readDuelSave('OTHER123', 'host')).toBeNull()
    expect(readDuelSave('ROOM1234', 'guest')).toBeNull()

    clearDuelSave('ROOM1234')
    expect(readDuelSave('ROOM1234', 'host')).toBeNull()
  })

  it('guardar un duelo sin mesa (una revancha que arranca de cero) borra lo anterior', () => {
    const host = playing()

    writeDuelSave('ROOM1234', host.getSnapshot())
    expect(readDuelSave('ROOM1234', 'host')).not.toBeNull()

    const fresh = createDuel(createMemoryRoom().join(), { role: 'host', name: 'Ana' })
    writeDuelSave('ROOM1234', fresh.getSnapshot())
    expect(readDuelSave('ROOM1234', 'host')).toBeNull()
  })

  it('lo que no tiene la forma de una mesa guardada se descarta', () => {
    const good = JSON.stringify(saveOf(playing().getSnapshot()))
    const mangled = (change: (data: Record<string, unknown>) => void) => {
      const data = JSON.parse(good) as Record<string, unknown>
      change(data)
      return JSON.stringify(data)
    }

    expect(parseSave(good, 'host')).not.toBeNull()
    expect(parseSave(null, 'host')).toBeNull()
    expect(parseSave('{no es json', 'host')).toBeNull()
    expect(parseSave('3', 'host')).toBeNull()
    expect(parseSave(good, 'guest')).toBeNull()
    expect(parseSave(mangled((data) => void (data.v = 2)), 'host')).toBeNull()
    expect(parseSave(mangled((data) => void delete data.initial), 'host')).toBeNull()
    expect(parseSave(mangled((data) => void (data.actions = 'x')), 'host')).toBeNull()
    expect(parseSave(mangled((data) => void (data.lp = 'mucho')), 'host')).toBeNull()
    expect(parseSave(mangled((data) => void (data.timer = { running: true })), 'host')).toBeNull()
    expect(parseSave(mangled((data) => void (data.starter = 2)), 'host')).toBeNull()
  })
})
