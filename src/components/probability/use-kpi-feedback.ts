import { useCallback, useEffect, useRef, useState } from 'react'

import { formatPercentPoints } from '../../app/utils'
import type { HandPattern } from '../../types'
import type { PatternEditorActions } from './pattern-editor-actions'

const FEEDBACK_VISIBLE_MS = 1800
const MIN_VISIBLE_DELTA = 0.0005
// Acciones que no cambian el cálculo (crear vacía, renombrar).
const UNTRACKED_ACTIONS = new Set<keyof PatternEditorActions>(['addPattern', 'setPatternName'])

export interface KpiFeedback {
  label: string
  tone: 'positive' | 'negative'
  patternId: string | null
}

/** Muestra cuánto movió el KPI la última edición de reglas (p. ej. "+1.2 pp"). */
export function useKpiFeedback(currentProbability: number | null) {
  const [feedback, setFeedback] = useState<KpiFeedback | null>(null)
  const previousRef = useRef<number | null>(currentProbability)
  const pendingPatternIdRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    const previous = previousRef.current
    const pendingPatternId = pendingPatternIdRef.current
    previousRef.current = currentProbability

    if (pendingPatternId === undefined || previous === null || currentProbability === null) {
      return
    }

    pendingPatternIdRef.current = undefined
    const delta = currentProbability - previous

    if (Math.abs(delta) < MIN_VISIBLE_DELTA) {
      return
    }

    setFeedback({ label: formatPercentPoints(delta), tone: delta > 0 ? 'positive' : 'negative', patternId: pendingPatternId })
    const timer = window.setTimeout(() => setFeedback(null), FEEDBACK_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [currentProbability])

  const trackChange = useCallback((patternId: string | null) => {
    pendingPatternIdRef.current = patternId
  }, [])

  return { feedback, trackChange }
}

/** Envuelve las acciones del editor para registrar qué regla cambió. */
export function withChangeTracking(
  actions: PatternEditorActions,
  onChange: (patternId: string | null) => void,
): PatternEditorActions {
  const entries = Object.entries(actions).map(([name, action]) => {
    if (UNTRACKED_ACTIONS.has(name as keyof PatternEditorActions)) {
      return [name, action]
    }

    return [
      name,
      (...args: unknown[]) => {
        onChange(getChangedPatternId(args[0]))
        return (action as (...values: unknown[]) => unknown)(...args)
      },
    ]
  })

  return Object.fromEntries(entries) as PatternEditorActions
}

function getChangedPatternId(firstArgument: unknown): string | null {
  if (typeof firstArgument === 'string') {
    return firstArgument
  }

  if (firstArgument && typeof firstArgument === 'object' && 'id' in firstArgument && !Array.isArray(firstArgument)) {
    return (firstArgument as HandPattern).id
  }

  return null
}
