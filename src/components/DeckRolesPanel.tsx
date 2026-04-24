import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import {
  areGroupKeysEqual,
  cardMatchesGroup,
  CARD_ORIGIN_DEFINITIONS,
  getCardOriginDefinition,
  getCardRoleDefinition,
  getDeckGroupTheme,
  serializeGroupKey,
} from '../app/deck-groups'
import { reclassifyAllCards } from '../app/deck-builder-slice'
import { getClassificationOverrides } from '../app/classification-overrides'
import {
  isCardFullyClassified,
  isCardMissingOrigin,
  isCardMissingRoles,
  isCardPendingReview,
} from '../app/role-step'
import { useAppDispatch } from '../app/store-hooks'
import { formatInteger } from '../app/utils'
import type { CardEntry, CardGroupKey, CardOrigin, CardRole } from '../types'
import { CardArt } from './CardArt'
import { StepHero } from './StepHero'
import { Button } from './ui/Button'
import { CloseButton } from './ui/IconButton'

interface DeckRolesPanelProps {
  cards: CardEntry[]
  onSetOrigin: (ygoprodeckId: number, origin: CardOrigin) => void
  onToggleRole: (ygoprodeckId: number, role: CardRole) => void
}

type ClassificationStateKey =
  | 'all'
  | 'unclassified'
  | 'missing-origin'
  | 'missing-role'
  | 'review'
  | 'complete'

type ClassificationFilterKey = ClassificationStateKey | CardGroupKey

type ClassificationStyleKey = ClassificationStateKey | CardGroupKey
type ClassificationDrawerMode = 'help' | null

interface ClassificationOverviewItem {
  key: ClassificationFilterKey
  label: string
  description: string
  cards: CardEntry[]
  copies: number
  styleKey: ClassificationStyleKey
}

type StatusTone = 'warning' | 'primary' | 'success'

const PANEL_THEME: Record<ClassificationStateKey, { color: string; rgb: string }> = {
  all: { color: 'var(--primary)', rgb: 'var(--primary-rgb)' },
  unclassified: { color: 'var(--warning)', rgb: 'var(--warning-rgb)' },
  'missing-origin': { color: 'var(--warning)', rgb: 'var(--warning-rgb)' },
  'missing-role': { color: '#3b82f6', rgb: '59 130 246' },
  review: { color: 'var(--primary)', rgb: 'var(--primary-rgb)' },
  complete: { color: 'var(--accent)', rgb: 'var(--accent-rgb)' },
}

const ROLE_EDITOR_SECTIONS = [
  {
    title: 'Plan de Juego',
    description: 'Inicio, conversión y continuidad de tu línea.',
    roles: ['starter', 'extender', 'enabler', 'searcher', 'draw', 'combo_piece', 'payoff', 'recovery'] as const,
  },
  {
    title: 'Interacción',
    description: 'Cómo frena, rompe o restringe al rival.',
    roles: ['handtrap', 'disruption', 'boardbreaker', 'floodgate', 'removal'] as const,
  },
  {
    title: 'Utility',
    description: 'Cartas incómodas, dependientes o de metajuego.',
    roles: ['brick', 'garnet', 'tech'] as const,
  },
] as const

const ROLE_FILTER_ORDER: CardRole[] = [
  'starter',
  'extender',
  'handtrap',
  'boardbreaker',
  'brick',
  'enabler',
  'searcher',
  'draw',
  'combo_piece',
  'payoff',
  'recovery',
  'disruption',
  'floodgate',
  'removal',
  'garnet',
  'tech',
]

const PRIMARY_FILTER_KEYS: ClassificationStateKey[] = [
  'unclassified',
  'missing-origin',
  'missing-role',
  'complete',
]

const DESKTOP_CLASSIFICATION_MEDIA_QUERY = '(min-width: 1101px)'

const ORIGIN_HELP_TEXT: Record<CardOrigin, string> = {
  engine: 'Parte del core del deck: cartas que querés ver para ejecutar el plan principal.',
  non_engine: 'Interacción o soporte que no pertenece al motor principal del deck.',
  hybrid: 'Puede contar como motor o como slot flexible según la mano y la build.',
}

const ORIGIN_BLURB_TEXT: Record<CardOrigin, string> = {
  engine: 'Core y plan principal.',
  non_engine: 'Interacción y soporte externo.',
  hybrid: 'Cruza ambos espacios.',
}

