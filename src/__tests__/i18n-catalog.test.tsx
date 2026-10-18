// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { getMonsterRequirementSourceLabel } from '../app/card-attributes'
import { buildCompactSearchDescription, DEFAULT_CARD_SEARCH_FILTERS, formatSearchError } from '../app/card-search'
import { CARD_ROLE_DEFINITIONS, getQualifiedDeckGroupLabel } from '../app/deck-groups'
import { buildRoleDistributions } from '../app/role-distribution'
import { CardDetailModal } from '../components/card-detail/CardDetailModal'
import { ClassificationEditor } from '../components/classification/ClassificationEditor'
import { getCardPrimaryStatus } from '../components/classification/classification-model'
import { DeckRolesPanel } from '../components/DeckRolesPanel'
import { SearchResultsToolbar, SearchStart } from '../components/search/SearchFeedback'
import { buildActiveFilterChips } from '../components/search/search-model'
import { ABILITY_OPTIONS, EFFECT_OPTIONS, FRAME_OPTIONS, LIMIT_OPTIONS, SPELL_TRAP_OPTIONS } from '../components/search/search-options'
import { applyLocale } from '../i18n'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { requestCardInfo } from '../ygoprodeck/client'
import type { CardEntry } from '../types'

vi.mock('../components/CardArt', () => ({
  CardArt: ({ name }: { name: string }) => <img alt={name} />,
}))

const { useCardPrices } = vi.hoisted(() => ({ useCardPrices: vi.fn() }))

vi.mock('../app/use-card-prices', () => ({ useCardPrices }))

beforeEach(() => {
  applyLocale('en')
  // El detalle de la carta pide los precios al abrir (para el selector de artes): sin datos hasta que un test los ponga.
  useCardPrices.mockReturnValue({ status: 'idle' })
})

afterEach(() => {
  cleanup()
  applyLocale('es')
  vi.unstubAllGlobals()
})

const apiCard: ApiCardSearchResult = {
  name: 'Mulcharmy Purulia',
  ygoprodeckId: 84192580,
  cardType: 'Effect Monster',
  frameType: 'effect',
  description: 'If you control no cards (Quick Effect): You can discard this card.',
  race: 'Aqua',
  attribute: 'WATER',
  level: 4,
  linkValue: null,
  atk: '100',
  def: '600',
  archetype: 'Mulcharmy',
  ygoprodeckUrl: null,
  imageUrl: null,
  imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null },
  genesys: { points: null },
}

function entry(name: string, overrides: Partial<CardEntry> = {}): CardEntry {
  return { id: `card-${name}`, name, copies: 3, source: 'ygoprodeck', origin: null, roles: [], needsReview: false, apiCard, ...overrides }
}

