import { getMainDeckCardKind } from './deck-presentation'
import type { DeckBuilderState, DeckCardInstance } from './model'

// Mapeo del formulario oficial de Konami (KDE_DeckList.pdf) a sus campos AcroForm.
type KdeSection = 'monster' | 'spell' | 'trap' | 'extra' | 'side'

interface KdeSectionSpec {
  label: string
  rows: number
  nameField: (row: number) => string
  countField: (row: number) => string
  totalField: string
}

const KDE_SECTIONS: Record<KdeSection, KdeSectionSpec> = {
  monster: {
    label: 'Monstruos',
    rows: 18,
    nameField: (row) => `Monster ${row}`,
    countField: (row) => `Monster Card ${row} Count`,
    totalField: 'Total Monster Cards',
  },
  spell: {
    label: 'Magias',
    rows: 18,
    nameField: (row) => `Spell ${row}`,
    countField: (row) => `Spell Card ${row} Count`,
    totalField: 'Total Spell Cards',
  },
  trap: {
    label: 'Trampas',
    rows: 18,
    nameField: (row) => `Trap ${row}`,
    countField: (row) => `Trap Card ${row} Count`,
    totalField: 'Total Trap Cards',
  },
  extra: {
    label: 'Extra Deck',
    rows: 15,
    nameField: (row) => `Extra Deck ${row}`,
    countField: (row) => `Extra Deck ${row} Count`,
    totalField: 'Total Extra Deck',
  },
  side: {
    label: 'Side Deck',
    rows: 15,
    nameField: (row) => `Side Deck ${row}`,
    countField: (row) => `Side Deck ${row} Count`,
    totalField: 'Total Side Deck',
  },
}

export const KDE_MAIN_DECK_TOTAL_FIELD = 'Main Deck Total'

export interface KdeDecklistEntry {
  name: string
  count: number
}

export interface KdeDecklist {
  fields: Record<string, string>
  // Secciones con más cartas distintas que filas en el formulario.
  overflow: string[]
}

export interface KdeDecklistSection {
  key: KdeSection
  label: string
  total: number
  entries: KdeDecklistEntry[]
}

const SECTION_ORDER: KdeSection[] = ['monster', 'spell', 'trap', 'extra', 'side']

export function buildKdeDecklistSections(deckBuilder: DeckBuilderState): KdeDecklistSection[] {
  const cardsBySection: Record<KdeSection, DeckCardInstance[]> = {
    monster: deckBuilder.main.filter((card) => getMainDeckCardKind(card.apiCard) === 'monster'),
    spell: deckBuilder.main.filter((card) => getMainDeckCardKind(card.apiCard) === 'spell'),
    trap: deckBuilder.main.filter((card) => getMainDeckCardKind(card.apiCard) === 'trap'),
    extra: deckBuilder.extra,
    side: deckBuilder.side,
  }

  return SECTION_ORDER.map((key) => ({
    key,
    label: KDE_SECTIONS[key].label,
    total: cardsBySection[key].length,
    entries: groupByName(cardsBySection[key]),
  }))
}

export function buildKdeDecklist(deckBuilder: DeckBuilderState): KdeDecklist {
  const fields: Record<string, string> = {
    [KDE_MAIN_DECK_TOTAL_FIELD]: String(deckBuilder.main.length),
  }
  const overflow: string[] = []

  for (const section of buildKdeDecklistSections(deckBuilder)) {
    const spec = KDE_SECTIONS[section.key]

    section.entries.slice(0, spec.rows).forEach((entry, index) => {
      fields[spec.nameField(index + 1)] = toPrintableName(entry.name)
      fields[spec.countField(index + 1)] = String(entry.count)
    })

    fields[spec.totalField] = String(section.total)

    if (section.entries.length > spec.rows) {
      overflow.push(spec.label)
    }
  }

  return { fields, overflow }
}

function groupByName(cards: DeckCardInstance[]): KdeDecklistEntry[] {
  const counts = new Map<string, number>()

  for (const card of cards) {
    counts.set(card.name, (counts.get(card.name) ?? 0) + 1)
  }

  return [...counts.entries()].map(([name, count]) => ({ name, count }))
}

// Las fuentes estándar del PDF (WinAnsi) no tienen ★/☆ ni caracteres fuera de Latin-1.
function toPrintableName(name: string): string {
  return name
    .replace(/[★☆]/g, '*')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e\xa0-\xff]/g, '?')
}