const ROLE_HELP_TEXT: Record<CardRole, string> = {
  starter: 'Carta que por sí sola inicia la línea principal.',
  extender: 'Continúa la jugada una vez que la mano ya empezó.',
  enabler: 'Habilita la condición o ventana que otra carta necesita.',
  searcher: 'Encuentra piezas concretas del deck, GY o zonas visibles.',
  draw: 'Aumenta la mano o mejora mucho la calidad del robo.',
  combo_piece: 'Pieza necesaria dentro de una secuencia concreta.',
  payoff: 'Convierte la línea en ventaja, presión o cierre.',
  recovery: 'Recupera recursos después de gastar piezas o recibir interacción.',
  handtrap: 'Interacción que frena al rival desde la mano.',
  disruption: 'Interrumpe al rival durante su línea o una vez establecida la mesa.',
  boardbreaker: 'Ayuda a desarmar un campo rival y abrir espacio para jugar.',
  floodgate: 'Restringe líneas del rival de forma continua o persistente.',
  removal: 'Quita cartas rivales por destrucción, banish, bounce o un efecto similar.',
  brick: 'Carta incómoda de robar si no viene acompañada.',
  garnet: 'Pieza que preferís dejar en el deck porque en mano empeora la línea.',
  tech: 'Slot flexible para matchup o metajuego.',
}

function getClassificationStyle(
  groupKey: ClassificationStyleKey,
): CSSProperties {
  const theme = typeof groupKey === 'string' ? PANEL_THEME[groupKey] : getDeckGroupTheme(groupKey)

  return {
    '--role-color': theme.color,
    '--role-rgb': theme.rgb,
  } as CSSProperties
}

function areClassificationFilterKeysEqual(
  left: ClassificationFilterKey,
  right: ClassificationFilterKey,
): boolean {
  if (typeof left === 'string' || typeof right === 'string') {
    return left === right
  }

  return areGroupKeysEqual(left, right)
}

function getClassificationFilterReactKey(groupKey: ClassificationFilterKey): string {
  return typeof groupKey === 'string' ? groupKey : serializeGroupKey(groupKey)
}

function getCardTypePriority(card: CardEntry): number {
  const cardType = card.apiCard?.cardType?.toLowerCase() ?? ''
  const frameType = card.apiCard?.frameType?.toLowerCase() ?? ''

  if (cardType.includes('spell') || frameType.includes('spell')) {
    return 1
  }

  if (cardType.includes('trap') || frameType.includes('trap')) {
    return 2
  }

  return 0
}

function getCardTypeLabel(card: CardEntry): string {
  const priority = getCardTypePriority(card)

  if (priority === 1) {
    return 'Magia'
  }

  if (priority === 2) {
    return 'Trampa'
  }

  return 'Monstruo'
}

function getCardActionPriority(card: CardEntry): number {
  if (isCardMissingOrigin(card) && isCardMissingRoles(card)) {
    return 0
  }

  if (isCardMissingOrigin(card)) {
    return 1
  }

  if (isCardMissingRoles(card)) {
    return 2
  }

  if (isCardPendingReview(card)) {
    return 3
  }

  return 4
}

function buildOverviewItem(
  key: ClassificationFilterKey,
  label: string,
  description: string,
  cards: CardEntry[],
  styleKey: ClassificationStyleKey,
): ClassificationOverviewItem {
  return {
    key,
    label,
    description,
    cards,
    copies: cards.reduce((total, card) => total + card.copies, 0),
    styleKey,
  }
}

function getEmptyStateCopy(filterKey: ClassificationFilterKey): {
  title: string
  description: string
  tone: string
} {
  if (filterKey === 'unclassified') {
    return {
      title: 'No quedan cartas pendientes en esta cola.',
      description: 'Podés repasar otros grupos desde la derecha o pasar al Paso 3 cuando termines de validar la build.',
      tone: 'surface-card-success text-(--accent)',
    }
  }

  if (filterKey === 'missing-origin') {
    return {
      title: 'No hay cartas sin origen en esta vista.',
      description: 'El motor y los slots externos ya quedaron diferenciados.',
      tone: 'surface-card-success text-(--accent)',
    }
  }

  if (filterKey === 'missing-role') {
    return {
      title: 'No hay cartas sin roles en esta vista.',
      description: 'La función táctica de estas cartas ya quedó definida.',
      tone: 'surface-card-success text-(--accent)',
    }
  }

  if (filterKey === 'review') {
    return {
      title: 'No hay cartas pendientes de revisión.',
      description: 'Las cartas cargadas en esta vista ya están validadas.',
      tone: 'surface-card-success text-(--accent)',
    }
  }

  if (filterKey === 'complete') {
    return {
      title: 'Todavía no hay cartas completas en esta vista.',
      description: 'Primero definí origen y roles para poblar este subconjunto.',
      tone: 'surface-card text-(--text-muted)',
    }
  }

  if (filterKey === 'all') {
    return {
      title: 'Todavía no hay cartas para clasificar.',
      description: 'Primero armá o importá tu Main Deck. Después vas a poder marcar origen y roles.',
      tone: 'surface-card text-(--text-muted)',
    }
  }

  return {
    title: 'Este grupo está vacío por ahora.',
    description: 'Ajustá el filtro o seguí clasificando cartas para poblarlo.',
    tone: 'surface-card text-(--text-muted)',
  }
}

function formatSharePercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function getOriginHelpText(origin: CardOrigin): string {
  return ORIGIN_HELP_TEXT[origin]
}

function getRoleHelpText(role: CardRole): string {
  return ROLE_HELP_TEXT[role]
}

function getGroupHelpText(groupKey: CardGroupKey): string {
  return groupKey.type === 'origin' ? getOriginHelpText(groupKey.value) : getRoleHelpText(groupKey.value)
}

function getOverviewDescription(filterKey: ClassificationFilterKey): string {
  if (filterKey === 'all') {
    return 'Vista general del Main Deck.'
  }

  if (filterKey === 'unclassified') {
    return 'Cartas que todavía requieren una decisión.'
  }

  if (filterKey === 'missing-origin') {
    return 'Todavía no tienen origen definido.'
  }

  if (filterKey === 'missing-role') {
    return 'Todavía no tienen roles asignados.'
  }

  if (filterKey === 'review') {
    return 'Tienen clasificación, pero conviene validarlas.'
  }

  if (filterKey === 'complete') {
    return 'Listas para pasar al Paso 3.'
  }

  return getGroupHelpText(filterKey)
}

function DefinitionTooltip({
  label,
  description,
  children,
  className = '',
}: {
  label: string
  description: string
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={['block min-w-0 max-w-full', className].join(' ').trim()}
      title={`${label}: ${description}`}
      aria-label={`${label}: ${description}`}
    >
      {children}
    </span>
  )
}

function ClassificationStatusChip({
  label,
  tone,
  className = '',
}: {
  label: string
  tone: StatusTone
  className?: string
}) {
  return (
    <span className={[
      'classification-status-chip',
      tone === 'warning'
        ? 'classification-status-chip-warning'
        : tone === 'primary'
          ? 'classification-status-chip-primary'
          : 'classification-status-chip-success',
      className,
    ].join(' ')}>
      {label}
    </span>
  )
}

function getCardPrimaryStatus(card: CardEntry): { label: string; tone: StatusTone } | null {
  if (isCardMissingOrigin(card) && isCardMissingRoles(card)) {
    return null
  }

  if (isCardMissingOrigin(card)) {
    return { label: 'Sin origen', tone: 'warning' }
  }

  if (isCardMissingRoles(card)) {
    return { label: 'Sin rol', tone: 'warning' }
  }

  if (isCardPendingReview(card)) {
    return { label: 'Revisión', tone: 'primary' }
  }

  return null
}

function getCardQueueSummary(card: CardEntry): string {
  const items = [getCardTypeLabel(card)]

  if (card.origin === null) {
    items.push('Sin origen')
  } else {
    const originLabel = getCardOriginDefinition(card.origin).label
    items.push(card.origin === 'non_engine' ? 'Non-Engine' : originLabel)
  }

  const roleLabels = ROLE_FILTER_ORDER
    .filter((role) => card.roles.includes(role))
    .map((role) => getCardRoleDefinition(role).label)

  if (roleLabels.length === 0) {
    items.push('Sin rol')
  } else {
    items.push(...roleLabels)
  }

  return items.join(' | ')
}

function renderReferenceRoles(roleKeys: readonly CardRole[]) {
  return roleKeys.map((roleKey) => {
    const definition = getCardRoleDefinition(roleKey)

    return (
      <article
        key={serializeGroupKey(definition.key)}
        className="role-reference-card grid gap-1 px-2 py-2"
        style={getClassificationStyle(definition.key)}
      >
        <div className="flex items-center gap-2">
          <span className="role-reference-mark shrink-0" />
          <strong className="block text-[0.8rem] leading-none text-(--text-main)">
            {definition.label}
          </strong>
        </div>
        <p className="app-muted m-0 text-[0.72rem] leading-[1.14]">{getRoleHelpText(roleKey)}</p>
      </article>
    )
  })
}

function matchesMediaQuery(query: string): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.matchMedia(query).matches
}

function ClassificationDrawer({
  kicker,
  title,
  subtitle,
  isOpen,
  onClose,
  children,
}: {
  kicker: string
  title: string
  subtitle: string
  isOpen: boolean
  onClose: () => void
  children: ReactNode
}) {
  if (!isOpen) {
    return null
  }

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar panel"
        className="fixed inset-0 z-120 bg-[rgb(var(--background-rgb)/0.72)] backdrop-blur-[2px]"
        onClick={onClose}
      />

      <aside
        className="surface-panel fixed inset-y-0 right-0 z-130 grid h-dvh w-full max-w-120 grid-rows-[minmax(0,1fr)] border-l border-(--border-subtle) p-0 shadow-[-28px_0_54px_rgba(0,0,0,0.38)]"
        style={{ background: 'var(--card-background)' }}
      >
        <div className="min-h-0 overflow-y-auto px-4 pb-4 pt-4">
          <div className="grid gap-3">
            <div className="flex justify-end">
              <CloseButton size="sm" aria-label="Cerrar panel" onClick={onClose} />
            </div>

            <header className="border-b border-(--border-subtle) pb-3">
              <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">{kicker}</p>
              <h3 className="m-[0.28rem_0_0] text-[1.6rem] leading-[0.98] tracking-[-0.02em] text-(--text-main)">{title}</h3>
              <p className="app-muted m-[0.38rem_0_0] max-w-[40ch] text-[0.8rem] leading-[1.18]">{subtitle}</p>
            </header>

            {children}
          </div>
        </div>
      </aside>
    </>
  )
}

