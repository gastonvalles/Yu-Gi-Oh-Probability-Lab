import type { CardEntry, DeckFormat } from '../types'
import { parseDerivedCardId } from './calculator-state'
import { getAddSearchResultIssue } from './deck-builder'
import { getCardCopyLimit } from './deck-format'
import type { Outcome } from './lab-suggestion'
import type { DeckBuilderState, DeckCardInstance } from './model'
import { createSavedBuild, readSavedBuilds, writeSavedBuilds, type BuildZones, type SavedBuild } from './saved-builds'
import { createId, isRecord } from './utils'

/**
 * Un cambio que se prueba sobre tu deck sin guardarlo (el «Probar el cambio» del Lab): sacar 1 copia de una carta del Main y meter 1 de
 * otra. Se resuelve contra el deck de AHORA (`resolveDraft`): si el deck cambia, el borrador se sigue aplicando mientras se pueda.
 */
export interface SwapDraft {
  kind: 'swap'
  /** Id de YGOPRODeck de la carta del Main que pierde una copia. */
  out: number
  /** Id de YGOPRODeck de la carta que gana una copia en el Main: tiene que estar en el deck (de ahí salen su clasificación y su imagen). */
  in: number
}

export type BuildDraft = SwapDraft

/**
 * `sessionStorage` (versión 1): el borrador es de esta pestaña y sobrevive a recargarla (pesa unos 50 bytes); otra pestaña no lo ve.
 * No va en la copia de seguridad (que lee `localStorage`). Ningún worker lo lee.
 */
export const BUILD_DRAFT_KEY = 'ygo-lab:build-draft'
/** Se dispara en `window` cuando se empieza, se cambia o se descarta el borrador. */
export const BUILD_DRAFT_EVENT = 'ygo-lab:build-draft-change'

const isId = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0

export function parseBuildDraft(value: unknown): BuildDraft | null {
  const draft = isRecord(value) && value.v === 1 && isRecord(value.draft) ? value.draft : null

  return draft && draft.kind === 'swap' && isId(draft.out) && isId(draft.in) && draft.out !== draft.in
    ? { kind: 'swap', out: draft.out, in: draft.in }
    : null
}

export function readBuildDraft(): BuildDraft | null {
  try {
    return parseBuildDraft(JSON.parse(sessionStorage.getItem(BUILD_DRAFT_KEY) ?? 'null'))
  } catch {
    return null
  }
}

/** `null` descarta el borrador. Sin almacenamiento, el borrador no sobrevive a recargar (igual se avisa a la pantalla). */
export function writeBuildDraft(draft: BuildDraft | null): void {
  try {
    if (draft) {
      sessionStorage.setItem(BUILD_DRAFT_KEY, JSON.stringify({ v: 1, draft }))
    } else {
      sessionStorage.removeItem(BUILD_DRAFT_KEY)
    }
  } catch {
    // Sin almacenamiento: el borrador se pierde al recargar.
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(BUILD_DRAFT_EVENT))
  }
}

const idOfEntry = (card: CardEntry) => card.apiCard?.ygoprodeckId ?? parseDerivedCardId(card.id)

/** El borrador de una sugerencia del Lab (`Outcome.changes`: sacar una y meter otra). `null` si no es un cambio de una por una. */
export function draftFromChanges(changes: Outcome['changes']): BuildDraft | null {
  const out = changes.find((change) => change.action === 'remove')
  const inn = changes.find((change) => change.action === 'add')
  const outId = out ? idOfEntry(out.card) : null
  const inId = inn ? idOfEntry(inn.card) : null

  return changes.length === 2 && outId !== null && inId !== null && outId !== inId ? { kind: 'swap', out: outId, in: inId } : null
}

export type SwapResult =
  | { ok: true; zones: BuildZones }
  /** La carta que sale ya no está en el Main, o la que entra ya no está en el deck. */
  | { ok: false; reason: 'missing-card' }
  /** El formato no deja meter esa copia (límite contando Extra y Side, banlist, Edison, puntos de Genesys): `issue` ya viene traducido. */
  | { ok: false; reason: 'not-allowed'; issue: string }

/**
 * El deck con el cambio (puro: no guarda nada). La copia que sale es la última de esa carta en el Main; la que entra copia la clasificación
 * de una que ya está y queda junto a las suyas. Respeta las mismas reglas que sumar una carta en el builder (`getAddSearchResultIssue`).
 */
