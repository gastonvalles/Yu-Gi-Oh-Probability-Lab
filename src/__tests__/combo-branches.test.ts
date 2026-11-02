import { describe, expect, it } from 'vitest'

import { decodeComboPayload, encodeComboPayload, toSavedCombo } from '../app/combo-share'
import type { MatAction } from '../app/practice-mat'
import { comboBranches, type SavedCombo } from '../app/saved-combos'
import { referenceCombo } from './support/combo-fixtures'

// La mesa del combo de referencia y jugadas cortas: la base sigue tres jugadas; la variante comparte `shared` y en vez de seguir el rival usa su handtrap.
const reference = referenceCombo()
const [p0, p1, p2, p3] = reference.actions.filter((action) => action.type !== 'rivalUse') as [MatAction, MatAction, MatAction, MatAction]
const rivalUse: MatAction = { type: 'rivalUse', id: 'rival.card-14558127-1' }
const combo = (id: string, actions: MatAction[], extra: Partial<SavedCombo> = {}): SavedCombo => ({ ...reference, id, name: id, savedAt: '2026-10-01', initial: structuredClone(reference.initial), actions, ...extra })
const ids = (branches: ReturnType<typeof comboBranches>) => branches.map(({ base, variant, fork }) => [base.id, variant.id, fork])

describe('ramas de los combos guardados', () => {
  it('una variante con handtrap se liga a su base por el prefijo común; `fork` es el índice de la primera jugada distinta', () => {
    const base = combo('base', [p0, p1, p2, p3])
    const variant = combo('var', [p0, p1, rivalUse, p2])

    expect(ids(comboBranches([base, variant]))).toEqual([['base', 'var', 2]])
  })

  it('sin jugadas en común (fork 0), con otra mesa o si el base es un prefijo de la variante, no hay rama', () => {
    const base = combo('base', [p0, p1, p2])

    expect(comboBranches([base, combo('var', [rivalUse, p0])])).toEqual([])
    expect(comboBranches([base, combo('var', [p0, rivalUse], { initial: { ...structuredClone(reference.initial), hand: [...reference.initial.hand].reverse() } })])).toEqual([])
    expect(comboBranches([base, combo('var', [p0, p1, p2, rivalUse])])).toEqual([])
  })

  it('el rival puede ser otro (otras handtraps): la mesa se compara sin él', () => {
    const base = combo('base', [p0, p1, p2], { initial: { ...structuredClone(reference.initial), rival: { hand: ['rival.card-1-1'], used: [] } } })

    expect(ids(comboBranches([base, combo('var', [p0, rivalUse])]))).toEqual([['base', 'var', 1]])
  })

  it('con dos bases gana el prefijo más largo, después el mismo deck y después el más viejo', () => {
    const variant = combo('var', [p0, p1, rivalUse])
    const short = combo('short', [p0, p2, p3], { savedAt: '2026-01-01' })
    const long = combo('long', [p0, p1, p2])

    expect(ids(comboBranches([short, long, variant]))).toEqual([['long', 'var', 2]])
    const otherDeck = combo('other', [p0, p1, p3], { deckName: 'Otro', savedAt: '2026-01-01' })
    expect(ids(comboBranches([otherDeck, long, variant]))).toEqual([['long', 'var', 2]])
    const older = combo('older', [p0, p1, p3], { savedAt: '2026-01-01' })
    expect(ids(comboBranches([long, older, variant]))).toEqual([['older', 'var', 2]])
  })

  it('borrar el base deja la variante suelta, y renombrarlo o anotarlo no la desliga', () => {
    const base = combo('base', [p0, p1, p2])
    const variant = combo('var', [p0, rivalUse])

    expect(comboBranches([variant])).toEqual([])
    expect(ids(comboBranches([{ ...base, name: 'Otro nombre', notes: { 0: 'Por qué' } }, variant]))).toEqual([['base', 'var', 1]])
  })

  it('base y variante que llegan por enlace se vuelven a ligar (el enlace arma la mesa y las jugadas con otro orden de claves)', async () => {
    // La invocación con las claves en otro orden que el del enlace (`FIELDS`), como puede armarla la mesa.
    const summon = reference.actions[4] as Extract<MatAction, { type: 'summon' }>
    const shuffled: MatAction = { type: 'summon', pos: summon.pos, index: summon.index, zone: summon.zone, materials: summon.materials, how: summon.how, id: summon.id }
    const prefix = [...reference.actions.slice(0, 4), shuffled]
    const base = combo('base', [...prefix, p3])
    const variant = combo('var', [...prefix, rivalUse, p3])
    const roundTrip = async (saved: SavedCombo) => {
      const result = await decodeComboPayload(await encodeComboPayload(saved))
      if (!result.ok) throw new Error(result.error)
      return toSavedCombo(result.combo, [])
    }
    const [sharedBase, sharedVariant] = [await roundTrip(base), await roundTrip(variant)]

    expect(comboBranches([sharedBase, sharedVariant]).map(({ fork }) => fork)).toEqual([5])
    expect(comboBranches([base, sharedVariant]).map(({ fork }) => fork)).toEqual([5])
  })
})
