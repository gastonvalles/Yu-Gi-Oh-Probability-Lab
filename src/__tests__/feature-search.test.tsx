// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../components/deck-mode/deck-workflow-navigation'
import { FeatureSearch } from '../components/shell/FeatureSearch'
import { buildFindEntries, filterFindEntries, normalize } from '../components/shell/feature-search'

// El buscador trae cartas y expansiones de la red: en las pruebas, lo que se le dice.
const finderApi = vi.hoisted(() => ({ cards: [] as unknown[] }))

vi.mock('../ygoprodeck', () => ({
  searchCards: vi.fn(async () => ({ results: finderApi.cards, hasMore: false })),
  fetchCardsByIds: vi.fn(async () => finderApi.cards),
}))
vi.mock('../app/card-prices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../app/card-prices')>()),
  fetchExpansions: vi.fn(async () => ({ expansions: [{ id: 7, name: 'Legend of Blue Eyes White Dragon', date: '2002-03-08', count: 126, code: 'LOB' }], updated: '' })),
  fetchExpansionCards: vi.fn(async () => []),
}))
const STEPS = buildDeckWorkflowNavigationItems({ mainDeckCount: 42, roleCardCount: 40, unclassifiedCardCount: 3, hasCompletedRoleStep: false, patternCount: 0 })
const GROUPS = buildAppNavGroups(STEPS, { practice: true, duel: true })

const labels = (entries: ReturnType<typeof filterFindEntries>) => entries.map((entry) => entry.label)

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {}
  finderApi.cards = []
})

afterEach(cleanup)

describe('qué se puede buscar', () => {
  it('todo lo del menú, también lo que el menú esconde o sólo trae la hoja del celular, más las mascotas y, donde hay buscador, las cartas', () => {
    const keys = buildFindEntries(GROUPS, { cards: true }).map((entry) => entry.key)

    expect(keys).toEqual(expect.arrayContaining(['deck-builder', 'categorization', 'probability-lab', 'workspace', 'practice', 'duel', 'duel-watch', 'duel-join', 'life', 'export', 'meta', 'tier-maker', 'tournaments', 'replays', 'expansions', 'banlists', 'search', 'mascots']))
    // Sin buscador de cartas en la pantalla (el builder, la práctica) no se ofrece.
    expect(buildFindEntries(GROUPS, { cards: false }).map((entry) => entry.key)).not.toContain('search')
  })

  it('se encuentra por lo que alguien escribiría, no sólo por el nombre: «vidas» → calculadora, «pdf» → exportar, «banlist» → banlists, «videos» → replays', () => {
    const entries = buildFindEntries(GROUPS, { cards: true })

    expect(labels(filterFindEntries(entries, 'vidas'))[0]).toBe('Calculadora de LP')
    expect(labels(filterFindEntries(entries, 'pdf'))[0]).toBe('Exportar')
    expect(labels(filterFindEntries(entries, 'banlist'))[0]).toBe('Banlists')
    expect(labels(filterFindEntries(entries, 'videos'))).toContain('Replays')
  })

  it('sin tildes ni mayúsculas, y todas las palabras tienen que estar; el nombre pesa más que lo demás', () => {
    const entries = buildFindEntries(GROUPS, { cards: true })

    expect(normalize('  Práctica ')).toBe('practica')
    // «práctica» no es el nombre (es «Entrenar solo»): se llega por las palabras clave, sin tildes ni mayúsculas.
    expect(labels(filterFindEntries(entries, 'PRACTICA'))[0]).toBe('Entrenar solo')
    expect(labels(filterFindEntries(entries, 'mirar duelo'))[0]).toBe('Mirar un duelo')
    expect(filterFindEntries(entries, 'zzzz')).toEqual([])
    // «carta» lleva a Buscar cartas antes que a las Expansiones, que sólo lo nombran de pasada.
    expect(labels(filterFindEntries(entries, 'carta'))[0]).toBe('Buscar cartas')
  })

  it('sin nada escrito, todo en el orden del menú', () => {
    const entries = buildFindEntries(GROUPS, { cards: false })

    expect(filterFindEntries(entries, '   ')).toEqual(entries)
    expect(entries[0]?.label).toBe('Deck')
  })
})

