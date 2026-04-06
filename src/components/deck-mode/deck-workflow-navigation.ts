import { formatInteger } from '../../app/utils'

export type DeckWorkflowStepKey = 'deck-builder' | 'categorization' | 'probability-lab' | 'export'
export type DeckWorkflowStepTone = 'complete' | 'progress' | 'pending'

export interface DeckModeNavigationItem {
  key: DeckWorkflowStepKey
  step: string
  title: string
  shortTitle: string
  description: string
  metric: string
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
      title: 'Deck Builder',
      shortTitle: 'Builder',
      description: 'Buscador, drag & drop y armado de Main, Extra y Side.',
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
      title: 'Categorization',
      shortTitle: 'Roles',
      description: 'Separá origen y función sin tocar el deck builder.',
      metric:
        roleCardCount > 0
          ? `${formatInteger(classifiedCardCount)} / ${formatInteger(roleCardCount)}`
          : 'Esperando deck',
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
      title: 'Probability Lab',
      shortTitle: 'Lab',
      description: 'Chequeos, aperturas, resultados y simulaciones.',
      metric:
        patternCount > 0
          ? `${formatInteger(patternCount)} chequeo${patternCount === 1 ? '' : 's'}`
          : 'Sin chequeos',
      detail: hasCompletedRoleStep
        ? patternCount > 0
          ? 'Listo para medir.'
          : 'Definí aperturas.'
        : 'Entrá igual; categorizá para medir.',
      tone: patternCount > 0 ? 'complete' : hasCompletedRoleStep ? 'progress' : 'pending',
      disabled: false,
    },
    {
      key: 'export',
      step: '4',
      title: 'Export',
      shortTitle: 'Export',
      description: 'Descarga la imagen y el TXT del deck sin duplicar lógica.',
      metric: mainDeckCount > 0 ? 'Descarga habilitada' : 'Sin deck',
      detail: mainDeckCount > 0 ? 'Imagen + TXT.' : 'Necesitás cartas en Main.',
      tone: mainDeckCount > 0 ? 'complete' : 'pending',
      disabled: mainDeckCount === 0,
    },
  ]
}
