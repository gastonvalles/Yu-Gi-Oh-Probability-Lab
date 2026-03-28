import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import {
  areGroupKeysEqual,
  cardMatchesGroup,
  CARD_ORIGIN_DEFINITIONS,
  createRoleGroupKey,
  getCardOriginDefinition,
  getCardRoleDefinition,
  getDeckGroupTheme,
  serializeGroupKey,
} from '../app/deck-groups'
import {
  countCardsPendingReview,
  isCardFullyClassified,
  isCardMissingOrigin,
  isCardMissingRoles,
  isCardPendingReview,
} from '../app/role-step'
import { formatInteger } from '../app/utils'
import type { CardEntry, CardGroupKey, CardOrigin, CardRole } from '../types'
import { CardArt } from './CardArt'
import { StepHero } from './StepHero'
import { Button } from './ui/Button'

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
type ClassificationDrawerMode = 'help' | 'filters' | null

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
    title: 'Flow del plan',
    description: 'Inicio, conversión y continuidad de tu línea.',
    roles: ['starter', 'extender', 'enabler', 'searcher', 'draw', 'combo_piece', 'payoff', 'recovery'] as const,
  },
  {
    title: 'Interacción',
    description: 'Cómo frena, rompe o restringe al rival.',
    roles: ['handtrap', 'disruption', 'boardbreaker', 'floodgate', 'removal'] as const,
  },
  {
    title: 'Riesgo y slots flex',
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
  'all',
  'unclassified',
  'missing-origin',
  'missing-role',
  'review',
  'complete',
]

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

