import { describe, expect, it } from 'vitest'

import {
  DECK_TREND_THRESHOLD,
  META_DECKS,
  MIN_TIER_DECKS,
  buildDeckTierReport,
  buildMetaDeckHash,
  buildMetaReport,
  buildTierListHash,
  buildTournamentsHash,
  cardIdsOfKind,
  countCopies,
  countKindCopies,
  deckTierOf,
  filterMetaDecks,
  kindsOf,
  loadMetaDecklist,
  placementRank,
  projectShare,
  readMetaDeckIdFromHash,
  readTierListHash,
  readTournamentsHash,
  tierOf,
  toYdkText,
  weeksAgo,
  type MetaDeck,
  type MetaDecklist,
  type MetaDecksData,
  type MetaWeek,
} from '../app/meta'

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
    const { deckCount, cards } = buildMetaReport(data, 'tcg', 'both', 4)
    const [ash, nibiru, imperm] = cards

    expect(deckCount).toBe(4)
    expect(cards.map((stat) => stat.name)).toEqual(['Ash Blossom & Joyous Spring', 'Nibiru, the Primal Being', 'Infinite Impermanence'])
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
    expect(buildMetaReport(data, 'tcg', 'side', 4).cards.map((stat) => [stat.name, stat.decks])).toEqual([
      ['Nibiru, the Primal Being', 2],
      ['Infinite Impermanence', 1],
    ])
    expect(buildMetaReport(data, 'tcg', 'main', 4).cards.map((stat) => stat.name)).not.toContain('Nibiru, the Primal Being')
    expect(buildMetaReport(data, 'tcg', 'both', 8).deckCount).toBe(5)
    expect(buildMetaReport(data, 'tcg', 'both', 1).deckCount).toBe(3)
  })

  it('cada región tiene su tier list, con su propia banlist', () => {
    const ocg = buildMetaReport(data, 'ocg', 'both', 4)

    expect(ocg.deckCount).toBe(1)
    // Nibiru está en el deck OCG pero prohibida en OCG: no se lista; en TCG sí.
    expect(ocg.cards.map((stat) => [stat.name, stat.share])).toEqual([['Ash Blossom & Joyous Spring', 1]])
    expect(buildMetaReport(data, 'tcg', 'both', 4).cards.map((stat) => stat.name)).toContain('Nibiru, the Primal Being')
  })

  it('una carta prohibida en la banlist TCG de hoy no entra al tier list, aunque los decks viejos la lleven', () => {
    const banned: MetaDecksData = {
      ...data,
      cards: { ...data.cards, [NIBIRU]: { name: 'Nibiru, the Primal Being', image: null, ban: { tcg: 'forbidden', ocg: null } } },
    }
    const names = buildMetaReport(banned, 'tcg', 'both', 4).cards.map((stat) => stat.name)

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

  it('la tendencia sale de lo que cambia la recta, no de las cifras ya recortadas al 100 %: una carta casi al tope que sube sigue subiendo', () => {
    const topping = projectShare(series([0.7, 0.8, 0.9, 1]), 0.95)

    expect(topping.projectedShare).toBe(1)
    expect(topping.trend).toBe('up')
    expect(projectShare(series([0.3, 0.2, 0.1, 0]), 0.05)).toMatchObject({ projectedShare: 0, trend: 'down' })
  })

  it('cuánto tiene que cambiar para que suba o baje lo pone quien pregunta: las cartas piden 5 puntos y los decks, 2', () => {
    // Sube 1,5 puntos por semana: 3 en dos semanas.
    const slow = series([0.02, 0.035, 0.05, 0.065])

    expect(projectShare(slow, 0.05).trend).toBe('flat')
    expect(projectShare(slow, 0.05, DECK_TREND_THRESHOLD).trend).toBe('up')
    expect(projectShare(series([0.065, 0.05, 0.035, 0.02]), 0.05, DECK_TREND_THRESHOLD).trend).toBe('down')
  })

  it('sin tres semanas con decks suficientes no proyecta nada', () => {
    const thin = projectShare([...series([0.1, 0.2], 20), ...series([0.9, 0.9], 3)], 0.42)
    expect(thin).toEqual({ projectedShare: 0.42, trend: 'flat' })

    const nibiru = buildMetaReport(data, 'tcg', 'both', 4).cards.find((stat) => stat.id === NIBIRU)
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

  it('arma el .ydk de una lista completa con una línea por copia, en el orden original', () => {
    const decklist: MetaDecklist = { main: [[ASH, 3], [IMPERM, 1]], extra: [[99, 2]], side: [[NIBIRU, 2]] }

    expect(toYdkText(decklist).split('\n')).toEqual(['#main', '1', '1', '1', '2', '#extra', '99', '99', '!side', '3', '3'])
    expect(countCopies(decklist.main)).toBe(4)
    expect(countCopies([])).toBe(0)
  })
})

describe('tier lists de hand traps y de boardbreakers', () => {
  const RAIGEKI = 4
  const BYSTIAL = 5
  const both: MetaDecksData = {
    ...data,
    cards: {
      ...data.cards,
      [RAIGEKI]: { name: 'Raigeki', image: null, ban: { tcg: null, ocg: null }, kinds: ['boardbreaker'] },
      // Una misma carta puede estar en las dos listas.
      [BYSTIAL]: { name: 'Bystial Druiswurm', image: null, ban: { tcg: null, ocg: null }, kinds: ['handtrap', 'boardbreaker'] },
    },
    decks: [
      deck(1, 'Blitzclique', '2026-10-03', [[ASH, 3], [RAIGEKI, 1]]),
      deck(2, 'Blitzclique', '2026-10-03', [[BYSTIAL, 2]], [[RAIGEKI, 2]]),
    ],
  }

  it('cada lista cuenta sólo las cartas de su tipo, y una carta de los dos tipos está en las dos', () => {
    const handtraps = buildMetaReport(both, 'tcg', 'both', 4, 'handtrap')
    const boardbreakers = buildMetaReport(both, 'tcg', 'both', 4, 'boardbreaker')

    // Los decks son los mismos en las dos listas: lo que cambia es qué cartas se miden.
    expect(handtraps.deckCount).toBe(2)
    expect(boardbreakers.deckCount).toBe(2)
    expect(handtraps.cards.map((stat) => stat.name)).toEqual(['Ash Blossom & Joyous Spring', 'Bystial Druiswurm'])
    expect(boardbreakers.cards.map((stat) => [stat.name, stat.share])).toEqual([
      ['Raigeki', 1],
      ['Bystial Druiswurm', 0.5],
    ])
    // Raigeki va en Main de un deck y en Side del otro.
    expect(boardbreakers.cards[0]).toMatchObject({ decks: 2, main: { decks: 1, copies: 1 }, side: { decks: 1, copies: 2 } })
  })

  it('los datos de antes de los boardbreakers (sin `kinds`) cuentan como hand traps', () => {
    expect(kindsOf(data.cards[ASH])).toEqual(['handtrap'])
    expect(kindsOf(undefined)).toEqual(['handtrap'])
    expect(buildMetaReport(data, 'tcg', 'both', 4, 'boardbreaker').cards).toEqual([])
  })

  it('sabe qué cartas y cuántas copias de cada tipo lleva un deck', () => {
    expect([...cardIdsOfKind('boardbreaker', both.cards)].sort()).toEqual([RAIGEKI, BYSTIAL])
    expect([...cardIdsOfKind('handtrap', both.cards)].sort()).toEqual([ASH, IMPERM, NIBIRU, BYSTIAL])

    const [first, second] = both.decks as [MetaDeck, MetaDeck]

    expect(countKindCopies(first.main, 'handtrap', both.cards)).toBe(3)
    expect(countKindCopies(first.main, 'boardbreaker', both.cards)).toBe(1)
    expect(countKindCopies(second.main, 'handtrap', both.cards)).toBe(2)
    expect(countKindCopies(second.main, 'boardbreaker', both.cards)).toBe(2)
    expect(countKindCopies(second.side, 'boardbreaker', both.cards)).toBe(2)
  })
})

describe('tier list de decks del meta', () => {
  const elf = (id: number, date: string, placement: string, cover: number | null): MetaDeck => ({ ...deck(id, 'Elfnote', date, []), placement, cover })
  const tiers: MetaDecksData = {
    ...data,
    decks: [
      elf(1, '2026-10-03', 'Top 16', 111),
      elf(2, '2026-10-04', 'Winner', null),
      elf(3, '2026-10-02', 'Top 8', 333),
      // Un solo resultado: no hace meta (no entra), pero cuenta para el total de decks.
      deck(4, 'Despia Branded', '2026-10-03', []),
      // Otra región: no cuenta.
      deck(5, 'Elfnote', '2026-10-03', [], [], 'ocg'),
    ],
  }

  it('asigna el tier de un deck con pisos propios, más bajos que los de las cartas', () => {
    expect(deckTierOf(0.5)).toBe('S')
    expect(deckTierOf(0.08)).toBe('S')
    // Se compara el porcentaje que se ve: 7,9% se muestra como 8%.
    expect(deckTierOf(0.079)).toBe('S')
    expect(deckTierOf(0.07)).toBe('A')
    expect(deckTierOf(0.03)).toBe('B')
    expect(deckTierOf(0.015)).toBe('B')
    expect(deckTierOf(0.01)).toBe('C')
    expect(deckTierOf(0.004)).toBe('D')
  })

  it('agrupa los decks por nombre y mide cada uno contra todos los decks de la región en la ventana', () => {
    const report = buildDeckTierReport(tiers, 'tcg', 4)

    expect(report.deckCount).toBe(4)
    expect(report.decks.map((stat) => [stat.name, stat.decks, stat.share, stat.tier])).toEqual([['Elfnote', 3, 0.75, 'S']])
    // Un nombre con menos de MIN_TIER_DECKS resultados queda afuera.
    expect(MIN_TIER_DECKS).toBe(2)
    expect(buildDeckTierReport(tiers, 'ocg', 4)).toMatchObject({ deckCount: 1, decks: [] })
  })

  it('ordena los resultados del mejor puesto al peor, y la portada es la del deck más nuevo que tenga una', () => {
    const [elfnote] = buildDeckTierReport(tiers, 'tcg', 4).decks

    expect(elfnote?.results.map((result) => [result.id, result.placement])).toEqual([
      [2, 'Winner'],
      [3, 'Top 8'],
      [1, 'Top 16'],
    ])
    // El más nuevo (id 2) no trae portada: se toma la del siguiente.
    expect(elfnote?.cover).toBe(111)
  })

  it('el orden de los puestos entiende campeón, finalista y Top N, y deja al final lo que no entiende', () => {
    const order = ['Winner', 'Runner-Up', 'Top 4', 'Top 8', 'Top 16', 'Top 32'].map(placementRank)

    expect(order).toEqual([...order].sort((left, right) => left - right))
    expect(new Set(order).size).toBe(order.length)
    expect(placementRank('1st Place')).toBe(placementRank('Winner'))
    expect(placementRank('Finalist')).toBe(placementRank('Runner-Up'))
    expect(placementRank(null)).toBe(99)
    expect(placementRank('Swiss 5-3')).toBe(99)
  })

  it('con datos de varias semanas proyecta la tendencia del deck', () => {
    const weekly = Array.from({ length: 8 }, (_, week) => week)
    const rising: MetaDecksData = {
      ...data,
      decks: weekly.flatMap((week) => {
        // Más Elfnote cada semana (de la más vieja a la más nueva), de 12 decks por semana.
        const date = new Date(Date.parse('2026-10-07') - week * 7 * 86_400_000).toISOString().slice(0, 10)
        const elfnotes = 8 - week

        return Array.from({ length: 12 }, (_, index) => deck(week * 100 + index, index < elfnotes ? 'Elfnote' : `Otro ${index}`, date, []))
      }),
    }
    const [elfnote] = buildDeckTierReport(rising, 'tcg', 4).decks

    expect(elfnote?.trend).toBe('up')
    expect(elfnote?.projectedShare).toBeGreaterThan(elfnote?.share ?? 1)
  })

  it('un deck que sube de a poco ya es tendencia (a una carta con ese cambio no le alcanzaría)', () => {
    // Elfnote tiene 2 de cada 12 decks las cuatro semanas más viejas y 3 de cada 12 las cuatro más nuevas: la recta sube ~1,6 puntos por semana.
    const slow: MetaDecksData = {
      ...data,
      decks: Array.from({ length: 8 }, (_, week) => week).flatMap((week) => {
        const date = new Date(Date.parse('2026-10-07') - week * 7 * 86_400_000).toISOString().slice(0, 10)
        const elfnotes = week < 4 ? 3 : 2

        return Array.from({ length: 12 }, (_, index) => deck(week * 100 + index, index < elfnotes ? 'Elfnote' : `Otro ${index}`, date, []))
      }),
    }
    const [elfnote] = buildDeckTierReport(slow, 'tcg', 4).decks

    expect(elfnote?.name).toBe('Elfnote')
    expect(elfnote?.trend).toBe('up')
    expect(projectShare(elfnote?.weekly ?? [], elfnote?.share ?? 0).trend).toBe('flat')
  })
})

describe('links directos', () => {
  it('arma y lee el link a un deck de torneo (y el de antes de separar las tier lists sigue andando)', () => {
    expect(buildMetaDeckHash(736578)).toBe('#tournaments?deck=736578')
    expect(buildMetaDeckHash(null)).toBe('#tournaments')
    expect(readMetaDeckIdFromHash('#tournaments?deck=736578')).toBe(736578)
    expect(readMetaDeckIdFromHash('#meta?deck=736578')).toBe(736578)
    expect(readMetaDeckIdFromHash('#meta')).toBeNull()
    expect(readMetaDeckIdFromHash('#tournaments')).toBeNull()
    expect(readMetaDeckIdFromHash('#deck-builder?deck=1')).toBeNull()
    expect(readMetaDeckIdFromHash('#tournaments?deck=abc')).toBeNull()
    expect(readMetaDeckIdFromHash('')).toBeNull()
  })

  it('el link de los decks de torneo lleva el deck abierto y el filtro por carta o por nombre de deck', () => {
    expect(buildTournamentsHash()).toBe('#tournaments')
    expect(buildTournamentsHash({ card: 5 })).toBe('#tournaments?card=5')
    expect(buildTournamentsHash({ deck: 7, card: 5, archetype: 'Azamina Mitsurugi' })).toBe('#tournaments?deck=7&card=5&archetype=Azamina+Mitsurugi')

    expect(readTournamentsHash(buildTournamentsHash({ archetype: 'Azamina Mitsurugi' }))).toEqual({ deck: null, card: null, archetype: 'Azamina Mitsurugi' })
    expect(readTournamentsHash('#tournaments?deck=7&card=5')).toEqual({ deck: 7, card: 5, archetype: null })
    expect(readTournamentsHash('#tournaments?card=-1&deck=1.5')).toEqual({ deck: null, card: null, archetype: null })
    // Un nombre disparatado de largo no es un deck de verdad.
    expect(readTournamentsHash(`#tournaments?archetype=${'x'.repeat(121)}`).archetype).toBeNull()
    // Otras pantallas no tienen que ver.
    expect(readTournamentsHash('#meta?list=deck')).toEqual({ deck: null, card: null, archetype: null })
    expect(readTournamentsHash('#replays?deck=7')).toEqual({ deck: null, card: null, archetype: null })
  })

  it('el link de las tier lists lleva la lista elegida; sin lista (o con una que no existe) es la de hand traps', () => {
    expect(buildTierListHash('handtrap')).toBe('#meta')
    expect(buildTierListHash('deck')).toBe('#meta?list=deck')
    expect(buildTierListHash('boardbreaker')).toBe('#meta?list=boardbreaker')

    expect(readTierListHash('#meta?list=boardbreaker')).toBe('boardbreaker')
    expect(readTierListHash('#meta?list=deck')).toBe('deck')
    expect(readTierListHash('#meta')).toBe('handtrap')
    expect(readTierListHash('#meta?list=otra')).toBe('handtrap')
    expect(readTierListHash('#tournaments?list=deck')).toBe('handtrap')
  })
})

describe('src/data/meta-decks.json (lo que escribe scripts/sync-meta-decks.mjs)', () => {
  it('trae decks recientes con hand traps y boardbreakers conocidos y datos completos', () => {
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
    expect(report.cards[0]?.tier).toBe('S')
    expect(buildMetaReport(META_DECKS, 'ocg', 'both', 8).deckCount).toBe(ocg)
  })

  it('cada carta está en alguna de las dos listas, y las dos tienen cartas', () => {
    const kinds = Object.values(META_DECKS.cards).map((card) => kindsOf(card))

    expect(kinds.every((entry) => entry.length > 0)).toBe(true)
    expect(kinds.flat()).toContain('handtrap')
    expect(kinds.flat()).toContain('boardbreaker')
    expect(buildMetaReport(META_DECKS, 'tcg', 'both', 8, 'handtrap').cards.length).toBeGreaterThan(5)
    expect(buildMetaReport(META_DECKS, 'tcg', 'both', 8, 'boardbreaker').cards.length).toBeGreaterThan(3)
  })

  it('el tier list de decks tiene decks de las dos regiones, cada uno con sus resultados', () => {
    for (const region of ['tcg', 'ocg'] as const) {
      const report = buildDeckTierReport(META_DECKS, region, 8)

      expect(report.decks.length).toBeGreaterThan(3)
      expect(report.decks.every((stat) => stat.results.length >= MIN_TIER_DECKS && stat.results.every((result) => result.name === stat.name))).toBe(true)
    }
  })

  it('las listas completas son del mismo snapshot: cada deck tiene la suya y sus cartas de los tier lists coinciden', async () => {
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
