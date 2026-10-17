import { describe, expect, it } from 'vitest'

import { DEFAULT_PREFS, PREFS_KEY, pickRoom, readPrefs, writePrefs, type DuelPrefs } from '../app/duel-prefs'
import type { PublicRoom } from '../app/duel-relay-rules'

const memory = () => {
  const data = new Map<string, string>()

  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) } as unknown as Storage
}

const room = (code: string, patch: Partial<PublicRoom> = {}): PublicRoom => ({ code, host: code, match: false, siding: false, format: 'tcg', limitMin: 50, createdAt: 1000, ...patch })

describe('las reglas que se recuerdan', () => {
  it('sin nada guardado valen las de siempre: TCG, 50 minutos, un solo duelo', () => {
    expect(DEFAULT_PREFS).toEqual({ limitMin: 50, format: 'tcg', match: false, siding: false, genesysCap: 100 })
    expect(readPrefs(memory)).toEqual(DEFAULT_PREFS)
  })

  it('lo que se guarda vuelve igual; el siding sólo vale en un Match', () => {
    const storage = memory()
    const prefs: DuelPrefs = { limitMin: 0, format: 'genesys', match: true, siding: true, genesysCap: 80 }

    writePrefs(prefs, () => storage)
    expect(readPrefs(() => storage)).toEqual(prefs)

    writePrefs({ ...prefs, match: false }, () => storage)
    expect(readPrefs(() => storage)).toMatchObject({ match: false, siding: false })
  })

  it('lo guardado que no se entiende (otra versión, otra persona) se revisa campo por campo', () => {
    const storage = memory()

    storage.setItem(PREFS_KEY, JSON.stringify({ limitMin: 40, format: 'otro', match: 'si', siding: true, genesysCap: 9 }))
    expect(readPrefs(() => storage)).toEqual(DEFAULT_PREFS)
    storage.setItem(PREFS_KEY, '{no es json')
    expect(readPrefs(() => storage)).toEqual(DEFAULT_PREFS)
    storage.setItem(PREFS_KEY, '[]')
    expect(readPrefs(() => storage)).toEqual(DEFAULT_PREFS)
    expect(readPrefs(() => { throw new Error('sin almacenamiento') })).toEqual(DEFAULT_PREFS)
    expect(() => writePrefs(DEFAULT_PREFS, () => { throw new Error('cuota') })).not.toThrow()
  })
})

describe('la sala a la que entra «Jugar ahora»', () => {
  it('sólo del mismo formato y del mismo tipo: no se entra a una mejor de 3 sin saberlo, ni a otro formato', () => {
    expect(pickRoom([room('A', { format: 'edison' }), room('B', { match: true })], DEFAULT_PREFS)).toBeNull()
    expect(pickRoom([], DEFAULT_PREFS)).toBeNull()
    expect(pickRoom([room('A', { match: true })], { ...DEFAULT_PREFS, match: true })?.code).toBe('A')
  })

  it('entre las compatibles, la del reloj elegido; y si empatan, la que hace más que espera', () => {
    expect(pickRoom([room('A', { limitMin: 0 }), room('B', { limitMin: 50, createdAt: 3000 }), room('C', { limitMin: 50, createdAt: 2000 })], DEFAULT_PREFS)?.code).toBe('C')
    expect(pickRoom([room('A', { limitMin: 0 }), room('B', { limitMin: 40 })], DEFAULT_PREFS)).not.toBeNull()
    expect(pickRoom([room('A', { limitMin: 0 }), room('B', { limitMin: 50 })], { ...DEFAULT_PREFS, limitMin: 0 })?.code).toBe('A')
  })

  it('en Genesys, sólo una sala con el mismo tope de puntos (si no, el deck de uno no valdría en la del otro); sin tope en la sala, vale el oficial de 100', () => {
    const prefs = { ...DEFAULT_PREFS, format: 'genesys' as const, genesysCap: 80 }

    expect(pickRoom([room('A', { format: 'genesys' }), room('B', { format: 'genesys', genesysCap: 100 })], prefs)).toBeNull()
    expect(pickRoom([room('A', { format: 'genesys' }), room('B', { format: 'genesys', genesysCap: 80 })], prefs)?.code).toBe('B')
    expect(pickRoom([room('A', { format: 'genesys' })], { ...prefs, genesysCap: 100 })?.code).toBe('A')
  })
})
