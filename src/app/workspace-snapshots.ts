import { buildCalculatorState, deriveMainDeckCardsFromZone } from './calculator-state'
import type { AppState, DeckCardInstance, PortableConfig } from './model'
import { isRoleStepComplete } from './role-step'
import { createId } from './utils'
import { calculateProbabilities } from '../probability'

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

const SNAPSHOTS_STORAGE_KEY = 'ygo-probability-lab:snapshots:v1'

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

export function buildSnapshotComparison(
  currentState: AppState,
  snapshotState: AppState,
  snapshotName: string,
  savedAt: number,
): SnapshotComparison {
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

  if (!isRoleStepComplete(derivedCards)) {
    return null
  }

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
