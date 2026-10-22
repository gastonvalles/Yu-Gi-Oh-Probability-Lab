import type { PatternKind } from '../../../types'
import { t } from '../../../i18n'
import { Segmented } from '../../ui/Segmented'
import type { PatternEditorActions } from '../pattern-editor-actions'

interface KindToggleProps {
  patternId: string
  currentKind: PatternKind
  actions: PatternEditorActions
}

/** Salida (si se cumple, la mano arranca) o problema (la frena). Lo elegido va en ámbar, como todo lo elegido: el verde y el rojo quedan para la etiqueta y el anillo. */
export function KindToggle({ patternId, currentKind, actions }: KindToggleProps) {
  return (
    <Segmented
      fullWidth
      label={t('builder.patternKind.label')}
      value={currentKind}
      options={[
        { value: 'opening', label: t('builder.patternKind.opening') },
        { value: 'problem', label: t('builder.patternKind.problem') },
      ]}
      onChange={(kind) => actions.setPatternCategory(patternId, kind)}
    />
  )
}
