// @vitest-environment jsdom
import { createElement } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fromPortableConfig } from '../app/app-state-codec'
import { createAbsentCardEntry } from '../app/card-name-registry'
import { getAddSearchResultIssue } from '../app/deck-builder'
import { buildDeckFormatIssues, getCardLimitIndicator, getDeckFormatLabel } from '../app/deck-format'
import { DECK_EXPORT_FILES, describeExportSelection } from '../app/deck-image-export'
import { buildDeckImportPreview, buildDeckImportPreviewFromJson } from '../app/deck-import'
import { formatSectionAriaLabel } from '../app/deck-import-presentation'
import { buildDeckZoneTypeCounts } from '../app/deck-presentation'
import { buildKdeDecklist } from '../app/kde-decklist'
import { createInitialState, type DeckBuilderState, type DeckCardInstance } from '../app/model'
import { ExportDeckPanel } from '../components/ExportDeckPanel'
import { DeckZone } from '../components/DeckZone'
import { applyLocale } from '../i18n'
import type { ApiCardSearchResult } from '../ygoprodeck'

vi.mock('../app/store', () => ({ stopPersisting: () => {} }))
// Los toasts se dibujan en un <Toaster> que acá no está montado.
vi.mock('../app/use-toast-message', () => ({ useToastMessage: () => ({ showToast: () => {} }) }))

const ASH: ApiCardSearchResult = {
  ygoprodeckId: 14558127, name: 'Ash Blossom & Joyous Spring', cardType: 'Tuner Monster', frameType: 'effect', description: null,
  race: 'Zombie', attribute: 'FIRE', level: 3, linkValue: null, atk: '0', def: '1800', archetype: null, ygoprodeckUrl: null,
  imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
}
// Con un número que no figura en ninguna banlist del sitio: el estado sale de la carta (si figurara, saldría de la lista que rige).
const withBanlist = (tcg: 'forbidden' | 'limited' | 'semi-limited'): ApiCardSearchResult => ({ ...ASH, ygoprodeckId: 99999999, banlist: { tcg, ocg: null, goat: null } })

function inDeck(card: ApiCardSearchResult, copies: number, extra: Partial<DeckCardInstance> = {}): DeckCardInstance[] {
  return Array.from({ length: copies }, (_, index) => ({
    instanceId: `${card.ygoprodeckId}-${index}`, name: card.name, apiCard: card, origin: null, roles: [], needsReview: false, ...extra,
  }))
}

const deck = (partial: Partial<DeckBuilderState>): DeckBuilderState => ({ deckName: 'Gatos', main: [], extra: [], side: [], isEditingDeck: false, ...partial })

beforeEach(() => {
  applyLocale('en')
})

afterEach(() => {
  applyLocale('es')
})

