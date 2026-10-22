import { useCallback, useMemo } from 'react'

import type { CardEntry } from '../types'
import {
  BUILD_DRAFT_EVENT,
  describeDraft,
  readBuildDraft,
  resolveDraft,
  saveDraftAsBuild,
  writeBuildDraft,
  type BuildDraft,
  type DraftLine,
  type SwapResult,
} from './build-draft'
import { deriveMainDeckCardsFromZone } from './calculator-state'
import { selectDraftForComparison } from './comparison-selection'
import { applySwapToDeck, undoDeckChange, type ApplySwapResult, type DeckChangeToken } from './deck-change-actions'
import type { SavedBuild, BuildZones } from './saved-builds'
import { useAppDispatch, useAppSelector } from './store-hooks'
import { useStoredValue } from './use-stored-value'

export interface LabDraft {
  draft: BuildDraft | null
  /** `none`: sin borrador · `active`: el Lab mide tu deck con el cambio · `stale`: tu deck cambió y el cambio ya no se puede aplicar (decilo y ofrecé descartarlo). */
  status: 'none' | 'active' | 'stale'
  /** Por qué no se puede aplicar (sólo en `stale`). */
  problem: Exclude<SwapResult, { ok: true }> | null
  /** Tu deck con el cambio, sin guardar (la B de Comparar). */
  zones: BuildZones | null
  /** Las cartas de ese Main como las cuenta el Lab: en modo borrador, todas las cuentas van con estas en vez de `derivedMainCards`. */
  cards: CardEntry[] | null
  /** «Sacar 1 Dominus Impulse · quedan 2» / «Meter 1 Fire King Island · ahora son 3». */
  lines: { out: DraftLine; in: DraftLine } | null
  /** «Probar el cambio»: todo el Lab pasa a borrador (no se guarda nada). */
  start: (draft: BuildDraft) => void
  /** La X: vuelve al deck de verdad. */
  discard: () => void
  /** «Aplicar al deck»: guarda el cambio en el builder y sale del borrador. Con `ok`, el `token` va al aviso con «Deshacer». */
  apply: () => ApplySwapResult | null
  /** «Deshacer» de «Aplicar al deck»: vuelve el deck y el borrador. `false` si el deck cambió desde entonces. */
  undo: (token: DeckChangeToken) => boolean
  /** «Comparar con mi deck»: deja A = tu deck y B = el borrador; después navegá a `#workspace`. */
  compare: () => void
  /** «Guardar B»: guarda el deck del borrador como build (`from: 'lab'`). `null` si ya no se puede aplicar. */
  saveAsBuild: (name?: string) => SavedBuild | null
}

/**
 * El borrador del Lab (`build-draft.ts`), al día en todas las pantallas que lo usan (el Lab y Comparar). Se resuelve contra el deck del
 * builder de ahora y el formato elegido.
 */
export function useLabDraft(): LabDraft {
  const dispatch = useAppDispatch()
  const deckBuilder = useAppSelector((state) => state.deckBuilder)
  const deckFormat = useAppSelector((state) => state.settings.deckFormat)
  const draft = useStoredValue(readBuildDraft, BUILD_DRAFT_EVENT)

  const resolved = useMemo(() => (draft ? resolveDraft(draft, deckBuilder, deckFormat) : null), [deckBuilder, deckFormat, draft])
  const zones = resolved?.ok ? resolved.zones : null
  const cards = useMemo(() => (zones ? deriveMainDeckCardsFromZone(zones.main) : null), [zones])
  const lines = useMemo(() => (draft ? describeDraft(deckBuilder, draft) : null), [deckBuilder, draft])

  const apply = useCallback(() => {
    if (!draft) {
      return null
    }

    const result = dispatch(applySwapToDeck(draft))

    if (result.ok) {
      writeBuildDraft(null)
    }

    return result
  }, [dispatch, draft])

  const undo = useCallback(
    (token: DeckChangeToken) => {
      const undone = dispatch(undoDeckChange(token))

      if (undone && token.draft) {
        writeBuildDraft(token.draft)
      }

      return undone
    },
    [dispatch],
  )

  return {
    draft,
    status: !resolved ? 'none' : resolved.ok ? 'active' : 'stale',
    problem: resolved && !resolved.ok ? resolved : null,
    zones,
    cards,
    lines,
    start: writeBuildDraft,
    discard: useCallback(() => writeBuildDraft(null), []),
    apply,
    undo,
    compare: useCallback(() => selectDraftForComparison(), []),
    saveAsBuild: useCallback((name?: string) => (draft ? saveDraftAsBuild(draft, deckBuilder, deckFormat, name) : null), [deckBuilder, deckFormat, draft]),
  }
}
