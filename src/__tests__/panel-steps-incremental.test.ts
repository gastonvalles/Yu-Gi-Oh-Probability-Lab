import { describe, expect, it } from 'vitest'

import { createMatState, describeMatSteps, matReducer, type MatAction, type MatState } from '../app/practice-mat'
import { createPanelSteps, panelStepsOf } from '../components/probability/panel-steps'
import { random, randomAction } from './support/random-mat'

const main = Array.from({ length: 40 }, (_, index) => `card-${1000 + index}-1`)
const extra = Array.from({ length: 15 }, (_, index) => `card-${9000 + index}-1`)
const table = createMatState(main, extra, 5)
const nameOf = (id: string) => `Carta ${id}`
const artOf = (id: string) => (id.endsWith('7-1') ? null : `https://example.invalid/${id}.jpg`)

/** Un duelo largo al azar (con semilla): todas las clases de jugada, también lotes, fases y fichas. */
function played(seed: number, moves: number, from: MatState = table): MatAction[] {
  const next = random(seed)
  const actions: MatAction[] = []
  let state = from

  for (let n = 0; n < moves; n += 1) {
    const action = randomAction(state, next)

    actions.push(action)
    state = matReducer(state, action)
  }

  return actions
}

const actions = played(7, 150)
const labels = describeMatSteps(table, actions, nameOf)
const full = (prefix: readonly MatAction[], initial: MatState = table, names = nameOf, arts = artOf, phrases = labels) => panelStepsOf(initial, prefix, phrases.slice(0, prefix.length), names, arts)

describe('la lista de pasos de a una jugada (createPanelSteps)', () => {
  it('sumando de a una, cada prefijo da lo mismo que calcularla entera, y los pasos de antes son los mismos objetos', () => {
    const steps = createPanelSteps()
    let before = steps(table, [], [], nameOf, artOf)

    for (let n = 1; n <= actions.length; n += 1) {
      const prefix = actions.slice(0, n)
      const now = steps(table, prefix, labels.slice(0, n), nameOf, artOf)

      expect(now).toHaveLength(n)
      expect(now).toEqual(full(prefix))
      expect(now.slice(0, n - 1).every((step, index) => step === before[index])).toBe(true)
      before = now
    }
  })

  it('de a varias, deshaciendo el final y cambiando una jugada del medio, también da lo mismo', () => {
    const steps = createPanelSteps()
    const next = random(11)
    let length = 0

    for (let round = 0; round < 60; round += 1) {
      const roll = next()

      // Suma de 1 a 20, o deshace de 1 a 10 (`undo`, `rewind`), o rehace la cola desde una jugada del medio que cambió (la mesa manual).
      if (roll < 0.6) length = Math.min(actions.length, length + 1 + Math.floor(next() * 20))
      else if (roll < 0.85) length = Math.max(0, length - 1 - Math.floor(next() * 10))

      const prefix = actions.slice(0, length)

      if (roll >= 0.85 && length > 2) {
        const at = Math.floor(next() * length)
        const tail = played(round, length - at, prefix.slice(0, at).reduce(matReducer, table))
        const changed = [...prefix.slice(0, at), ...tail]
        const phrases = describeMatSteps(table, changed, nameOf)
        const before = steps(table, prefix, labels.slice(0, length), nameOf, artOf)
        const now = steps(table, changed, phrases, nameOf, artOf)

        expect(now).toEqual(full(changed, table, nameOf, artOf, phrases))
        expect(now.slice(0, at).every((step, index) => step === before[index])).toBe(true)
        expect(now.slice(at).some((step, index) => step === before[at + index])).toBe(false)
      }

      expect(steps(table, prefix, labels.slice(0, length), nameOf, artOf)).toEqual(full(prefix))
    }
  })

  it('con otros nombres, otras imágenes u otra frase, rehace esos pasos; con la misma mesa pero otra inicial, todos', () => {
    const steps = createPanelSteps()
    const before = steps(table, actions, labels, nameOf, artOf)
    // `nameOf` y `artOf` nuevos que dicen lo mismo (en la mesa cambian de identidad en cada render): nada cambia.
    const again = steps(table, actions, labels, (id) => nameOf(id), (id) => artOf(id))

    expect(again.every((step, index) => step === before[index])).toBe(true)

    const renamed = (id: string) => (id === 'card-1003-1' ? 'Otra carta' : nameOf(id))
    const named = steps(table, actions, labels, renamed, artOf)

    expect(named).toEqual(full(actions, table, renamed))
    expect(named.some((step, index) => step !== before[index])).toBe(true)

    const noArt = (id: string) => (id === 'card-1004-1' ? null : artOf(id))

    expect(steps(table, actions, labels, renamed, noArt)).toEqual(full(actions, table, renamed, noArt))

    const phrases = labels.map((label, index) => (index === 100 ? 'Otra frase' : label))

    expect(steps(table, actions, phrases, renamed, noArt)).toEqual(full(actions, table, renamed, noArt, phrases))

    // Otra mano inicial (otra mesa de arranque, las mismas jugadas): todo de nuevo.
    const other = createMatState(main, extra, 6)
    const otherSteps = steps(other, actions, labels, nameOf, artOf)

    expect(otherSteps).toEqual(full(actions, other))
    expect(otherSteps).not.toEqual(full(actions))
  })
})
