// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TIERLIST_VERSION, addCards, newList, writeStore } from '../app/tierlist-maker'
import { DeckModeScreen } from '../components/deck-mode/DeckModeScreen'
import { TierListsScreen } from '../components/meta/TierListsScreen'
import { deckState, storeWith } from './support/deck-fixtures'

// «Crear tier list» es «La tuya» de Tier lists: el selector de arriba de todo, la cuenta de lo guardado y los enlaces viejos.
vi.mock('../components/CardArt', () => ({ CardArt: () => <img alt="" /> }))
vi.mock('../app/use-brief-loading', () => ({ BRIEF_LOADING_MS: 1000, useBriefLoading: () => false }))
// En la app entera, Tier lists va de mentira (lo de arriba la prueba de verdad): acá importa a dónde se llega.
vi.mock('../components/deck-mode/lazy-steps', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/deck-mode/lazy-steps')>()),
  LazyTierListsScreen: () => <p>tier lists en {window.location.hash}</p>,
  preloadHeavySteps: () => {},
}))

const SWITCHER = { name: 'Las del meta o la tuya' }

beforeEach(() => {
  localStorage.clear()
  window.scrollTo = () => {}
  Element.prototype.scrollIntoView = () => {}
  Element.prototype.scrollTo = () => {}
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '#')
})

/** Deja guardada una lista con tres cartas sin clasificar. */
const seed = () => {
  const list = addCards(newList('Mi tier list'), [101, 102, 103].map((id) => ({ id, name: `Carta ${id}`, image: null })))

  writeStore({ version: TIERLIST_VERSION, activeId: list.id, lists: [list] })
}

function renderTierLists(hash: string) {
  window.history.replaceState(null, '', hash)
  const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'tcg' }) => state } })

  return render(
    <Provider store={store}>
      <TierListsScreen />
    </Provider>,
  )
}

const unranked = () => screen.queryByRole('region', { name: 'Sin clasificar' })
const metaFilters = () => screen.queryByRole('radiogroup', { name: 'Qué tier list ver' })

describe('Tier lists: las del meta y la tuya', () => {
  it('sin vista en el enlace abre «Del meta», sin el creador; elegir «La tuya» lo muestra sin los filtros del meta y lo dice en el enlace (y vuelta)', () => {
    renderTierLists('#meta?list=boardbreaker')
    const switcher = screen.getByRole('radiogroup', SWITCHER)

    expect(within(switcher).getByRole('radio', { name: 'Del meta' })).toHaveAttribute('aria-checked', 'true')
    expect(metaFilters()).toBeInTheDocument()
    expect(unranked()).toBeNull()

    fireEvent.click(within(switcher).getByRole('radio', { name: 'La tuya' }))
    expect(unranked()).toBeInTheDocument()
    expect(metaFilters()).toBeNull()
    expect(screen.queryByRole('radiogroup', { name: 'Región de los torneos' })).toBeNull()
    // La lista elegida del meta no se pierde: vuelve al cambiar de nuevo.
    expect(window.location.hash).toBe('#meta?list=boardbreaker&vista=tuya')

    fireEvent.click(within(screen.getByRole('radiogroup', SWITCHER)).getByRole('radio', { name: 'Del meta' }))
    expect(window.location.hash).toBe('#meta?list=boardbreaker')
    expect(screen.getByRole('radio', { name: 'Boardbreakers' })).toHaveAttribute('aria-checked', 'true')
    expect(unranked()).toBeNull()
  })

  it('`#meta?vista=tuya` abre la tuya, con «Descargar imagen», y un enlace a la vista cambia la pantalla abierta', () => {
    renderTierLists('#meta?vista=tuya')

    expect(within(screen.getByRole('radiogroup', SWITCHER)).getByRole('radio', { name: 'La tuya' })).toHaveAttribute('aria-checked', 'true')
    expect(unranked()).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar imagen' })).toBeInTheDocument()

    act(() => {
      window.history.replaceState(null, '', '#meta')
      window.dispatchEvent(new Event('hashchange'))
    })
    expect(unranked()).toBeNull()
    expect(metaFilters()).toBeInTheDocument()
  })

  it('«La tuya» lleva la cuenta de las cartas guardadas (sin nada, no lleva número) y se actualiza al sacar una', () => {
    renderTierLists('#meta')
    expect(within(screen.getByRole('radiogroup', SWITCHER)).getByRole('radio', { name: 'La tuya' })).toHaveTextContent(/^La tuya$/)
    cleanup()

    seed()
    renderTierLists('#meta')
    expect(within(screen.getByRole('radiogroup', SWITCHER)).getByRole('radio', { name: 'La tuya, con 3 cartas' })).toHaveTextContent('La tuya3')

    fireEvent.click(screen.getByRole('radio', { name: 'La tuya, con 3 cartas' }))
    fireEvent.click(screen.getAllByRole('button', { name: /^Carta / })[0] as HTMLElement)
    fireEvent.click(screen.getByRole('button', { name: 'Sacar de la lista' }))
    expect(screen.getByRole('radio', { name: 'La tuya, con 2 cartas' })).toHaveAttribute('aria-checked', 'true')
  })
})

describe('el enlace viejo y el buscador de la app', () => {
  const app = (hash: string) => {
    window.history.replaceState(null, '', hash)

    return render(
      <Provider store={storeWith(deckState())}>
        <DeckModeScreen />
      </Provider>,
    )
  }

  it('`#tier-maker` se reescribe a la tuya de Tier lists, con Descubrir marcado en el menú', async () => {
    app('#tier-maker')

    expect(await screen.findByText('tier lists en #meta?vista=tuya')).toBeInTheDocument()
    expect(window.location.hash).toBe('#meta?vista=tuya')
    expect(screen.getAllByRole('button', { name: 'Descubrir' }).some((button) => button.hasAttribute('aria-current'))).toBe(true)
  })

  it('«Crear tier list» del buscador lleva a la tuya', async () => {
    app('#expansions')

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    fireEvent.change(await screen.findByRole('combobox'), { target: { value: 'crear tier list' } })
    fireEvent.click(within(screen.getByRole('listbox')).getAllByRole('option')[0]?.querySelector('button') ?? document.body)

    expect(await screen.findByText('tier lists en #meta?vista=tuya')).toBeInTheDocument()
  })
})