describe('el deck en inglés', () => {
  it('los avisos al agregar una carta: zona, límite de copias (plural) y formato', () => {
    const talker = { ...ASH, ygoprodeckId: 2, name: 'Accesscode Talker', cardType: 'Link Monster', frameType: 'link' }

    expect(getAddSearchResultIssue(deck({}), talker, 'main')).toBe('Accesscode Talker can only go in the Extra Deck or Side Deck.')
    expect(getAddSearchResultIssue(deck({}), ASH, 'extra')).toBe('Ash Blossom & Joyous Spring can only go in the Main Deck or Side Deck.')
    expect(getAddSearchResultIssue(deck({ main: inDeck(withBanlist('limited'), 1) }), withBanlist('limited'), 'main', 'tcg')).toBe(
      'Ash Blossom & Joyous Spring has already reached the limit of 1 copy in this format.',
    )
    expect(getAddSearchResultIssue(deck({ main: inDeck(withBanlist('semi-limited'), 2) }), withBanlist('semi-limited'), 'main', 'tcg')).toBe(
      'Ash Blossom & Joyous Spring has already reached the limit of 2 copies in this format.',
    )
    expect(getAddSearchResultIssue(deck({}), { ...ASH, name: 'Carta Inventada' }, 'main', 'genesys')).toBe("Carta Inventada isn't listed as a legal card in Genesys.")
  })

  it('rótulos y ajustes del formato', () => {
    const limited = withBanlist('limited')

    expect(getDeckFormatLabel('unlimited')).toBe('No limit')
    expect(getCardLimitIndicator(withBanlist('forbidden'), 'tcg')?.label).toBe('TCG: forbidden')
    expect(getCardLimitIndicator(withBanlist('semi-limited'), 'tcg')?.label).toBe('TCG: 2x')
    expect(buildDeckFormatIssues(deck({ main: inDeck(limited, 2) }), 'tcg')).toEqual(['Ash Blossom & Joyous Spring exceeds the limit of 1 copy in TCG.'])
  })

  it('los archivos para exportar se nombran con la conjunción del inglés y sus rótulos salen traducidos', () => {
    const picked = (partial: Partial<Record<'image' | 'pdf' | 'ydk' | 'txt' | 'json', boolean>>) => ({ image: false, pdf: false, ydk: false, txt: false, json: false, ...partial })

    expect(describeExportSelection(picked({ image: true, pdf: true, ydk: true }))).toBe('image, decklist PDF, and YDK')
    expect(describeExportSelection(picked({ image: true, ydk: true }))).toBe('image and YDK')
    expect(describeExportSelection(picked({ pdf: true }))).toBe('decklist PDF')
    expect(describeExportSelection(picked({}))).toBe('')
    expect(DECK_EXPORT_FILES.map((file) => file.label)).toEqual(['Deck image', 'Official decklist', 'YDK file', 'Text list', 'Copy for this app'])
  })

  it('la planilla de Konami avisa en inglés qué sección no entró completa', () => {
    const monsters = Array.from({ length: 19 }, (_, index) => ({ ...ASH, ygoprodeckId: 100 + index, name: `Monster ${index}` }))
    const { overflow } = buildKdeDecklist(deck({ main: monsters.flatMap((card) => inDeck(card, 1)) }))

    expect(overflow).toEqual(['Monsters'])
  })

  it('el importador explica en inglés las líneas inválidas, los conflictos y los errores', () => {
    const preview = buildDeckImportPreview({ cards: [ASH], deckFormat: 'unlimited', deckName: 'x', text: '4 Ash Blossom & Joyous Spring\n12345' })

    expect(preview.invalidLines.map((line) => line.reason)).toEqual(["Couldn't read a quantity and a card name on that line."])
    expect(preview.conflicts.map((conflict) => conflict.reason)).toEqual(['Ash Blossom & Joyous Spring has already reached the limit of 3 copies in this format.'])

    const apiCard = { ...ASH }
    const main = Array.from({ length: 4 }, () => ({ name: ASH.name, origin: 'engine', roles: ['starter'], needsReview: false, apiCard }))
    const fromJson = buildDeckImportPreviewFromJson({ deckName: 'x', text: JSON.stringify({ deckName: 'Gatos', main, extra: [], side: [] }) })

    expect(fromJson.conflicts.map((conflict) => conflict.reason)).toEqual(['More than 3 copies of Ash Blossom & Joyous Spring.'])
    expect(() => buildDeckImportPreviewFromJson({ deckName: 'x', text: 'no es json' })).toThrow("The JSON file isn't valid.")
    expect(() => buildDeckImportPreviewFromJson({ deckName: 'x', text: '[1, 2]' })).toThrow("The JSON doesn't match a PortableConfig or a deckBuilder serialized by the app.")
    expect(() => fromPortableConfig({ handSize: 5, deckBuilder: { deckName: 'x', main: [5], extra: [], side: [] }, patterns: [] })).toThrow('"deckBuilder.main[0]" is invalid.')
    expect(formatSectionAriaLabel('Cards found', 1)).toBe('Cards found, 1 item')
    expect(formatSectionAriaLabel('Cards found', 15)).toBe('Cards found, 15 items')
  })

  it('nombre por defecto, carta ausente y conteo por tipo (singular y plural)', () => {
    const spell = { ...ASH, ygoprodeckId: 3, cardType: 'Spell Card', frameType: 'spell' }
    const trap = { ...ASH, ygoprodeckId: 4, cardType: 'Trap Card', frameType: 'trap' }
    const labels = buildDeckZoneTypeCounts('main', [...inDeck(spell, 2), ...inDeck(trap, 1)]).map((entry) => `${entry.count} ${entry.label}`)

    expect(createInitialState().deckBuilder.deckName).toBe('New Deck')
    expect(createAbsentCardEntry('card-1', 'Pot of Greed').name).toBe('Pot of Greed (not in the deck)')
    expect(labels).toEqual(['2 spells', '1 trap'])
  })
})

describe('las pantallas del deck en inglés', () => {
  const noop = () => {}

  it('la zona vacía invita a arrastrar cartas', () => {
    render(
      createElement(DeckZone, {
        zone: 'main', title: 'Main Deck', cards: [], activeDragInstanceId: null, variant: 'classic-builder', desktopCompact: true,
        onDeckCardPointerDown: noop, onDeckCardClick: noop, onRemoveCard: noop,
      }),
    )

    expect(screen.getByText('Drag cards here')).toBeInTheDocument()
  })

  it('Exportar: título, copia de seguridad y la confirmación de restaurar con la fecha en inglés', async () => {
    localStorage.clear()
    render(createElement(ExportDeckPanel, { deckBuilder: deck({}), deckFormat: 'unlimited', mainDeckCount: 0, onExport: async () => {} }))

    expect(screen.getByRole('heading', { name: 'Export your deck' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download backup' })).toBeInTheDocument()
    expect(screen.getByText('Step 2')).toBeInTheDocument()

    const copy = JSON.stringify({ app: 'ygo-probability-lab', version: 1, savedAt: '2026-10-12T10:00:00.000Z', entries: { 'ygo-lab:saved-builds': '[2]' } })
    fireEvent.change(screen.getByLabelText('Backup file'), { target: { files: [new File([copy], 'backup.json', { type: 'application/json' })] } })

    const dialog = await screen.findByRole('alertdialog', { name: 'Restore the backup?' })
    await waitFor(() => expect(dialog).toHaveTextContent('from Oct 12, 2026'))
  })
})
