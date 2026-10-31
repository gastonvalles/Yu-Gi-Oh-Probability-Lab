// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BOT_DECK_LISTS, type BotDeckList } from '../app/bot-deck-lists'
import { DEFAULT_HANDTRAP_CONFIG, writeHandtrapConfig } from '../app/handtraps'
import { SoloScreen } from '../components/duel/SoloScreen'
import { card, render } from './support/practice-mat-harness'

// «Ver mazo» de la ficha de un bot: la lista fija de `bot-deck-lists.ts`, con nombres e imágenes de YGOPRODeck en un solo pedido (acá, de mentira).
const { fetchCardsByIds } = vi.hoisted(() => ({ fetchCardsByIds: vi.fn() }))

vi.mock('../ygoprodeck', async (importOriginal) => ({ ...(await importOriginal<typeof import('../ygoprodeck')>()), fetchCardsByIds }))

const named = async (ids: number[]) => ids.map((id) => ({ ...card(id, 'effect'), name: `Carta ${id}` }))
const total = (pairs: BotDeckList['main']) => pairs.reduce((sum, [, copies]) => sum + copies, 0)
const media = (desktop: boolean) => {
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce') || (desktop && query.includes('1101')), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('Worker', class {})
  window.scrollTo = () => {}
  HTMLElement.prototype.scrollTo = () => {}
  fetchCardsByIds.mockReset()
  fetchCardsByIds.mockImplementation(named)
  media(true)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const solo = (deck: string | null, onPlay = vi.fn()) => {
  writeHandtrapConfig({ ...DEFAULT_HANDTRAP_CONFIG, botDeck: deck ?? undefined, enabled: deck === null })
  render(<SoloScreen deckName="Mi deck" deckSize={40} minDeck={5} onOpenBuilder={() => {}} onPlay={onPlay} />)
}
const openDeck = (name: string) => {
  fireEvent.click(screen.getByRole('button', { name: 'Ver mazo' }))
  return screen.getByRole('dialog', { name: `Mazo de ${name}` })
}

describe('Ver mazo', () => {
  it.each(BOT_DECK_LISTS.map((deck) => [deck.name, deck] as const))('%s: Main y Extra con sus totales y una carta por passcode, con ×N si son más de una; un solo pedido', async (_name, deck) => {
    solo(deck.id)
    const sheet = openDeck(deck.name)
    const zones = within(sheet).getByRole('radiogroup', { name: 'Parte del mazo' })

    // Los conteos salen de la lista fija (Sky Striker 40, Branded 41, Elfnote 42; Extra 15) y son los mismos del chip de la ficha.
    const mainLabel = `Main · ${total(deck.main)}`
    expect(total(deck.extra)).toBe(15)
    expect(screen.getByRole('region', { name: deck.name })).toHaveTextContent(`Main ${total(deck.main)} · Extra 15`)
    expect(within(zones).getByRole('radio', { name: mainLabel })).toHaveAttribute('aria-checked', 'true')
    expect(within(zones).getByRole('radio', { name: 'Extra · 15' })).toHaveAttribute('aria-checked', 'false')

    const main = await within(sheet).findByRole('list', { name: mainLabel })
    const buttons = within(main).getAllByRole('button')

    expect(buttons).toHaveLength(deck.main.length)
    deck.main.forEach(([id, copies], index) => expect(buttons[index]).toHaveAccessibleName(copies > 1 ? `Carta ${id}, ${copies} copias` : `Carta ${id}`))
    expect(fetchCardsByIds).toHaveBeenCalledTimes(1)
    expect(fetchCardsByIds).toHaveBeenCalledWith([...new Set([...deck.main, ...deck.extra].map(([id]) => id))], expect.objectContaining({ persistForMs: expect.any(Number) }))
  })

  it('el selector pasa al Extra (y lo dice), tocar una carta la abre en grande y al cerrarla se vuelve a la hoja; volver a abrirla no pide de nuevo', async () => {
    const elfnote = BOT_DECK_LISTS.find((deck) => deck.id === 'elfnote')!
    solo('elfnote')
    let sheet = openDeck('Elfnote')

    await within(sheet).findByRole('list', { name: 'Main · 42' })
    fireEvent.click(within(sheet).getByRole('radio', { name: 'Extra · 15' }))
    const extra = within(sheet).getByRole('list', { name: 'Extra · 15' })

    expect(within(extra).getAllByRole('button')).toHaveLength(15)
    expect(within(sheet).queryByRole('list', { name: 'Main · 42' })).toBeNull()
    expect(sheet).toHaveTextContent('Extra: 15 cartas')

    const [first] = elfnote.extra[0]!
    fireEvent.click(within(extra).getByRole('button', { name: `Carta ${first}` }))
    expect(screen.getByRole('dialog', { name: new RegExp(`Carta ${first}`) })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: new RegExp(`Carta ${first}`) })).toBeNull())
    expect(screen.getByRole('dialog', { name: 'Mazo de Elfnote' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mazo de Elfnote' })).toBeNull())
    sheet = openDeck('Elfnote')
    // Vuelve a abrir en el Main, con las cartas que ya habían llegado.
    expect(within(sheet).getByRole('list', { name: 'Main · 42' })).toBeInTheDocument()
    expect(fetchCardsByIds).toHaveBeenCalledTimes(1)
  })

  it('cargando, error después del intento fallido y reintento; si no resolvió ninguna, lo dice', async () => {
    let fail: (error: Error) => void = () => {}
    fetchCardsByIds.mockImplementationOnce(() => new Promise((_resolve, reject) => (fail = reject)))
    solo('sky-striker')
    const sheet = openDeck('Sky Striker')

    expect(within(sheet).getAllByLabelText('Cargando las cartas del mazo').length).toBeGreaterThan(0)
    expect(sheet).not.toHaveTextContent('No se pudieron cargar las cartas')

    fail(new Error('No se pudo conectar con YGOPRODeck.'))
    expect(await within(sheet).findByText('No se pudieron cargar las cartas')).toBeInTheDocument()
    expect(sheet).toHaveTextContent('No se pudo conectar con YGOPRODeck.')

    fetchCardsByIds.mockResolvedValueOnce([])
    fireEvent.click(within(sheet).getByRole('button', { name: 'Reintentar' }))
    expect(await within(sheet).findByText('No encontramos las cartas de este mazo')).toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('button', { name: 'Reintentar' }))
    expect(await within(sheet).findByRole('list', { name: 'Main · 40' })).toBeInTheDocument()
    expect(fetchCardsByIds).toHaveBeenCalledTimes(3)
  })

  it('Pasivo y Handtraps no tienen lista: sin «Ver mazo»', () => {
    solo(null)
    expect(screen.getByRole('region', { name: 'Handtraps' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ver mazo' })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /^Pasivo/ }))
    expect(screen.queryByRole('button', { name: 'Ver mazo' })).toBeNull()
  })

  it('en el celular: desde la hoja de la ficha, y «Jugar contra X» sigue abajo de la del mazo', async () => {
    media(false)
    const onPlay = vi.fn()
    solo('branded', onPlay)
    fireEvent.click(screen.getByRole('button', { name: /Ficha y ajustes/ }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Despia Branded' })).getByRole('button', { name: 'Ver mazo' }))
    const sheet = screen.getByRole('dialog', { name: 'Mazo de Despia Branded' })

    await within(sheet).findByRole('list', { name: 'Main · 41' })
    fireEvent.click(within(sheet).getByRole('button', { name: 'Jugar contra Despia Branded' }))
    expect(onPlay).toHaveBeenCalledWith('auto')
  })
})
