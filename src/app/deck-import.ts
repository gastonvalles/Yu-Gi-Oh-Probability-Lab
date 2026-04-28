import type { DeckFormat } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { fromPortableConfig } from './app-state-codec'
import { classifyCard, normalizeCardNameForLookup } from './classification-engine'
import { getClassificationOverrides } from './classification-overrides'
import { addSearchResultToZone, getAddSearchResultIssue } from './deck-builder'
import type { AppState, DeckBuilderState, DeckZone, PortableConfig } from './model'
import { createInitialState } from './model'
import { isRecord, normalizeSearchText } from './utils'

const DECK_ZONES: DeckZone[] = ['main', 'extra', 'side']

export type DeckImportSourceKind = 'json' | 'text' | 'txt' | 'ydk'

export interface DeckImportSource {
  fileName: string | null
  kind: DeckImportSourceKind
  label: string
}

export interface ImportedDeckEntry {
  zone: DeckZone
  name: string
  count: number
}

export interface ParsedImportedDeckEntry extends ImportedDeckEntry {
  lineNumber: number
  rawLine: string
}

export interface ImportedDeckInvalidLine {
  lineNumber: number
  rawLine: string
  reason: string
}

export interface DecklistTextAssessment {
  parsedEntries: ImportedDeckEntry[]
  quality: 'good' | 'uncertain' | 'poor'
  likelyDeckGridScreenshot: boolean
  message: string | null
}

export interface ResolvedImportedDeckEntry extends ImportedDeckEntry {
  appliedCount: number
  card: ApiCardSearchResult
}

export interface DeckImportConflict extends ImportedDeckEntry {
  reason: string
}

export interface DeckImportPreview {
  source: DeckImportSource
  parsedEntries: ImportedDeckEntry[]
  invalidLines: ImportedDeckInvalidLine[]
  resolvedEntries: ResolvedImportedDeckEntry[]
  missingEntries: ImportedDeckEntry[]
  conflicts: DeckImportConflict[]
  importedDeck: DeckBuilderState
  requestedTotals: Record<DeckZone, number>
  importedTotals: Record<DeckZone, number>
  requestedCardCount: number
  importedCardCount: number
}

interface ParsedDecklistDetails {
  entries: ParsedImportedDeckEntry[]
  invalidLines: ImportedDeckInvalidLine[]
}

