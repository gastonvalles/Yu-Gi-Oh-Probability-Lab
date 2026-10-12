import type { PatternKind } from '../../../types'
import { t } from '../../../i18n'
import { Segmented } from '../../ui/Segmented'
import type { PatternEditorActions } from '../pattern-editor-actions'

interface KindToggleProps {
  patternId: string
  currentKind: PatternKind
  actions: PatternEditorActions
}

/** Salida (si se cumple, la mano arranca) o problema (la frena). */
export function KindToggle({ patternId, currentKind, actions }: KindToggleProps) {
  return (
    <Segmented
      label={t('builder.patternKind.label')}
      value={currentKind}
      options={[
        { value: 'opening', label: t('builder.patternKind.opening'), tone: 'success' },
        { value: 'problem', label: t('builder.patternKind.problem'), tone: 'danger' },
      ]}
      onChange={(kind) => actions.setPatternCategory(patternId, kind)}
    />
  )
}
