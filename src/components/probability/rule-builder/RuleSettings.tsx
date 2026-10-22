import { useMemo } from 'react'

import type { DerivedDeckGroup } from '../../../app/deck-groups'
import { allowsSharedCards, resolveConditionCardIds } from '../../../app/patterns'
import { t } from '../../../i18n'
import type { CardEntry, HandPattern } from '../../../types'
import { Switch } from '../../ui/Switch'
import type { PatternEditorActions } from '../pattern-editor-actions'
import { RuleStep } from './RuleStep'

interface RuleSettingsProps {
  pattern: HandPattern
  actions: PatternEditorActions
  derivedMainCards: CardEntry[]
  groupsByKey: Map<string, DerivedDeckGroup>
}

/**
 * Interruptores que cambian cómo se evalúa la regla, y sólo los que aplican: «Contar la carta que robás» si la regla vale yendo 2º (o si ya venía apagado),
 * «Rescatar las cartas que usa» en una salida y «La misma carta cuenta…» cuando hay cartas en más de una condición.
 */
export function RuleSettings({ pattern, actions, derivedMainCards, groupsByKey }: RuleSettingsProps) {
  // Hay cartas que caen en más de una condición: ahí importa si una misma carta puede contar dos veces.
  const hasOverlap = useMemo(() => {
    const defined = pattern.conditions.filter((condition) => condition.matcher !== null)

    if (defined.length < 2) {
      return false
    }

    const sets = defined.map((condition) => new Set(resolveConditionCardIds(condition, groupsByKey, derivedMainCards)))

    return sets.some((set, index) => sets.slice(index + 1).some((other) => [...set].some((cardId) => other.has(cardId))))
  }, [derivedMainCards, groupsByKey, pattern.conditions])

  const rows = [
    (pattern.turnContext === 'second' || (pattern.turnContext === 'either' && pattern.ignoresDraw === true)) && (
      <SettingRow
        key="draw"
        title={t('builder.settings.draw.title')}
        description={t(pattern.ignoresDraw ? 'builder.settings.draw.handOnly' : 'builder.settings.draw.withDraw')}
        checked={pattern.ignoresDraw !== true}
        onChange={(counts) => actions.setPatternIgnoresDraw(pattern.id, !counts)}
      />
    ),
    pattern.kind === 'opening' && (
      <SettingRow
        key="rescue"
        title={t('builder.settings.rescue.title')}
        description={t(pattern.rescuesCards ? 'builder.settings.rescue.on' : 'builder.settings.rescue.off')}
        checked={pattern.rescuesCards === true}
        onChange={(checked) => actions.setPatternRescuesCards(pattern.id, checked)}
      />
    ),
    hasOverlap && (
      <SettingRow
        key="shared"
        title={t('builder.settings.shared.title')}
        description={t(allowsSharedCards(pattern) ? 'builder.settings.shared.on' : 'builder.settings.shared.off')}
        checked={allowsSharedCards(pattern)}
        onChange={(checked) => actions.setPatternAllowSharedCards(pattern.id, checked)}
      />
    ),
  ].filter(Boolean)

  if (rows.length === 0) {
    return null
  }

  return (
    <RuleStep title={t('builder.field.settings')}>
      <div className="grid gap-4">{rows}</div>
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
    <div className="flex items-center justify-between gap-4">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-body font-semibold text-foreground">{title}</span>
        <span className="text-body text-muted">{description}</span>
      </span>
      <Switch size="lg" checked={checked} label={title} onChange={onChange} />
    </div>
  )
}