describe('catálogo en inglés: buscador', () => {
  it('arma las frases de la búsqueda, las etiquetas de los filtros y los grupos de las listas', () => {
    expect(formatSearchError('No card matching your query was found.')).toBe('No cards found for that search.')
    expect(formatSearchError('boom')).toBe("Couldn't complete the search.")
    expect(buildCompactSearchDescription(apiCard)).toBe('Effect Monster · Archetype: Mulcharmy')

    expect(FRAME_OPTIONS.map((option) => option.label)).toEqual(['Normal', 'Effect', 'Fusion', 'Ritual', 'Synchro', 'Xyz', 'Pendulum', 'Link', 'Spell', 'Trap'])
    expect(SPELL_TRAP_OPTIONS.map((option) => option.label)).toEqual(['Normal Spell', 'Field Spell', 'Equip Spell', 'Continuous Spell', 'Quick-Play Spell', 'Ritual Spell', 'Normal Trap', 'Continuous Trap', 'Counter Trap'])
    expect(ABILITY_OPTIONS.map((option) => option.label)).toEqual(['Toon', 'Gemini', 'Union', 'Spirit', 'Tuner', 'Flip', 'Non-Effect'])
    expect(LIMIT_OPTIONS.map((option) => option.label)).toEqual(['Forbidden', 'Limited', 'Semi-Limited', 'Unlimited'])
    expect(EFFECT_OPTIONS.map((option) => option.label).slice(0, 4)).toEqual(['Search the Deck', 'Draw', 'Special Summon', 'Banish'])

    const chips = buildActiveFilterChips({ filters: { ...DEFAULT_CARD_SEARCH_FILTERS, archetype: 'Blue-Eyes', legalOnly: true, frames: ['xyz'] }, deckFormat: 'tcg', formatLabel: 'TCG' })
    expect(chips.map((chip) => `${chip.label}: ${chip.value}`)).toEqual(['Archetype: Blue-Eyes', 'Frame: Xyz', 'Legality: No forbidden cards in TCG'])
  })

  it('las condiciones de monstruo siguen a "monster": una frase que cambia de orden entre idiomas', () => {
    expect([
      getMonsterRequirementSourceLabel({ type: 'level', value: 4 }),
      getMonsterRequirementSourceLabel({ type: 'monster_type', value: 'Dragon' }),
      getMonsterRequirementSourceLabel({ type: 'atk', value: 1800 }),
      getMonsterRequirementSourceLabel({ type: 'attribute', value: 'DARK' }),
    ]).toEqual(['of Level 4', 'of type Dragon', 'with 1800 ATK', 'with the DARK attribute'])
  })

  it('la barra de resultados y el inicio eligen el plural y resaltan lo que toca', () => {
    const { rerender } = render(<SearchResultsToolbar count={1} hasMore={false} sortOrder="default" onSortOrderChange={vi.fn()} />)
    expect(screen.getByText('1').closest('p')).toHaveTextContent('1 result')
    expect(screen.getByRole('option', { name: 'Default order' })).toBeInTheDocument()

    // Con más resultados por traer el plural va siempre.
    rerender(<SearchResultsToolbar count={1} hasMore sortOrder="default" onSortOrderChange={vi.fn()} hint="tap for details" />)
    expect(screen.getByText('1+').closest('p')).toHaveTextContent('1+ results · tap for details')

    rerender(<SearchStart layout="mobile" recent={['Ash']} onPickRecent={vi.fn()} onClearRecent={vi.fn()} />)
    expect(screen.getByText('Filters').tagName).toBe('STRONG')
    expect(screen.getByText(/Type at least 2 letters of the name/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Recent searches' })).toBeInTheDocument()
  })
})

describe('catálogo en inglés: detalle de carta y precios', () => {
  const copies = (count: number) => (
    <CardDetailModal
      card={apiCard}
      deckFormat="unlimited"
      isOpen
      showActions={false}
      deckCopy={{ zoneLabel: 'Main Deck', copies: count, canAddCopy: true, onRemoveCopy: vi.fn(), onAddCopy: vi.fn() }}
      onAddToZone={() => false}
      onClose={vi.fn()}
    />
  )

  it('el detalle y las copias en el deck: plural, cifra resaltada y botones', () => {
    const { rerender } = render(copies(1))

    expect(screen.getByRole('dialog', { name: 'Details for Mulcharmy Purulia' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Effect' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Card text' })).toBeInTheDocument()
    expect(screen.getByText('1').tagName).toBe('STRONG')
    expect(screen.getByText('1').closest('p')).toHaveTextContent('1 copy in Main Deck')
    expect(screen.getByRole('button', { name: 'Remove one' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add one' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()

    rerender(copies(3))
    expect(screen.getByText('3').closest('p')).toHaveTextContent('3 copies in Main Deck')
  })

  it('los precios usan dólares y fecha de Estados Unidos, y cuentan las impresiones en singular y plural', () => {
    const prices = [
      { set: 'Justice Hunters', code: 'JUSH-EN016', rarity: 'Ultra Rare', edition: '1st Edition', market: 1.33, url: 'https://www.tcgplayer.com/product/2', productId: 2, expansionId: 5, variant: '' },
      { set: 'Justice Hunters', code: 'JUSH-EN016', rarity: 'Common', edition: '1st Edition', market: null, url: 'https://www.tcgplayer.com/product/1', productId: 1, expansionId: 5, variant: '' },
      { set: 'Rarity Collection 5', code: 'RA05-EN091', rarity: 'Starlight Rare', edition: '1st Edition', market: 20.12, url: 'https://www.tcgplayer.com/product/3', productId: 3, expansionId: 6, variant: '' },
    ]
    useCardPrices.mockReturnValue({ status: 'ready', updated: '2026-10-11', prices })

    render(<CardDetailModal card={apiCard} deckFormat="unlimited" isOpen onAddToZone={() => false} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'View prices on TCGplayer' }))

    const dialog = screen.getByRole('dialog', { name: 'Mulcharmy Purulia' })
    expect(dialog).toHaveTextContent('Prices on TCGplayer')
    expect(dialog).toHaveTextContent('2 printings')
    expect(dialog).toHaveTextContent('1 printing')
    expect(dialog).toHaveTextContent('$1.33')
    expect(dialog).toHaveTextContent('No price')
    expect(dialog).toHaveTextContent('TCGplayer market price, in US dollars, as of Oct 11, 2026.')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search by code, rarity or art' }), { target: { value: 'zzz' } })
    expect(screen.getByText('No printing matches “zzz”.')).toBeInTheDocument()
  })

  it('los errores de YGOPRODeck que llegan a la pantalla salen en inglés', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))

    await expect(requestCardInfo(new URLSearchParams())).rejects.toThrow("Couldn't reach YGOPRODeck. Check your connection and try again.")
  })
})

