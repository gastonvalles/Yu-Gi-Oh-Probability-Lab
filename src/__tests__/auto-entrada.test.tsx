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

// La entrada al duelo automático, para todos: «Modo del duelo» en las reglas de Online y la mesa de Solo (`#practice`). Las dos mesas van de mentira (lo que dibujan lo prueban
// `practice-*` y `auto-screen-*`): acá importa cuál se abre.
vi.mock('../components/deck-mode/lazy-steps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/deck-mode/lazy-steps')>()),
  LazyPracticeSection: ({ session, state, onAuto }: { session: { actions: unknown[]; cursor: number; replay: boolean }; state: { phase: string }; onAuto?: (state: unknown) => void }) => (
    <>
      <p>mesa manual</p>
      <p data-testid="manual-session">{`${session.actions.length}·${session.cursor}·${session.replay}·${state.phase}`}</p>
      {onAuto ? (
        <button type="button" onClick={() => onAuto(state)}>
          a automático
        </button>
      ) : null}
    </>
  ),
  preloadHeavySteps: () => {},
}))
// «Seguir en manual» de mentira: una partida con dos jugadas.
vi.mock('../components/auto/AutoSoloScreen', async () => {
  const { createMatState } = await import('../app/practice-mat')
  const game = { initial: createMatState(['card-1-1'], [], 0), actions: [{ type: 'phase', phase: 'standby' }, { type: 'phase', phase: 'main1' }], names: {} }

  return {
    AutoSoloScreen: ({ onManual, resume }: { onManual?: (value: typeof game | null) => void; resume?: { state: { phase: string }; lp: readonly number[] } }) => (
      <>
        <p>mesa automática</p>
        <p data-testid="auto-resume">{resume ? `${resume.state.phase}·${resume.lp.join('/')}` : 'nuevo'}</p>
        <button type="button" onClick={() => onManual?.(game)}>
          seguir
        </button>
        <button type="button" onClick={() => onManual?.(null)}>
          volver sin jugar
        </button>
      </>
    ),
  }
})

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
  render(<PlayHome view={null} name="" onName={() => {}} deckName="Mi deck" onOpenBuilder={() => {}} deckReady deckSize={40} minDeck={40} onOpenDuel={() => {}} onJoin={() => {}} paused={null} onResume={() => {}} onDropPaused={() => {}} {...props} />)

/** La hoja de «Reglas del duelo» abierta desde el atajo de la portada. */
const openRules = () => {
  fireEvent.click(screen.getByRole('button', { name: /^Reglas del duelo/ }))

  return screen.getByRole('dialog', { name: 'Reglas del duelo' })
}
const MODE = { name: 'Modo del duelo' }

