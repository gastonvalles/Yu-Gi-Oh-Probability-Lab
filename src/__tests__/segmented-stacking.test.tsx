// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactNode } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setMetaRegion } from '../app/use-meta-region'
import { BanlistsScreen } from '../components/banlists/BanlistsScreen'
import { ExpansionsScreen } from '../components/expansions/ExpansionsScreen'
import { TierListsScreen } from '../components/meta/TierListsScreen'
import { TournamentDecksScreen } from '../components/meta/TournamentDecksScreen'
import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'
import { RuleBuilder } from '../components/probability/rule-builder/RuleBuilder'
import { Segmented } from '../components/ui/Segmented'
import type { CardEntry, HandPattern } from '../types'
import { stackedGroups } from './support/stacked-groups'

/**
 * Regla 12 de `docs/design-system.md`: nunca dos barras de pastillas seguidas en la misma columna. Fuera de un diálogo, entre dos grupos de opciones
 * (pestañas, `Segmented` o `FilterChips`) seguidos tiene que haber algo que los nombre. Se montan las pantallas donde pasaba, a 390 px y a 1440 px.
 */
vi.mock('../components/CardArt', () => ({ CardArt: () => <img alt="" /> }))
vi.mock('../app/use-brief-loading', () => ({ BRIEF_LOADING_MS: 0, useBriefLoading: () => false }))

const media = (desktop: boolean) => {
  window.matchMedia = ((query: string) => ({ matches: desktop, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
}

beforeEach(() => {
  localStorage.clear()
  setMetaRegion('tcg')
  window.scrollTo = () => {}
  Element.prototype.scrollIntoView = () => {}
  Element.prototype.scrollTo = () => {}
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '#')
})

function mount(screenNode: ReactNode, hash = '#') {
  window.history.replaceState(null, '', hash)
  const store = configureStore({
    reducer: {
      settings: (state = { handSize: 5, deckFormat: 'tcg' }) => state,
      deckBuilder: (state = { deckName: '', main: [], extra: [], side: [], isEditingDeck: false }) => state,
    },
  })

  return render(<Provider store={store}>{screenNode}</Provider>).container
}

describe('la prueba tiene poder', () => {
  const options = [
    { value: 'a', label: 'Uno' },
    { value: 'b', label: 'Dos' },
  ]

  it('marca dos Segmented apilados sin rótulo y deja pasar los mismos con su rótulo, en una sola fila o dentro de un diálogo', () => {
    const bare = render(
      <div className="grid gap-2">
        <Segmented label="Vista" value="a" options={options} onChange={() => {}} />
        <Segmented label="Región" value="a" options={options} onChange={() => {}} />
      </div>,
    )
    expect(stackedGroups(bare.container)).toEqual(['Vista + Región'])
    cleanup()

    const row = render(
      <div className="flex gap-2">
        <Segmented label="Vista" value="a" options={options} onChange={() => {}} />
        <Segmented label="Región" value="a" options={options} onChange={() => {}} />
      </div>,
    )
    expect(stackedGroups(row.container)).toEqual([])
    cleanup()

    const labelled = render(
      <div>
        <Segmented label="Vista" value="a" options={options} onChange={() => {}} />
        <p>Región</p>
        <Segmented label="Región" value="a" options={options} onChange={() => {}} />
      </div>,
    )
    expect(stackedGroups(labelled.container)).toEqual([])
    cleanup()

    const sheet = render(
      <div role="dialog">
        <Segmented label="Vista" value="a" options={options} onChange={() => {}} />
        <Segmented label="Región" value="a" options={options} onChange={() => {}} />
      </div>,
    )
    expect(stackedGroups(sheet.container)).toEqual([])
  })

  it('también ve los chips que se prenden (un `group` con `aria-pressed`)', () => {
    const view = render(
      <div>
        <Segmented label="Vista" value="a" options={options} onChange={() => {}} />
        <div role="group" aria-label="Rareza">
          <button type="button" aria-pressed="true">Rare</button>
        </div>
      </div>,
    )
    expect(stackedGroups(view.container)).toEqual(['Vista + Rareza'])
  })
})

describe.each([false, true])('ninguna pantalla apila dos grupos de opciones sin nombre (escritorio: %s)', (desktop) => {
  beforeEach(() => media(desktop))

  it('Tier lists, en una lista del meta y en «La tuya»', () => {
    const container = mount(<TierListsScreen />, '#meta')

    expect(stackedGroups(container)).toEqual([])
    fireEvent.click(screen.getByRole('tab', { name: /^La tuya/ }))
    expect(stackedGroups(container)).toEqual([])
  })

  it('Banlists, en «Cambios» y en «Lista completa»', () => {
    const container = mount(<BanlistsScreen />)

    expect(stackedGroups(container)).toEqual([])
    fireEvent.click(screen.getByRole('tab', { name: 'Lista completa' }))
    expect(stackedGroups(container)).toEqual([])
  })

  it('Decks de torneo', () => {
    expect(stackedGroups(mount(<TournamentDecksScreen />, '#tournaments'))).toEqual([])
  })

  it('Expansiones, con una expansión abierta', async () => {
    const index = { updated: '2026-10-11', shards: 4, groups: [[2, 'Maze of Millennia', '2024-01-19', 2, 'MAZE']] }
    const set = [
      ['MAZE-EN001', 'Rare', 'Unlimited', 0.5, 21, 100, 'Mulcharmy Purulia'],
      ['MAZE-EN002', 'Common', 'Unlimited', 0.1, 23, 101, 'Ash Blossom & Joyous Spring'],
    ]
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => (url.endsWith('/prices/index.json') ? index : url.endsWith('/sets/2.json') ? set : {}) })))
    const container = mount(<ExpansionsScreen />)

    if (!desktop) fireEvent.click(await screen.findByText('Maze of Millennia'))
    await screen.findByRole('button', { name: 'Ver el detalle de Ash Blossom & Joyous Spring' })
    expect(stackedGroups(container)).toEqual([])
  })

  it('el editor de una regla del Lab, con dos condiciones (montado fuera de su hoja, para que la prueba lo mire)', () => {
    const deck: CardEntry[] = [{ id: 'ash', name: 'Ash Blossom', copies: 3, source: 'manual', apiCard: null, origin: 'non_engine', roles: ['handtrap'], needsReview: false }]
    const condition = (id: string) => ({ id, matcher: { type: 'role', value: 'handtrap' } as const, quantity: 1, kind: 'include' as const, distinct: false })
    const pattern: HandPattern = { id: 'regla', name: '', kind: 'opening', turnContext: 'either', logic: 'all', minimumConditionMatches: 1, reusePolicy: 'forbid', needsReview: false, conditions: [condition('c1'), condition('c2')] }
    const actions = new Proxy({}, { get: () => () => {} }) as PatternEditorActions
    const container = mount(<RuleBuilder actions={actions} derivedMainCards={deck} pattern={pattern} onPickCondition={() => {}} onMoveCondition={() => {}} />)

    expect(screen.getAllByRole('radiogroup').length).toBeGreaterThan(1)
    expect(stackedGroups(container)).toEqual([])
  })
})
