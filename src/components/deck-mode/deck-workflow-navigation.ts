import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { NavGroup, NavItem, NavTone } from '../shell/nav-model'
import type { IconName } from '../ui/Icon'

export type DeckWorkflowStepKey = 'deck-builder' | 'categorization' | 'probability-lab' | 'export' | 'workspace' | 'meta' | 'replays'

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
  tone: NavTone
  disabled: boolean
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
  'replays',
]

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
      label: t('shell.step.deck.label'),
      title: t('shell.step.deck.title'),
      icon: 'cards',
      detail:
        mainDeckCount >= 40
          ? t('shell.step.deck.ready')
          : mainDeckCount > 0
            ? t('shell.step.deck.remaining', { count: formatInteger(Math.max(0, 40 - mainDeckCount)) })
            : t('shell.step.deck.empty'),
      tone: mainDeckCount >= 40 ? 'complete' : mainDeckCount > 0 ? 'progress' : 'pending',
      disabled: false,
    },
    {
      key: 'categorization',
      step: '2',
      label: t('shell.step.roles.label'),
      title: t('shell.step.roles.title'),
      icon: 'tag',
      detail:
        roleCardCount === 0
          ? t('shell.step.roles.needsMain')
          : hasCompletedRoleStep
            ? t('shell.step.roles.done')
            : t('shell.step.roles.open', { count: formatInteger(unclassifiedCardCount) }),
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
      label: t('shell.step.lab.label'),
      title: t('shell.step.lab.title'),
      icon: 'flask',
      detail: hasCompletedRoleStep
        ? patternCount > 0
          ? t('shell.step.lab.ready')
          : t('shell.step.lab.baseRules')
        : t('shell.step.lab.classifyFirst'),
      tone: hasCompletedRoleStep ? 'complete' : 'pending',
      disabled: false,
    },
    {
      key: 'workspace',
      step: '4',
      label: t('shell.step.compare.label'),
      title: t('shell.step.compare.title'),
      icon: 'columns',
      detail: t('shell.step.compare.detail'),
      tone: 'pending',
      disabled: false,
    },
    {
      key: 'export',
      step: '5',
      label: t('shell.step.export.label'),
      title: t('shell.step.export.title'),
      icon: 'download',
      detail: mainDeckCount > 0 ? t('shell.step.export.formats') : t('shell.step.export.needsMain'),
      tone: mainDeckCount > 0 ? 'complete' : 'pending',
      disabled: mainDeckCount === 0,
    },
    // No es un paso del deck: es la referencia del meta para armarlo. Siempre se puede abrir.
    {
      key: 'meta',
      step: '6',
      label: t('shell.step.meta.label'),
      title: t('shell.step.meta.title'),
      icon: 'chart',
      detail: t('shell.step.meta.detail'),
      tone: 'pending',
      disabled: false,
    },
    // También es referencia: los duelos de torneo de los decks del Meta, en video.
    {
      key: 'replays',
      step: '7',
      label: t('shell.step.replays.label'),
      title: t('shell.step.replays.title'),
      icon: 'play',
      detail: t('shell.step.replays.detail'),
      tone: 'pending',
      disabled: false,
    },
  ]
}

/** Qué herramientas se pueden abrir ahora: la mesa de práctica necesita cartas en el Main. */
interface AppNavTools {
  practice: boolean
}

/** El menú de la app: los pasos del deck, las herramientas (que abren un panel) y la referencia del meta. Lo ven el menú lateral y el cajón del celular. */
export function buildAppNavGroups(steps: DeckModeNavigationItem[], tools: AppNavTools): NavGroup[] {
  const pick = (...keys: DeckWorkflowStepKey[]): NavItem[] => keys.flatMap((key) => steps.filter((step) => step.key === key))

  return [
    { key: 'deck', label: t('shell.nav.group.deck'), items: pick('deck-builder', 'categorization', 'probability-lab', 'workspace', 'export') },
    {
      key: 'tools',
      label: t('shell.nav.group.tools'),
      items: [
        ...(tools.practice ? [{ key: 'practice', label: t('shell.practice.title'), title: t('shell.practice.title'), icon: 'hand' as const }] : []),
        { key: 'life', label: t('shell.life.title'), title: t('shell.life.title'), icon: 'heart' as const },
      ],
    },
    { key: 'discover', label: t('shell.nav.group.discover'), items: pick('meta', 'replays') },
  ]
}
