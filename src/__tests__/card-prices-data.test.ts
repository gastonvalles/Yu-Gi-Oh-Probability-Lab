import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { SHARDS, shardOf } from '../../scripts/sync-card-prices.mjs'

const DIR = new URL('../../public/prices/', import.meta.url)
const read = (name: string) => JSON.parse(readFileSync(new URL(name, DIR), 'utf8')) as unknown

interface Index {
  updated: string
  shards: number
  groups: Array<[number, string, string]>
}

type Row = [string, string, string, number | null, number, number]
type Shard = Record<string, Row[]>

describe('public/prices (lo que escribe scripts/sync-card-prices.mjs)', () => {
  const index = read('index.json') as Index
  const shards = Array.from({ length: SHARDS }, (_, n) => read(`cards/${n}.json`) as Shard)

  it('el índice tiene la fecha de la bajada, cuántos archivos por carta hay y los sets ordenados, con fecha de salida o vacía', () => {
    expect(index.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(index.shards).toBe(SHARDS)
    expect(index.groups.length).toBeGreaterThan(400)
    expect(index.groups.map(([id]) => id)).toEqual([...index.groups.map(([id]) => id)].sort((a, b) => a - b))

    for (const [id, name, published] of index.groups) {
      expect(Number.isInteger(id)).toBe(true)
      expect(name).not.toBe('')
      expect(published === '' || /^\d{4}-\d{2}-\d{2}$/.test(published)).toBe(true)
    }
  })

  it('están los archivos por carta (0 a 255) y el índice, y no sobra nada', () => {
    expect(readdirSync(DIR).sort()).toEqual(['cards', 'index.json'])
    expect(readdirSync(new URL('cards/', DIR)).sort()).toEqual(Array.from({ length: SHARDS }, (_, n) => `${n}.json`).sort())
  })

  it('cada carta está en el archivo que le toca y sus filas son [código, rareza, edición, mercado, producto, set], de un set del índice y en orden', () => {
    const groupIds = new Set(index.groups.map(([id]) => id))
    // Son más de 100.000 filas: se juntan los problemas y se comprueba una sola vez (un `expect` por campo tardaría minutos).
    const problems: string[] = []
    let cards = 0

    shards.forEach((shard, n) => {
      for (const [id, rows] of Object.entries(shard)) {
        cards += 1

        if (shardOf(Number(id)) !== n) problems.push(`carta ${id} en el archivo ${n}`)
        if (rows.length === 0) problems.push(`carta ${id} sin filas`)

        for (const [code, rarity, edition, market, productId, groupId] of rows) {
          const valid =
            code !== '' &&
            typeof rarity === 'string' &&
            typeof edition === 'string' &&
            (market === null || market >= 0) &&
            Number.isInteger(productId) &&
            groupIds.has(groupId)

          if (!valid) problems.push(`carta ${id}: fila ${JSON.stringify([code, rarity, edition, market, productId, groupId])}`)
        }

        if (rows.some((row, i) => i > 0 && row[5] < rows[i - 1]![5])) problems.push(`carta ${id}: filas fuera de orden`)
      }
    })

    expect(problems.slice(0, 5)).toEqual([])
    // Hoy hay precio de unas 14.000 cartas.
    expect(cards).toBeGreaterThan(10_000)
  })

  it('todos los sets del índice se usan en alguna carta, y los archivos son livianos (una carta por línea)', () => {
    const used = new Set<number>()

    for (const shard of shards) {
      for (const rows of Object.values(shard)) rows.forEach((row) => used.add(row[5]))
    }

    expect([...used].sort((a, b) => a - b)).toEqual(index.groups.map(([id]) => id))

    for (let n = 0; n < SHARDS; n += 1) {
      expect(readFileSync(new URL(`cards/${n}.json`, DIR), 'utf8').length).toBeLessThan(60_000)
    }
  })
})
