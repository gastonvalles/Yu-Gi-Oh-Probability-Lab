import { AUTO_KEYS, autoPrefs, canRunAuto, DEFAULT_AUTO_PREFS, readAutoPrefs, setAutoPref } from '../app/auto-prefs'

const memory = () => {
  const data = new Map<string, string>()

  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) } as unknown as Storage
}

describe('las preferencias del duelo automático', () => {
  it('sin nada guardado: el interruptor prendido (se juega en automático donde se puede), se pregunta la cadena y la casilla, la mano del rival a la vista', () => {
    expect(readAutoPrefs(memory)).toEqual(DEFAULT_AUTO_PREFS)
    expect(DEFAULT_AUTO_PREFS).toEqual({ duel: true, chain: 'ask', place: 'ask', blind: false })
  })

  it('ya no hay bandera: la clave vieja no prende nada', () => {
    const storage = memory()

    storage.setItem('ygo-lab:auto-flag', 'on')
    expect(readAutoPrefs(() => storage)).toEqual(DEFAULT_AUTO_PREFS)
    expect(AUTO_KEYS).not.toHaveProperty('flag')
  })

  it('lo guardado vuelve; lo que no se entiende vale lo de siempre; sin almacenamiento, también', () => {
    const storage = memory()

    storage.setItem(AUTO_KEYS.duel, 'on')
    storage.setItem(AUTO_KEYS.chain, 'never')
    storage.setItem(AUTO_KEYS.place, 'auto')
    storage.setItem(AUTO_KEYS.blind, 'on')
    expect(readAutoPrefs(() => storage)).toEqual({ duel: true, chain: 'never', place: 'auto', blind: true })
    storage.setItem(AUTO_KEYS.chain, 'always')
    expect(readAutoPrefs(() => storage).chain).toBe('always')
    storage.setItem(AUTO_KEYS.duel, 'si')
    storage.setItem(AUTO_KEYS.blind, 'si')
    storage.setItem(AUTO_KEYS.chain, 'siempre')
    storage.setItem(AUTO_KEYS.place, '1')
    expect(readAutoPrefs(() => storage)).toEqual(DEFAULT_AUTO_PREFS)
    const broken = () => {
      throw new Error('sin almacenamiento')
    }

    expect(readAutoPrefs(broken)).toEqual(DEFAULT_AUTO_PREFS)
    expect(() => setAutoPref('duel', true, broken)).not.toThrow()
    setAutoPref('duel', false, broken)
  })

  it('cambiar una se guarda y la ven quienes la leen', () => {
    const storage = memory()

    setAutoPref('chain', 'never', () => storage)
    setAutoPref('duel', true, () => storage)
    setAutoPref('duel', false, () => storage)
    expect(autoPrefs()).toMatchObject({ chain: 'never', duel: false })
    expect([storage.getItem(AUTO_KEYS.chain), storage.getItem(AUTO_KEYS.duel)]).toEqual(['never', 'off'])
    expect(readAutoPrefs(() => storage)).toMatchObject({ chain: 'never', duel: false })
    setAutoPref('duel', true, () => storage)
    expect(storage.getItem(AUTO_KEYS.duel)).toBe('on')
    expect(readAutoPrefs(() => storage).duel).toBe(true)
  })

  it('el núcleo necesita WebAssembly y un Worker: sin alguno, el navegador no lo puede correr', () => {
    class FakeWorker {}

    expect(canRunAuto({ WebAssembly: {}, Worker: FakeWorker })).toBe(true)
    expect(canRunAuto({ WebAssembly: {} })).toBe(false)
    expect(canRunAuto({ Worker: FakeWorker })).toBe(false)
    expect(canRunAuto({})).toBe(false)
  })
})