function getClassificationFilterCardStyle(
  groupKey: ClassificationStyleKey,
  active: boolean,
): CSSProperties {
  return {
    ...getClassificationStyle(groupKey),
    ...(active
      ? {
          borderColor: 'rgb(var(--role-rgb) / 0.72)',
          background:
            'linear-gradient(180deg, rgb(var(--role-rgb) / 0.16), rgb(var(--card-background-rgb) / 0.98)),' +
            'linear-gradient(180deg, rgb(var(--secondary-rgb) / 0.96), rgb(var(--background-rgb) / 0.98))',
          boxShadow:
            '0 0 0 1px rgb(var(--role-rgb) / 0.12), 0 0 26px rgb(var(--role-rgb) / 0.12)',
        }
      : {}),
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

function getCardStatusItems(card: CardEntry): Array<{ key: string; label: string; tone: StatusTone }> {
  const items: Array<{ key: string; label: string; tone: StatusTone }> = []

  if (isCardMissingOrigin(card)) {
    items.push({ key: 'missing-origin', label: 'Sin origen', tone: 'warning' })
  }

  if (isCardMissingRoles(card)) {
    items.push({ key: 'missing-role', label: 'Sin rol', tone: 'warning' })
  }

  if (isCardPendingReview(card)) {
    items.push({ key: 'review', label: 'Revisión pendiente', tone: 'primary' })
  }

  if (items.length === 0) {
    items.push({ key: 'complete', label: 'Completa', tone: 'success' })
  }

  return items
}

function getCardPrimaryStatus(card: CardEntry): { label: string; tone: StatusTone } {
  if (isCardMissingOrigin(card) && isCardMissingRoles(card)) {
    return { label: 'Sin origen y rol', tone: 'warning' }
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

  return { label: '✓ Completa', tone: 'success' }
}

function getCardQueueSummary(card: CardEntry): string {
  const originSummary = card.origin === null ? 'Sin origen' : getCardOriginDefinition(card.origin).shortLabel

  if (card.roles.length === 0) {
    return `${originSummary} · sin rol`
  }

  return `${originSummary} · ${formatInteger(card.roles.length)} rol${card.roles.length === 1 ? '' : 'es'}`
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
        className="fixed inset-0 z-[120] bg-[rgb(var(--background-rgb)/0.72)] min-[1180px]:hidden"
        onClick={onClose}
      />

      <aside className="surface-panel fixed inset-y-0 right-0 z-[130] grid h-[100dvh] w-full max-w-[30rem] grid-rows-[auto_minmax(0,1fr)] gap-0 border-l border-(--border-subtle) p-0 shadow-[-28px_0_54px_rgba(0,0,0,0.38)]">
        <div className="grid gap-2 border-b border-(--border-subtle) px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">{kicker}</p>
              <h3 className="m-[0.2rem_0_0] text-[1rem] leading-none text-(--text-main)">{title}</h3>
              <p className="app-muted m-[0.3rem_0_0] max-w-[38ch] text-[0.76rem] leading-[1.14]">{subtitle}</p>
            </div>

            <button
              type="button"
              className="app-icon-button text-[1rem] leading-none"
              aria-label="Cerrar panel"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-4">
          {children}
        </div>
      </aside>
    </>
  )
}

export function DeckRolesPanel({
  cards,
  onSetOrigin,
  onToggleRole,
}: DeckRolesPanelProps) {
  const [activeFilter, setActiveFilter] = useState<ClassificationFilterKey>(() =>
    cards.some((card) => !isCardFullyClassified(card)) ? 'unclassified' : 'all',
  )
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [drawerMode, setDrawerMode] = useState<ClassificationDrawerMode>(null)

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
  const pendingReviewCount = useMemo(() => countCardsPendingReview(sortedCards), [sortedCards])
  const completeCards = useMemo(
    () => sortedCards.filter((card) => isCardFullyClassified(card)),
    [sortedCards],
  )
  const defaultFilter = unclassifiedCards.length > 0 ? 'unclassified' : 'all'
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
  const hasPinnedSelectedCard = Boolean(selectedCard && !isSelectedCardInActiveFilter)
  const selectedCardIndex = selectedCard
    ? visibleQueueCards.findIndex((card) => card.id === selectedCard.id) + 1
    : 0
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
  const advancedFilterSections = useMemo(
    () => [
      {
        title: 'Origen',
        items: CARD_ORIGIN_DEFINITIONS.map((definition) => filterItemMap.get(serializeGroupKey(definition.key))).filter(
          (item): item is ClassificationOverviewItem => Boolean(item),
        ),
      },
      {
        title: 'Roles',
        items: ROLE_FILTER_ORDER.map((role) => filterItemMap.get(serializeGroupKey(createRoleGroupKey(role)))).filter(
          (item): item is ClassificationOverviewItem => Boolean(item),
        ),
      },
    ],
    [filterItemMap],
  )
  const activeAdvancedFilter = typeof activeFilter === 'string' ? null : activeOverview

  useEffect(() => {
    if (overviewItems.some((item) => areClassificationFilterKeysEqual(item.key, activeFilter))) {
      return
    }

    setActiveFilter(defaultFilter)
  }, [activeFilter, defaultFilter, overviewItems])

  useEffect(() => {
    if (selectedCardId && sortedCards.some((card) => card.id === selectedCardId)) {
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
    if (drawerMode === null) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDrawerMode(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [drawerMode])

  return (
    <section className="surface-panel grid h-full min-h-0 min-w-0 overflow-x-hidden gap-3 p-2.5 min-[1380px]:grid-rows-[auto_minmax(0,1fr)]">
      <StepHero
        step="Paso 2"
        pill="Categorization"
        title="Clasificá cada carta sin perder el foco"
        description="Separá dos decisiones distintas para el Main Deck: de qué espacio viene cada carta y qué función cumple cuando la robás."
        side={
          sortedCards.length > 0 ? (
            <div className="grid gap-2">
              <div className="grid grid-cols-3 gap-2">
                <div className="surface-card px-2 py-1.5">
                  <span className="app-muted block text-[0.62rem] uppercase tracking-widest">Pendientes</span>
                  <strong className="mt-1 block text-[0.94rem] leading-none text-(--text-main)">{formatInteger(unclassifiedCards.length)}</strong>
                </div>
                <div className="surface-card px-2 py-1.5">
                  <span className="app-muted block text-[0.62rem] uppercase tracking-widest">Revisión</span>
                  <strong className="mt-1 block text-[0.94rem] leading-none text-(--text-main)">{formatInteger(pendingReviewCount)}</strong>
                </div>
                <div className="surface-card-success px-2 py-1.5 text-(--accent)">
                  <span className="block text-[0.62rem] uppercase tracking-widest">Completas</span>
                  <strong className="mt-1 block text-[0.94rem] leading-none text-(--text-main)">{formatInteger(completeCards.length)}</strong>
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={() => setDrawerMode('filters')}>
                  Filtros
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setDrawerMode('help')}>
                  Ver modelo
                </Button>
              </div>
            </div>
          ) : null
        }
        sideClassName="min-[920px]:w-full"
      />

      {sortedCards.length > 0 ? (
        <section className="surface-panel-soft grid gap-2 p-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Vista activa</p>
              <p className="app-muted m-[0.22rem_0_0] text-[0.75rem] leading-[1.14]">
                Priorizá el subconjunto que querés cerrar primero.
              </p>
            </div>

            {activeAdvancedFilter ? (
              <button
                type="button"
                className="classification-view-chip classification-view-chip-active"
                style={getClassificationStyle(activeAdvancedFilter.styleKey)}
                onClick={() => handleFilterChange(defaultFilter)}
              >
                Filtrando: {activeAdvancedFilter.label} ×
              </button>
            ) : null}
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
        <div className="grid min-h-0 gap-3 min-[1180px]:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] min-[1180px]:items-start">
          <section className="surface-panel-soft grid min-h-0 min-w-0 gap-2.5 p-2.5 min-[1180px]:h-full min-[1180px]:grid-rows-[auto_minmax(0,1fr)]">
            <div className="grid gap-2">
              <div>
                <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Cola de clasificación</p>
                <h3 className="m-[0.2rem_0_0] text-[0.98rem] leading-none">{activeOverview?.label ?? 'Cartas del Main Deck'}</h3>
                <p className="app-muted m-[0.28rem_0_0] text-[0.75rem] leading-[1.16]">
                  {activeOverview?.description ?? 'Elegí una carta y resolvé origen y roles sin salir de la cola.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <span className="app-chip px-2 py-0.5 text-[0.68rem]">{formatInteger(filteredCards.length)} cartas</span>
                <span className="app-chip px-2 py-0.5 text-[0.68rem]">{formatInteger(activeOverview?.copies ?? 0)} copias</span>
                <span className="app-chip px-2 py-0.5 text-[0.68rem]">{formatInteger(totalCopies)} total</span>
                {hasPinnedSelectedCard ? (
                  <span className="app-chip-accent px-2 py-0.5 text-[0.68rem]">Carta fijada en edición</span>
                ) : null}
              </div>

              {hasPinnedSelectedCard ? (
                <p className="surface-card-warning m-0 px-2.5 py-2 text-[0.74rem] leading-[1.14] text-(--warning)">
                  Esta carta ya salió de la cola activa, pero queda visible para que termines de revisarla sin tener que buscarla de nuevo.
                </p>
              ) : null}
            </div>

            {visibleQueueCards.length === 0 ? (
              <p className={[emptyStateCopy.tone, 'm-0 px-2.5 py-2 text-[0.8rem]'].join(' ')}>
                <strong className="block text-(--text-main)">{emptyStateCopy.title}</strong>
                <span className="mt-1 block">{emptyStateCopy.description}</span>
              </p>
            ) : (
              <div className="flex min-h-0 flex-col gap-1 overflow-y-auto pr-1">
                {visibleQueueCards.map((card) => {
                  const primaryStatus = getCardPrimaryStatus(card)
                  const active = selectedCard?.id === card.id
                  const pinned = hasPinnedSelectedCard && selectedCard?.id === card.id

                  return (
                    <button
                      key={card.id}
                      type="button"
                      aria-pressed={active}
                      className={[
                        'classification-queue-card app-list-item grid min-w-0 shrink-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 px-1.5 py-1.5 text-left',
                        active ? 'classification-queue-card-active' : '',
                      ].join(' ')}
                      onClick={() => setSelectedCardId(card.id)}
                    >
                      <div className="w-[36px]">
                        <CardArt
                          remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
                          name={card.name}
                          className="block aspect-[0.72] w-full border border-(--border-subtle) bg-(--input) object-cover"
                          limitCard={card.apiCard}
                        />
                      </div>

                      <div className="grid min-w-0 gap-1">
                        <strong className="truncate text-[0.8rem] leading-[1.04] text-(--text-main)">{card.name}</strong>

                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="app-muted m-0 min-w-0 truncate text-[0.66rem] leading-none">
                            {getCardTypeLabel(card)} · {getCardQueueSummary(card)}
                          </p>
                          {pinned ? (
                            <span className="app-chip-accent shrink-0 px-1.5 py-0.5 text-[0.58rem]">
                              En edición
                            </span>
                          ) : null}
                          <ClassificationStatusChip
                            label={primaryStatus.label}
                            tone={primaryStatus.tone}
                            className="classification-status-chip-compact shrink-0"
                          />
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

          <section className="surface-panel-soft grid min-h-0 min-w-0 gap-3 p-2.5 min-[1180px]:h-full min-[1180px]:grid-rows-[auto_auto_minmax(0,1fr)]">
            {selectedCard ? (
              <div className="mx-auto grid w-full max-w-[980px] min-w-0 gap-3">
                <article className="surface-panel-strong grid gap-3 p-3 min-[860px]:grid-cols-[88px_minmax(0,1fr)]">
                  <div className="w-[88px]">
                    <CardArt
                      remoteUrl={selectedCard.apiCard?.imageUrlSmall ?? selectedCard.apiCard?.imageUrl ?? null}
                      name={selectedCard.name}
                      className="block aspect-[0.72] w-full border border-(--border-subtle) bg-(--input) object-cover"
                      limitCard={selectedCard.apiCard}
                    />
                  </div>

                  <div className="grid min-w-0 gap-2">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">
                          Carta actual {selectedCardIndex > 0 ? `· ${formatInteger(selectedCardIndex)} / ${formatInteger(visibleQueueCards.length)}` : ''}
                        </p>
                        <h3 className="m-[0.22rem_0_0] truncate text-[1.1rem] leading-none text-(--text-main)">{selectedCard.name}</h3>
                        <p className="app-muted m-[0.28rem_0_0] text-[0.76rem] leading-[1.14]">
                          {formatInteger(selectedCard.copies)} copia{selectedCard.copies === 1 ? '' : 's'} en Main Deck · {getCardTypeLabel(selectedCard)}
                        </p>
                      </div>

                      <span className="step-hero-pill px-2 py-[0.26rem] text-[0.66rem] font-semibold uppercase tracking-widest">
                        {activeOverview?.label ?? 'Vista actual'}
                      </span>
                    </div>

                    {hasPinnedSelectedCard ? (
                      <p className="surface-card m-0 px-2.5 py-2 text-[0.74rem] leading-[1.14] text-(--text-muted)">
                        Estás editando una carta que ya no coincide con <strong className="text-(--text-main)">{activeOverview?.label ?? 'la vista activa'}</strong>. Queda fijada hasta que elijas otra.
                      </p>
                    ) : null}

                    <div className="flex flex-wrap gap-1">
                      {getCardStatusItems(selectedCard).map((status) => (
                        <ClassificationStatusChip key={status.key} label={status.label} tone={status.tone} />
                      ))}
                    </div>

                    <div className="grid gap-1">
                      <span className="app-soft text-[0.66rem] uppercase tracking-widest">Clasificación actual</span>
                      <div className="flex flex-wrap gap-1">
                        {selectedCard.origin ? (
                          <span
                            className="app-role-chip inline-flex px-2 py-0.5 text-[0.68rem]"
                            style={getClassificationStyle(getCardOriginDefinition(selectedCard.origin).key)}
                          >
                            {getCardOriginDefinition(selectedCard.origin).label}
                          </span>
                        ) : (
                          <span className="app-chip px-2 py-0.5 text-[0.68rem]">Sin origen</span>
                        )}

                        {selectedCard.roles.length > 0 ? (
                          selectedCard.roles.map((role) => {
                            const definition = getCardRoleDefinition(role)

                            return (
                              <span
                                key={serializeGroupKey(definition.key)}
                                className="app-role-chip inline-flex px-2 py-0.5 text-[0.68rem]"
                                style={getClassificationStyle(definition.key)}
                              >
                                {definition.label}
                              </span>
                            )
                          })
                        ) : (
                          <span className="app-chip px-2 py-0.5 text-[0.68rem]">Sin roles</span>
                        )}
                      </div>
                    </div>
                  </div>
                </article>

                {isCardPendingReview(selectedCard) ? (
                  <p className="surface-card-warning m-0 px-3 py-2 text-[0.78rem] text-(--warning)">
                    <strong className="text-(--text-main)">Pendiente de revisión.</strong> Validá que esta clasificación siga representando la build actual.
                  </p>
                ) : null}

                <div className="grid gap-3 overflow-y-auto pr-1">
                  <section className="grid gap-2">
                    <div>
                      <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Origen</p>
                      <p className="app-muted m-[0.24rem_0_0] text-[0.75rem] leading-[1.16]">
                        Elegí de qué espacio del deck viene esta carta.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {CARD_ORIGIN_DEFINITIONS.map((definition) => {
                        const active = selectedCard.origin === definition.key.value

                        return (
                          <DefinitionTooltip
                            key={serializeGroupKey(definition.key)}
                            label={definition.label}
                            description={getOriginHelpText(definition.key.value)}
                            className="min-w-0 grow basis-[11.5rem]"
                          >
                            <button
                              type="button"
                              aria-pressed={active}
                              title={getOriginHelpText(definition.key.value)}
                              className={[
                                'classification-origin-option grid gap-1.5 p-2.5 text-left',
                                active ? 'classification-origin-option-active' : '',
                              ].join(' ')}
                              style={getClassificationStyle(definition.key)}
                              onClick={() => onSetOrigin(selectedCard.apiCard?.ygoprodeckId ?? 0, definition.key.value)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="role-reference-mark shrink-0" />
                                <strong className="text-[0.84rem] leading-none text-(--text-main)">{definition.label}</strong>
                              </div>
                              <span className="app-muted text-[0.71rem] leading-[1.12]">{ORIGIN_BLURB_TEXT[definition.key.value]}</span>
                            </button>
                          </DefinitionTooltip>
                        )
                      })}
                    </div>
                  </section>

                  <section className="grid gap-2">
                    <div>
                      <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Roles</p>
                      <p className="app-muted m-[0.24rem_0_0] text-[0.75rem] leading-[1.16]">
                        Marcá todas las funciones que cumple esta carta. La ayuda aparece al pasar el mouse o enfocar cada etiqueta.
                      </p>
                    </div>

                    <div className="grid gap-2">
                      {ROLE_EDITOR_SECTIONS.map((section) => {
                        const selectedCount = section.roles.reduce(
                          (total, role) => total + (selectedCard.roles.includes(role) ? 1 : 0),
                          0,
                        )

                        return (
                          <article key={section.title} className="surface-card grid gap-2 p-2.5">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <strong className="text-[0.84rem] leading-none text-(--text-main)">{section.title}</strong>
                                <p className="app-muted m-[0.22rem_0_0] text-[0.72rem] leading-[1.14]">{section.description}</p>
                              </div>
                              <span className="app-chip px-1.5 py-0.5 text-[0.66rem]">
                                {formatInteger(selectedCount)} / {formatInteger(section.roles.length)}
                              </span>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {section.roles.map((role) => {
                                const definition = getCardRoleDefinition(role)
                                const active = selectedCard.roles.includes(role)

                                return (
                                  <DefinitionTooltip
                                    key={serializeGroupKey(definition.key)}
                                    label={definition.label}
                                    description={getRoleHelpText(role)}
                                    className="min-w-0 max-w-full grow basis-[10.5rem]"
                                  >
                                    <button
                                      type="button"
                                      aria-pressed={active}
                                      title={getRoleHelpText(role)}
                                      className={[
                                        'role-option-button min-w-0 w-full max-w-full px-2 py-[0.5rem] text-left text-[0.7rem] leading-[1.12] whitespace-normal',
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
              </div>
            ) : (
              <p className={[emptyStateCopy.tone, 'm-0 px-2.5 py-2 text-[0.8rem]'].join(' ')}>
                <strong className="block text-(--text-main)">{emptyStateCopy.title}</strong>
                <span className="mt-1 block">{emptyStateCopy.description}</span>
              </p>
            )}
          </section>
        </div>
      )}

      <ClassificationDrawer
        kicker="Filtros"
        title="Subconjuntos avanzados"
        subtitle="Filtrá por origen o rol sin dejar cargado el panel principal."
        isOpen={drawerMode === 'filters'}
        onClose={() => setDrawerMode(null)}
      >
        <div className="grid gap-4">
          {advancedFilterSections.map((section) => (
            <section key={section.title} className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <strong className="text-[0.82rem] uppercase tracking-widest text-(--text-soft)">{section.title}</strong>
                <span className="app-chip px-1.5 py-0.5 text-[0.66rem]">{section.items.length}</span>
              </div>

              <div className="grid gap-1.5">
                {section.items.map((item) => {
                  const active = activeOverview ? areClassificationFilterKeysEqual(activeOverview.key, item.key) : false
                  const isEmpty = item.cards.length === 0
                  const copyShare = totalCopies === 0 ? 0 : item.copies / totalCopies

                  return (
                    <button
                      key={getClassificationFilterReactKey(item.key)}
                      type="button"
                      aria-pressed={active}
                      className={[
                        'classification-filter-row grid items-center gap-2 px-2.5 py-2 text-left',
                        active ? 'classification-filter-row-active' : '',
                        isEmpty ? 'opacity-60' : '',
                      ].join(' ')}
                      style={getClassificationFilterCardStyle(item.styleKey, active)}
                      onClick={() => {
                        handleFilterChange(item.key)
                        setDrawerMode(null)
                      }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="role-reference-mark shrink-0" style={getClassificationStyle(item.styleKey)} />
                          <strong className="truncate text-[0.76rem] leading-none text-(--text-main)">{item.label}</strong>
                        </div>
                        <p className="app-muted m-[0.26rem_0_0] truncate text-[0.68rem] leading-[1.08]">{item.description}</p>
                      </div>

                      <div className="grid justify-items-end gap-1 text-right">
                        <span className="app-chip px-1.5 py-0.5 text-[0.64rem]">{formatInteger(item.cards.length)}</span>
                        <span className="app-soft text-[0.64rem] leading-none">{formatInteger(item.copies)} · {formatSharePercent(copyShare)}</span>
                      </div>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </ClassificationDrawer>

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
