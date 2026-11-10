// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setAutoPref } from '../app/auto-prefs'
import { DeckModeScreen } from '../components/deck-mode/DeckModeScreen'
import { deckState, fortyCardMain, storeWith } from './support/deck-fixtures'

// «Lie-fi»: el navegador cree que hay red, pero la pantalla del duelo automático de Solo (que se baja al usarla) no llega.
vi.mock('../components/deck-mode/lazy-steps', async (importOriginal) => ({ ...(await importOriginal<typeof import('../components/deck-mode/lazy-steps')>()), preloadHeavySteps: () => {} }))
vi.mock('../components/auto/AutoSoloScreen', () => {
  throw new TypeError('Failed to fetch dynamically imported module')
})

beforeEach(() => {
  localStorage.clear()
  setAutoPref('duel', false)
  vi.stubGlobal('Worker', class {})
  window.scrollTo = () => {}
  HTMLElement.prototype.scrollTo = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  setAutoPref('duel', false)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '#')
})

describe('Solo automático sin la pantalla del núcleo', () => {
  it('si no baja, lo dice el borde de la pantalla (con la vuelta a Solo) y el resto de la app sigue en pie', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    window.history.replaceState(null, '', '#solo')
    render(
      <Provider store={storeWith(deckState({ main: fortyCardMain() }))}>
        <DeckModeScreen />
      </Provider>,
    )

    setAutoPref('duel', true)
    fireEvent.click((await screen.findAllByRole('button', { name: 'Jugar contra las handtraps' }, { timeout: 5000 }))[0])

    expect(await screen.findByRole('alert', {}, { timeout: 5000 })).toHaveTextContent('No se pudo abrir el duelo automático')
    // No es la pantalla de toda la app («Algo salió mal»): el menú sigue.
    expect(screen.queryByText('Algo salió mal')).toBeNull()
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Volver a Solo' }))
    expect(window.location.hash).toBe('#solo')
  })
})
