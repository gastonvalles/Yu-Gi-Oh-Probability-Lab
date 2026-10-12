import { describe, expect, it } from 'vitest'

import {
  META_DECKS,
  buildMetaDeckHash,
  buildMetaReport,
  countCopies,
  filterMetaDecks,
  loadMetaDecklist,
  projectShare,
  readMetaDeckIdFromHash,
  tierOf,
  toYdkText,
  weeksAgo,
  type MetaDeck,
  type MetaDecklist,
  type MetaDecksData,
  type MetaWeek,
} from '../app/meta-handtraps'

const ASH = 1
const IMPERM = 2
const NIBIRU = 3

function deck(
  id: number,
  name: string,
  date: string,
  main: Array<[number, number]>,
  side: Array<[number, number]> = [],
  region: MetaDeck['region'] = 'tcg',
): MetaDeck {
  return { id, region, name, date, tournament: 'YCS Test', placement: 'Top 8', players: 100, player: 'Jugador', cover: null, url: `deck-${id}`, main, side }
}

const data: MetaDecksData = {
  fetchedAt: '2026-10-08',
  windowDays: 56,
  source: 'https://ygoprodeck.com/deck-search/',
  cards: {
    [ASH]: { name: 'Ash Blossom & Joyous Spring', image: null, ban: { tcg: 'semi-limited', ocg: null } },
    [IMPERM]: { name: 'Infinite Impermanence', image: null, ban: { tcg: null, ocg: null } },
    [NIBIRU]: { name: 'Nibiru, the Primal Being', image: null, ban: { tcg: 'unlimited', ocg: 'forbidden' } },
  },
  decks: [
    // OCG, última semana: no cuenta para el tier list TCG; en OCG Nibiru está prohibida y no se lista.
    deck(7, 'Raise Moon', '2026-10-05', [[ASH, 3], [NIBIRU, 1]], [], 'ocg'),
    // Última semana: Ash en Main, Imperm en Main y Side, Nibiru sólo en Side.
    deck(1, 'Blitzclique', '2026-10-03', [[ASH, 3], [IMPERM, 3]], [[IMPERM, 1], [NIBIRU, 2]]),
    deck(2, 'Blitzclique', '2026-10-03', [[ASH, 3]], [[NIBIRU, 3]]),
    deck(3, 'Despia Branded', '2026-10-02', [[ASH, 2]]),
    // Tres semanas atrás: sólo Ash.
    deck(4, 'Elfnote', '2026-09-14', [[ASH, 3]]),
    // Siete semanas atrás: fuera de una ventana de 4 semanas, dentro de la de 8.
    deck(5, 'Elfnote', '2026-08-18', [[IMPERM, 3]]),
    // Fuera de todos los datos.
    deck(6, 'Elfnote', '2026-06-01', [[IMPERM, 3]]),
  ],
}

const series = (shares: number[], decks = 20): MetaWeek[] => shares.map((share) => ({ share, decks }))

