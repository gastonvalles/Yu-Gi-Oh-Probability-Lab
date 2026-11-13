// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { EFFECTS_KEY, setEffects } from '../app/effects'

// «Efectos: Livianos» (☰): se guarda y se pone en el html (`data-effects`, la variante `fx-lite:` de index.css); Completos lo saca.
describe('guardar y aplicar la calidad de los efectos', () => {
  afterEach(() => {
    setEffects('full')
    localStorage.clear()
  })

  it('Livianos se guarda y marca el html; Completos lo saca', () => {
    setEffects('lite')
    expect(localStorage.getItem(EFFECTS_KEY)).toBe('lite')
    expect(document.documentElement.getAttribute('data-effects')).toBe('lite')

    setEffects('full')
    expect(localStorage.getItem(EFFECTS_KEY)).toBe('full')
    expect(document.documentElement.hasAttribute('data-effects')).toBe(false)
  })
})
