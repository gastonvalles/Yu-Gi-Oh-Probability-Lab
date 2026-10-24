import { AUTO_KEYS, autoPrefs, DEFAULT_AUTO_PREFS, readAutoPrefs, setAutoPref } from '../app/auto-prefs'

const memory = () => {
  const data = new Map<string, string>()

  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) } as unknown as Storage
}

describe('las preferencias del duelo automático', () => {
  it('sin nada guardado: la beta escondida, el switch apagado, se pregunta la cadena y la casilla', () => {
    expect(readAutoPrefs(memory, '')).toEqual(DEFAULT_AUTO_PREFS)
    expect(DEFAULT_AUTO_PREFS).toEqual({ flag: false, duel: false, chain: 'ask', place: 'ask' })
  })

  it('`?auto=1` prende la bandera y queda guardada; `?auto=0` la apaga', () => {
    const storage = memory()

    expect(readAutoPrefs(() => storage, '?auto=1').flag).toBe(true)
    expect(storage.getItem(AUTO_KEYS.flag)).toBe('on')
    expect(readAutoPrefs(() => storage, '').flag).toBe(true)
    expect(readAutoPrefs(() => storage, '?x=2&auto=0').flag).toBe(false)
    expect(readAutoPrefs(() => storage, '').flag).toBe(false)
  })

  it('lo guardado vuelve; lo que no se entiende vale lo de siempre; sin almacenamiento, también', () => {
    const storage = memory()

    storage.setItem(AUTO_KEYS.duel, 'on')
    storage.setItem(AUTO_KEYS.chain, 'never')
    storage.setItem(AUTO_KEYS.place, 'auto')
    expect(readAutoPrefs(() => storage, '')).toEqual({ flag: false, duel: true, chain: 'never', place: 'auto' })
    storage.setItem(AUTO_KEYS.chain, 'siempre')
    storage.setItem(AUTO_KEYS.place, '1')
    expect(readAutoPrefs(() => storage, '')).toMatchObject({ chain: 'ask', place: 'ask' })
    const broken = () => {
      throw new Error('sin almacenamiento')
    }

    expect(readAutoPrefs(broken, '?auto=1')).toEqual({ ...DEFAULT_AUTO_PREFS, flag: true })
    expect(() => setAutoPref('duel', true, broken)).not.toThrow()
    setAutoPref('duel', false, broken)
  })

  it('cambiar una se guarda y la ven quienes la leen', () => {
    const storage = memory()

    setAutoPref('chain', 'never', () => storage)
    setAutoPref('duel', true, () => storage)
    expect(autoPrefs()).toMatchObject({ chain: 'never', duel: true })
    expect([storage.getItem(AUTO_KEYS.chain), storage.getItem(AUTO_KEYS.duel)]).toEqual(['never', 'on'])
    expect(readAutoPrefs(() => storage, '')).toMatchObject({ chain: 'never', duel: true })
  })
})