describe('tier list de hand traps del meta', () => {
  it('asigna el tier por el piso que alcanza', () => {
    expect(tierOf(0.95)).toBe('S')
    expect(tierOf(0.6)).toBe('S')
    expect(tierOf(0.59)).toBe('A')
    expect(tierOf(0.2)).toBe('B')
    expect(tierOf(0.05)).toBe('C')
    expect(tierOf(0.01)).toBe('D')
  })

  it('cuenta semanas enteras hacia atrás desde el snapshot', () => {
    expect(weeksAgo('2026-10-08', '2026-10-08')).toBe(0)
    expect(weeksAgo('2026-10-02', '2026-10-08')).toBe(0)
    expect(weeksAgo('2026-10-01', '2026-10-08')).toBe(1)
    expect(weeksAgo('2026-10-20', '2026-10-08')).toBe(0)
    // El snapshot es un instante (con hora): la hora no cambia la semana.
    expect(weeksAgo('2026-10-02', '2026-10-08T23:59:00.000Z')).toBe(0)
    expect(weeksAgo('2026-10-01', '2026-10-08T00:30:00.000Z')).toBe(1)
  })

  it('cuenta cada deck una vez por carta, con las copias por zona, y ordena por uso', () => {
    const { deckCount, handtraps } = buildMetaReport(data, 'tcg', 'both', 4)
    const [ash, nibiru, imperm] = handtraps

    expect(deckCount).toBe(4)
    expect(handtraps.map((stat) => stat.name)).toEqual(['Ash Blossom & Joyous Spring', 'Nibiru, the Primal Being', 'Infinite Impermanence'])
    expect(ash).toMatchObject({ decks: 4, share: 1, tier: 'S', main: { decks: 4, copies: 11 }, side: { decks: 0, copies: 0 } })
    // Imperm va en Main y en Side del mismo deck: un solo deck la juega.
    expect(imperm).toMatchObject({ decks: 1, share: 0.25, tier: 'B', main: { decks: 1, copies: 3 }, side: { decks: 1, copies: 1 } })
    expect(nibiru).toMatchObject({ decks: 2, share: 0.5, tier: 'A', side: { decks: 2, copies: 5 } })
    expect(ash?.archetypes).toEqual([
      { name: 'Blitzclique', decks: 2, total: 2 },
      { name: 'Despia Branded', decks: 1, total: 1 },
      { name: 'Elfnote', decks: 1, total: 1 },
    ])
  })

  it('con la zona Side sólo quedan las que van en Side, y la ventana cambia qué decks cuentan', () => {
    expect(buildMetaReport(data, 'tcg', 'side', 4).handtraps.map((stat) => [stat.name, stat.decks])).toEqual([
      ['Nibiru, the Primal Being', 2],
      ['Infinite Impermanence', 1],
    ])
    expect(buildMetaReport(data, 'tcg', 'main', 4).handtraps.map((stat) => stat.name)).not.toContain('Nibiru, the Primal Being')
    expect(buildMetaReport(data, 'tcg', 'both', 8).deckCount).toBe(5)
    expect(buildMetaReport(data, 'tcg', 'both', 1).deckCount).toBe(3)
  })

  it('cada región tiene su tier list, con su propia banlist', () => {
    const ocg = buildMetaReport(data, 'ocg', 'both', 4)

    expect(ocg.deckCount).toBe(1)
    // Nibiru está en el deck OCG pero prohibida en OCG: no se lista; en TCG sí.
    expect(ocg.handtraps.map((stat) => [stat.name, stat.share])).toEqual([['Ash Blossom & Joyous Spring', 1]])
    expect(buildMetaReport(data, 'tcg', 'both', 4).handtraps.map((stat) => stat.name)).toContain('Nibiru, the Primal Being')
  })

  it('una carta prohibida en la banlist TCG de hoy no entra al tier list, aunque los decks viejos la lleven', () => {
    const banned: MetaDecksData = {
      ...data,
      cards: { ...data.cards, [NIBIRU]: { name: 'Nibiru, the Primal Being', image: null, ban: { tcg: 'forbidden', ocg: null } } },
    }
    const names = buildMetaReport(banned, 'tcg', 'both', 4).handtraps.map((stat) => stat.name)

    expect(names).toEqual(['Ash Blossom & Joyous Spring', 'Infinite Impermanence'])
    expect(buildMetaReport(banned, 'tcg', 'both', 4).deckCount).toBe(4)
  })

  it('proyecta la tendencia con una recta pesada por decks y la prolonga dos semanas', () => {
    const rising = projectShare(series([0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65]), 0.6)
    expect(rising.trend).toBe('up')
    expect(rising.projectedShare).toBeCloseTo(0.75, 5)

    const falling = projectShare(series([0.8, 0.7, 0.6, 0.5]), 0.5)
    expect(falling.trend).toBe('down')
    expect(falling.projectedShare).toBeCloseTo(0.3, 5)

    expect(projectShare(series([0.5, 0.52, 0.49, 0.5]), 0.5).trend).toBe('flat')
  })

  it('sin tres semanas con decks suficientes no proyecta nada', () => {
    const thin = projectShare([...series([0.1, 0.2], 20), ...series([0.9, 0.9], 3)], 0.42)
    expect(thin).toEqual({ projectedShare: 0.42, trend: 'flat' })

    const nibiru = buildMetaReport(data, 'tcg', 'both', 4).handtraps.find((stat) => stat.id === NIBIRU)
    expect(nibiru?.trend).toBe('flat')
    expect(nibiru?.projectedShare).toBe(0.5)
  })

  it('filtra los decks por región, por carta o por nombre de deck', () => {
    expect(filterMetaDecks(data.decks, { cardId: NIBIRU }).map((item) => item.id)).toEqual([7, 1, 2])
    expect(filterMetaDecks(data.decks, { region: 'tcg', cardId: NIBIRU }).map((item) => item.id)).toEqual([1, 2])
    expect(filterMetaDecks(data.decks, { region: 'ocg' }).map((item) => item.id)).toEqual([7])
    expect(filterMetaDecks(data.decks, { archetype: 'Elfnote' }).map((item) => item.id)).toEqual([4, 5, 6])
    expect(filterMetaDecks(data.decks, { archetype: 'Elfnote', cardId: ASH }).map((item) => item.id)).toEqual([4])
    expect(filterMetaDecks(data.decks, {})).toHaveLength(7)
  })

  it('busca por texto en nombre, torneo, puesto y jugador, sin importar mayúsculas, tildes ni orden', () => {
    expect(filterMetaDecks(data.decks, { text: 'despiá branded' }).map((item) => item.id)).toEqual([3])
    expect(filterMetaDecks(data.decks, { text: 'DESPIA' }).map((item) => item.id)).toEqual([3])
    expect(filterMetaDecks(data.decks, { text: 'TEST ycs' })).toHaveLength(7)
    expect(filterMetaDecks(data.decks, { text: 'top 8 blitz' }).map((item) => item.id)).toEqual([1, 2])
    expect(filterMetaDecks(data.decks, { text: 'jugador', cardId: NIBIRU, region: 'tcg' }).map((item) => item.id)).toEqual([1, 2])
    expect(filterMetaDecks(data.decks, { text: 'no existe' })).toEqual([])
    expect(filterMetaDecks(data.decks, { text: '   ' })).toHaveLength(7)
  })

  it('arma y lee el link directo a un deck', () => {
    expect(buildMetaDeckHash(736578)).toBe('#meta?deck=736578')
    expect(buildMetaDeckHash(null)).toBe('#meta')
    expect(readMetaDeckIdFromHash('#meta?deck=736578')).toBe(736578)
    expect(readMetaDeckIdFromHash('#meta')).toBeNull()
    expect(readMetaDeckIdFromHash('#deck-builder?deck=1')).toBeNull()
    expect(readMetaDeckIdFromHash('#meta?deck=abc')).toBeNull()
    expect(readMetaDeckIdFromHash('')).toBeNull()
  })

  it('arma el .ydk de una lista completa con una línea por copia, en el orden original', () => {
    const decklist: MetaDecklist = { main: [[ASH, 3], [IMPERM, 1]], extra: [[99, 2]], side: [[NIBIRU, 2]] }

    expect(toYdkText(decklist).split('\n')).toEqual(['#main', '1', '1', '1', '2', '#extra', '99', '99', '!side', '3', '3'])
    expect(countCopies(decklist.main)).toBe(4)
    expect(countCopies([])).toBe(0)
  })
})

