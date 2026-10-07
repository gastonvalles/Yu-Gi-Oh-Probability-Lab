import { useEffect } from 'react'

import type { SystemRuleNames } from '../../app/pattern-presets'
import type { CardEntry, HandPattern } from '../../types'

/** Espera a que el deck y las reglas dejen de cambiar antes de calcular de fondo. */
const PREWARM_DELAY_MS = 2500

interface UseLabPrewarmInput {
  derivedMainCards: CardEntry[]
  patterns: HandPattern[]
  disabledGenericRuleIds: readonly string[]
  systemRuleNames: SystemRuleNames
  handSize: number
  isEditingDeck: boolean
  /** false en el propio Lab: ahí el cálculo ya se pide solo. */
  enabled: boolean
}

/**
 * Deja calculado el Lab en segundo plano cuando el deck está quieto, para que abrirlo sea instantáneo.
 * El motor se carga recién entonces (import dinámico): no pesa en la carga inicial de la app.
 */
export function useLabPrewarm({ derivedMainCards, patterns, disabledGenericRuleIds, systemRuleNames, handSize, isEditingDeck, enabled }: UseLabPrewarmInput): void {
  useEffect(() => {
    if (!enabled || isEditingDeck || derivedMainCards.length === 0) {
      return
    }

    const run = () => {
      void import('./lab-prewarm').then(({ prewarmLab }) =>
        prewarmLab({ derivedMainCards, patterns, disabledGenericRuleIds, systemRuleNames, handSize }),
      )
    }
    const timer = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 4000 })
      } else {
        run()
      }
    }, PREWARM_DELAY_MS)

    return () => window.clearTimeout(timer)
  }, [derivedMainCards, disabledGenericRuleIds, enabled, handSize, isEditingDeck, patterns, systemRuleNames])
}
