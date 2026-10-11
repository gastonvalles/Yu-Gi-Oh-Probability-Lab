import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const DIR = new URL('../../public/prices/', import.meta.url)
const read = (name: string) => JSON.parse(readFileSync(new URL(name, DIR), 'utf8')) as unknown

interface Index {
  updated: string
  groups: Array<[number, string, string, string]>
}

describe('public/prices (lo que escribe scripts/sync-card-prices.mjs)', () => {
  const index = read('index.json') as Index

  it('el índice tiene la fecha de la bajada y los sets ordenados, con fecha de salida o vacía', () => {
    expect(index.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(index.groups.length).toBeGreaterThan(400)
    expect(index.groups.map(([id]) => id)).toEqual([...index.groups.map(([id]) => id)].sort((a, b) => a - b))

    for (const [id, name, abbreviation, published] of index.groups) {
      expect(Number.isInteger(id)).toBe(true)
      expect(name).not.toBe('')
      expect(typeof abbreviation).toBe('string')
      expect(published === '' || /^\d{4}-\d{2}-\d{2}$/.test(published)).toBe(true)
    }
  })

  it('cada set del índice tiene su archivo y no sobra ninguno', () => {
    const files = readdirSync(DIR).filter((name) => name !== 'index.json')

    expect(files.sort()).toEqual(index.groups.map(([id]) => `${id}.json`).sort())
  })

  it('las filas son [código, rareza, edición, mercado, mínimo, id de producto], con algún precio y en orden', () => {
    for (const [id] of index.groups.slice(0, 40)) {
      const { rows } = read(`${id}.json`) as { rows: Array<[string, string, string, number | null, number | null, number]> }

      expect(rows.length).toBeGreaterThan(0)

      for (const [code, rarity, edition, market, low, productId] of rows) {
        expect(code).not.toBe('')
        expect(typeof rarity).toBe('string')
        expect(typeof edition).toBe('string')
        expect(market === null || market >= 0).toBe(true)
        expect(low === null || low >= 0).toBe(true)
        expect(market !== null || low !== null).toBe(true)
        expect(Number.isInteger(productId)).toBe(true)
      }

      expect(rows.map((row) => row[0])).toEqual([...rows.map((row) => row[0])].sort((a, b) => a.localeCompare(b)))
    }
  })
})