describe('catálogo en inglés: roles', () => {
  it('los nombres de roles quedan igual y sus descripciones, guías y estados se traducen', () => {
    const starter = CARD_ROLE_DEFINITIONS.find((definition) => definition.key.value === 'starter')!

    expect(starter.label).toBe('Starter')
    expect(starter.description).toBe('A card that gets you going on its own or finds your starting point.')
    expect(getQualifiedDeckGroupLabel(starter)).toBe('Role: Starter')
    expect(buildRoleDistributions([], [5]).map((distribution) => distribution.label)).toEqual(['Starters', 'Extenders', 'Interaction', 'Bricks'])
    expect(getCardPrimaryStatus(entry('A', { origin: 'engine' }))?.label).toBe('No role')
    expect(getCardPrimaryStatus(entry('B', { roles: ['starter'] }))?.label).toBe('No origin')
  })

  it('el editor de una carta: nombre, copias, guía y navegación', () => {
    render(
      <ClassificationEditor
        card={entry('Starter Uno', { origin: 'engine', roles: ['starter'], needsReview: true })}
        position={3}
        total={31}
        onSetOrigin={vi.fn()}
        onToggleRole={vi.fn()}
        onConfirm={vi.fn()}
        onOpenHelp={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: 'Classify Starter Uno' })).toBeInTheDocument()
    expect(screen.getByText('[Effect Monster] Aqua/WATER · [★4] / 100/600 · ×3 in Main')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Card classification' })).toBeInTheDocument()
    expect(screen.getByText('Where does it fit in your plan?')).toBeInTheDocument()
    expect(screen.getByText('Game plan')).toBeInTheDocument()
    expect(screen.getByText('Suggested automatically: confirm it if it looks right.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'What does each role mean?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('la pantalla de clasificación no deja texto en español', () => {
    const store = configureStore({ reducer: (state: object = {}) => state })

    render(
      <Provider store={store}>
        <DeckRolesPanel cards={[entry('Starter Uno'), entry('Handtrap Dos', { origin: 'non_engine', roles: ['handtrap'], copies: 1 })]} onSetOrigin={vi.fn()} onToggleRole={vi.fn()} onConfirm={vi.fn()} onOpenLab={vi.fn()} />
      </Provider>,
    )

    expect(screen.getByRole('heading', { name: 'Classify your cards' })).toBeInTheDocument()
    expect(screen.getByText('1 card left to classify')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Classify all' })).toBeInTheDocument()
    expect(screen.getByText('Active view')).toBeInTheDocument()
    expect(screen.getByText('Monsters')).toBeInTheDocument()
    expect(screen.getByText('1 · 3 copies')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Classification guide' }))
    expect(screen.getByText('Origin and roles used in the Lab. Check it only when you need a reminder of the definitions.')).toBeInTheDocument()

    expect(document.body.textContent).not.toMatch(/\b(carta|cartas|clasific\w*|todavía|origen|rol|guía|plan de juego)\b/i)
  })
})
