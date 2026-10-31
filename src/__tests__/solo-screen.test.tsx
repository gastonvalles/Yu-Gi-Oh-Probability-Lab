// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setAutoPref } from '../app/auto-prefs'
import { readHandtrapConfig, writeHandtrapConfig, DEFAULT_HANDTRAP_CONFIG } from '../app/handtraps'
import { DeckModeScreen } from '../components/deck-mode/DeckModeScreen'
import { SoloScreen } from '../components/duel/SoloScreen'
import { deckState, fortyCardMain, storeWith } from './support/deck-fixtures'
import { render as renderWithStore } from './support/practice-mat-harness'

// Solo (`#solo`): la lista de rivales (un bot por mazo, el pasivo y el de handtraps), su ficha y «Jugar contra X», que abre la mesa (`#practice`) en el modo que corresponde.
// Las dos mesas van de mentira (lo que dibujan lo prueban `practice-*` y `auto-screen-*`): acá importa cuál se abre, contra quién y adónde se vuelve.
vi.mock('../components/deck-mode/lazy-steps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/deck-mode/lazy-steps')>()),
  LazyPracticeSection: () => <p>mesa manual</p>,
  preloadHeavySteps: () => {},
}))
vi.mock('../components/auto/AutoSoloScreen', async () => {
  const { readHandtrapConfig: read } = await import('../app/handtraps')

  return {
    AutoSoloScreen: ({ onExit }: { onExit: () => void }) => (
      <>
        <p>mesa automática</p>
        <p data-testid="bot">{read().botDeck ?? 'sin bot'}</p>
        <button type="button" onClick={onExit}>
          salir
        </button>
      </>
    ),
  }
})

const withWorker = () => vi.stubGlobal('Worker', class {})
const DESKTOP = '(min-width: 1101px)'
const media = (desktop: boolean) => {
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') || (desktop && query.includes('1101')), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
}

beforeEach(() => {
  setAutoPref('duel', false)
  localStorage.clear()
  window.scrollTo = () => {}
  HTMLElement.prototype.scrollTo = () => {}
  media(false)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '#')
})

const app = (hash: string) => {
  window.history.replaceState(null, '', hash)

  return render(
    <Provider store={storeWith(deckState({ main: fortyCardMain() }))}>
      <DeckModeScreen />
    </Provider>,
  )
}
const rivals = async () => screen.findByRole('radiogroup', { name: 'Contra quién jugás' })
const radio = async (name: RegExp) => within(await rivals()).getByRole('radio', { name })
const go = (hash: string) =>
  act(() => {
    window.history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  })

describe('Solo, de punta a punta', () => {
  it('jugar contra Elfnote: tocar la fila la elige y la guarda; «Jugar» abre la mesa automática con ese bot (aunque el modo esté en Manual) y salir vuelve a Solo', async () => {
    withWorker()
    app('#solo')

    fireEvent.click(await radio(/^Elfnote/))
    expect(await radio(/^Elfnote/)).toHaveAttribute('aria-checked', 'true')
    expect(readHandtrapConfig().botDeck).toBe('elfnote')

    fireEvent.click(screen.getByRole('button', { name: 'Jugar contra Elfnote' }))
    expect(await screen.findByText('mesa automática')).toBeInTheDocument()
    expect(screen.getByTestId('bot')).toHaveTextContent('elfnote')
    expect(window.location.hash).toBe('#practice')

    fireEvent.click(screen.getByRole('button', { name: 'salir' }))
    expect(await rivals()).toBeInTheDocument()
    expect(window.location.hash).toBe('#solo')
  })

  it('el último bot queda elegido, con «Último», al volver', async () => {
    withWorker()
    writeHandtrapConfig({ ...DEFAULT_HANDTRAP_CONFIG, botDeck: 'branded' })
    app('#solo')

    expect(await radio(/^Despia Branded/)).toHaveAttribute('aria-checked', 'true')
    expect(await radio(/^Despia Branded/)).toHaveTextContent('Último')
    expect(await radio(/^Sky Striker/)).not.toHaveTextContent('Último')
  })

  it('Pasivo en Manual es tu mesa sin rival (la práctica manual); Handtraps en Automático abre la del núcleo; el modo se cambia en la ficha y es el de Online', async () => {
    withWorker()
    app('#solo')

    fireEvent.click(await radio(/^Pasivo/))
    expect(await radio(/^Pasivo/)).toHaveTextContent('Tu mesa sin rival: movés vos.')
    fireEvent.click(screen.getByRole('button', { name: 'Abrir tu mesa' }))
    expect(await screen.findByText('mesa manual')).toBeInTheDocument()

    go('#solo')
    fireEvent.click(await radio(/^Handtraps/))
    fireEvent.click(screen.getByRole('button', { name: /Ficha y ajustes/ }))
    const ficha = screen.getByRole('dialog', { name: 'Handtraps' })
    // Abrir la ficha no enfoca un campo de texto (no hay ninguno).
    expect(document.activeElement?.tagName).not.toBe('INPUT')
    const mode = within(ficha).getByRole('switch', { name: 'Automático' })

    expect(mode).toHaveAttribute('aria-checked', 'false')
    expect(ficha).toHaveTextContent('El modo vale también para tus salas de Online.')
    // En Manual no hay turnos del rival: ni «Quién empieza» ni «El rival juega su turno».
    expect(within(ficha).queryByRole('radiogroup', { name: 'Quién empieza' })).toBeNull()
    fireEvent.click(mode)
    expect(within(ficha).getByRole('radiogroup', { name: 'Quién empieza' })).toBeInTheDocument()
    expect(within(ficha).getByRole('switch', { name: 'El rival juega su turno' })).toBeInTheDocument()
    fireEvent.click(within(ficha).getByRole('button', { name: 'Jugar contra las handtraps' }))
    expect(await screen.findByText('mesa automática')).toBeInTheDocument()
    expect(screen.getByTestId('bot')).toHaveTextContent('sin bot')
    expect(readHandtrapConfig().enabled).toBe(true)
  })

  it('las rutas de antes siguen andando: #practice abre la mesa, #duel y #duel?room= siguen siendo Online', async () => {
    app('#practice')
    expect(await screen.findByText('mesa manual')).toBeInTheDocument()
    go('#duel?room=ABCDEFGH')
    expect(await screen.findByText(/El duelo con un amigo todavía no está disponible/)).toBeInTheDocument()
    go('#duel')
    expect(screen.getByText(/El duelo con un amigo todavía no está disponible/)).toBeInTheDocument()
    go('#solo')
    expect(await rivals()).toBeInTheDocument()
  })
})

