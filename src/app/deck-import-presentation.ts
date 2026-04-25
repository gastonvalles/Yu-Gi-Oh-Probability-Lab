import type { DeckZone } from './model'
import type {
  DeckImportPreview,
  ResolvedImportedDeckEntry,
} from './deck-import'

/** Estado visual del import */
export type ImportStatus = 'success' | 'warning' | 'error'

/** Paso activo del flujo de importación */
export type ImportStep = 1 | 2 | 3

/** Grupo de cartas resueltas por zona */
export interface ZoneGroup {
  zone: DeckZone
  label: string
  entries: ResolvedImportedDeckEntry[]
  totalCards: number
}

/** Resumen compacto de problemas */
export interface ProblemSummary {
  missingCount: number
  conflictCount: number
  invalidLineCount: number
  totalProblems: number
}

export const ZONE_ORDER: DeckZone[] = ['main', 'extra', 'side']

export const ZONE_LABELS: Record<DeckZone, string> = {
  main: 'Main Deck',
  extra: 'Extra Deck',
  side: 'Side Deck',
}

/** Agrupa cartas resueltas por zona, omitiendo zonas vacías. Orden: Main → Extra → Side */
export function groupResolvedByZone(entries: ResolvedImportedDeckEntry[]): ZoneGroup[] {
  const byZone = new Map<DeckZone, ResolvedImportedDeckEntry[]>()

  for (const entry of entries) {
    const list = byZone.get(entry.zone)
    if (list) {
      list.push(entry)
    } else {
      byZone.set(entry.zone, [entry])
    }
  }

  const groups: ZoneGroup[] = []

  for (const zone of ZONE_ORDER) {
    const zoneEntries = byZone.get(zone)
    if (zoneEntries && zoneEntries.length > 0) {
      groups.push({
        zone,
        label: ZONE_LABELS[zone],
        entries: zoneEntries,
        totalCards: zoneEntries.length,
      })
    }
  }

  return groups
}

/** Calcula el estado visual del import basado en los datos del preview */
export function computeImportStatus(preview: DeckImportPreview): ImportStatus {
  if (preview.importedCardCount === 0) {
    return 'error'
  }

  const hasNoProblems =
    preview.missingEntries.length === 0 &&
    preview.conflicts.length === 0 &&
    preview.importedCardCount === preview.requestedCardCount

  if (hasNoProblems) {
    return 'success'
  }

  return 'warning'
}

/** Determina el paso activo del flujo de importación */
export function computeActiveStep(options: {
  hasPreview: boolean
  canApply: boolean
}): ImportStep {
  if (!options.hasPreview) {
    return 1
  }

  if (!options.canApply) {
    return 2
  }

  return 3
}

/** Genera el resumen de problemas, o null si no hay problemas */
export function buildProblemSummary(preview: DeckImportPreview): ProblemSummary | null {
  const missingCount = preview.missingEntries.length
  const conflictCount = preview.conflicts.length
  const invalidLineCount = preview.invalidLines.length
  const totalProblems = missingCount + conflictCount + invalidLineCount

  if (totalProblems === 0) {
    return null
  }

  return {
    missingCount,
    conflictCount,
    invalidLineCount,
    totalProblems,
  }
}

/** Formatea el encabezado de un grupo de zona (ej: "Main Deck (40)") */
export function formatZoneGroupHeader(zone: DeckZone, count: number): string {
  return `${ZONE_LABELS[zone]} (${count})`
}

/** Formatea el aria-label de una sección (ej: "Cartas resueltas, 15 elementos") */
export function formatSectionAriaLabel(sectionName: string, itemCount: number): string {
  return `${sectionName}, ${itemCount} ${itemCount === 1 ? 'elemento' : 'elementos'}`
}
