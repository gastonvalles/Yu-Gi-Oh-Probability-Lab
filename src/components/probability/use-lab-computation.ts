import { useEffect, useMemo, useState } from 'react'

import {
  labComputationKey,
  peekLabComputation,
  requestLabComputation,
  type LabComputationInput,
} from '../../app/lab-computation-client'
import type { LabComputation } from '../../app/probability-lab'

/**
 * Resultado del Lab sin trabar la pantalla: si ya se calculó (en esta sesión o en una anterior) aparece
 * al instante; si no, se calcula en workers y mientras tanto se sigue mostrando el último resultado.
 */
export function useLabComputation(input: LabComputationInput | null): { computation: LabComputation | null; isComputing: boolean } {
  const key = useMemo(() => (input ? labComputationKey(input) : null), [input])
  const cached = key ? peekLabComputation(key) : null
  const [settled, setSettled] = useState<{ key: string; computation: LabComputation } | null>(null)
  const [previous, setPrevious] = useState<LabComputation | null>(null)

  useEffect(() => {
    if (!input || !key || peekLabComputation(key)) {
      return
    }

    let cancelled = false

    void requestLabComputation(input, key).then((computation) => {
      if (!cancelled) {
        setSettled({ key, computation })
      }
    })

    return () => {
      cancelled = true
    }
  }, [input, key])

  const current = cached ?? (settled && settled.key === key ? settled.computation : null)

  // Se recuerda el último resultado para no vaciar la pantalla mientras se recalcula una edición.
  if (current && current !== previous) {
    setPrevious(current)
  } else if (!input && previous) {
    setPrevious(null)
  }

  return { computation: current ?? (input ? previous : null), isComputing: input !== null && current === null }
}
