import { afterEach, describe, expect, it } from 'vitest'

import { compareBuilds } from '../app/build-comparison'
import { pairChanges } from '../app/change-pairs'
import { CURRENT_SOURCE, DECK_BEFORE_SOURCE, DRAFT_SOURCE } from '../app/comparison-selection'
import type { DeckBefore } from '../app/deck-before'
import type { SavedBuild } from '../app/saved-builds'
import { describeChange, describeZones, sourceOptions, whenText, zoneMarks } from '../components/comparison/build-sources'
import { deltaPoints, mirrorGroups, per100, VIEWS, verdictRows, winnerOf } from '../components/comparison/comparison-rows'
import { applyLocale } from '../i18n'
import { DECK_A, DECK_B, HANDS, RULES } from './support/comparison-fixtures'
import { copies, fillerCards, fortyCardMain } from './support/deck-fixtures'

afterEach(() => applyLocale('es'))

describe('el ▲/▼ de B contra A', () => {
  it('son puntos «de cada 100» enteros: menos de medio punto es «=», menos de uno se dice uno, y sin dato no hay número', () => {
    expect(deltaPoints({ a: 0.81, b: 0.87 })).toBe(6)
    expect(deltaPoints({ a: 0.87, b: 0.81 })).toBe(-6)
    expect(deltaPoints({ a: 0.81, b: 0.8135 })).toBe(0)
    expect(deltaPoints({ a: 0.5, b: 0.506 })).toBe(1)
    expect(deltaPoints({ a: null, b: 0.5 })).toBeNull()
  })

  it('en lo que traba, el que tiene menos es el mejor', () => {
    expect(winnerOf({ a: 0.19, b: 0.12 }, false)).toBe('B')
    expect(winnerOf({ a: 0.19, b: 0.12 }, true)).toBe('A')
    expect(winnerOf({ a: 0.19, b: 0.191 }, false)).toBeNull()
  })

  it('el número de una fila es el entero del anillo, sin mentir en las puntas', () => {
    expect([per100(0.813), per100(0.004), per100(0.996), per100(null)]).toEqual(['81', '<1', '>99', '—'])
  })
})