describe('los estados de Solo', () => {
  const solo = (props: Partial<Parameters<typeof SoloScreen>[0]> = {}) => renderWithStore(<SoloScreen deckName="Mi deck" deckSize={40} minDeck={5} onOpenBuilder={() => {}} onPlay={() => {}} {...props} />)

  it('sin modo automático en el navegador: los bots se ven apagados y dicen por qué; Pasivo y Handtraps van en manual', () => {
    writeHandtrapConfig({ ...DEFAULT_HANDTRAP_CONFIG, botDeck: 'elfnote' })
    const onPlay = vi.fn()
    solo({ onPlay })
    const list = screen.getByRole('radiogroup', { name: 'Contra quién jugás' })
    const elfnote = within(list).getByRole('radio', { name: /^Elfnote/ })

    expect(screen.getByText(/^Este navegador no puede correr el modo automático/)).toBeInTheDocument()
    expect(elfnote).toHaveAttribute('aria-disabled', 'true')
    expect(elfnote).toHaveTextContent('Necesita el modo automático')
    fireEvent.click(elfnote)
    expect(elfnote).toHaveAttribute('aria-checked', 'false')
    // Lo guardado era Elfnote: sin núcleo vale el pasivo, en manual.
    expect(within(list).getByRole('radio', { name: /^Pasivo/ })).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(screen.getByRole('button', { name: /Ficha y ajustes/ }))
    expect(within(screen.getByRole('dialog')).getByRole('switch', { name: 'Automático' })).toBeDisabled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Abrir tu mesa' }))
    expect(onPlay).toHaveBeenCalledWith('manual')
  })

  it('sin deck listo: el aviso de siempre y la principal dice «Elegí tu deck», que lleva al builder', () => {
    withWorker()
    const onOpenBuilder = vi.fn()
    const onPlay = vi.fn()
    solo({ deckSize: 3, onOpenBuilder, onPlay })

    expect(screen.getByText(/^Para repartir la mano hacen falta 5 cartas en el Main y tu deck tiene 3/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Elegí tu deck' }))
    expect(onOpenBuilder).toHaveBeenCalledTimes(1)
    expect(onPlay).not.toHaveBeenCalled()
  })

  it('en escritorio la ficha es el panel de la derecha, con tu deck y «Jugar contra X» abajo; sin barra ni hoja', () => {
    withWorker()
    media(true)
    expect(window.matchMedia(DESKTOP).matches).toBe(true)
    writeHandtrapConfig({ ...DEFAULT_HANDTRAP_CONFIG, botDeck: 'elfnote' })
    const onPlay = vi.fn()
    solo({ onPlay })
    const ficha = screen.getByRole('region', { name: 'Elfnote' })

    expect(within(ficha).getByRole('heading', { name: 'Elfnote' })).toBeInTheDocument()
    expect(ficha).toHaveTextContent('Main 42 · Extra 15')
    expect(within(ficha).getByText('Mi deck · 40')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ficha y ajustes/ })).toBeNull()
    fireEvent.click(within(ficha).getByRole('button', { name: 'Jugar contra Elfnote' }))
    expect(onPlay).toHaveBeenCalledWith('auto')
  })
})
