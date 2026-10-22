import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  CURRENT_SOURCE,
  readComparisonSelection,
  resolveComparisonSelection,
  writeComparisonSelection,
  type BuildSource,
  type ComparisonSelection,
  type ComparisonSources,
  type StoredComparisonSelection,
} from './comparison-selection'
import { endChangeSession } from './deck-before'

/**
 * A y B de Comparar, ya elegidas al entrar y recordadas. Montarlo cuenta como «abrir Comparar»: cierra la sesión de cambios del builder
 * (la próxima edición guarda otro «Tu deck de antes»). `sources` conviene memoizarlo (`useMemo`).
 */
export function useComparisonSelection(sources: ComparisonSources): {
  selection: ComparisonSelection
  setA: (a: BuildSource) => void
  /** Elegir B a mano (o `null`: volver a la de entrada). */
  setB: (b: BuildSource | null) => void
  /** ⇅: A pasa a B y B a A. */
  swap: () => void
} {
  const [stored, setStored] = useState<StoredComparisonSelection>(readComparisonSelection)

  useEffect(() => {
    endChangeSession()
  }, [])

  const selection = useMemo(() => resolveComparisonSelection(stored, sources), [stored, sources])

  const save = useCallback((next: StoredComparisonSelection) => {
    setStored(next)
    writeComparisonSelection(next)
  }, [])

  return {
    selection,
    setA: useCallback((a: BuildSource) => save({ ...stored, a }), [save, stored]),
    setB: useCallback((b: BuildSource | null) => save({ ...stored, b, pickedAt: new Date().toISOString() }), [save, stored]),
    swap: useCallback(
      () => save({ a: selection.b ?? CURRENT_SOURCE, b: selection.a, pickedAt: new Date().toISOString() }),
      [save, selection],
    ),
  }
}
