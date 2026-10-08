import { formatInteger } from '../../app/utils'
import type { IconName } from '../ui/Icon'

export type DeckWorkflowStepKey = 'deck-builder' | 'categorization' | 'probability-lab' | 'export' | 'workspace'
export type DeckWorkflowStepTone = 'complete' | 'progress' | 'pending'

export interface DeckModeNavigationItem {
  key: DeckWorkflowStepKey
  step: string
  /** Nombre corto: es el que se ve en las pestañas (igual en desktop y mobile). */
  label: string
  /** Nombre completo: tooltip y lectores de pantalla. */
  title: string
  icon: IconName
  /** Dato en vivo bajo el nombre (sólo donde cambia con el trabajo: cartas del deck y cartas clasificadas). */
  metric: string | null
  /** Estado del paso: tooltip y lectores de pantalla. */
  detail: string
  tone: DeckWorkflowStepTone
  disabled: boolean
}

export interface DeckWorkflowNavigationSnapshot {
  mainDeckCount: number
  roleCardCount: number
  classifiedCardCount: number
  unclassifiedCardCount: number
  hasCompletedRoleStep: boolean
  patternCount: number
}

const WORKFLOW_STEP_KEYS: readonly DeckWorkflowStepKey[] = [
  'deck-builder',
  'categorization',
  'probability-lab',
  'workspace',
  'export',
]

export const DECK_WORKFLOW_TONE_LABEL: Record<DeckWorkflowStepTone, string> = {
  complete: 'Listo',
  progress: 'En progreso',
  pending: 'Pendiente',
}

export function isDeckWorkflowStepKey(value: string): value is DeckWorkflowStepKey {
  return WORKFLOW_STEP_KEYS.some((stepKey) => stepKey === value)
}

export function buildDeckWorkflowNavigationItems({
  mainDeckCount,
  roleCardCount,
  classifiedCardCount,
  unclassifiedCardCount,
  hasCompletedRoleStep,
  patternCount,
}: DeckWorkflowNavigationSnapshot): DeckModeNavigationItem[] {
  return [
    {
      key: 'deck-builder',
      step: '1',
      label: 'Deck',
      title: 'Deck Builder',
      icon: 'cards',
      metric: `${formatInteger(mainDeckCount)} / 40`,
      detail:
        mainDeckCount >= 40
          ? 'Base principal lista.'
          : mainDeckCount > 0
            ? `${formatInteger(Math.max(0, 40 - mainDeckCount))} para llegar a 40.`
            : 'Empezá agregando cartas.',
      tone: mainDeckCount >= 40 ? 'complete' : mainDeckCount > 0 ? 'progress' : 'pending',
      disabled: false,
    },
    {
      key: 'categorization',
      step: '2',
      label: 'Roles',
      title: 'Categorización de roles',
      icon: 'tag',
      metric: roleCardCount > 0 ? `${formatInteger(classifiedCardCount)} / ${formatInteger(roleCardCount)}` : null,
      detail:
        roleCardCount === 0
          ? 'Necesita cartas en Main.'
          : hasCompletedRoleStep
            ? 'Todo clasificado.'
            : `${formatInteger(unclassifiedCardCount)} sin cerrar.`,
      tone:
        roleCardCount === 0
          ? 'pending'
          : hasCompletedRoleStep
            ? 'complete'
            : 'progress',
      disabled: roleCardCount === 0,
    },
    {
      key: 'probability-lab',
      step: '3',
      label: 'Lab',
      title: 'Probability Lab',
      icon: 'flask',
      metric: null,
      detail: hasCompletedRoleStep
        ? patternCount > 0
          ? 'Listo para medir.'
          : 'Medí con las reglas base o sumá las tuyas.'
        : 'Entrá igual; categorizá para medir.',
      tone: hasCompletedRoleStep ? 'complete' : 'pending',
      disabled: false,
    },
    {
      key: 'workspace',
      step: '4',
      label: 'Comparar',
      title: 'Comparar builds',
      icon: 'columns',
      metric: null,
      detail: 'Guardá o importá builds y compará.',
      tone: 'pending',
      disabled: false,
    },
    {
      key: 'export',
      step: '5',
      label: 'Exportar',
      title: 'Exportar deck',
      icon: 'download',
      metric: null,
      detail: mainDeckCount > 0 ? 'Imagen + PDF + YDK.' : 'Necesitás cartas en Main.',
      tone: mainDeckCount > 0 ? 'complete' : 'pending',
      disabled: mainDeckCount === 0,
    },
  ]
}
