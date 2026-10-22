/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from 'vitest'

import {
  COMPARISON_SELECTION_KEY,
  CURRENT_SOURCE,
  DECK_BEFORE_SOURCE,
  DRAFT_SOURCE,
  defaultComparisonB,
  readComparisonSelection,
  resolveComparisonSelection,
  selectDraftForComparison,
  writeComparisonSelection,
  type ComparisonSources,
} from '../app/comparison-selection'
import { createSavedBuild, type BuildZones } from '../app/saved-builds'
import { copies, fillerCards } from './support/deck-fixtures'

const zones = (main: BuildZones['main']): BuildZones => ({ main, extra: [], side: [] })
const current = zones([...copies(1, 'Starter', 3, ['starter']), ...fillerCards(37)])
const changed = zones([...copies(1, 'Starter', 2, ['starter']), ...fillerCards(38)])
const older = createSavedBuild('Vieja', changed, [], new Date('2026-10-01T10:00:00.000Z'))
const newer = createSavedBuild('Nueva', zones([...copies(2, 'Otra', 3, ['starter']), ...fillerCards(37)]), [], new Date('2026-10-20T10:00:00.000Z'))
const sameAsCurrent = createSavedBuild('Igual', current, [], new Date('2026-10-21T10:00:00.000Z'))

const sources = (overrides: Partial<ComparisonSources> = {}): ComparisonSources => ({
  current,
  deckBefore: null,
  draft: null,
  savedBuilds: [older, newer, sameAsCurrent],
  ...overrides,
})

const before = (savedAt: string, deck = changed) => ({ ...deck, savedAt })

describe('la B de entrada', () => {
  it('es «Tu deck de antes» si tiene otras cartas que tu deck', () => {
    expect(defaultComparisonB(sources({ deckBefore: before('2026-10-22T09:00:00.000Z') }))).toBe(DECK_BEFORE_SOURCE)
  })

  it('si no, la build guardada más reciente que no sea igual a A (aunque no sea la primera de la lista)', () => {
    expect(defaultComparisonB(sources({ deckBefore: before('2026-10-22T09:00:00.000Z', current) }))).toBe(newer.id)
  })

  it('sin nada con qué comparar, ninguna (primera vez)', () => {
    expect(defaultComparisonB(sources({ savedBuilds: [sameAsCurrent] }))).toBeNull()
  })
})

describe('la selección recordada', () => {
  it('B que se borró vuelve a la de entrada; A que se borró vuelve a tu deck', () => {
    const gone = { a: 'build-borrada', b: 'build-otra', pickedAt: '2026-10-22T00:00:00.000Z' }

    expect(resolveComparisonSelection(gone, sources())).toEqual({ a: CURRENT_SOURCE, b: newer.id })
  })

  it('renombrar una build no la cambia: se recuerda por id', () => {
    const renamed = { ...older, name: 'Otro nombre' }
    const stored = { a: CURRENT_SOURCE, b: older.id, pickedAt: '2026-10-22T00:00:00.000Z' }

    expect(resolveComparisonSelection(stored, sources({ savedBuilds: [renamed, newer] })).b).toBe(older.id)
  })

  it('un «Tu deck de antes» guardado después de elegir B pasa a ser B; uno de antes, no', () => {
    const stored = { a: CURRENT_SOURCE, b: older.id, pickedAt: '2026-10-22T08:00:00.000Z' }

    expect(resolveComparisonSelection(stored, sources({ deckBefore: before('2026-10-22T09:00:00.000Z') })).b).toBe(DECK_BEFORE_SOURCE)
    expect(resolveComparisonSelection(stored, sources({ deckBefore: before('2026-10-22T07:00:00.000Z') })).b).toBe(older.id)
  })

  it('el borrador del Lab vale como B mientras exista', () => {
    const stored = { a: CURRENT_SOURCE, b: DRAFT_SOURCE, pickedAt: '2026-10-22T08:00:00.000Z' }

    expect(resolveComparisonSelection(stored, sources({ draft: changed })).b).toBe(DRAFT_SOURCE)
    expect(resolveComparisonSelection(stored, sources()).b).toBe(newer.id)
  })

  it('lee lo que guardaba la pantalla de antes ({ a, b } sin fecha) y lo escribe con la misma forma', () => {
    localStorage.setItem(COMPARISON_SELECTION_KEY, JSON.stringify({ a: 'current', b: older.id }))
    expect(readComparisonSelection()).toEqual({ a: 'current', b: older.id })

    localStorage.setItem(COMPARISON_SELECTION_KEY, '{roto')
    expect(readComparisonSelection()).toEqual({ a: CURRENT_SOURCE, b: null })

    writeComparisonSelection({ a: CURRENT_SOURCE, b: newer.id, pickedAt: '2026-10-22T00:00:00.000Z' })
    expect(JSON.parse(localStorage.getItem(COMPARISON_SELECTION_KEY)!)).toEqual({ a: 'current', b: newer.id, pickedAt: '2026-10-22T00:00:00.000Z' })
  })

  beforeEach(() => localStorage.clear())

  it('«Comparar con mi deck» desde el Lab deja A = tu deck y B = el borrador', () => {
    selectDraftForComparison(new Date('2026-10-22T10:00:00.000Z'))

    expect(readComparisonSelection()).toEqual({ a: CURRENT_SOURCE, b: DRAFT_SOURCE, pickedAt: '2026-10-22T10:00:00.000Z' })
  })
})