describe('las filas espejo', () => {
  const comparison = compareBuilds({ name: 'A', cards: DECK_A }, { name: 'B', cards: DECK_B }, RULES)

  it('sin salida y con problema salen del mismo cálculo que los anillos, en cada vista, con la cuenta exacta de cada turno', () => {
    const [noOpening, withProblem] = verdictRows(comparison)

    for (const view of VIEWS) {
      expect(noOpening!.values[view]).toEqual({ a: comparison.a.results![view].noOpeningProbability, b: comparison.b.results![view].noOpeningProbability })
      expect(withProblem!.values[view].b).toBe(comparison.b.results![view].withProblemProbability)
    }

    expect(noOpening!.higherIsBetter).toBe(false)
    expect(noOpening!.counts.first.a).toEqual({ hands: Math.round(comparison.a.results!.first.noOpeningProbability * HANDS.a5), total: HANDS.a5 })
    expect(noOpening!.counts.second.b!.total).toBe(HANDS.b6)
  })

  it('se agrupan (lo que traba, tus reglas, los roles), de la mayor diferencia a la menor, y lo que da igual en todas las vistas va plegado', () => {
    const groups = mirrorGroups(comparison)
    const gap = (row: { values: { average: { a: number | null; b: number | null } } }) => Math.abs((row.values.average.b ?? 0) - (row.values.average.a ?? 0))

    expect(groups.rules.every((row) => row.higherIsBetter)).toBe(true)
    expect(groups.problems.every((row) => !row.higherIsBetter)).toBe(true)
    // B no tiene bricks: la fila de los bricks está, y menos es mejor.
    const bricks = groups.roles.find((row) => row.key === 'brick')!
    expect(bricks.higherIsBetter).toBe(false)
    expect(winnerOf(bricks.values.average, false)).toBe('B')

    for (const rows of [groups.problems, groups.rules, groups.roles]) {
      const gaps = rows.map(gap)
      expect(gaps).toEqual([...gaps].sort((left, right) => right - left))
      // Ninguna fila a la vista da igual en todas las vistas: esas van plegadas.
      expect(rows.every((row) => VIEWS.some((view) => deltaPoints(row.values[view]) !== 0))).toBe(true)
    }

    expect(groups.same.every((row) => VIEWS.every((view) => !deltaPoints(row.values[view])))).toBe(true)
  })

  it('un rol que repite una regla (mismos valores) no se lista dos veces', () => {
    const groups = mirrorGroups(comparison)
    const shown = [...groups.problems, ...groups.rules, ...groups.roles, ...groups.same]
    const pairs = shown.map((row) => `${row.higherIsBetter}|${row.values.average.a?.toFixed(3)}|${row.values.average.b?.toFixed(3)}`)

    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('cada fila sabe qué medida la mueve (para «Qué lo mueve»)', () => {
    const groups = mirrorGroups(comparison)

    expect(groups.roles.find((row) => row.key === 'brick')!.measure).toBe('role:brick')
    expect([...groups.rules, ...groups.problems, ...groups.same].filter((row) => !['starter', 'extender', 'interaction', 'brick'].includes(row.key)).every((row) => row.measure === `rule:${row.key}`)).toBe(true)
  })
})

describe('«Qué cambiaste» en palabras', () => {
  const purulia = copies(84, 'Mulcharmy Purulia', 2, ['handtrap'], { origin: 'non_engine' })
  const circle = copies(59, 'Circle of the Fire Kings', 1, ['recovery', 'extender'])
  const island = copies(57, 'Fire King Island', 3, ['searcher', 'starter'])
  const solemn = copies(78, 'Solemn Accusation', 2, ['disruption'], { origin: 'non_engine' })
  const base = fillerCards(35)

  it('lo que entra, con su rol (el de su familia) y de dónde viene, en lugar de lo que sale; lo que baja al Side lo dice la línea del Side', () => {
    const a = { main: [...base, ...purulia, ...island.slice(0, 2)], extra: [], side: [...circle, ...solemn] }
    const b = { main: [...base, ...circle, ...island], extra: [], side: [...purulia, solemn[0]!] }
    const changes = pairChanges(a, b)
    const texts = changes.main.map(describeChange)

    expect(texts).toContainEqual({ title: 'Circle of the Fire Kings', facts: ['Extender', 'sube del Side', 'en lugar de Mulcharmy Purulia'] })
    expect(texts).toContainEqual({ title: 'Fire King Island', facts: ['Starter', 'ahora son 3', 'en lugar de Mulcharmy Purulia'] })
    // Lo que sube del Side ya lo dice su cambio: la línea del Side dice lo que baja y lo que sale del deck.
    expect(describeZones(changes)).toBe('Side: bajan 2 Mulcharmy Purulia y sale 1 Solemn Accusation. Extra: igual en las dos. El Extra y el Side no cambian la mano.')
  })

  it('una carta nueva dice «nueva»; una que sale sin reemplazo, cuántas quedan o adónde va; sin rol, «Sin clasificar»', () => {
    const unclassified = copies(99, 'Called by the Grave', 1, [], { origin: null })
    const a = { main: [...base, ...island], extra: [], side: [] }
    const b = { main: [...base, ...island.slice(0, 2), ...unclassified], extra: [], side: [] }

    expect(pairChanges(a, b).main.map(describeChange)).toEqual([{ title: 'Called by the Grave', facts: ['Sin clasificar', 'nueva', 'en lugar de Fire King Island'] }])
    expect(pairChanges(a, { ...a, main: [...base, ...island.slice(0, 2)] }).main.map(describeChange)).toEqual([{ title: 'Sale Fire King Island', facts: ['Starter', 'quedan 2'] }])
    expect(describeZones(pairChanges(a, b))).toBe('El Extra y el Side quedan igual.')
  })

  it('las dos listas marcan en A las copias que salen de cada zona y en B las que entran', () => {
    const a = { main: [...base, ...purulia, ...island.slice(0, 2)], extra: [], side: [...circle] }
    const b = { main: [...base, ...circle, ...island], extra: [], side: [...purulia] }
    const marks = zoneMarks(pairChanges(a, b), 'main')

    expect([...marks.A]).toEqual([[84, 2]])
    expect(new Map(marks.B)).toEqual(new Map([[57, 1], [59, 1]]))
  })
})

describe('de dónde sale cada build', () => {
  const NOW = new Date(2026, 9, 22, 18, 0)

  it('cuándo se guardó, como se dice: hoy y ayer con la hora (24 h), y si no el día', () => {
    expect(whenText(new Date(2026, 9, 22, 14, 20).toISOString(), NOW)).toBe('hoy, 14:20')
    expect(whenText(new Date(2026, 9, 21, 21, 40).toISOString(), NOW)).toBe('ayer, 21:40')
    expect(whenText(new Date(2026, 9, 12, 9, 0).toISOString(), NOW)).toBe('12 oct')
    applyLocale('en')
    expect(whenText(new Date(2026, 9, 21, 21, 40).toISOString(), NOW)).toBe('yesterday, 21:40')
  })

  it('en el orden de la lista: tu deck, el de antes, el borrador y las builds (de la más nueva), cada una con su origen; con la clasificación de tu deck', () => {
    const current = { main: fortyCardMain(), extra: [], side: [] }
    // La build trae una copia del Starter Uno sin clasificar: en tu deck está clasificado, así que se mide igual que en tu deck.
    const loose = { ...current.main[0]!, origin: null, roles: [] }
    const build = (id: string, savedAt: string, from?: SavedBuild['from']): SavedBuild => ({ id, name: id, savedAt, ...(from ? { from } : {}), main: [loose, ...current.main.slice(1)], extra: [], side: [] })
    const deckBefore: DeckBefore = { v: 1, deckName: 'Fuego', savedAt: new Date(2026, 9, 21, 21, 40).toISOString(), counts: { main: 40, extra: 0, side: 0 }, ...current }
    const options = sourceOptions(
      { current, deckBefore, draft: current, savedBuilds: [build('vieja', new Date(2026, 9, 12).toISOString(), 'import'), build('nueva', new Date(2026, 9, 22, 14, 20).toISOString(), 'lab')] },
      'Mi deck',
      NOW,
    )

    expect(options.map((option) => option.source)).toEqual([CURRENT_SOURCE, DECK_BEFORE_SOURCE, DRAFT_SOURCE, 'nueva', 'vieja'])
    expect(options.map((option) => [option.name, option.meta])).toEqual([
      ['Tu deck actual', 'el del builder'],
      ['Tu deck de antes', 'se guardó sola · ayer, 21:40'],
      ['Borrador del Lab', 'sin guardar'],
      ['nueva', 'del Lab · hoy, 14:20'],
      ['vieja', 'importada 12 oct'],
    ])
    expect(options[1]!.deckName).toBe('Fuego')
    expect(options[3]!.zones.main[0]!.roles).toEqual(current.main[0]!.roles)
    expect(options.every((option) => option.pending === 0)).toBe(true)
  })
})
