import { describe, expect, it } from 'vitest'

import { buildGenesysCardInfo } from '../app/genesys-format'
import genesysCardData from '../data/genesys-card-data.json'
import { keepCardImageUrl } from '../ygoprodeck/parser'

const CARDS = genesysCardData.cards as Record<string, number>

// Caracteres que hay que seguir normalizando, por código: así ningún editor los confunde con un espacio o una comilla común.
const char = String.fromCharCode
const NBSP = char(0xa0)
const CURLY_QUOTE = char(0x201c)
const CURLY_APOSTROPHE = char(0x2019)
const EN_DASH = char(0x2013)

// Lo que hacían las dos funciones antes de tener atajo: el atajo tiene que dar siempre lo mismo.
function slowKeepCardImageUrl(url: string | null): string | null {
  if (!url) {
    return null
  }

  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.host === 'images.ygoprodeck.com' ? url : null
  } catch {
    return null
  }
}

function slowGenesysPoints(cardName: string): number | null {
  const points =
    CARDS[
      cardName
        .normalize('NFKD')
        .replace(new RegExp(`[${char(0x2018)}${char(0x2019)}]`, 'g'), "'")
        .replace(new RegExp(`[${char(0x201c)}${char(0x201d)}]`, 'g'), '"')
        .replace(new RegExp(`[${char(0x2010)}-${char(0x2015)}]`, 'g'), '-')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    ]

  return typeof points === 'number' ? points : null
}

function seededRandom(seed: number): () => number {
  let state = seed

  return () => {
    state = (state + 0x6d2b79f5) | 0
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state)
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

describe('keepCardImageUrl: el atajo del CDN', () => {
  it('conserva la URL canónica y sigue descartando todo lo que no es el CDN', () => {
    const canonical = 'https://images.ygoprodeck.com/images/cards_small/14558127.jpg'

    expect(keepCardImageUrl(canonical)).toBe(canonical)
    expect(keepCardImageUrl('https://images.ygoprodeck.com.evil.com/x')).toBeNull()
    expect(keepCardImageUrl('https://images.ygoprodeck.com@evil.example/x')).toBeNull()
    expect(keepCardImageUrl('https://evil.example/https://images.ygoprodeck.com/x')).toBeNull()
    expect(keepCardImageUrl('http://images.ygoprodeck.com/x.jpg')).toBeNull()
    expect(keepCardImageUrl('//images.ygoprodeck.com/x.jpg')).toBeNull()
    expect(keepCardImageUrl('')).toBeNull()
    expect(keepCardImageUrl(null)).toBeNull()
  })

  it('da lo mismo que `new URL` con prefijos y sufijos raros', () => {
    const random = seededRandom(20261014)
    const prefixes = [
      'https://images.ygoprodeck.com/', 'https://images.ygoprodeck.com', 'https://images.ygoprodeck.com:443/', 'https://images.ygoprodeck.com:8080/',
      'https://images.ygoprodeck.com.evil.com/', 'https://images.ygoprodeck.com@evil.example/', 'https://user@images.ygoprodeck.com/',
      'https://images.ygoprodeck.com\\@evil.example/', 'https://images.ygoprodeck.com\\', 'https://images.ygoprodeck.com?', 'https://images.ygoprodeck.com#',
      'HTTPS://IMAGES.YGOPRODECK.COM/', 'https://Images.YgoProDeck.com/', 'http://images.ygoprodeck.com/', 'https:images.ygoprodeck.com/',
      'https:/images.ygoprodeck.com/', ' https://images.ygoprodeck.com/', 'https://images.ygoprodeck.com /', 'https://images.ygoprodeck.com\t/', 'https://evil.example/',
    ]
    const pieces = ['a', '1', '.', '/', '\\', '@', '?', '#', '%', '%zz', ' ', '\t', '\n', ':', '..', '//', char(0xe9), char(0xd800), char(0), 'images/cards/1.jpg']
    const mismatches: string[] = []

    for (let index = 0; index < 5000; index += 1) {
      const suffix = Array.from({ length: Math.floor(random() * 6) }, () => pieces[Math.floor(random() * pieces.length)]).join('')
      const url = prefixes[index % prefixes.length]! + suffix

      if (keepCardImageUrl(url) !== slowKeepCardImageUrl(url)) {
        mismatches.push(url)
      }
    }

    expect(mismatches).toEqual([])
  })
})

describe('nombres de cartas con puntos de Genesys: el atajo ASCII', () => {
  it('comillas tipográficas, guiones largos, espacios raros y dobles se siguen normalizando', () => {
    const key = Object.keys(CARDS).find((name) => name.includes('"') && name.includes(' - '))!
    const points = CARDS[key]

    expect(points).toBeGreaterThanOrEqual(0)
    expect(buildGenesysCardInfo(key).points).toBe(points)
    expect(buildGenesysCardInfo(key.toUpperCase()).points).toBe(points)
    expect(buildGenesysCardInfo(key.replace(/"/g, CURLY_QUOTE).replace(' - ', ` ${EN_DASH} `)).points).toBe(points)
    expect(buildGenesysCardInfo(key.replace(/ /g, NBSP)).points).toBe(points)
    expect(buildGenesysCardInfo(`  ${key.replace(/ /g, '   ')}\n`).points).toBe(points)
    expect(buildGenesysCardInfo('Esta carta no existe').points).toBeNull()
  })

  it('da lo mismo que el camino completo con todos los nombres de los datos y sus variantes', () => {
    const variants = (name: string) => [
      name,
      name.toUpperCase(),
      name.replace(/ /g, '  '),
      ` ${name} `,
      name.replace(/'/g, CURLY_APOSTROPHE).replace(/"/g, CURLY_QUOTE).replace(/-/g, EN_DASH),
      name.replace(/ /g, NBSP),
      name.normalize('NFD'),
      name.replace(/ /g, '\t'),
    ]
    const extras = ['', ' ', 'constructor', '__proto__', 'toString', 'Ash Blossom & Joyous Spring', `${char(0xe9)}${char(0xe8)}`, 'ａｂｃ']
    const mismatches: string[] = []

    for (const name of [...Object.keys(CARDS), ...extras]) {
      for (const variant of variants(name)) {
        if (buildGenesysCardInfo(variant).points !== slowGenesysPoints(variant)) {
          mismatches.push(variant)
        }
      }
    }

    expect(mismatches).toEqual([])
  })
})