describe('el buscador de la app', () => {
  const open = (props: Partial<Parameters<typeof FeatureSearch>[0]> = {}) => {
    const onSelect = vi.fn()
    const onClose = vi.fn()

    render(<FeatureSearch isOpen onClose={onClose} groups={GROUPS} activeKey="export" cardsAvailable onSelect={onSelect} {...props} />)

    return { onSelect, onClose, input: screen.getByRole('combobox') }
  }

  it('abre con el campo vacío y todo listado por grupos; el destino de ahora dice «Estás acá»', () => {
    open()

    expect(screen.getByRole('combobox', { name: 'Buscar en YGOUltraLab' })).toHaveValue('')
    expect(screen.getAllByRole('option').length).toBeGreaterThan(10)
    expect(within(screen.getByRole('option', { name: /Exportar/ })).getByText('Estás acá')).toBeInTheDocument()
  })

  it('escribir filtra, las flechas recorren y Enter va al resultado (y cierra)', () => {
    const { input, onSelect, onClose } = open()

    fireEvent.change(input, { target: { value: 'tier' } })
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Tier lists')
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')

    fireEvent.change(input, { target: { value: 'duel' } })

    const first = screen.getAllByRole('option')[0]

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    expect(first).toHaveAttribute('aria-selected', 'false')
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('tocar un resultado va a él con la misma clave que el menú', () => {
    const { input, onSelect } = open()

    fireEvent.change(input, { target: { value: 'vidas' } })
    fireEvent.click(within(screen.getByRole('option', { name: /Calculadora de LP/ })).getByRole('button'))

    expect(onSelect).toHaveBeenCalledWith('life')
  })

  it('«Buscar … entre las cartas» lleva lo que se escribió; sin buscador de cartas no se ofrece y, sin nada, lo dice', async () => {
    const { input, onSelect } = open()

    fireEvent.change(input, { target: { value: 'zzzz' } })
    fireEvent.click(await screen.findByRole('button', { name: /Buscar «zzzz» entre las cartas/ }))
    expect(onSelect).toHaveBeenCalledWith('search', 'zzzz')

    cleanup()

    const noCards = open({ cardsAvailable: false })

    fireEvent.change(noCards.input, { target: { value: 'zzzz' } })
    expect(await screen.findByText('No encontré nada con «zzzz».')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /entre las cartas/ })).not.toBeInTheDocument()
  })

  it('una carta escrita sale con su arte, antes que las expansiones, y al tocarla se abre su detalle', async () => {
    const card = { ygoprodeckId: 46986414, name: 'Dark Magician', cardType: 'Normal Monster', archetype: 'Dark Magician', imageUrl: null, imageUrlSmall: null }

    finderApi.cards = [card]

    const onOpenCard = vi.fn()
    const { input, onSelect, onClose } = open({ onOpenCard })

    fireEvent.change(input, { target: { value: 'dark magician' } })
    fireEvent.click((await screen.findByText('Normal Monster · Dark Magician')).closest('button')!)

    expect(onOpenCard).toHaveBeenCalledWith(card)
    expect(onSelect).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sin quien abra el detalle, la carta lleva al buscador de cartas con su nombre escrito', async () => {
    finderApi.cards = [{ ygoprodeckId: 1, name: 'Dark Magician', cardType: 'Normal Monster', archetype: 'Dark Magician', imageUrl: null, imageUrlSmall: null }]

    const { input, onSelect } = open()

    fireEvent.change(input, { target: { value: 'dark mag' } })
    fireEvent.click((await screen.findByText('Normal Monster · Dark Magician')).closest('button')!)

    expect(onSelect).toHaveBeenCalledWith('search', 'Dark Magician')
  })

  it('un código de expansión lleva a su expansión', async () => {
    const { input } = open()

    fireEvent.change(input, { target: { value: 'lob-' } })
    fireEvent.click(within(await screen.findByRole('option', { name: /Legend of Blue Eyes White Dragon/ })).getByRole('button'))

    expect(window.location.hash).toBe('#expansions?set=7')
  })

  it('cerrado no existe', () => {
    render(<FeatureSearch isOpen={false} onClose={() => {}} groups={GROUPS} activeKey={null} cardsAvailable onSelect={() => {}} />)

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
