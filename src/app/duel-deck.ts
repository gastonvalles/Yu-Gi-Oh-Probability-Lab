/**
 * El deck con el que se juega un duelo cuando no es el del builder (por ejemplo, desde un celular que no tiene ninguno armado):
 * un enlace `ydke://` o el contenido de un archivo `.ydk`. Sólo importan los números de las cartas (los ids de YGOPRODeck): el
 * nombre y el arte se piden aparte. El Side Deck no se usa en un duelo.
 */

export interface DuelDeckCards {
  main: number[]
  extra: number[]
}

/** Topes generosos (un deck real tiene hasta 60 y 15): sólo evitan que un texto enorme llene la memoria. */
const MAX_MAIN = 120
const MAX_EXTRA = 30
const MAX_CARD_ID = 2 ** 32 - 1

const isCardId = (value: number) => Number.isInteger(value) && value > 0 && value <= MAX_CARD_ID

/** Una zona de un enlace YDKE: enteros de 32 bits little-endian en base64 (null si no es base64 válido). */
function decodeYdkeZone(zone: string): number[] | null {
  if (zone === '') {
    return []
  }

  let bytes: string

  try {
    bytes = atob(decodeURIComponent(zone))
  } catch {
    return null
  }

  if (bytes.length % 4 !== 0) {
    return null
  }

  const view = new DataView(Uint8Array.from(bytes, (char) => char.charCodeAt(0)).buffer)
  return Array.from({ length: bytes.length / 4 }, (_, index) => view.getUint32(index * 4, true))
}

function parseYdke(text: string): DuelDeckCards | null {
  const [main, extra] = text.slice('ydke://'.length).split('!')

  if (main === undefined || extra === undefined) {
    return null
  }

  const decodedMain = decodeYdkeZone(main)
  const decodedExtra = decodeYdkeZone(extra)

  return decodedMain && decodedExtra ? { main: decodedMain, extra: decodedExtra } : null
}

/** Un `.ydk`: `#main`, `#extra` y `!side` separan zonas; cada línea es el número de una carta (las que empiezan con `#` o `!` y no son una zona son comentarios). */
function parseYdk(text: string): DuelDeckCards | null {
  const zones: Record<'main' | 'extra' | 'side', number[]> = { main: [], extra: [], side: [] }
  let zone: keyof typeof zones = 'main'

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim().toLowerCase()

    if (line === '') continue
    if (line === '#main') zone = 'main'
    else if (line === '#extra') zone = 'extra'
    else if (line === '!side') zone = 'side'
    else if (/^\d+$/.test(line)) zones[zone].push(Number(line))
    else if (!line.startsWith('#') && !line.startsWith('!')) return null
  }

  return { main: zones.main, extra: zones.extra }
}

/** Las cartas del deck de un texto pegado o de un archivo; `null` si no es un formato conocido, está vacío o tiene números que no son cartas. */
export function parseDuelDeck(text: string): DuelDeckCards | null {
  const trimmed = text.trim()

  if (trimmed === '' || trimmed.length > 100_000) {
    return null
  }

  const deck = trimmed.toLowerCase().startsWith('ydke://') ? parseYdke(trimmed) : parseYdk(trimmed)

  if (!deck || deck.main.length === 0 || deck.main.length > MAX_MAIN || deck.extra.length > MAX_EXTRA) {
    return null
  }

  return [...deck.main, ...deck.extra].every(isCardId) ? deck : null
}

/** Los ids de copia que usa la mesa (`card-14558127-2`): cada número de carta, con su cuenta de copias dentro de la zona. */
export function duelCardIds(cards: readonly number[]): string[] {
  const copies = new Map<number, number>()

  return cards.map((card) => {
    const copy = (copies.get(card) ?? 0) + 1
    copies.set(card, copy)
    return `card-${card}-${copy}`
  })
}
