import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { SHARDS, shardOf } from '../../scripts/sync-card-prices.mjs'

// Las filas de un set: [código, rareza, edición, mercado, producto, id de la carta, nombre de la carta].
type SetRow = [string, string, string, number | null, number, number, string, string?]

const DIR = new URL('../../public/prices/', import.meta.url)
const read = (name: string) => JSON.parse(readFileSync(new URL(name, DIR), 'utf8')) as unknown

interface Index {
  updated: string
  shards: number
  groups: Array<[number, string, string, number, string]>
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

    for (const [id, name, published, count, code] of index.groups) {
      expect(Number.isInteger(id)).toBe(true)
      expect(name).not.toBe('')
      expect(published === '' || /^\d{4}-\d{2}-\d{2}$/.test(published)).toBe(true)
      expect(Number.isInteger(count) && count > 0).toBe(true)
      // El prefijo de los códigos del set: es el nombre de la imagen de su sobre.
      expect(code).toMatch(/^[A-Za-z0-9]+$/)
    }
  })

  it('están los archivos por carta (0 a 255), los de cada set y el índice, y no sobra nada', () => {
    expect(readdirSync(DIR).sort()).toEqual(['cards', 'index.json', 'sets'])
    expect(readdirSync(new URL('sets/', DIR)).sort()).toEqual(index.groups.map(([id]) => `${id}.json`).sort())
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
  }, 60_000)

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

describe('public/prices/sets (las mismas impresiones, vistas por expansión)', () => {
  const index = read('index.json') as Index

  it('cada set trae las impresiones que dice el índice, ordenadas por código, con la carta y su nombre', () => {
    const problems: string[] = []
    let total = 0

    for (const [id, , , count, code] of index.groups) {
      const rows = read(`sets/${id}.json`) as SetRow[]

      total += rows.length
      if (!rows.some((row) => row[0].startsWith(`${code}-`))) problems.push(`set ${id}: ninguna fila lleva el prefijo ${code}`)
      if (rows.length !== count) problems.push(`set ${id}: ${rows.length} filas y el índice dice ${count}`)

      rows.forEach(([code, rarity, edition, market, productId, cardId, name], i) => {
        const valid = code !== '' && typeof rarity === 'string' && typeof edition === 'string' && (market === null || market >= 0) && Number.isInteger(productId) && Number.isInteger(cardId) && name !== ''

        if (!valid) problems.push(`set ${id}: fila ${JSON.stringify(rows[i])}`)
        if (i > 0 && code < rows[i - 1]![0]) problems.push(`set ${id}: fuera de orden en ${code}`)
        // De qué arte es (sólo si es distinto): nunca un texto vacío, que ocuparía lugar sin decir nada.
        if (rows[i]!.length > 7 && (typeof rows[i]![7] !== 'string' || rows[i]![7] === '')) problems.push(`set ${id}: arte vacío en ${code}`)
      })
    }

    expect(problems.slice(0, 5)).toEqual([])
    // Es lo mismo que está en los archivos por carta, visto desde el otro lado.
    expect(total).toBeGreaterThan(50_000)
  }, 60_000)

  it('cada impresión de un set está también en el archivo de su carta, y al revés', () => {
    const fromSets = new Set<string>()
    const fromCards = new Set<string>()

    for (const [id] of index.groups) {
      for (const [code, rarity, edition, , productId, cardId] of read(`sets/${id}.json`) as SetRow[]) fromSets.add(`${id}|${cardId}|${code}|${rarity}|${edition}|${productId}`)
    }

    for (let n = 0; n < SHARDS; n += 1) {
      for (const [cardId, rows] of Object.entries(read(`cards/${n}.json`) as Shard)) {
        for (const [code, rarity, edition, , productId, groupId] of rows) fromCards.add(`${groupId}|${cardId}|${code}|${rarity}|${edition}|${productId}`)
      }
    }

    expect(fromSets.size).toBe(fromCards.size)
    expect([...fromSets].filter((key) => !fromCards.has(key)).slice(0, 5)).toEqual([])
  }, 60_000)
})

describe('public/prices: el arte de cada impresión (overframe, extended art, alternativas)', () => {
  it('las impresiones de arte distinto traen su nombre al final, en los archivos por set y por carta', () => {
    // Magnificent Monsters: Dark Magical Curtain (MAMO-EN003) salió en arte normal y en arte extendido, que son productos distintos en TCGplayer.
    const rows = read('sets/24707.json') as SetRow[]
    const curtain = rows.filter((row) => row[0] === 'MAMO-EN003')

    expect(curtain.some((row) => row[7] === 'Extended Art')).toBe(true)
    expect(curtain.some((row) => row.length === 7)).toBe(true)

    const cardId = curtain[0]![5]
    const shard = read(`cards/${shardOf(cardId)}.json`) as Shard

    expect(shard[String(cardId)]!.some((row) => (row as unknown[])[6] === 'Extended Art')).toBe(true)
  })

  it('hay muchas impresiones con arte distinto en total', () => {
    let withVariant = 0

    for (const [id] of (read('index.json') as Index).groups) {
      for (const row of read(`sets/${id}.json`) as SetRow[]) if (row[7]) withVariant += 1
    }

    // Hoy son unas 1.600 (colores de Duel Terminal, Alternate Art, Extended Art, sellos...).
    expect(withVariant).toBeGreaterThan(500)
  }, 60_000)
})
