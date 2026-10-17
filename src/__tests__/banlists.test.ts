import { afterEach, describe, expect, it } from 'vitest'

import { applyLocale } from '../i18n'
import { BANLISTS_FETCHED_AT, banlistCardName, banlistsOf, diffBanlists, formatBanlistDate, isUpcoming, listedCards, statusIn, type Banlist } from '../app/banlists'

const list = (forbidden: number[], limited: number[], semiLimited: number[]): Banlist => ({ region: 'tcg', date: '2026-01', forbidden, limited, semiLimited })

afterEach(() => applyLocale('es'))

describe('banlists históricas (datos reales)', () => {
  it('hay al menos 52 listas por región, las más nuevas primero, y los datos dicen cuándo se bajaron', () => {
    for (const region of ['tcg', 'ocg'] as const) {
      const lists = banlistsOf(region)

      expect(lists.length).toBeGreaterThanOrEqual(52)
      expect(lists.map((entry) => entry.date)).toEqual([...lists.map((entry) => entry.date)].sort().reverse())
      expect(lists.every((entry) => entry.region === region)).toBe(true)
    }

    expect(BANLISTS_FETCHED_AT).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // Siempre la misma lista (no se arma de nuevo en cada pedido).
    expect(banlistsOf('tcg')).toBe(banlistsOf('tcg'))
  })

  it('los cambios de la lista de septiembre de 2026 del TCG son los del anuncio oficial de Konami', () => {
    const lists = banlistsOf('tcg')
    const at = lists.findIndex((entry) => entry.date === '2026-09-21')
    const [current, previous] = [lists[at], lists[at + 1]]

    expect(current!.date).toBe('2026-09-21')
    expect(current!.partial).toBeUndefined()

    const changes = diffBanlists(previous!, current!)
    const names = (status: keyof typeof changes) => changes[status].map(({ cardId }) => banlistCardName(cardId))

    expect(names('forbidden')).toEqual(['Archlord Kristya', 'Dimension Shifter', 'Kewl Tune Rotary', 'Phantasmal Lord Ultimitl Bishbaalkin', 'Protectcode Talker', 'PSY-Framelord Omega', 'Reprodocus', 'Wind-Up Hunter'])
    expect(names('limited')).toEqual(['Elfnote Tinia', 'Prohibited Power Patron Portal - Terminus'])
    expect(names('semi-limited')).toEqual(['Branded in High Spirits'])
    expect(names('unlimited')).toEqual([
      'Elder Entity Norden',
      'M-X-Saber Invoker',
      'Metamorphosis',
      'Mind Master',
      'Mirage of Nightmare',
      'Premature Burial',
      'Purrely Delicious Memory',
      'Runick Fountain',
      'Unchained Soul of Sharvara',
      'Wind-Up Carrier Zenmaity',
    ])
    // Y de dónde venía cada una.
    expect(changes.forbidden.find(({ cardId }) => banlistCardName(cardId) === 'Dimension Shifter')?.from).toBe('limited')
    expect(changes.unlimited.find(({ cardId }) => banlistCardName(cardId) === 'Mind Master')?.from).toBe('forbidden')
  })
})

describe('la lista de octubre de 2026 del TCG (anunciada en partes durante el YCS Houston)', () => {
  it('trae lo anunciado en las partes 1 y 2 respecto de la de septiembre', () => {
    const lists = banlistsOf('tcg')
    const october = lists.find((entry) => entry.date === '2026-10-19')
    const september = lists.find((entry) => entry.date === '2026-09-21')
    const changes = diffBanlists(september!, october!)
    const names = (status: keyof typeof changes) => changes[status].map(({ cardId }) => banlistCardName(cardId))

    expect(names('forbidden')).toEqual(
      expect.arrayContaining([
        'Called by the Grave',
        'Albion the Branded Dragon',
        'Amorphage Goliath',
        'Charmer Quartet in Bloom',
        'Beelze of the Diabolic Dragons',
        'Trishula, Dragon of the Ice Barrier',
        'XX-Saber Gottoms',
        'D/D/D Wave High King Caesar',
        'Secret Village of the Spellcasters',
        'Anti-Spell Fragrance',
      ]),
    )
    expect(names('limited')).toEqual(expect.arrayContaining(['Droll & Lock Bird', 'Branded Opening']))
    expect(changes.forbidden.find(({ cardId }) => banlistCardName(cardId) === 'Called by the Grave')?.from).toBe('limited')
  })
})

