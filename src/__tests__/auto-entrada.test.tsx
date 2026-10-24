// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ComponentProps } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AUTO_KEYS, autoPrefs, setAutoPref } from '../app/auto-prefs'
import { DeckModeScreen } from '../components/deck-mode/DeckModeScreen'
import { PlayHome } from '../components/duel/PlayHome'
import { deckState, fortyCardMain, storeWith } from './support/deck-fixtures'

// La entrada al duelo automático, para todos: el interruptor del lobby de Jugar y la mesa que abre «Entrenar solo». Las dos mesas van de mentira (lo que dibujan lo prueban
// `practice-*` y `auto-screen-*`): acá importa cuál se abre.
vi.mock('../components/deck-mode/lazy-steps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/deck-mode/lazy-steps')>()),
  LazyPracticeSection: () => <p>mesa manual</p>,
  preloadHeavySteps: () => {},
}))
vi.mock('../components/auto/AutoSoloScreen', () => ({ AutoSoloScreen: () => <p>mesa automática</p> }))

const SWITCH = { name: 'Duelo automático (beta)' }
/** jsdom no tiene `Worker`: el navegador «puede» correr el núcleo sólo cuando la prueba le pone uno. */
const withWorker = () => vi.stubGlobal('Worker', class {})

beforeEach(() => {
  setAutoPref('duel', false)
  localStorage.clear()
  window.scrollTo = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '#')
})

const lobby = (props: Partial<ComponentProps<typeof PlayHome>> = {}) =>
  render(<PlayHome view={null} name="" onName={() => {}} deckName="Mi deck" onOpenBuilder={() => {}} deckReady deckSize={40} minDeck={40} trainReady onTrain={() => {}} onOpenDuel={() => {}} onJoin={() => {}} paused={null} onResume={() => {}} onDropPaused={() => {}} {...props} />)

describe('el interruptor del lobby de Jugar', () => {
  it('con deck se ve debajo de las baldosas, apagado de entrada; tocarlo lo prende y lo apaga, y queda guardado', () => {
    withWorker()
    lobby()
    const toggle = screen.getByRole('switch', SWITCH)

    expect(toggle).not.toBeChecked()
    expect(toggle).toBeEnabled()
    // Va con las baldosas (en su misma grilla), después de «Entrenar solo».
    expect(screen.getByRole('button', { name: 'Entrenar solo' }).parentElement).toContainElement(toggle)
    fireEvent.click(toggle)
    expect(toggle).toBeChecked()
    expect([autoPrefs().duel, localStorage.getItem(AUTO_KEYS.duel)]).toEqual([true, 'on'])
    fireEvent.click(toggle)
    expect(toggle).not.toBeChecked()
    expect([autoPrefs().duel, localStorage.getItem(AUTO_KEYS.duel)]).toEqual([false, 'off'])
  })

  it('sin deck no está: la baldosa «Entrenar solo» ya dice que falta', () => {
    withWorker()
    lobby({ deckReady: false, trainReady: false, deckSize: 3 })

    expect(screen.getByRole('button', { name: 'Entrenar solo' })).toBeDisabled()
    expect(screen.queryByRole('switch', SWITCH)).toBeNull()
  })

  it('un navegador que no puede correr el núcleo lo ve apagado, sin poder tocarlo, y con el porqué (aunque lo hubiera prendido)', () => {
    setAutoPref('duel', true)
    lobby()
    const toggle = screen.getByRole('switch', SWITCH)

    expect(toggle).toBeDisabled()
    expect(toggle).not.toBeChecked()
    expect(screen.getByText('Tu navegador no puede correr el motor de reglas.')).toBeInTheDocument()
  })

  it('las reglas del duelo en Solo ya no lo repiten: el interruptor es uno solo, el del lobby', () => {
    withWorker()
    lobby()
    fireEvent.click(screen.getByRole('button', { name: /^Reglas del duelo/ }))
    const rules = screen.getByRole('dialog', { name: 'Reglas del duelo' })

    fireEvent.click(within(rules).getByRole('radio', { name: 'Solo' }))
    expect(within(rules).getByRole('switch', { name: 'Handtraps del rival' })).toBeInTheDocument()
    expect(within(rules).queryByRole('switch', SWITCH)).toBeNull()
  })
})

describe('«Entrenar solo» abre la mesa que dice el interruptor', () => {
  const practice = () => {
    window.history.replaceState(null, '', '#practice')

    return render(
      <Provider store={storeWith(deckState({ main: fortyCardMain() }))}>
        <DeckModeScreen />
      </Provider>,
    )
  }

  it('apagado, la manual de siempre; prendido, la automática; apagarlo («Jugar en modo manual») vuelve a la manual con el mismo deck', async () => {
    withWorker()
    practice()

    expect(await screen.findByText('mesa manual')).toBeInTheDocument()
    act(() => setAutoPref('duel', true))
    expect(await screen.findByText('mesa automática')).toBeInTheDocument()
    expect(screen.queryByText('mesa manual')).toBeNull()
    act(() => setAutoPref('duel', false))
    expect(await screen.findByText('mesa manual')).toBeInTheDocument()
    expect(screen.queryByText('mesa automática')).toBeNull()
  })

  it('en un navegador que no puede correr el núcleo, la preferencia no se usa: siempre la manual', async () => {
    setAutoPref('duel', true)
    practice()

    expect(await screen.findByText('mesa manual')).toBeInTheDocument()
    expect(screen.queryByText('mesa automática')).toBeNull()
  })
})
