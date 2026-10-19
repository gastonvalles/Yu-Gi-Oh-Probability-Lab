// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../components/deck-mode/deck-workflow-navigation'
import { FeatureSearch } from '../components/shell/FeatureSearch'
import { buildFindEntries, filterFindEntries, normalize } from '../components/shell/feature-search'

const STEPS = buildDeckWorkflowNavigationItems({ mainDeckCount: 42, roleCardCount: 40, unclassifiedCardCount: 3, hasCompletedRoleStep: false, patternCount: 0 })
const GROUPS = buildAppNavGroups(STEPS, { practice: true, duel: true })

const labels = (entries: ReturnType<typeof filterFindEntries>) => entries.map((entry) => entry.label)

beforeEach(() => {
  Element.prototype.scrollIntoView = () => {}
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

  it('sin resultados lo dice y, donde hay buscador, ofrece buscar cartas; sin buscador no ofrece nada', () => {
    const { input, onSelect } = open()

    fireEvent.change(input, { target: { value: 'zzzz' } })
    expect(screen.getByText('No encontré nada con «zzzz».')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Buscar «cartas» por nombre/ }))
    expect(onSelect).toHaveBeenCalledWith('search')

    cleanup()

    const noCards = open({ cardsAvailable: false })

    fireEvent.change(noCards.input, { target: { value: 'zzzz' } })
    expect(screen.queryByRole('button', { name: /Buscar «cartas»/ })).not.toBeInTheDocument()
  })

  it('cerrado no existe', () => {
    render(<FeatureSearch isOpen={false} onClose={() => {}} groups={GROUPS} activeKey={null} cardsAvailable onSelect={() => {}} />)

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