describe('listas que todavía no rigen', () => {
  it('una lista con día rige desde ese día, y una con sólo el mes, desde el primero', () => {
    const entry = (date: string): Banlist => ({ ...list([], [], []), date })

    expect(isUpcoming(entry('2026-10-19'), '2026-10-17')).toBe(true)
    expect(isUpcoming(entry('2026-10-19'), '2026-10-19')).toBe(false)
    expect(isUpcoming(entry('2026-10-19'), '2026-10-20')).toBe(false)
    expect(isUpcoming(entry('2026-10'), '2026-09-30')).toBe(true)
    expect(isUpcoming(entry('2026-10'), '2026-10-01')).toBe(false)
  })
})

describe('funciones de las banlists', () => {
  it('una carta que no está en la lista es ilimitada', () => {
    const entry = list([1], [2], [3])

    expect(statusIn(entry, 1)).toBe('forbidden')
    expect(statusIn(entry, 2)).toBe('limited')
    expect(statusIn(entry, 3)).toBe('semi-limited')
    expect(statusIn(entry, 4)).toBe('unlimited')
    expect(statusIn(null, 1)).toBe('unlimited')
  })

  it('los cambios se agrupan por el estado al que pasó cada carta; lo que no cambió no aparece', () => {
    const previous = list([1, 2], [3, 4], [5])
    const next = list([1, 3, 6], [2], [5, 7])
    const changes = diffBanlists(previous, next)
    const ids = (status: keyof typeof changes) => changes[status].map(({ cardId }) => cardId).sort((a, b) => a - b)

    expect(ids('forbidden')).toEqual([3, 6])
    expect(ids('limited')).toEqual([2])
    expect(ids('semi-limited')).toEqual([7])
    expect(ids('unlimited')).toEqual([4])
    expect(changes.forbidden.map(({ from }) => from).sort()).toEqual(['limited', 'unlimited'])
  })

  it('con la primera lista (sin anterior) todo lo que trae es nuevo', () => {
    const changes = diffBanlists(null, list([1], [2], [3]))

    expect(changes.forbidden).toEqual([{ cardId: 1, from: 'unlimited' }])
    expect(changes.limited).toEqual([{ cardId: 2, from: 'unlimited' }])
    expect(changes['semi-limited']).toEqual([{ cardId: 3, from: 'unlimited' }])
    expect(changes.unlimited).toEqual([])
  })

  it('las cartas de una lista salen por estado y ordenadas por nombre', () => {
    const [current] = banlistsOf('tcg')
    const cards = listedCards(current!)

    expect(cards.forbidden).toHaveLength(current!.forbidden.length)

    const names = cards.limited.map(banlistCardName)

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')))
  })

  it('la fecha exacta se escribe entera en el idioma elegido, y la que todavía no tiene día, con el mes', () => {
    expect(formatBanlistDate('2026-09-21')).toBe('21 de septiembre de 2026')
    expect(formatBanlistDate('2013-10-11')).toBe('11 de octubre de 2013')
    expect(formatBanlistDate('2026-09')).toBe('Septiembre de 2026')

    applyLocale('en')

    expect(formatBanlistDate('2026-09-21')).toBe('September 21, 2026')
    expect(formatBanlistDate('2013-10-11')).toBe('October 11, 2013')
    expect(formatBanlistDate('2026-09')).toBe('September 2026')

    applyLocale('es')

    expect(formatBanlistDate('2026-09-21')).toBe('21 de septiembre de 2026')
    expect(formatBanlistDate('2026-09')).toBe('Septiembre de 2026')
  })

  it('una carta sin nombre en los datos se muestra por su id', () => {
    expect(banlistCardName(1)).toBe('1')
  })
})
