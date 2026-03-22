import type { AppState } from './model'

export interface ImportedDeckEntry {
  zone: 'main' | 'extra' | 'side'
  name: string
  count: number
}

export interface DecklistTextAssessment {
  parsedEntries: ImportedDeckEntry[]
  quality: 'good' | 'uncertain' | 'poor'
  likelyDeckGridScreenshot: boolean
  message: string | null
}

export function exportYdk(state: AppState): string {
  const lines = [
    '#created by YGO Probability Lab',
    '#main',
    ...state.deckBuilder.main.map((card) => String(card.apiCard.ygoprodeckId)),
    '#extra',
    ...state.deckBuilder.extra.map((card) => String(card.apiCard.ygoprodeckId)),
    '!side',
    ...state.deckBuilder.side.map((card) => String(card.apiCard.ygoprodeckId)),
  ]

  return lines.join('\n')
}

export function parseYdk(text: string): { main: number[]; extra: number[]; side: number[] } {
  const zones = {
    main: [] as number[],
    extra: [] as number[],
    side: [] as number[],
  }
  let currentZone: keyof typeof zones = 'main'

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (line.length === 0 || line.startsWith('#created')) {
      continue
    }

    if (line === '#main') {
      currentZone = 'main'
      continue
    }

    if (line === '#extra') {
      currentZone = 'extra'
      continue
    }

    if (line === '!side') {
      currentZone = 'side'
      continue
    }

    const parsedValue = Number.parseInt(line, 10)

    if (Number.isInteger(parsedValue) && parsedValue > 0) {
      zones[currentZone].push(parsedValue)
    }
  }

  return zones
}

export function parseDecklistText(text: string): ImportedDeckEntry[] {
  const rawEntries: ImportedDeckEntry[] = []
  let currentZone: ImportedDeckEntry['zone'] = 'main'

  for (const rawLine of text.split(/\r?\n/)) {
    const normalizedLine = rawLine
      .replace(/[|•·]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (normalizedLine.length === 0) {
      continue
    }

    const lowerLine = normalizedLine.toLowerCase()

    if (lowerLine.includes('main deck')) {
      currentZone = 'main'
      continue
    }

    if (lowerLine.includes('extra deck')) {
      currentZone = 'extra'
      continue
    }

    if (lowerLine.includes('side deck')) {
      currentZone = 'side'
      continue
    }

    const parsedEntry = parseDecklistLine(normalizedLine, currentZone)

    if (!parsedEntry) {
      continue
    }

    rawEntries.push(parsedEntry)
  }

  const aggregatedEntries = new Map<string, ImportedDeckEntry>()

  for (const entry of rawEntries) {
    const key = `${entry.zone}:${entry.name.toLowerCase()}`
    const existingEntry = aggregatedEntries.get(key)

    if (existingEntry) {
      existingEntry.count += entry.count
      continue
    }

    aggregatedEntries.set(key, { ...entry })
  }

  return [...aggregatedEntries.values()]
}

export function assessDecklistText(text: string): DecklistTextAssessment {
  const parsedEntries = parseDecklistText(text)
  const normalizedLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const noisyLines = normalizedLines.filter(isLikelyNoiseLine).length
  const hasDeckBuilderNoise = /(cardmarket|tcgplayer|coolstuff|€|\$)/i.test(text)
  const likelyDeckGridScreenshot =
    parsedEntries.length < 4 &&
    (hasDeckBuilderNoise || (normalizedLines.length > 0 && noisyLines / normalizedLines.length > 0.45))

  if (parsedEntries.length === 0) {
    return {
      parsedEntries,
      quality: 'poor',
      likelyDeckGridScreenshot,
      message: likelyDeckGridScreenshot
        ? 'La captura parece una grilla de cartas del deck builder. Este importador hoy funciona con listas en texto o capturas donde los nombres se leen bien.'
        : 'No pude detectar una lista legible. Probá con una captura de texto más nítida o pegá la lista manualmente.',
    }
  }

  if (likelyDeckGridScreenshot || noisyLines > normalizedLines.length / 3) {
    return {
      parsedEntries,
      quality: 'uncertain',
      likelyDeckGridScreenshot,
      message:
        'La lectura salió dudosa. Revisá el texto antes de cargarlo. Si la captura es una grilla de cartas, lo más probable es que este importador no la resuelva bien.',
    }
  }

  return {
    parsedEntries,
    quality: 'good',
    likelyDeckGridScreenshot: false,
    message: null,
  }
}

function parseDecklistLine(
  line: string,
  zone: ImportedDeckEntry['zone'],
): ImportedDeckEntry | null {
  const pureNumber = Number.parseInt(line, 10)

  if (String(pureNumber) === line) {
    return null
  }

  const prefixMatch = line.match(/^(\d+)\s*[xX]?\s+(.+)$/)

  if (prefixMatch) {
    const count = Number.parseInt(prefixMatch[1] ?? '1', 10)
    const name = cleanupDeckEntryName(prefixMatch[2] ?? '')

    if (name) {
      return { zone, name, count: clampDeckEntryCount(count) }
    }
  }

  const suffixMatch = line.match(/^(.+?)\s*[xX]\s*(\d+)$/)

  if (suffixMatch) {
    const count = Number.parseInt(suffixMatch[2] ?? '1', 10)
    const name = cleanupDeckEntryName(suffixMatch[1] ?? '')

    if (name) {
      return { zone, name, count: clampDeckEntryCount(count) }
    }
  }

  const fallbackName = cleanupDeckEntryName(line)

  if (!fallbackName) {
    return null
  }

  return {
    zone,
    name: fallbackName,
    count: 1,
  }
}

function cleanupDeckEntryName(value: string): string {
  const cleanedValue = value
    .replace(/\[[^\]]*]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/[^A-Za-z0-9!&'":+\-./\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleanedValue.length < 2) {
    return ''
  }

  if (/^(monster|spell|trap|card|main|extra|side)$/i.test(cleanedValue)) {
    return ''
  }

  if (isLikelyNoiseLine(cleanedValue)) {
    return ''
  }

  return cleanedValue
}

function clampDeckEntryCount(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    return 1
  }

  return Math.min(value, 3)
}

function isLikelyNoiseLine(value: string): boolean {
  const normalizedValue = value.trim()

  if (normalizedValue.length < 2) {
    return true
  }

  if (/(cardmarket|tcgplayer|coolstuff)/i.test(normalizedValue)) {
    return true
  }

  const tokens = normalizedValue.split(/\s+/)
  const shortTokenCount = tokens.filter((token) => token.length <= 2).length
  const letters = normalizedValue.match(/[A-Za-z]/g)?.length ?? 0
  const digits = normalizedValue.match(/\d/g)?.length ?? 0
  const punctuation = normalizedValue.match(/[^A-Za-z0-9\s]/g)?.length ?? 0

  if (letters < 2) {
    return true
  }

  if (digits > letters && !/\b(?:2|3)\b/.test(normalizedValue)) {
    return true
  }

  if (punctuation > Math.max(3, Math.floor(letters / 2))) {
    return true
  }

  if (tokens.length >= 3 && shortTokenCount / tokens.length > 0.6) {
    return true
  }

  if (/^[A-Z0-9\s]+$/.test(normalizedValue) && !normalizedValue.includes(' ')) {
    return true
  }

  return false
}
