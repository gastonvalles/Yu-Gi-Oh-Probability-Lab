import { useMemo } from 'react'

import { buildDerivedDeckGroupMap } from '../../../app/deck-groups'
import { allowsSharedCards, resolveConditionCardIds } from '../../../app/patterns'
import type { CardEntry, HandPattern } from '../../../types'
import { Switch } from '../../ui/Switch'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { RuleStep } from './RuleStep'

interface RuleSettingsProps {
  pattern: HandPattern
  actions: PatternEditorActions
  derivedMainCards: CardEntry[]
}

/** Interruptores que cambian cómo se evalúa la regla; sólo aparecen los que aplican a esta regla. */
export function RuleSettings({ pattern, actions, derivedMainCards }: RuleSettingsProps) {
  // Hay cartas que caen en más de una condición: ahí importa si una misma carta puede contar dos veces.
  const hasOverlap = useMemo(() => {
    const defined = pattern.conditions.filter((condition) => condition.matcher !== null)

    if (defined.length < 2) {
      return false
    }

    const groupsByKey = buildDerivedDeckGroupMap(derivedMainCards)
    const sets = defined.map((condition) => new Set(resolveConditionCardIds(condition, groupsByKey, derivedMainCards)))

    return sets.some((set, index) => sets.slice(index + 1).some((other) => [...set].some((cardId) => other.has(cardId))))
  }, [derivedMainCards, pattern.conditions])

  const rows = [
    pattern.turnContext !== 'first' && (
      <SettingRow
        key="draw"
        title="Contar la carta que robás yendo 2º"
        description={
          pattern.ignoresDraw
            ? 'Se mira sólo la mano inicial de 5 (p. ej. interacción para el turno del rival).'
            : 'Yendo 2º la regla ve las 6 cartas, la robada incluida.'
        }
        checked={pattern.ignoresDraw !== true}
        onChange={(counts) => actions.setPatternIgnoresDraw(pattern.id, !counts)}
      />
    ),
    pattern.kind === 'opening' && (
      <SettingRow
        key="rescue"
        title="Rescatar las cartas que usa"
        description={
          pattern.rescuesCards
            ? 'Si la mano cumple esta salida, sus cartas no cuentan como muertas en los problemas.'
            : 'Los problemas cuentan todas las cartas de la mano.'
        }
        checked={pattern.rescuesCards === true}
        onChange={(checked) => actions.setPatternRescuesCards(pattern.id, checked)}
      />
    ),
    hasOverlap && (
      <SettingRow
        key="shared"
        title="La misma carta cuenta para más de una condición"
        description={
          allowsSharedCards(pattern)
            ? 'Hay cartas en más de una condición: una sola copia puede cumplir varias a la vez.'
            : 'Hay cartas en más de una condición: cada condición necesita cartas distintas.'
        }
        checked={allowsSharedCards(pattern)}
        onChange={(checked) => actions.setPatternAllowSharedCards(pattern.id, checked)}
      />
    ),
  ].filter(Boolean)

  if (rows.length === 0) {
    return null
  }

  return (
    <RuleStep title="Ajustes">
      <div className="grid divide-y divide-border-subtle">{rows}</div>
    </RuleStep>
  )
}

function SettingRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-body font-medium text-foreground">{title}</span>
        <span className="text-micro text-muted">{description}</span>
      </span>
      <Switch checked={checked} label={title} onChange={onChange} />
    </div>
  )
}