describe('«Modo del duelo», en las reglas de Jugar', () => {
  it('la portada ya no tiene el interruptor: el nombre se escribe ahí mismo (hasta 20 letras, «Duelista» si queda vacío) y se guarda mientras se escribe', () => {
    withWorker()
    const onName = vi.fn()
    lobby({ onName })

    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.queryByText('Duelo automático (beta)')).toBeNull()
    const input = screen.getByLabelText('Tu nombre')

    expect(input).toHaveAttribute('maxlength', '20')
    expect(input).toHaveAttribute('placeholder', 'Duelista')
    expect(input).toHaveAccessibleDescription('Cómo te ve tu rival')
    expect(input).not.toHaveFocus()
    fireEvent.change(input, { target: { value: 'Ana' } })
    expect(onName).toHaveBeenCalledWith('Ana')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('automático de entrada: elegir «Manual» lo guarda y «Automático» lo vuelve; el «Tipo» es Single · Match (jugar solo es otra entrada del menú)', () => {
    withWorker()
    setAutoPref('duel', true)
    lobby()
    const rules = openRules()
    const mode = within(rules).getByRole('radiogroup', MODE)

    expect(within(within(rules).getByRole('radiogroup', { name: 'Tipo' })).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['Single', 'Match · mejor de 3'])
    expect(within(mode).getByRole('radio', { name: 'Automático' })).toBeChecked()
    expect(within(rules).getByText(/^El núcleo aplica las reglas por los dos/)).toBeInTheDocument()
    fireEvent.click(within(mode).getByRole('radio', { name: 'Manual' }))
    expect([autoPrefs().duel, localStorage.getItem(AUTO_KEYS.duel)]).toEqual([false, 'off'])
    expect(within(rules).getByText(/^Movés las cartas vos/)).toBeInTheDocument()
    fireEvent.click(within(mode).getByRole('radio', { name: 'Automático' }))
    expect([autoPrefs().duel, localStorage.getItem(AUTO_KEYS.duel)]).toEqual([true, 'on'])
    // Lo de Solo ya no está acá: ni el rival ni quién empieza.
    expect(within(rules).queryByRole('radiogroup', { name: 'Rival' })).toBeNull()
    expect(within(rules).queryByRole('radiogroup', { name: 'Quién empieza' })).toBeNull()
    expect(within(rules).queryByRole('switch', { name: 'Mostrar la mano del bot' })).toBeNull()
  })

  it('la portada de Online ya no tiene «Entrenar solo»: tres atajos (un amigo, un código y las reglas)', () => {
    withWorker()
    lobby({ deckReady: false, deckSize: 3 })

    expect(screen.queryByRole('button', { name: /Entrenar solo/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Retar a un amigo/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Tengo un código/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Reglas del duelo/ })).toBeInTheDocument()
  })

  it('un navegador que no puede correr el núcleo lo ve en «Manual», sin poder tocarlo, y con el porqué (aunque lo hubiera dejado en automático)', () => {
    setAutoPref('duel', true)
    lobby()
    const rules = openRules()

    const mode = within(rules).getByRole('radiogroup', MODE)
    expect(within(mode).getByRole('radio', { name: 'Manual' })).toBeChecked()
    expect(within(mode).getByRole('radio', { name: 'Automático' })).toBeDisabled()
    expect(within(rules).getByText('Tu navegador no puede correr las reglas automáticas.')).toBeInTheDocument()
  })
})

describe('«Entrenar solo» abre la mesa que dice el modo', () => {
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

  it('«Seguir en modo manual» abre la manual con la partida (en vivo, con su historial) sin tocar el interruptor; al volver al lobby de Jugar, otra vez la automática', async () => {
    withWorker()
    // Cambiar de pantalla sube el contenido (jsdom no lo tiene).
    HTMLElement.prototype.scrollTo = () => {}
    setAutoPref('duel', true)
    practice()
    fireEvent.click(await screen.findByRole('button', { name: 'seguir' }))

    expect(await screen.findByText('mesa manual')).toBeInTheDocument()
    // Las dos jugadas, con el cursor al final y sin los controles de un combo: Deshacer y los Pasos siguen.
    expect(screen.getByTestId('manual-session')).toHaveTextContent('2·2·false·main1')
    expect(autoPrefs().duel).toBe(true)
    const go = (hash: string) =>
      act(() => {
        window.history.replaceState(null, '', hash)
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      })

    go('#duel')
    go('#practice')
    expect(await screen.findByText('mesa automática')).toBeInTheDocument()
  })

  it('el ciclo manual → automático → manual: «Seguir en automático» abre la automática desde la mesa manual y, sin jugar, volver deja la manual como estaba; el lobby lo olvida', async () => {
    withWorker()
    HTMLElement.prototype.scrollTo = () => {}
    setAutoPref('duel', true)
    practice()
    expect(await screen.findByTestId('auto-resume')).toHaveTextContent('nuevo')
    fireEvent.click(screen.getByRole('button', { name: 'seguir' }))
    expect(await screen.findByTestId('manual-session')).toHaveTextContent('2·2·false·main1')

    fireEvent.click(screen.getByRole('button', { name: 'a automático' }))
    expect(await screen.findByTestId('auto-resume')).toHaveTextContent('main1·8000/8000')
    fireEvent.click(screen.getByRole('button', { name: 'volver sin jugar' }))
    expect(await screen.findByTestId('manual-session')).toHaveTextContent('2·2·false·main1')
    // Con jugadas, la partida del automático (la de mentira) reemplaza la manual.
    fireEvent.click(screen.getByRole('button', { name: 'a automático' }))
    fireEvent.click(await screen.findByRole('button', { name: 'seguir' }))
    expect(await screen.findByTestId('manual-session')).toHaveTextContent('2·2·false·main1')

    act(() => {
      window.history.replaceState(null, '', '#duel')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    act(() => {
      window.history.replaceState(null, '', '#practice')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(await screen.findByTestId('auto-resume')).toHaveTextContent('nuevo')
  })

  it('con la beta apagada la práctica no ofrece «Seguir en automático»', async () => {
    withWorker()
    practice()
    expect(await screen.findByText('mesa manual')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'a automático' })).toBeNull()
  })

  it('en un navegador que no puede correr el núcleo, la preferencia no se usa: siempre la manual', async () => {
    setAutoPref('duel', true)
    practice()

    expect(await screen.findByText('mesa manual')).toBeInTheDocument()
    expect(screen.queryByText('mesa automática')).toBeNull()
  })
})