interface DeckImportBuildOptions {
  deckFormat: DeckFormat
  deckName: string
  cards: ApiCardSearchResult[]
  source?: Partial<DeckImportSource>
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

export function getDeckImportFileKind(fileName: string): DeckImportSourceKind | null {
  const normalizedFileName = fileName.trim().toLowerCase()

  if (normalizedFileName.endsWith('.txt')) {
    return 'txt'
  }

  if (normalizedFileName.endsWith('.json')) {
    return 'json'
  }

  if (normalizedFileName.endsWith('.ydk')) {
    return 'ydk'
  }

  return null
}

export function parseDecklistText(text: string): ImportedDeckEntry[] {
  return aggregateImportedDeckEntries(parseDecklistTextDetails(text).entries)
}

export function assessDecklistText(text: string): DecklistTextAssessment {
  const { entries, invalidLines } = parseDecklistTextDetails(text)
  const parsedEntries = aggregateImportedDeckEntries(entries)
  const normalizedLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const noisyLines = invalidLines.length + normalizedLines.filter(isLikelyNoiseLine).length
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

export function buildDeckImportPreview(options: DeckImportBuildOptions & { text: string }): DeckImportPreview {
  const { cards, deckFormat, deckName, text } = options
  const { entries, invalidLines } = parseDecklistTextDetails(text)
  const parsedEntries = aggregateImportedDeckEntries(entries)
  const cardIndex = buildDeckImportCardIndex(cards)

  return buildDeckImportPreviewFromResolvedEntries({
    parsedEntries,
    invalidLines,
    source: resolveDeckImportSource(options.source, 'text'),
    resolver: (entry, importedDeck) => {
      const matchedCard = cardIndex.get(normalizeImportedCardName(entry.name))

      if (!matchedCard) {
        return { type: 'missing', entry }
      }

      const nextDeckBuilder = appendResolvedEntryCopies({
        entry,
        importedDeck,
        matchedCard,
        deckFormat,
      })

      return {
        type: 'resolved',
        importedDeck: nextDeckBuilder.deckBuilder,
        resolvedEntry: {
          ...entry,
          appliedCount: nextDeckBuilder.appliedCount,
          card: matchedCard,
        },
        conflicts: nextDeckBuilder.conflicts,
      }
    },
    deckName,
  })
}

export function buildDeckImportPreviewFromYdk(
  options: DeckImportBuildOptions & { text: string },
): DeckImportPreview {
  const { cards, deckFormat, deckName, text } = options
  const parsedYdk = parseYdk(text)
  const cardsById = buildCardsByIdIndex(cards)
  const rawEntries: ImportedDeckEntry[] = []

  for (const zone of DECK_ZONES) {
    for (const cardId of parsedYdk[zone]) {
      rawEntries.push({
        zone,
        name: cardsById.get(cardId)?.name ?? `ID ${cardId}`,
        count: 1,
      })
    }
  }

  const parsedEntries = aggregateImportedDeckEntries(rawEntries)

  return buildDeckImportPreviewFromResolvedEntries({
    parsedEntries,
    invalidLines: [],
    source: resolveDeckImportSource(options.source, 'ydk'),
    resolver: (entry, importedDeck) => {
      const matchedCard = findCardByImportedName(cardsById, entry.name)

      if (!matchedCard) {
        return { type: 'missing', entry }
      }

      const nextDeckBuilder = appendResolvedEntryCopies({
        entry,
        importedDeck,
        matchedCard,
        deckFormat,
      })

      return {
        type: 'resolved',
        importedDeck: nextDeckBuilder.deckBuilder,
        resolvedEntry: {
          ...entry,
          appliedCount: nextDeckBuilder.appliedCount,
          card: matchedCard,
        },
        conflicts: nextDeckBuilder.conflicts,
      }
    },
    deckName,
  })
}

export function buildDeckImportPreviewFromJson(options: {
  deckName: string
  source?: Partial<DeckImportSource>
  text: string
}): DeckImportPreview {
  let parsedValue: unknown

  try {
    parsedValue = JSON.parse(options.text)
  } catch {
    throw new Error('El archivo JSON no es válido.')
  }

  const importedDeck = parseDeckBuilderFromImportedJson(parsedValue, options.deckName)

  return buildDeckImportPreviewFromDeckBuilder({
    deckBuilder: importedDeck,
    source: resolveDeckImportSource(options.source, 'json'),
  })
}

export function buildDeckImportPreviewFromDeckBuilder(options: {
  deckBuilder: DeckBuilderState
  source?: Partial<DeckImportSource>
}): DeckImportPreview {
  const importedDeck = cloneDeckBuilderForImport(options.deckBuilder)
  const overrides = getClassificationOverrides()

  for (const zone of DECK_ZONES) {
    for (const card of importedDeck[zone]) {
      if (card.origin !== null || card.roles.length > 0) {
        card.needsReview = false
      } else {
        const suggestion = classifyCard(card.apiCard, card.name, overrides)
        const hasOverride = overrides.has(normalizeCardNameForLookup(card.name))
        card.origin = suggestion.origin
        card.roles = [...suggestion.roles]
        card.needsReview = !hasOverride
      }
    }
  }

  const resolvedEntries = buildResolvedEntriesFromDeckBuilder(importedDeck)
  const parsedEntries = resolvedEntries.map<ImportedDeckEntry>((entry) => ({
    zone: entry.zone,
    name: entry.name,
    count: entry.count,
  }))

  return finalizeDeckImportPreview({
    source: resolveDeckImportSource(options.source, 'json'),
    parsedEntries,
    invalidLines: [],
    resolvedEntries,
    missingEntries: [],
    conflicts: [],
    importedDeck,
  })
}

function buildDeckImportPreviewFromResolvedEntries(options: {
  deckName: string
  invalidLines: ImportedDeckInvalidLine[]
  parsedEntries: ImportedDeckEntry[]
  resolver: (
    entry: ImportedDeckEntry,
    importedDeck: DeckBuilderState,
  ) =>
    | { type: 'missing'; entry: ImportedDeckEntry }
    | {
        type: 'resolved'
        importedDeck: DeckBuilderState
        resolvedEntry: ResolvedImportedDeckEntry
        conflicts: DeckImportConflict[]
      }
  source: DeckImportSource
}): DeckImportPreview {
  const resolvedEntries: ResolvedImportedDeckEntry[] = []
  const missingEntries: ImportedDeckEntry[] = []
  const conflictMap = new Map<string, DeckImportConflict>()
  let importedDeck = createEmptyImportedDeck(options.deckName)

  for (const entry of options.parsedEntries) {
    const resolution = options.resolver(entry, importedDeck)

    if (resolution.type === 'missing') {
      missingEntries.push(resolution.entry)
      continue
    }

    importedDeck = resolution.importedDeck
    resolvedEntries.push(resolution.resolvedEntry)

    for (const conflict of resolution.conflicts) {
      appendDeckImportConflict(conflictMap, conflict, conflict.reason)
    }
  }

  return finalizeDeckImportPreview({
    source: options.source,
    parsedEntries: options.parsedEntries,
    invalidLines: options.invalidLines,
    resolvedEntries,
    missingEntries,
    conflicts: [...conflictMap.values()],
    importedDeck,
  })
}

function finalizeDeckImportPreview(options: {
  source: DeckImportSource
  parsedEntries: ImportedDeckEntry[]
  invalidLines: ImportedDeckInvalidLine[]
  resolvedEntries: ResolvedImportedDeckEntry[]
  missingEntries: ImportedDeckEntry[]
  conflicts: DeckImportConflict[]
  importedDeck: DeckBuilderState
}): DeckImportPreview {
  return {
    source: options.source,
    parsedEntries: options.parsedEntries,
    invalidLines: options.invalidLines,
    resolvedEntries: options.resolvedEntries,
    missingEntries: options.missingEntries,
    conflicts: options.conflicts,
    importedDeck: options.importedDeck,
    requestedTotals: buildDeckZoneTotalsFromEntries(options.parsedEntries),
    importedTotals: buildDeckZoneTotalsFromDeck(options.importedDeck),
    requestedCardCount: options.parsedEntries.reduce((total, entry) => total + entry.count, 0),
    importedCardCount:
      options.importedDeck.main.length + options.importedDeck.extra.length + options.importedDeck.side.length,
  }
}

function appendResolvedEntryCopies(options: {
  entry: ImportedDeckEntry
  importedDeck: DeckBuilderState
  matchedCard: ApiCardSearchResult
  deckFormat: DeckFormat
}): { deckBuilder: DeckBuilderState; appliedCount: number; conflicts: DeckImportConflict[] } {
  const { entry, importedDeck, matchedCard, deckFormat } = options
  let nextDeckBuilder = importedDeck
  let appliedCount = 0
  const conflicts: DeckImportConflict[] = []

  for (let copyIndex = 0; copyIndex < entry.count; copyIndex += 1) {
    const issue = getAddSearchResultIssue(nextDeckBuilder, matchedCard, entry.zone, deckFormat)

    if (issue) {
      conflicts.push({
        zone: entry.zone,
        name: matchedCard.name,
        count: 1,
        reason: issue,
      })
      continue
    }

    nextDeckBuilder = addSearchResultToZone(
      nextDeckBuilder,
      [matchedCard],
      matchedCard.ygoprodeckId,
      entry.zone,
      nextDeckBuilder[entry.zone].length,
      deckFormat,
      getClassificationOverrides(),
    )
    appliedCount += 1
  }

  return {
    deckBuilder: nextDeckBuilder,
    appliedCount,
    conflicts,
  }
}

function parseDeckBuilderFromImportedJson(
  value: unknown,
  fallbackDeckName: string,
): DeckBuilderState {
  if (isRecord(value) && isRecord(value.deckBuilder)) {
    try {
      return fromPortableConfig(value).deckBuilder
    } catch {
      return fromPortableConfig(
        buildPortableConfigFromDeckBuilderRecord(value.deckBuilder, fallbackDeckName),
      ).deckBuilder
    }
  }

  if (isRecord(value) && ('main' in value || 'extra' in value || 'side' in value)) {
    return fromPortableConfig(buildPortableConfigFromDeckBuilderRecord(value, fallbackDeckName)).deckBuilder
  }

  throw new Error(
    'El JSON no coincide con un PortableConfig ni con un deckBuilder serializado por la app.',
  )
}

function buildPortableConfigFromDeckBuilderRecord(
  value: Record<string, unknown>,
  fallbackDeckName: string,
): PortableConfig {
  const initialState = createInitialState()

  return {
    version: 15,
    handSize: initialState.handSize,
    deckFormat: initialState.deckFormat,
    patternsSeeded: false,
    patternsSeedVersion: 0,
    patterns: [],
    deckBuilder: {
      deckName:
        typeof value.deckName === 'string' && value.deckName.trim().length > 0
          ? value.deckName
          : fallbackDeckName || initialState.deckBuilder.deckName,
      main: Array.isArray(value.main)
        ? (value.main as PortableConfig['deckBuilder']['main'])
        : [],
      extra: Array.isArray(value.extra)
        ? (value.extra as PortableConfig['deckBuilder']['extra'])
        : [],
      side: Array.isArray(value.side)
        ? (value.side as PortableConfig['deckBuilder']['side'])
        : [],
    },
  }
}

function cloneDeckBuilderForImport(deckBuilder: DeckBuilderState): DeckBuilderState {
  return {
    deckName: deckBuilder.deckName,
    main: deckBuilder.main.map((card) => ({
      ...card,
      roles: [...card.roles],
      apiCard: { ...card.apiCard },
    })),
    extra: deckBuilder.extra.map((card) => ({
      ...card,
      roles: [...card.roles],
      apiCard: { ...card.apiCard },
    })),
    side: deckBuilder.side.map((card) => ({
      ...card,
      roles: [...card.roles],
      apiCard: { ...card.apiCard },
    })),
    isEditingDeck: true,
  }
}

function buildResolvedEntriesFromDeckBuilder(
  deckBuilder: DeckBuilderState,
): ResolvedImportedDeckEntry[] {
  const entries = new Map<string, ResolvedImportedDeckEntry>()

  for (const zone of DECK_ZONES) {
    for (const card of deckBuilder[zone]) {
      const key = `${zone}:${card.apiCard.ygoprodeckId}`
      const existingEntry = entries.get(key)

      if (existingEntry) {
        existingEntry.count += 1
        existingEntry.appliedCount += 1
        continue
      }

      entries.set(key, {
        zone,
        name: card.name,
        count: 1,
        appliedCount: 1,
        card: {
          ...card.apiCard,
          name: card.name,
        },
      })
    }
  }

  return [...entries.values()]
}

function parseDecklistTextDetails(text: string): ParsedDecklistDetails {
  const entries: ParsedImportedDeckEntry[] = []
  const invalidLines: ImportedDeckInvalidLine[] = []
  let currentZone: DeckZone = 'main'

  for (const [lineIndex, rawLine] of text.split(/\r?\n/).entries()) {
    const normalizedLine = normalizeImportLine(rawLine)

    if (normalizedLine.length === 0) {
      continue
    }

    const sectionZone = parseDeckSectionHeader(normalizedLine)

    if (sectionZone) {
      currentZone = sectionZone
      continue
    }

    const parsedEntry = parseDecklistLine(normalizedLine, currentZone)

    if (!parsedEntry) {
      invalidLines.push({
        lineNumber: lineIndex + 1,
        rawLine,
        reason: 'No pude leer una cantidad y un nombre de carta en esa linea.',
      })
      continue
    }

    entries.push({
      ...parsedEntry,
      lineNumber: lineIndex + 1,
      rawLine,
    })
  }

  return {
    entries,
    invalidLines,
  }
}

function parseDecklistLine(
  line: string,
  zone: DeckZone,
): ImportedDeckEntry | null {
  const pureNumber = Number.parseInt(line, 10)

  if (String(pureNumber) === line) {
    return null
  }

  const prefixMatch = line.match(/^(\d+)\s*[xX×]?\s+(.+)$/)

  if (prefixMatch) {
    const count = Number.parseInt(prefixMatch[1] ?? '1', 10)
    const name = cleanupDeckEntryName(prefixMatch[2] ?? '')

    if (name) {
      return { zone, name, count: sanitizeDeckEntryCount(count) }
    }
  }

  const suffixMatch = line.match(/^(.+?)\s*[xX×]\s*(\d+)$/)

  if (suffixMatch) {
    const count = Number.parseInt(suffixMatch[2] ?? '1', 10)
    const name = cleanupDeckEntryName(suffixMatch[1] ?? '')

    if (name) {
      return { zone, name, count: sanitizeDeckEntryCount(count) }
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

function aggregateImportedDeckEntries(entries: ImportedDeckEntry[]): ImportedDeckEntry[] {
  const aggregatedEntries = new Map<string, ImportedDeckEntry>()

  for (const entry of entries) {
    const key = `${entry.zone}:${normalizeImportedCardName(entry.name)}`
    const existingEntry = aggregatedEntries.get(key)

    if (existingEntry) {
      existingEntry.count += entry.count
      continue
    }

    aggregatedEntries.set(key, {
      zone: entry.zone,
      name: entry.name,
      count: entry.count,
    })
  }

  return [...aggregatedEntries.values()]
}

function parseDeckSectionHeader(line: string): DeckZone | null {
  const normalizedHeader = normalizeSearchText(
    normalizeImportPunctuation(line).replace(/[:\-\[\]{}()]+/g, ' '),
  )

  if (normalizedHeader === 'main' || normalizedHeader === 'main deck') {
    return 'main'
  }

  if (normalizedHeader === 'extra' || normalizedHeader === 'extra deck') {
    return 'extra'
  }

  if (normalizedHeader === 'side' || normalizedHeader === 'side deck') {
    return 'side'
  }

  return null
}

function cleanupDeckEntryName(value: string): string {
  const cleanedValue = normalizeImportPunctuation(decodeHtmlEntities(value))
    .replace(/^[\s\-–—•·*|]+/, '')
    .replace(/[\s\-–—•·*|]+$/, '')
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

function sanitizeDeckEntryCount(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    return 1
  }

  return value
}

function normalizeImportLine(value: string): string {
  return normalizeImportPunctuation(value)
    .replace(/[|•·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeImportPunctuation(value: string): string {
  return value
    .replace(/[“”„‟]/g, '"')
    .replace(/[’‘‛]/g, "'")
    .replace(/[‐‑‒–—―]/g, '-')
    .replace(/：/g, ':')
    .replace(/／/g, '/')
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
}

function normalizeImportedCardName(value: string): string {
  return normalizeSearchText(normalizeImportPunctuation(decodeHtmlEntities(value)))
}

function buildDeckImportCardIndex(cards: ApiCardSearchResult[]): Map<string, ApiCardSearchResult> {
  const cardsByNormalizedName = new Map<string, ApiCardSearchResult>()

  for (const card of cards) {
    const normalizedName = normalizeImportedCardName(card.name)
    const existingCard = cardsByNormalizedName.get(normalizedName)

    if (!existingCard || shouldPreferImportCard(card, existingCard)) {
      cardsByNormalizedName.set(normalizedName, card)
    }
  }

  return cardsByNormalizedName
}

function buildCardsByIdIndex(cards: ApiCardSearchResult[]): Map<number, ApiCardSearchResult> {
  return new Map(cards.map((card) => [card.ygoprodeckId, card]))
}

function findCardByImportedName(
  cardsById: Map<number, ApiCardSearchResult>,
  name: string,
): ApiCardSearchResult | null {
  const normalizedName = normalizeImportedCardName(name)

  for (const card of cardsById.values()) {
    if (normalizeImportedCardName(card.name) === normalizedName) {
      return card
    }
  }

  return null
}

function shouldPreferImportCard(
  candidate: ApiCardSearchResult,
  current: ApiCardSearchResult,
): boolean {
  const candidateHasImage = Boolean(candidate.imageUrlSmall || candidate.imageUrl)
  const currentHasImage = Boolean(current.imageUrlSmall || current.imageUrl)

  if (candidateHasImage !== currentHasImage) {
    return candidateHasImage
  }

  return candidate.ygoprodeckId < current.ygoprodeckId
}

function appendDeckImportConflict(
  conflicts: Map<string, DeckImportConflict>,
  entry: ImportedDeckEntry,
  reason: string,
): void {
  const key = `${entry.zone}:${normalizeImportedCardName(entry.name)}:${reason}`
  const existingConflict = conflicts.get(key)

  if (existingConflict) {
    existingConflict.count += entry.count
    return
  }

  conflicts.set(key, {
    zone: entry.zone,
    name: entry.name,
    count: entry.count,
    reason,
  })
}

function buildDeckZoneTotalsFromEntries(
  entries: ImportedDeckEntry[],
): Record<DeckZone, number> {
  return entries.reduce<Record<DeckZone, number>>(
    (totals, entry) => {
      totals[entry.zone] += entry.count
      return totals
    },
    {
      main: 0,
      extra: 0,
      side: 0,
    },
  )
}

function buildDeckZoneTotalsFromDeck(
  deckBuilder: DeckBuilderState,
): Record<DeckZone, number> {
  return {
    main: deckBuilder.main.length,
    extra: deckBuilder.extra.length,
    side: deckBuilder.side.length,
  }
}

function createEmptyImportedDeck(deckName: string): DeckBuilderState {
  return {
    deckName,
    main: [],
    extra: [],
    side: [],
    isEditingDeck: true,
  }
}

function resolveDeckImportSource(
  source: Partial<DeckImportSource> | undefined,
  fallbackKind: DeckImportSourceKind,
): DeckImportSource {
  const kind = source?.kind ?? fallbackKind
  const fileName = source?.fileName ?? null

  return {
    kind,
    fileName,
    label: source?.label ?? getDeckImportSourceLabel(kind, fileName),
  }
}

function getDeckImportSourceLabel(kind: DeckImportSourceKind, fileName: string | null): string {
  if (fileName) {
    return fileName
  }

  if (kind === 'json') {
    return 'JSON'
  }

  if (kind === 'txt') {
    return 'TXT'
  }

  if (kind === 'ydk') {
    return 'YDK'
  }

  return 'Texto pegado'
}

function isLikelyNoiseLine(value: string): boolean {
  const rawValue = normalizeImportPunctuation(value).trim()
  const normalizedValue = normalizeSearchText(rawValue)

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

  return false
}
