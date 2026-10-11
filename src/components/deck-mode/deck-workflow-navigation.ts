import { formatInteger } from '../../app/utils'
import type { IconName } from '../ui/Icon'

export type DeckWorkflowStepKey = 'deck-builder' | 'categorization' | 'probability-lab' | 'export' | 'workspace' | 'meta' | 'life'
export type DeckWorkflowStepTone = 'complete' | 'progress' | 'pending'

export interface DeckModeNavigationItem {
  key: DeckWorkflowStepKey
  step: string
  /** Nombre corto: es el que se ve en las pestañas (igual en desktop y mobile). */
  label: string
  /** Nombre completo: tooltip y lectores de pantalla. */
  title: string
  icon: IconName
  /** Estado del paso: tooltip y lectores de pantalla. */
  detail: string
  tone: DeckWorkflowStepTone
  disabled: boolean
  /** Sólo en la barra del celular: no aparece en las pestañas de escritorio. */
  mobileOnly?: boolean
}

interface DeckWorkflowNavigationSnapshot {
  mainDeckCount: number
  roleCardCount: number
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
  'meta',
  'life',
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
      detail: mainDeckCount > 0 ? 'Imagen + PDF + YDK.' : 'Necesitás cartas en Main.',
      tone: mainDeckCount > 0 ? 'complete' : 'pending',
      disabled: mainDeckCount === 0,
    },
    // No es un paso del deck: es la referencia del meta para armarlo. Siempre se puede abrir.
    {
      key: 'meta',
      step: '6',
      label: 'Meta',
      title: 'Hand traps del meta',
      icon: 'chart',
      detail: 'Qué hand traps se juegan en los torneos.',
      tone: 'pending',
      disabled: false,
    },
    // Tampoco es un paso: la calculadora de LP para duelos en mesa. Sólo en el celular.
    {
      key: 'life',
      step: '7',
      label: 'LP',
      title: 'Calculadora de LP',
      icon: 'heart',
      detail: 'Contá los puntos de vida de un duelo.',
      tone: 'pending',
      disabled: false,
      mobileOnly: true,
    },
  ]
}
