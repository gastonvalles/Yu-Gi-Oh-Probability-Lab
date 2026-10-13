import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface Data {
  fetchedAt: string
  cards: Record<string, string>
  lists: Array<{ region: string; date: string; forbidden: number[]; limited: number[]; semiLimited: number[] }>
}

const data = JSON.parse(readFileSync(new URL('../data/banlists.json', import.meta.url), 'utf8')) as Data

describe('src/data/banlists.json (lo que escribe scripts/sync-banlists.mjs)', () => {
  it('trae la fecha de la bajada y las listas del TCG y del OCG, las más viejas primero dentro de cada región', () => {
    expect(data.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    for (const region of ['tcg', 'ocg']) {
      const dates = data.lists.filter((list) => list.region === region).map((list) => list.date)

      // Hoy son 52 por región (TCG desde septiembre de 2011, OCG desde septiembre de 2013).
      expect(dates.length).toBeGreaterThan(40)
      expect(dates).toEqual([...dates].sort())
      expect(new Set(dates).size).toBe(dates.length)
      expect(dates.every((date) => /^\d{4}-\d{2}(-\d{2})?$/.test(date))).toBe(true)
    }

    expect(new Set(data.lists.map((list) => list.region))).toEqual(new Set(['tcg', 'ocg']))
  })

  it('cada lista trae el día exacto en que entró en vigencia (de Yugipedia): las nuevas pueden tener sólo el mes hasta que su página exista', () => {
    const monthOnly = data.lists.filter((list) => list.date.length === 7)

    // Como mucho la lista de este mes puede estar sin día; el resto, con el de los anuncios de Konami.
    expect(monthOnly.length).toBeLessThanOrEqual(2)

    const day = (region: string, month: string) => data.lists.find((list) => list.region === region && list.date.startsWith(month))?.date

    expect(day('tcg', '2026-09')).toBe('2026-09-21')
    expect(day('tcg', '2026-05')).toBe('2026-05-18')
    expect(day('tcg', '2022-02')).toBe('2022-02-07')
    expect(day('tcg', '2013-10')).toBe('2013-10-11')
    expect(day('ocg', '2026-10')).toBe('2026-10-01')
    expect(day('ocg', '2014-02')).toBe('2014-02-01')
  })

  it('cada carta está en una sola sección de su lista, sin repetirse y en orden, y todas tienen nombre', () => {
    const problems: string[] = []

    for (const list of data.lists) {
      const all = [...list.forbidden, ...list.limited, ...list.semiLimited]

      if (new Set(all).size !== all.length) problems.push(`${list.region} ${list.date}: carta en dos secciones o repetida`)

      for (const section of [list.forbidden, list.limited, list.semiLimited]) {
        if (section.some((id, i) => !Number.isInteger(id) || (i > 0 && id <= section[i - 1]!))) problems.push(`${list.region} ${list.date}: ids fuera de orden`)
      }

      for (const id of all) {
        if (!data.cards[String(id)]) problems.push(`${list.region} ${list.date}: la carta ${id} no tiene nombre`)
      }
    }

    expect(problems.slice(0, 5)).toEqual([])
  })

  it('los nombres son sólo de cartas que están en alguna lista', () => {
    const used = new Set(data.lists.flatMap((list) => [...list.forbidden, ...list.limited, ...list.semiLimited]).map(String))

    expect(Object.keys(data.cards).filter((id) => !used.has(id))).toEqual([])
    expect(Object.values(data.cards).every((name) => name.trim() !== '')).toBe(true)
  })

  it('las listas son completas: la última del TCG tiene más de cien prohibidas y la del OCG también', () => {
    for (const region of ['tcg', 'ocg']) {
      const last = data.lists.filter((list) => list.region === region).at(-1)!

      expect(last.forbidden.length).toBeGreaterThan(80)
      expect(last.limited.length).toBeGreaterThan(50)
    }
  })
})
