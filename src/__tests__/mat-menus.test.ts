// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// «Menús flotantes» (`app/mat-menus.ts`): acoplado por defecto, flotante se guarda y vuelve tras recargar, y lo que se guardó mal se ignora.
const KEY = 'ygo-lab:mat-menus'

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
})
afterEach(() => localStorage.clear())

describe('la preferencia de los menús flotantes', () => {
  it('de fábrica, acoplados; flotantes se guarda y sobrevive a recargar; volver a acoplados la borra', async () => {
    const first = await import('../app/mat-menus')

    expect(first.MAT_MENUS_KEY).toBe(KEY)
    expect(localStorage.getItem(KEY)).toBeNull()
    first.setMatMenus('floating')
    expect(localStorage.getItem(KEY)).toBe('floating')

    // Recargar la página: el módulo se lee de nuevo.
    vi.resetModules()
    const reloaded = await import('../app/mat-menus')

    expect(localStorage.getItem(KEY)).toBe('floating')
    reloaded.setMatMenus('docked')
    expect(localStorage.getItem(KEY)).toBeNull()
  })

  it('lo guardado que no es «floating» se lee como acoplado', async () => {
    localStorage.setItem(KEY, 'dock')
    vi.resetModules()
    const { renderHook } = await import('@testing-library/react')
    const { useMatMenus } = await import('../app/mat-menus')

    expect(renderHook(() => useMatMenus()).result.current).toBe('docked')
  })

  it('el hook sigue al cambio y avisa a todos los que lo leen', async () => {
    const { act, renderHook } = await import('@testing-library/react')
    const { setMatMenus, useMatMenus } = await import('../app/mat-menus')
    const a = renderHook(() => useMatMenus())
    const b = renderHook(() => useMatMenus())

    expect([a.result.current, b.result.current]).toEqual(['docked', 'docked'])
    act(() => setMatMenus('floating'))
    expect([a.result.current, b.result.current]).toEqual(['floating', 'floating'])
  })

  it('sin almacenamiento (ventana privada) vale hasta recargar y no tira', async () => {
    const { setMatMenus } = await import('../app/mat-menus')
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('cuota')
    })

    expect(() => setMatMenus('floating')).not.toThrow()
    spy.mockRestore()
  })
})
