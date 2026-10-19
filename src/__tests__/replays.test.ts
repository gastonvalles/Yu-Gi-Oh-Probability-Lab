import { describe, expect, it } from 'vitest'

import { META_DECKS, type MetaDeck } from '../app/meta'
import { buildReplaysHash, countReplaysOfDeck, deckIdsWithReplay, hasMetaDeck, matchReplays, parseReplayTitle, playsDeck, readReplaysHash, readStage, samePlayer, type ReplayVideo } from '../app/replays'

const deck = (id: number, tournament: string, player: string, name: string, placement = 'Top 8'): MetaDeck => ({
  id,
  region: 'tcg',
  name,
  date: '2026-09-19',
  tournament,
  placement,
  players: 500,
  player,
  cover: null,
  url: null,
  main: [],
  side: [],
})
const video = (number: number, title: string, date = '2026-09-21'): ReplayVideo => ({ id: `video${String(number).padStart(6, '0')}`, channel: 'eu', title, duration: '31:38', date })

describe('los títulos de los replays', () => {
  it('separan torneo, instancia y jugadores en los formatos de cada canal', () => {
    expect(parseReplayTitle('YCS Paris 2026 - Day 2 - FINAL - Timoti B. vs. Vladis B.')).toEqual({
      event: 'YCS Paris 2026',
      stage: { label: 'Final', rank: 0 },
      players: ['Timoti B.', 'Vladis B.'],
      genesys: false,
    })
    expect(parseReplayTitle('YCS Paris 2026 - Day 2 - Round 15 - Conal C. vs. Tom-Luca M.')?.stage).toEqual({ label: 'Ronda 15', rank: 85 })
    expect(parseReplayTitle('2025 North America YCS Orlando, FL// Semi Final 1 - Aditya D. vs. Manuel K.')).toMatchObject({
      event: '2025 North America YCS Orlando, FL',
      stage: { label: 'Semifinal 1' },
      players: ['Aditya D.', 'Manuel K.'],
    })
    expect(parseReplayTitle('Kangas vs. Ruggles')).toMatchObject({ event: '', stage: null, players: ['Kangas', 'Ruggles'] })
  })

  it('en Genesys el torneo viene al final y queda marcado', () => {
    expect(parseReplayTitle('Genesys Championship Day 2 | Final - Sigge V. vs. Richard S. | WCQ Brussels 2026')).toMatchObject({
      event: 'WCQ Brussels 2026 · Genesys',
      stage: { label: 'Final' },
      players: ['Sigge V.', 'Richard S.'],
      genesys: true,
    })
  })

  it('lo que no es un duelo no se lee', () => {
    expect(parseReplayTitle('YCS Paris 2026 | Spotlight')).toBeNull()
    expect(parseReplayTitle('Seeker of the Sinful Spoils II: “Snake-Eyes Poplar”')).toBeNull()
  })

  it('ordenan las instancias de la final hacia atrás y las rondas de la última a la primera', () => {
    const rank = (text: string) => readStage(text)?.rank ?? 1000
    const order = ['Final', 'Top 4', 'Top 8', 'Top 16', 'Top 32', 'Top 64', 'Round 15', 'Round 14', 'Round 1']

    expect(order.map(rank)).toEqual([...order.map(rank)].sort((left, right) => left - right))
    expect(readStage('Semi Final 2')).toEqual({ label: 'Semifinal 2', rank: 1 })
    expect(readStage('Swiss Round 3')?.label).toBe('Ronda 3')
    expect(readStage('Day 2')).toBeNull()
  })
})

describe('el nombre de un jugador', () => {
  it('"Timoti B." es "Timoti Baggio": la inicial del apellido, sin importar tildes ni el orden de las palabras', () => {
    expect(samePlayer('Timoti B.', 'Timoti Baggio')).toBe(true)
    expect(samePlayer('Tom-Luca M.', 'Tom-Luca Menzel')).toBe(true)
    expect(samePlayer('Jérémy T.', 'Jeremy Thomas')).toBe(true)
    // Algunos jugadores están cargados con el apellido primero.
    expect(samePlayer('Alexandros P.', 'Papachristopoulos Alexandros')).toBe(true)
  })

  it('no confunde a otro: otra inicial, un nombre escrito distinto o un nombre completo que no es el mismo', () => {
    expect(samePlayer('Danilo S.', 'Danilo Rossi')).toBe(false)
    expect(samePlayer('Conal C.', 'Conall Keane')).toBe(false)
    expect(samePlayer('Eike Ruting', 'Eike Ruting')).toBe(true)
    expect(samePlayer('Eike Ruting', 'Eike Rutinger')).toBe(false)
    expect(samePlayer('', 'Eike Ruting')).toBe(false)
  })
})

