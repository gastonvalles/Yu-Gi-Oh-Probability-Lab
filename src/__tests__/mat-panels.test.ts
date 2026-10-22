import { describe, expect, it } from 'vitest'

import { MAT_MIN_PX, MAT_PANELS_KEY, PANEL_DEFAULT_PX, PANEL_MAX_PX, PANEL_MIN_PX, clampPanel, fitPanels, panelMax, readMatPanels, writeMatPanels } from '../app/mat-panels'

/** Un almacenamiento en memoria con lo que se le dé. */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial))

  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  }
}

const BOTH = { left: true, right: true }

describe('los anchos de los paneles de la mesa', () => {
  it('los valores: 20 rem el de siempre, de 16 a 36 rem, y la mesa del medio nunca menos de 33 rem', () => {
    expect([PANEL_DEFAULT_PX, PANEL_MIN_PX, PANEL_MAX_PX, MAT_MIN_PX]).toEqual([320, 256, 576, 528])
  })

  it('un ancho se acota entre el mínimo y el tope que se le dé (en px enteros); sin tope, hasta 36 rem', () => {
    expect(clampPanel(100)).toBe(PANEL_MIN_PX)
    expect(clampPanel(400.6)).toBe(401)
    expect(clampPanel(9000)).toBe(PANEL_MAX_PX)
    expect(clampPanel(500, 420)).toBe(420)
    // Un tope por debajo del mínimo no deja el panel más angosto que el mínimo.
    expect(clampPanel(300, 100)).toBe(PANEL_MIN_PX)
  })

  it('lo más ancho de un panel: lo que deja la sección sin el otro panel y la mesa mínima, entre 16 y 36 rem', () => {
    // 1440 px con el menú abierto (sección de 1190 px) y el otro panel de 20 rem.
    expect(panelMax(1190, 320)).toBe(1190 - 320 - MAT_MIN_PX)
    // Sin el otro panel (entre 1101 y 1439 px) entra más; nunca más de 36 rem.
    expect(panelMax(851, 0)).toBe(851 - MAT_MIN_PX)
    expect(panelMax(1844, 320)).toBe(PANEL_MAX_PX)
    // Una sección chiquita no lo deja por debajo del mínimo.
    expect(panelMax(600, 320)).toBe(PANEL_MIN_PX)
  })

  it('sin elegir nada los dos miden lo de siempre; lo elegido se recorta a lo que entra sin cambiar lo guardado', () => {
    expect(fitPanels({ left: null, right: null }, 1190, BOTH)).toEqual({ left: 320, right: 320 })
    expect(fitPanels({ left: 500, right: null }, 1844, BOTH)).toEqual({ left: 500, right: 320 })

    // La misma elección en una ventana más chica: el detalle entra hasta lo que deja la mesa con el otro a su mínimo, y el de la derecha cede primero.
    const chosen = { left: 576, right: 576 }

    expect(fitPanels(chosen, 1844, BOTH)).toEqual({ left: 576, right: 576 })
    expect(fitPanels(chosen, 1670, BOTH)).toEqual({ left: 576, right: 1670 - 576 - MAT_MIN_PX })
    expect(fitPanels(chosen, 1190, BOTH)).toEqual({ left: 1190 - PANEL_MIN_PX - MAT_MIN_PX, right: PANEL_MIN_PX })
    expect(chosen).toEqual({ left: 576, right: 576 })
  })

  it('un panel que no está mide 0 y le deja todo al otro', () => {
    expect(fitPanels({ left: 500, right: 576 }, 851, { left: false, right: true })).toEqual({ left: 0, right: 851 - MAT_MIN_PX })
    expect(fitPanels({ left: 500, right: 576 }, 1190, { left: true, right: false })).toEqual({ left: 500, right: 0 })
    expect(fitPanels({ left: null, right: null }, 1090, { left: false, right: false })).toEqual({ left: 0, right: 0 })
  })

  it('sin medir todavía (una sección infinita) no recorta nada', () => {
    expect(fitPanels({ left: 576, right: 576 }, Number.POSITIVE_INFINITY, BOTH)).toEqual({ left: 576, right: 576 })
  })
})

describe('lo que se recuerda en el navegador', () => {
  it('sin nada guardado, o sin almacenamiento, son los de siempre', () => {
    expect(readMatPanels(() => memoryStorage())).toEqual({ left: null, right: null })
    expect(
      readMatPanels(() => {
        throw new Error('sin almacenamiento')
      }),
    ).toEqual({ left: null, right: null })
  })

  it('lo que no se entiende vuelve al de siempre, cada panel por su lado; lo de afuera del rango se acota', () => {
    const read = (raw: string) => readMatPanels(() => memoryStorage({ [MAT_PANELS_KEY]: raw }))

    expect(read('{roto')).toEqual({ left: null, right: null })
    expect(read('[1,2]')).toEqual({ left: null, right: null })
    expect(read('"texto"')).toEqual({ left: null, right: null })
    expect(read('null')).toEqual({ left: null, right: null })
    expect(read(JSON.stringify({ left: '400', right: true }))).toEqual({ left: null, right: null })
    expect(read(JSON.stringify({ left: 400, right: 'ancho' }))).toEqual({ left: 400, right: null })
    expect(read(JSON.stringify({ left: 5, right: 99999 }))).toEqual({ left: PANEL_MIN_PX, right: PANEL_MAX_PX })
    expect(read(JSON.stringify({ left: 300.4, right: null }))).toEqual({ left: 300, right: null })
  })

  it('se escribe con su clave y se vuelve a leer igual; sin almacenamiento no rompe', () => {
    const storage = memoryStorage()

    writeMatPanels({ left: 448, right: null }, () => storage)
    expect(storage.getItem(MAT_PANELS_KEY)).toBe('{"left":448,"right":null}')
    expect(readMatPanels(() => storage)).toEqual({ left: 448, right: null })

    expect(() =>
      writeMatPanels({ left: 448, right: 300 }, () => {
        throw new Error('cuota')
      }),
    ).not.toThrow()
  })
})