function ClassificationModal({
  isOpen,
  kicker = 'Categorization',
  title,
  subtitle,
  headerActions,
  hideHeader = false,
  onClose,
  children,
}: {
  isOpen: boolean
  kicker?: string
  title: string
  subtitle: string
  headerActions?: ReactNode
  hideHeader?: boolean
  onClose: () => void
  children: ReactNode
}) {
  if (!isOpen) {
    return null
  }

  return (
    <>
      <div className="fixed inset-0 z-150 grid place-items-center bg-[rgb(var(--background-rgb)/0.76)] px-4 py-5" onClick={onClose}>
        <div
          className="surface-panel relative flex w-full max-w-280 min-h-0 max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0 shadow-none"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="absolute right-4 top-4 z-10 min-[1101px]:right-6 min-[1101px]:top-5">
            <CloseButton size="md" aria-label="Cerrar detalle" onClick={onClose} />
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4 min-[1101px]:px-6 min-[1101px]:pb-5 min-[1101px]:pt-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="grid gap-2.5 min-[1101px]:gap-3">
              {!hideHeader ? (
                <header className="grid gap-2 border-b border-(--border-subtle) pb-2 min-[860px]:grid-cols-[minmax(0,1fr)_auto] min-[860px]:items-end">
                  <div className="min-w-0">
                    <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">{kicker}</p>
                    <h3 className="m-[0.2rem_0_0] text-[1.45rem] leading-[0.98] tracking-[-0.03em] text-(--text-main) min-[1101px]:text-[1.72rem]">{title}</h3>
                    <p className="app-muted m-[0.3rem_0_0] text-[0.76rem] leading-[1.14]">{subtitle}</p>
                  </div>

                  {headerActions ? (
                    <div className="flex flex-wrap items-center gap-2 min-[860px]:justify-end">
                      {headerActions}
                    </div>
                  ) : null}
                </header>
              ) : null}

              {children}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export function DeckRolesPanel({
  cards,
  onSetOrigin,
  onToggleRole,
}: DeckRolesPanelProps) {
  const dispatch = useAppDispatch()
  const [activeFilter, setActiveFilter] = useState<ClassificationFilterKey>(() =>
    cards.some((card) => !isCardFullyClassified(card)) ? 'unclassified' : 'complete',
  )
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [drawerMode, setDrawerMode] = useState<ClassificationDrawerMode>(null)
  const [isDesktopLayout, setIsDesktopLayout] = useState(() =>
    matchesMediaQuery(DESKTOP_CLASSIFICATION_MEDIA_QUERY),
  )
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  const sortedCards = useMemo(
    () =>
      [...cards].sort((left, right) => {
        const actionDelta = getCardActionPriority(left) - getCardActionPriority(right)

        if (actionDelta !== 0) {
          return actionDelta
        }

        return right.copies - left.copies || getCardTypePriority(left) - getCardTypePriority(right) || left.name.localeCompare(right.name)
      }),
    [cards],
  )
  const totalCopies = useMemo(
    () => sortedCards.reduce((total, card) => total + card.copies, 0),
    [sortedCards],
  )
  const unclassifiedCards = useMemo(
    () => sortedCards.filter((card) => !isCardFullyClassified(card)),
    [sortedCards],
  )
  const completeCards = useMemo(
    () => sortedCards.filter((card) => isCardFullyClassified(card)),
    [sortedCards],
  )
  const hasCardsNeedingClassification = useMemo(
    () => sortedCards.some((card) => card.origin === null || card.roles.length === 0 || card.needsReview),
    [sortedCards],
  )

  const defaultFilter = unclassifiedCards.length > 0 ? 'unclassified' : 'complete'
  const overviewItems = useMemo(() => {
    const stateItems = [
      buildOverviewItem(
        'unclassified',
        'Sin completar',
        getOverviewDescription('unclassified'),
        unclassifiedCards,
        'unclassified',
      ),
      buildOverviewItem(
        'missing-origin',
        'Sin origen',
        getOverviewDescription('missing-origin'),
        sortedCards.filter((card) => isCardMissingOrigin(card)),
        'missing-origin',
      ),
      buildOverviewItem(
        'missing-role',
        'Sin rol',
        getOverviewDescription('missing-role'),
        sortedCards.filter((card) => isCardMissingRoles(card)),
        'missing-role',
      ),
      buildOverviewItem(
        'review',
        'Revisión pendiente',
        getOverviewDescription('review'),
        sortedCards.filter((card) => isCardPendingReview(card)),
        'review',
      ),
      buildOverviewItem(
        'complete',
        'Completas',
        getOverviewDescription('complete'),
        completeCards,
        'complete',
      ),
      buildOverviewItem(
        'all',
        'Todo el Main',
        getOverviewDescription('all'),
        sortedCards,
        'all',
      ),
    ]

    const originItems = CARD_ORIGIN_DEFINITIONS.map((definition) =>
      buildOverviewItem(
        definition.key,
        definition.label,
        getOverviewDescription(definition.key),
        sortedCards.filter((card) => cardMatchesGroup(card, definition.key)),
        definition.key,
      ),
    )

    const roleItems = ROLE_FILTER_ORDER.map((role) => {
      const definition = getCardRoleDefinition(role)

      return buildOverviewItem(
        definition.key,
        definition.label,
        getOverviewDescription(definition.key),
        sortedCards.filter((card) => cardMatchesGroup(card, definition.key)),
        definition.key,
      )
    })

    return [...stateItems, ...originItems, ...roleItems]
  }, [completeCards, sortedCards, unclassifiedCards])
  const activeOverview =
    overviewItems.find((item) => areClassificationFilterKeysEqual(item.key, activeFilter)) ??
    overviewItems[0] ??
    null
  const filteredCards = activeOverview?.cards ?? []
  const emptyStateCopy = getEmptyStateCopy(activeFilter)
  const selectedCard = useMemo(
    () =>
      (selectedCardId ? sortedCards.find((card) => card.id === selectedCardId) : null) ??
      filteredCards[0] ??
      null,
    [filteredCards, selectedCardId, sortedCards],
  )
  const isSelectedCardInActiveFilter = useMemo(
    () => (selectedCard ? filteredCards.some((card) => card.id === selectedCard.id) : false),
    [filteredCards, selectedCard],
  )
  const visibleQueueCards = useMemo(() => {
    if (!selectedCard || isSelectedCardInActiveFilter) {
      return filteredCards
    }

    return [selectedCard, ...filteredCards.filter((card) => card.id !== selectedCard.id)]
  }, [filteredCards, isSelectedCardInActiveFilter, selectedCard])
  const selectedCardPosition = selectedCard
    ? visibleQueueCards.findIndex((card) => card.id === selectedCard.id) + 1
    : 0
  // Stable navigation order (by name) so prev/next don't jump when a card's priority changes
  const stableNavigationCards = useMemo(
    () => [...cards].sort((left, right) =>
      left.name.localeCompare(right.name) || right.copies - left.copies,
    ),
    [cards],
  )
  const selectedCardIndexInFullList = selectedCard
    ? stableNavigationCards.findIndex((card) => card.id === selectedCard.id)
    : -1
  const previousCard = selectedCardIndexInFullList > 0 ? stableNavigationCards[selectedCardIndexInFullList - 1] ?? null : null
  const nextCard =
    selectedCardIndexInFullList >= 0 && selectedCardIndexInFullList < stableNavigationCards.length - 1
      ? stableNavigationCards[selectedCardIndexInFullList + 1] ?? null
      : null
  const filterItemMap = useMemo(
    () => new Map(overviewItems.map((item) => [getClassificationFilterReactKey(item.key), item])),
    [overviewItems],
  )
  const primaryFilterItems = useMemo(
    () =>
      PRIMARY_FILTER_KEYS.map((key) => filterItemMap.get(key)).filter(
        (item): item is ClassificationOverviewItem => Boolean(item),
      ),
    [filterItemMap],
  )

  useEffect(() => {
    if (overviewItems.some((item) => areClassificationFilterKeysEqual(item.key, activeFilter))) {
      return
    }

    setActiveFilter(defaultFilter)
  }, [activeFilter, defaultFilter, overviewItems])

  useEffect(() => {
    if (selectedCardId && sortedCards.some((card) => card.id === selectedCardId)) {
      // Card still exists in deck — check if it left the active filter
      if (!filteredCards.some((card) => card.id === selectedCardId) && filteredCards.length > 0) {
        // Card left the filter (e.g., was classified while viewing "Sin completar")
        // Auto-advance to the first card still in the filter
        setSelectedCardId(filteredCards[0]?.id ?? null)
      }
      return
    }

    if (filteredCards.length === 0) {
      setSelectedCardId(null)
      return
    }

    setSelectedCardId(filteredCards[0]?.id ?? null)
  }, [filteredCards, selectedCardId, sortedCards])

  const handleFilterChange = (nextFilter: ClassificationFilterKey) => {
    if (areClassificationFilterKeysEqual(activeFilter, nextFilter)) {
      return
    }

    setSelectedCardId(null)
    setActiveFilter(nextFilter)
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_CLASSIFICATION_MEDIA_QUERY)

    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktopLayout(event.matches)
    }

    setIsDesktopLayout(mediaQuery.matches)
    mediaQuery.addEventListener('change', handleChange)

    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])

  useEffect(() => {
    if (!selectedCard) {
      setIsDetailOpen(false)
    }
  }, [selectedCard])

  useEffect(() => {
    if (drawerMode === null && !isDetailOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (drawerMode !== null) {
          setDrawerMode(null)
          return
        }

        setIsDetailOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [drawerMode, isDetailOpen])

  const handleCardSelection = (cardId: string) => {
    setSelectedCardId(cardId)
    setIsDetailOpen(true)
  }

  const handleSelectPreviousCard = () => {
    if (!previousCard) {
      return
    }

    setSelectedCardId(previousCard.id)
    setIsDetailOpen(true)
  }

  const handleSelectNextCard = () => {
    if (!nextCard) {
      return
    }

    setSelectedCardId(nextCard.id)
    setIsDetailOpen(true)
  }

  const renderSelectedCardDetail = () => {
    if (!selectedCard) {
      return (
        <p className={[emptyStateCopy.tone, 'm-0 px-2.5 py-2 text-[0.8rem]'].join(' ')}>
          <strong className="block text-(--text-main)">{emptyStateCopy.title}</strong>
          <span className="mt-1 block">{emptyStateCopy.description}</span>
        </p>
      )
    }

    const cardArtColumn = (
      <div className="grid content-start gap-2">
        <div className="w-full min-[1101px]:w-[18rem]">
          <CardArt
            remoteUrl={selectedCard.apiCard?.imageUrl ?? selectedCard.apiCard?.imageUrlSmall ?? null}
            name={selectedCard.name}
            className="block h-auto w-full bg-input"
            limitCard={selectedCard.apiCard}
          />
        </div>
      </div>
    )

    const editorPanel = (
      <div className="grid gap-3">
        <section className="grid gap-2">
          <div className="grid gap-0.5">
            <p className="app-kicker m-0 text-[0.64rem] uppercase tracking-widest">¿Qué es?</p>
          </div>

	          <div className="grid gap-1.5 min-[860px]:grid-cols-3">
	            {CARD_ORIGIN_DEFINITIONS.map((definition) => {
	              const active = selectedCard.origin === definition.key.value
	              const muted = selectedCard.origin !== null && !active

	              return (
	                <DefinitionTooltip
                  key={serializeGroupKey(definition.key)}
                  label={definition.label}
                  description={getOriginHelpText(definition.key.value)}
                  className="min-w-0"
                >
                  <button
                    type="button"
                    aria-pressed={active}
                    title={getOriginHelpText(definition.key.value)}
	                    className={[
	                      'classification-origin-option grid gap-1 p-2 text-left',
	                      active ? 'classification-origin-option-active' : '',
	                      muted ? 'classification-origin-option-muted' : '',
	                    ].join(' ')}
	                    style={getClassificationStyle(definition.key)}
	                    onClick={() => onSetOrigin(selectedCard.apiCard?.ygoprodeckId ?? 0, definition.key.value)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="role-reference-mark shrink-0" />
                      <strong className="text-[0.8rem] leading-none text-(--text-main)">{definition.label}</strong>
                    </div>
                    <span className="app-muted text-[0.66rem] leading-[1.08]">{ORIGIN_BLURB_TEXT[definition.key.value]}</span>
                  </button>
                </DefinitionTooltip>
              )
            })}
          </div>
        </section>

        <section className="grid gap-2">
          <div className="grid gap-1.5">
            <p className="app-kicker m-0 text-[0.64rem] uppercase tracking-widest">¿Qué roles cumple?</p>
          </div>

          <div className="grid gap-2 min-[1101px]:grid-cols-3 min-[1101px]:items-stretch">
          {ROLE_EDITOR_SECTIONS.map((section) => {
            const selectedCount = section.roles.reduce(
              (total, role) => total + (selectedCard.roles.includes(role) ? 1 : 0),
              0,
            )

            return (
              <article
                key={section.title}
                className="surface-card grid h-full grid-rows-[auto_minmax(0,1fr)] gap-1.5 p-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <strong className="text-[0.8rem] leading-none text-(--text-main)">{section.title}</strong>
                  <span className="app-chip px-1.5 py-0.5 text-[0.62rem]">
                    {formatInteger(selectedCount)} / {formatInteger(section.roles.length)}
                  </span>
                </div>

                <div className="grid content-start gap-1.5 min-[720px]:grid-cols-2">
                  {section.roles.map((role) => {
                    const definition = getCardRoleDefinition(role)
                    const active = selectedCard.roles.includes(role)

                    return (
                      <DefinitionTooltip
                        key={serializeGroupKey(definition.key)}
                        label={definition.label}
                        description={getRoleHelpText(role)}
                        className="min-w-0"
                      >
                        <button
                          type="button"
                          aria-pressed={active}
                          title={getRoleHelpText(role)}
                          className={[
                            'role-option-button min-w-0 w-full max-w-full px-2 py-[0.44rem] text-left text-[0.68rem] leading-[1.08] whitespace-normal',
                            active ? 'role-option-button-active' : '',
                          ].join(' ')}
                          style={getClassificationStyle(definition.key)}
                          onClick={() => onToggleRole(selectedCard.apiCard?.ygoprodeckId ?? 0, role)}
                        >
                          {definition.label}
                        </button>
                      </DefinitionTooltip>
                    )
                  })}
                </div>
              </article>
            )
          })}
          </div>
        </section>
      </div>
    )

    return (
      <div className="grid w-full min-w-0 gap-3">
        <div className="grid gap-3 min-[1101px]:grid-cols-[18rem_minmax(0,1fr)] min-[1101px]:items-stretch">
          {cardArtColumn}

          <div className="flex min-h-full flex-col gap-2.5">
            <div className="grid gap-1 pr-12">
              <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-[0.12em]">Carta actual</p>
              <h3 className="m-0 wrap-break-word text-[2rem] leading-[0.94] tracking-[-0.03em] text-(--text-main) min-[1101px]:text-[2.3rem]">
                {selectedCard.name}
              </h3>
              <p className="app-muted m-0 text-[0.9rem] leading-[1.05] min-[1101px]:text-[0.98rem]">
                {formatInteger(selectedCard.copies)} copia{selectedCard.copies === 1 ? '' : 's'} en Main Deck
              </p>
            </div>

            {editorPanel}

            <div className="mt-auto flex justify-end gap-2 pt-1">
              <Button variant="primary" size="sm" onClick={handleSelectPreviousCard} disabled={!previousCard}>
                Anterior
              </Button>
              <Button variant="primary" size="sm" onClick={handleSelectNextCard} disabled={!nextCard}>
                Siguiente
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <section className="surface-panel deck-mobile-step-shell grid min-w-0 content-start gap-2.5 overflow-x-hidden p-0 min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:grid-rows-[auto_auto_minmax(0,1fr)] min-[1101px]:gap-3 min-[1101px]:overflow-hidden min-[1101px]:p-2.5">
      <StepHero
        step="Categorización"
        title="Clasificá cada carta con Origen y Roles"
        description="Separá dos decisiones distintas para el Main Deck: a qué grupo pertenece cada carta y qué rol cumple cuando la robás."
        side={
          sortedCards.length > 0 ? (
            <>
              {hasCardsNeedingClassification ? (
                <Button variant="primary" size="sm" onClick={() => dispatch(reclassifyAllCards({ overrides: getClassificationOverrides() }))}>
                  Clasificar todo
                </Button>
              ) : null}
              <Button variant="primary" size="sm" onClick={() => setDrawerMode('help')}>
                Guia de Clasificación
              </Button>
            </>
          ) : null
        }
        sideVariant="inline"
      />

      {sortedCards.length > 0 ? (
        <section className="surface-panel-soft grid gap-2 p-2.5">
          <div className="min-w-0">
            <div className="min-w-0">
              <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Vista activa</p>
              <p className="app-muted m-[0.22rem_0_0] text-[0.75rem] leading-[1.14]">
                Priorizá el subconjunto que querés cerrar primero.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {primaryFilterItems.map((item) => {
              const active = areClassificationFilterKeysEqual(activeFilter, item.key)

              return (
                <button
                  key={getClassificationFilterReactKey(item.key)}
                  type="button"
                  className={[
                    'classification-view-chip',
                    active ? 'classification-view-chip-active' : '',
                  ].join(' ')}
                  style={getClassificationStyle(item.styleKey)}
                  onClick={() => handleFilterChange(item.key)}
                >
                  <span>{item.label}</span>
                  <span className="app-soft text-[0.66rem]">{formatInteger(item.cards.length)}</span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {sortedCards.length === 0 ? (
        <p className="surface-card m-0 px-2.5 py-2 text-[0.8rem] text-(--text-muted)">
          Primero armá o importá tu Main Deck. Después vas a poder clasificar cada carta.
        </p>
      ) : (
        <section className="surface-panel-soft grid min-w-0 gap-2.5 p-2.5 max-[1100px]:max-h-[min(70dvh,48rem)] max-[1100px]:overflow-hidden min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:grid-rows-[auto_minmax(0,1fr)] min-[1101px]:overflow-hidden">
            {visibleQueueCards.length === 0 ? (
              <p className={[emptyStateCopy.tone, 'm-0 px-2.5 py-2 text-[0.8rem]'].join(' ')}>
                <strong className="block text-(--text-main)">{emptyStateCopy.title}</strong>
                <span className="mt-1 block">{emptyStateCopy.description}</span>
              </p>
            ) : (
              <div className="grid gap-1 pr-0 max-[1100px]:min-h-0 max-[1100px]:overflow-y-auto max-[1100px]:pr-1 min-[1101px]:min-h-0 min-[1101px]:overflow-y-auto min-[1101px]:pr-1">
                {visibleQueueCards.map((card) => {
                  const primaryStatus = getCardPrimaryStatus(card)
                  const active = selectedCard?.id === card.id

                  return (
                    <button
                      key={card.id}
                      type="button"
                      aria-pressed={active}
                      className={[
                        'classification-queue-card app-list-item grid min-w-0 shrink-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 px-1.5 py-1.5 text-left',
                        active ? 'classification-queue-card-active' : '',
                      ].join(' ')}
                      onClick={() => handleCardSelection(card.id)}
                    >
                      <div
                        className={[
                          'classification-queue-art w-[36px]',
                          active ? 'classification-queue-art-active' : '',
                        ].join(' ')}
                      >
                        <CardArt
                          remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
                          name={card.name}
                          className="block h-auto w-full bg-input"
                          limitCard={card.apiCard}
                          limitBadgeSize="sm"
                        />
                      </div>

                      <div className="grid min-w-0 gap-1">
                        <strong className="truncate text-[0.8rem] leading-[1.04] text-(--text-main)">{card.name}</strong>

                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="app-muted m-0 min-w-0 truncate text-[0.66rem] leading-none">
                            {getCardQueueSummary(card)}
                          </p>
                          {primaryStatus ? (
                            <ClassificationStatusChip
                              label={primaryStatus.label}
                              tone={primaryStatus.tone}
                              className="classification-status-chip-compact shrink-0"
                            />
                          ) : null}
                        </div>
                      </div>

                      <span className="app-chip shrink-0 px-1.5 py-0.5 text-[0.62rem]">
                        {formatInteger(card.copies)}x
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
        </section>
      )}

      <ClassificationModal
        isOpen={isDetailOpen && selectedCard !== null}
        kicker={isDesktopLayout ? 'Clasificación' : 'Categorization'}
        title="Origen y roles"
        subtitle="Resolvé la carta seleccionada sin salir de la cola."
        hideHeader
        onClose={() => setIsDetailOpen(false)}
        key={selectedCard?.id ?? 'empty'}
      >
        {renderSelectedCardDetail()}
      </ClassificationModal>

      <ClassificationDrawer
        kicker="Modelo"
        title="Guía de clasificación"
        subtitle="Origen y roles usados en el lab. Consultala solo cuando necesites recordar la definición."
        isOpen={drawerMode === 'help'}
        onClose={() => setDrawerMode(null)}
      >
        <div className="grid gap-4">
          <section className="grid gap-2">
            <div>
              <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Origen</p>
              <p className="app-muted m-[0.22rem_0_0] text-[0.73rem] leading-[1.14]">
                Responde si la carta pertenece al motor principal o a un espacio externo/flexible.
              </p>
            </div>

            <div className="grid gap-2">
              {CARD_ORIGIN_DEFINITIONS.map((definition) => (
                <article
                  key={serializeGroupKey(definition.key)}
                  className="role-reference-group grid gap-2 p-2.5"
                  style={getClassificationStyle(definition.key)}
                >
                  <div className="flex items-center gap-2">
                    <span className="role-reference-mark shrink-0" />
                    <strong className="text-[0.84rem] leading-none text-(--text-main)">{definition.label}</strong>
                  </div>
                  <p className="app-muted m-0 text-[0.72rem] leading-[1.14]">{getOriginHelpText(definition.key.value)}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-2">
            <div>
              <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Roles</p>
              <p className="app-muted m-[0.22rem_0_0] text-[0.73rem] leading-[1.14]">
                Responden qué hace la carta dentro de tu mano, tu línea o tu plan de turno.
              </p>
            </div>

            <div className="grid gap-2">
              {ROLE_EDITOR_SECTIONS.map((section) => (
                <article key={section.title} className="role-reference-group grid gap-2 p-2.5">
                  <div className="grid gap-1">
                    <strong className="text-[0.82rem] leading-none text-(--text-main)">{section.title}</strong>
                    <p className="app-muted m-0 text-[0.72rem] leading-[1.14]">{section.description}</p>
                  </div>

                  <div className="grid gap-1.5">{renderReferenceRoles(section.roles)}</div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </ClassificationDrawer>
    </section>
  )
}
