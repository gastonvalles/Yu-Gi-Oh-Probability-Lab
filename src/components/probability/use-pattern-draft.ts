import { useMemo, useReducer, useState } from 'react'

import { patternsReducer, replacePatterns, type PatternsState } from '../../app/patterns-slice'
import { createPatternEditorActions, type PatternEditorDefaults } from '../../app/use-pattern-editor-actions'
import type { HandPattern } from '../../types'

const EMPTY_DRAFT_STATE: PatternsState = {
  patternsSeeded: true,
  patternsSeedVersion: 0,
  patterns: [],
  disabledGenericRuleIds: [],
  systemRuleNames: {},
}

/**
 * Borrador de una regla: el editor la modifica con las mismas acciones del slice,
 * pero sobre un estado local. El store (y el cálculo) sólo cambian al guardar.
 */
export function usePatternDraft(defaults: PatternEditorDefaults) {
  const [state, dispatch] = useReducer(patternsReducer, EMPTY_DRAFT_STATE)
  const [baseline, setBaseline] = useState<HandPattern | null>(null)
  const actions = useMemo(() => createPatternEditorActions(dispatch, defaults), [defaults])
  const draft = state.patterns[0] ?? null

  return {
    draft,
    actions,
    isDirty: draft !== null && JSON.stringify(draft) !== JSON.stringify(baseline),
    open(pattern: HandPattern) {
      setBaseline(pattern)
      dispatch(replacePatterns([pattern]))
    },
    close() {
      setBaseline(null)
      dispatch(replacePatterns([]))
    },
  }
}
