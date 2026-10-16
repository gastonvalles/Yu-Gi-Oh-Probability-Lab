// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// `readActive` corre una vez al importar el módulo: cada prueba lo vuelve a cargar con otro ancho de ventana.
const media = (desktop: boolean) =>
  ((query: string) => ({ matches: desktop, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia

const load = async () => (await import('../app/mascot')).activeMascotIds()

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})

afterEach(() => {
  // Sin matchMedia, como arrancan el resto de los tests.
  Reflect.deleteProperty(window, 'matchMedia')
})

describe('las mascotas la primera vez', () => {
  it('desde un celular o una tableta no sale ninguna (se sacan desde Mascotas, en Herramientas)', async () => {
    window.matchMedia = media(false)

    expect(await load()).toEqual([])
  })

  it('desde escritorio sale la de siempre', async () => {
    window.matchMedia = media(true)

    expect(await load()).toEqual(['cupsy'])
  })

  it('quien ya eligió (o la mandó a descansar) lo conserva, también desde un celular', async () => {
    window.matchMedia = media(false)
    localStorage.setItem('ygo-lab:mascots', JSON.stringify(['winged-kuriboh']))

    expect(await load()).toEqual(['winged-kuriboh'])
  })

  it('quien tenía su mascota de antes (la versión con una sola) también la conserva', async () => {
    window.matchMedia = media(false)
    localStorage.setItem('ygo-lab:mascot-id', 'cupsy')

    expect(await load()).toEqual(['cupsy'])
  })
})