describe('el cruce de los replays con los decks del Meta', () => {
  const decks = [
    deck(1, 'YCS Paris', 'Timoti Baggio', 'Elfnote', 'Runner-Up'),
    deck(2, 'YCS Paris', 'Vladis Baranovskis', 'Azamina Mitsurugi', 'Winner'),
    deck(3, 'Dubuque WCQ Regional', 'Timoti Baggio', 'Branded'),
    deck(4, 'YCS Paris', 'Alex Smith', 'Kewl Tune'),
    deck(5, 'YCS Paris', 'Alex Stone', 'Mitsurugi'),
  ]

  it('cada jugador lleva el deck que jugó en ese torneo', () => {
    const [final] = matchReplays([video(1, 'YCS Paris 2026 - Day 2 - FINAL - Timoti B. vs. Vladis B.')], decks)

    expect(final?.players.map((player) => player.deck?.name)).toEqual(['Elfnote', 'Azamina Mitsurugi'])
    expect(final?.stage?.label).toBe('Final')
    expect(final && hasMetaDeck(final)).toBe(true)
    expect(final && playsDeck(final, 2)).toBe(true)
    expect(final && playsDeck(final, 3)).toBe(false)
  })

  it('un jugador sin deck en el Meta queda sin deck, y el torneo tiene que coincidir', () => {
    const [round, regional] = matchReplays(
      [video(1, 'YCS Paris 2026 - Day 1 - Round 5 - Mario D. vs. Nathan F.'), video(2, 'Dubuque WCQ Regional - Top 8 - Timoti B. vs. Mario D.', '2026-09-20')],
      decks,
    )

    expect(round && hasMetaDeck(round)).toBe(false)
    // Timoti B. también jugó el Regional de Dubuque con otro deck.
    expect(regional?.players[0].deck?.name).toBe('Branded')
  })

  it('un YCS no se confunde con un Regional de la misma ciudad, y Genesys no se cruza', () => {
    const entries = matchReplays(
      [video(1, 'Paris WCQ Regional - Final - Timoti B. vs. Vladis B.'), video(2, 'Genesys Championship Day 1 - Round 1 - Timoti B. vs. Vladis B. | YCS Paris 2026')],
      decks,
    )

    expect(entries.map(hasMetaDeck)).toEqual([false, false])
    expect(entries.find((entry) => entry.genesys)?.event).toBe('YCS Paris 2026 · Genesys')
  })

  it('si dos jugadores distintos encajan con el nombre, no se adivina', () => {
    const [entry] = matchReplays([video(1, 'YCS Paris 2026 - Round 3 - Alex S. vs. Timoti B.')], decks)

    expect(entry?.players[0].deck).toBeNull()
    expect(entry?.players[1].deck?.id).toBe(1)
  })

  it('descarta lo que no sirve (id raro, sin dos jugadores) y ordena lo más nuevo primero, de la final hacia atrás', () => {
    const entries = matchReplays(
      [
        video(1, 'YCS Paris 2026 - Day 2 - Top 8 - Vladis B. vs. Michael W.'),
        { ...video(2, 'YCS Paris 2026 - Final - Timoti B. vs. Vladis B.'), id: 'no es un id' },
        video(3, 'YCS Paris 2026 | Spotlight'),
        video(4, 'YCS Paris 2026 - Day 2 - FINAL - Timoti B. vs. Vladis B.'),
        video(5, 'YCS Paris 2026 - Day 2 - Round 15 - Timoti B. vs. Mario D.'),
        video(6, 'Dubuque WCQ Regional - Top 8 - Timoti B. vs. Mario D.', '2026-09-30'),
      ],
      decks,
    )

    expect(entries.map((entry) => entry.video.id)).toEqual(['video000006', 'video000004', 'video000001', 'video000005'])
  })

  it('arma el texto que se busca con torneo, instancia, jugadores y decks', () => {
    const [entry] = matchReplays([video(1, 'YCS Paris 2026 - Day 2 - FINAL - Timoti B. vs. Vladis B.')], decks)

    expect(entry?.search).toContain('elfnote')
    expect(entry?.search).toContain('timoti baggio')
    expect(entry?.search).toContain('runner-up')
    expect(entry?.search).toContain('ycs paris 2026')
  })
})

describe('los links a un replay y a los de un deck', () => {
  it('se arman y se leen en el hash de la pestaña Replays', () => {
    expect(buildReplaysHash()).toBe('#replays')
    expect(buildReplaysHash({ video: '0yJYrr_QlbU', deck: 5 })).toBe('#replays?video=0yJYrr_QlbU&deck=5')
    expect(readReplaysHash('#replays?video=0yJYrr_QlbU&deck=5')).toEqual({ video: '0yJYrr_QlbU', deck: 5 })
    expect(readReplaysHash('#replays')).toEqual({ video: null, deck: null })
  })

  it('ignoran lo raro y lo que es de otra pestaña', () => {
    expect(readReplaysHash('#replays?video=<script>&deck=-3')).toEqual({ video: null, deck: null })
    expect(readReplaysHash('#meta?deck=5&video=0yJYrr_QlbU')).toEqual({ video: null, deck: null })
  })
})

describe('deckIdsWithReplay', () => {
  it('son los decks de torneo que tienen replay: los mismos para los que countReplaysOfDeck da algo', () => {
    const ids = deckIdsWithReplay()

    for (const metaDeck of META_DECKS.decks) {
      expect(ids.has(metaDeck.id), String(metaDeck.id)).toBe(countReplaysOfDeck(metaDeck.id) > 0)
    }
  })
})
