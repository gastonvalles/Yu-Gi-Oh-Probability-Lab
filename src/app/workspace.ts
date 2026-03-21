import { buildCalculatorState, deriveMainDeckCardsFromZone } from './deck-utils'
import type { PortableConfig, DeckCardInstance } from './model'
import { createId } from './utils'
import { calculateProbabilities } from '../probability'
import type { AppState } from './model'

export interface WorkspaceSnapshot {
  id: string
  name: string
  savedAt: number
  config: PortableConfig
}

export interface SnapshotComparison {
  snapshotName: string
  savedAt: number
  currentProbability: number | null
  snapshotProbability: number | null
  deltaProbability: number | null
  currentDeckSize: number
  snapshotDeckSize: number
  deckChanges: string[]
}

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

const SNAPSHOTS_STORAGE_KEY = 'ygo-probability-lab:snapshots:v1'

export function serializePortableConfig(config: PortableConfig): string {
  return JSON.stringify(config, null, 2)
}

export function buildSharePayload(config: PortableConfig): string {
  const jsonPayload = JSON.stringify(config)
  const bytes = new TextEncoder().encode(jsonPayload)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function buildShareUrl(config: PortableConfig): string {
  const sharePayload = buildSharePayload(config)
  return `${window.location.origin}${window.location.pathname}#share=${sharePayload}`
}

export function parseSharePayload(value: string): PortableConfig {
  const normalizedValue = value.trim().replace(/^.*#share=/, '').replace(/^share=/, '')
  const paddedValue = normalizedValue.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(normalizedValue.length / 4) * 4, '=')
  const binary = atob(paddedValue)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const jsonPayload = new TextDecoder().decode(bytes)

  return JSON.parse(jsonPayload) as PortableConfig
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

export function loadSnapshots(): WorkspaceSnapshot[] {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_STORAGE_KEY)

    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as unknown

    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.flatMap((entry) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        typeof entry.id !== 'string' ||
        typeof entry.name !== 'string' ||
        typeof entry.savedAt !== 'number' ||
        typeof entry.config !== 'object' ||
        entry.config === null
      ) {
        return []
      }

      return [
        {
          id: entry.id,
          name: entry.name,
          savedAt: entry.savedAt,
          config: entry.config as PortableConfig,
        },
      ]
    })
  } catch {
    return []
  }
}

export function saveSnapshots(snapshots: WorkspaceSnapshot[]): void {
  try {
    localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots))
  } catch {
    return
  }
}

export function createSnapshot(name: string, config: PortableConfig): WorkspaceSnapshot {
  return {
    id: createId('snapshot'),
    name: name.trim() || 'Snapshot',
    savedAt: Date.now(),
    config,
  }
}

export function buildSnapshotComparison(currentState: AppState, snapshotState: AppState, snapshotName: string, savedAt: number): SnapshotComparison {
  const currentSummary = calculateStateProbability(currentState)
  const snapshotSummary = calculateStateProbability(snapshotState)

  return {
    snapshotName,
    savedAt,
    currentProbability: currentSummary,
    snapshotProbability: snapshotSummary,
    deltaProbability:
      currentSummary === null || snapshotSummary === null ? null : currentSummary - snapshotSummary,
    currentDeckSize: currentState.deckBuilder.main.length,
    snapshotDeckSize: snapshotState.deckBuilder.main.length,
    deckChanges: buildDeckChanges(currentState.deckBuilder.main, snapshotState.deckBuilder.main),
  }
}

function calculateStateProbability(state: AppState): number | null {
  const derivedCards = deriveMainDeckCardsFromZone(state.deckBuilder.main)
  const result = calculateProbabilities(
    buildCalculatorState(derivedCards, {
      handSize: state.handSize,
      patterns: state.patterns,
    }),
  )

  return result.summary?.totalProbability ?? null
}

function buildDeckChanges(currentCards: DeckCardInstance[], snapshotCards: DeckCardInstance[]): string[] {
  const currentCounts = countCardsByName(currentCards)
  const snapshotCounts = countCardsByName(snapshotCards)
  const allCardNames = new Set([...currentCounts.keys(), ...snapshotCounts.keys()])
  const changes: string[] = []

  for (const cardName of [...allCardNames].sort((left, right) => left.localeCompare(right))) {
    const currentCopies = currentCounts.get(cardName) ?? 0
    const snapshotCopies = snapshotCounts.get(cardName) ?? 0
    const delta = currentCopies - snapshotCopies

    if (delta === 0) {
      continue
    }

    changes.push(`${delta > 0 ? '+' : ''}${delta} ${cardName}`)
  }

  return changes
}

function countCardsByName(cards: DeckCardInstance[]): Map<string, number> {
  const counts = new Map<string, number>()

  for (const card of cards) {
    counts.set(card.name, (counts.get(card.name) ?? 0) + 1)
  }

  return counts
}