export function swapInDeck(deck: BuildZones, swap: SwapDraft, format: DeckFormat, newInstanceId = createId('deck-card')): SwapResult {
  const outIndex = deck.main.findLastIndex((card) => card.apiCard.ygoprodeckId === swap.out)
  const template = [...deck.main, ...deck.side, ...deck.extra].find((card) => card.apiCard.ygoprodeckId === swap.in)

  if (outIndex < 0 || !template || swap.out === swap.in) {
    return { ok: false, reason: 'missing-card' }
  }

  const main = deck.main.filter((_, index) => index !== outIndex)
  const withoutOut: DeckBuilderState = { deckName: '', isEditingDeck: false, main, extra: deck.extra, side: deck.side }
  const issue = getAddSearchResultIssue(withoutOut, { ...template.apiCard, name: template.name }, 'main', format)

  if (issue) {
    return { ok: false, reason: 'not-allowed', issue }
  }

  const lastCopy = main.findLastIndex((card) => card.apiCard.ygoprodeckId === swap.in)
  main.splice(lastCopy < 0 ? main.length : lastCopy + 1, 0, { ...template, instanceId: newInstanceId, roles: [...template.roles] })

  return { ok: true, zones: { main, extra: deck.extra, side: deck.side } }
}

/** El deck derivado del borrador, sin guardarlo (lo que el Lab mide en modo borrador y lo que Comparar muestra como B). */
export function resolveDraft(draft: BuildDraft, deck: BuildZones, format: DeckFormat): SwapResult {
  return swapInDeck(deck, draft, format)
}

/** Una línea de «Estás probando un cambio»: la carta y sus copias en el Main antes y después («quedan 2», «ahora son 3»). */
export interface DraftLine {
  card: DeckCardInstance
  before: number
  after: number
}

export function describeDraft(deck: BuildZones, draft: BuildDraft): { out: DraftLine; in: DraftLine } | null {
  const inMain = (id: number) => deck.main.filter((card) => card.apiCard.ygoprodeckId === id).length
  const outCard = deck.main.find((card) => card.apiCard.ygoprodeckId === draft.out)
  const inCard = [...deck.main, ...deck.side, ...deck.extra].find((card) => card.apiCard.ygoprodeckId === draft.in)

  return outCard && inCard
    ? {
        out: { card: outCard, before: inMain(draft.out), after: inMain(draft.out) - 1 },
        in: { card: inCard, before: inMain(draft.in), after: inMain(draft.in) + 1 },
      }
    : null
}

const nameKey = (name: string) => name.trim().toLocaleLowerCase()

/**
 * Cuántas copias de una carta puede tener el Main sin pasarse del límite del formato, descontando las que ya están en el Extra o el Side
 * (el builder las cuenta todas). Es el `maxCopiesOf` para `useLabSuggestion`: así la sugerencia nunca pide una copia que no se puede meter.
 */
export function mainCopyLimit(deck: BuildZones, format: DeckFormat): (card: CardEntry) => number {
  const outside = new Map<string, number>()

  for (const card of [...deck.extra, ...deck.side]) {
    outside.set(nameKey(card.name), (outside.get(nameKey(card.name)) ?? 0) + 1)
  }

  return (card) => Math.max(0, (card.apiCard ? getCardCopyLimit(card.apiCard, format) : 3) - (outside.get(nameKey(card.name)) ?? 0))
}

/**
 * Guarda el deck del borrador como una build («Guardar B»; `from: 'lab'`). Sin nombre, lleva el del deck (con «(2)» si ya existe).
 * `null` si el borrador ya no se puede aplicar a tu deck. Avisa con `SAVED_BUILDS_EVENT`.
 */
export function saveDraftAsBuild(
  draft: BuildDraft,
  deck: BuildZones & { deckName: string },
  format: DeckFormat,
  name?: string,
  now = new Date(),
): SavedBuild | null {
  const resolved = resolveDraft(draft, deck, format)

  if (!resolved.ok) {
    return null
  }

  const builds = readSavedBuilds()
  const build = createSavedBuild(name ?? deck.deckName, resolved.zones, builds, now, 'lab')

  writeSavedBuilds([build, ...builds])

  return build
}