describe('src/data/meta-decks.json (lo que escribe scripts/sync-meta-decks.mjs)', () => {
  it('trae decks recientes con hand traps conocidas y datos completos', () => {
    expect(META_DECKS.decks.length).toBeGreaterThan(50)
    expect(Object.keys(META_DECKS.cards).length).toBeGreaterThan(10)

    for (const deck of META_DECKS.decks) {
      expect(weeksAgo(deck.date, META_DECKS.fetchedAt)).toBeLessThanOrEqual(Math.ceil(META_DECKS.windowDays / 7))
      expect(deck.name.length).toBeGreaterThan(0)

      for (const [id, copies] of [...deck.main, ...deck.side]) {
        expect(META_DECKS.cards[String(id)]).toBeDefined()
        expect(Number.isInteger(copies) && copies >= 1).toBe(true)
      }
    }

    const tcg = META_DECKS.decks.filter((deck) => deck.region === 'tcg').length
    const ocg = META_DECKS.decks.filter((deck) => deck.region === 'ocg').length
    expect(tcg + ocg).toBe(META_DECKS.decks.length)
    expect(tcg).toBeGreaterThan(50)
    expect(ocg).toBeGreaterThan(10)

    const report = buildMetaReport(META_DECKS, 'tcg', 'both', 8)
    expect(report.deckCount).toBe(tcg)
    expect(report.handtraps[0]?.tier).toBe('S')
    expect(buildMetaReport(META_DECKS, 'ocg', 'both', 8).deckCount).toBe(ocg)
  })

  it('las listas completas son del mismo snapshot: cada deck tiene la suya y sus hand traps coinciden', async () => {
    const entriesOf = (entries: ReadonlyArray<[number, number]>) =>
      entries
        .filter(([id]) => Object.hasOwn(META_DECKS.cards, String(id)))
        .map(([id, copies]) => `${id}:${copies}`)
        .sort()

    for (const deck of META_DECKS.decks.slice(0, 40)) {
      const decklist = await loadMetaDecklist(deck.id)

      expect(decklist).not.toBeNull()
      expect(countCopies(decklist!.main)).toBeGreaterThanOrEqual(40)
      expect(entriesOf(decklist!.main)).toEqual(deck.main.map(([id, copies]) => `${id}:${copies}`).sort())
      expect(entriesOf(decklist!.side)).toEqual(deck.side.map(([id, copies]) => `${id}:${copies}`).sort())
    }

    expect(await loadMetaDecklist(-1)).toBeNull()
  })
})
