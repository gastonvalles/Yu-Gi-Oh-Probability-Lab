import { useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  areGroupKeysEqual,
  cardMatchesGroup,
  CARD_ORIGIN_DEFINITIONS,
  getCardRoleDefinition,
  serializeGroupKey,
} from '../app/deck-groups'
import { getDeckModelStatus } from '../app/deck-model-status'
import { reclassifyAllCards } from '../app/deck-builder-slice'
import { getClassificationOverrides } from '../app/classification-overrides'
import {
  isCardFullyClassified,
  isCardMissingOrigin,
  isCardMissingRoles,
  isCardPendingReview,
} from '../app/role-step'
import { useAppDispatch, useAppSelector } from '../app/store-hooks'
import { formatInteger } from '../app/utils'
import type { CardEntry, CardGroupKey, CardOrigin, CardRole } from '../types'
import {
  ORIGIN_HELP_TEXT,
  ROLE_EDITOR_SECTIONS,
  ROLE_HELP_TEXT,
} from './classification/classification-copy'
import { ClassificationEditor } from './classification/ClassificationEditor'
import { ClassificationQueue } from './classification/ClassificationQueue'
import {
  compareCardsForQueue,
  getClassificationStyle,
  ROLE_FILTER_ORDER,
  type ClassificationStateKey,
  type ClassificationStyleKey,
} from './classification/classification-model'
import { DeckModelStatusBadge } from './DeckModelStatusBadge'
import { StepHero } from './StepHero'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import {
  ROLE_REFERENCE_CARD,
  ROLE_REFERENCE_GROUP,
  ROLE_REFERENCE_MARK,
  viewChip,
} from './classification-styles'
import { cx } from './ui/cx'
import { surface } from './ui/surfaces'

interface DeckRolesPanelProps {
  cards: CardEntry[]
  onSetOrigin: (ygoprodeckId: number, origin: CardOrigin) => void
  onToggleRole: (ygoprodeckId: number, role: CardRole) => void
  onConfirm: (ygoprodeckId: number) => void
}

type ClassificationFilterKey = ClassificationStateKey | CardGroupKey

type ClassificationDrawerMode = 'help' | null

interface ClassificationOverviewItem {
  key: ClassificationFilterKey
  label: string
  description: string
  cards: CardEntry[]
  copies: number
  styleKey: ClassificationStyleKey
}

const PRIMARY_FILTER_KEYS: ClassificationStateKey[] = [
  'unclassified',
  'missing-origin',
  'missing-role',
  'complete',
]


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
      description: 'Podés repasar otros grupos desde la derecha o pasar al Probability Lab cuando termines de validar la build.',
      tone: `${surface.cardSuccess} text-accent`,
    }
  }

  if (filterKey === 'missing-origin') {
    return {
      title: 'No hay cartas sin origen en esta vista.',
      description: 'El motor y los slots externos ya quedaron diferenciados.',
      tone: `${surface.cardSuccess} text-accent`,
    }
  }

  if (filterKey === 'missing-role') {
    return {
      title: 'No hay cartas sin roles en esta vista.',
      description: 'La función táctica de estas cartas ya quedó definida.',
      tone: `${surface.cardSuccess} text-accent`,
    }
  }

  if (filterKey === 'review') {
    return {
      title: 'No hay cartas pendientes de revisión.',
      description: 'Las cartas cargadas en esta vista ya están validadas.',
      tone: `${surface.cardSuccess} text-accent`,
    }
  }

  if (filterKey === 'complete') {
    return {
      title: 'Todavía no hay cartas completas en esta vista.',
      description: 'Primero definí origen y roles para poblar este subconjunto.',
      tone: `${surface.card} text-muted`,
    }
  }

  if (filterKey === 'all') {
    return {
      title: 'Todavía no hay cartas para clasificar.',
      description: 'Primero armá o importá tu Main Deck. Después vas a poder marcar origen y roles.',
      tone: `${surface.card} text-muted`,
    }
  }

  return {
    title: 'Este grupo está vacío por ahora.',
    description: 'Ajustá el filtro o seguí clasificando cartas para poblarlo.',
    tone: `${surface.card} text-muted`,
  }
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
    return 'Listas para medir en el Probability Lab.'
  }

  return getGroupHelpText(filterKey)
}

function renderReferenceRoles(roleKeys: readonly CardRole[]) {
  return roleKeys.map((roleKey) => {
    const definition = getCardRoleDefinition(roleKey)

    return (
      <article
        key={serializeGroupKey(definition.key)}
        className={cx(ROLE_REFERENCE_CARD, 'grid gap-1 px-2 py-2')}
        style={getClassificationStyle(definition.key)}
      >
        <div className="flex items-center gap-2">
          <span className={ROLE_REFERENCE_MARK} />
          <strong className="block text-small leading-none text-foreground">
            {definition.label}
          </strong>
        </div>
        <p className="text-muted m-0 text-caption">{getRoleHelpText(roleKey)}</p>
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
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" kicker={kicker} title={title} subtitle={subtitle}>
      <div className="grid gap-3">{children}</div>
    </Modal>
  )
}

function ClassificationModal({
  isOpen,
  kicker = 'Clasificación',
  title,
  subtitle,
  headerActions,
  hideHeader = false,
  footer,
  onClose,
  children,
}: {
  isOpen: boolean
  kicker?: string
  title: string
  subtitle: string
  headerActions?: ReactNode
  hideHeader?: boolean
  footer?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      footer={footer}
      size="sheet"
      bare={hideHeader}
      kicker={kicker}
      title={title}
      subtitle={subtitle}
      headerActions={headerActions}
      ariaLabel={title}
    >
      <div className="grid gap-2.5 min-[1101px]:gap-3">{children}</div>
    </Modal>
  )
}

export function DeckRolesPanel({
  cards,
  onSetOrigin,
  onToggleRole,
  onConfirm,
}: DeckRolesPanelProps) {
  const dispatch = useAppDispatch()
  const patterns = useAppSelector((state) => state.patterns.patterns)
  const modelStatus = useMemo(
    () => getDeckModelStatus(cards, patterns),
    [cards, patterns],
  )
  const [activeFilter, setActiveFilter] = useState<ClassificationFilterKey>(() =>
    cards.some((card) => !isCardFullyClassified(card)) ? 'unclassified' : 'complete',
  )
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [drawerMode, setDrawerMode] = useState<ClassificationDrawerMode>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)

  const sortedCards = useMemo(() => [...cards].sort(compareCardsForQueue), [cards])
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
  // Anterior/Siguiente siguen el orden de la lista, que no cambia al clasificar.
  const stableNavigationCards = sortedCards
  const classifiedPercent = sortedCards.length > 0 ? Math.round((completeCards.length / sortedCards.length) * 100) : 0
  const selectedCardIndexInFullList = selectedCard
    ? stableNavigationCards.findIndex((card) => card.id === selectedCard.id)
    : -1
  const previousCard = selectedCardIndexInFullList >= 0 && stableNavigationCards.length > 1
    ? stableNavigationCards[(selectedCardIndexInFullList - 1 + stableNavigationCards.length) % stableNavigationCards.length] ?? null
    : null
  const nextCard = selectedCardIndexInFullList >= 0 && stableNavigationCards.length > 1
    ? stableNavigationCards[(selectedCardIndexInFullList + 1) % stableNavigationCards.length] ?? null
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
    // Aunque la carta salga del filtro al clasificarla (p. ej. "Sin completar"),
    // se queda seleccionada: el usuario avanza cuando termina, con "Siguiente".
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

  useEffect(() => {
    if (!isDetailOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && ['INPUT', 'TEXTAREA'].includes(target.tagName)) {
        return
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        handleSelectPreviousCard()
        return
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        handleSelectNextCard()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isDetailOpen, previousCard, nextCard])

  const detailNavigation = selectedCard ? (
    <div className="flex flex-1 items-center justify-end gap-2 max-[1100px]:[&>button]:flex-1">
      <Button variant="secondary" size="md" onClick={handleSelectPreviousCard} disabled={!previousCard}>
        ← Anterior
      </Button>
      <span className="text-soft min-w-12 text-center text-caption tabular-nums max-[1100px]:order-0 min-[1101px]:hidden">
        {formatInteger(selectedCardIndexInFullList + 1)} / {formatInteger(stableNavigationCards.length)}
      </span>
      <Button variant="primary" size="md" onClick={handleSelectNextCard} disabled={!nextCard}>
        Siguiente →
      </Button>
    </div>
  ) : null

  const renderSelectedCardDetail = () => {
    if (!selectedCard) {
      return (
        <p className={[emptyStateCopy.tone, 'm-0 px-2.5 py-2 text-small'].join(' ')}>
          <strong className="block text-foreground">{emptyStateCopy.title}</strong>
          <span className="mt-1 block">{emptyStateCopy.description}</span>
        </p>
      )
    }

    return (
      <ClassificationEditor
        card={selectedCard}
        position={selectedCardIndexInFullList + 1}
        total={stableNavigationCards.length}
        completed={completeCards.length}
        onSetOrigin={onSetOrigin}
        onToggleRole={onToggleRole}
        onConfirm={onConfirm}
        onOpenHelp={() => setDrawerMode('help')}
      />
    )
  }

  return (
    <section className={`${surface.stepShell} grid min-w-0 content-start gap-3 overflow-x-hidden px-4 pt-3 min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:grid-rows-[auto_auto_minmax(0,1fr)] min-[1101px]:gap-3 min-[1101px]:overflow-hidden min-[1101px]:p-2.5`}>
      <StepHero
        title="Clasificá tus cartas"
        help="Para cada carta elegí dónde encaja en tu plan (Engine, Non-engine o Hybrid) y qué función cumple cuando la robás. Estas decisiones forman tu modelo del deck: el Probability Lab calcula los porcentajes a partir de acá."
        side={
          sortedCards.length > 0 ? (
            <>
              <DeckModelStatusBadge modelStatus={modelStatus} variant="compact" />
              {hasCardsNeedingClassification ? (
                <Button variant="primary" size="sm" onClick={() => dispatch(reclassifyAllCards({ overrides: getClassificationOverrides() }))}>
                  Clasificar todo
                </Button>
              ) : null}
              <Button variant="primary" size="sm" onClick={() => setDrawerMode('help')}>
                Guía de clasificación
              </Button>
            </>
          ) : null
        }
      />

      {sortedCards.length > 0 ? (
        <section className={`${surface.panelSoft} grid gap-2 p-2.5`}>
          <div className="flex flex-wrap items-end justify-between gap-2.5 min-w-0">
            <div className="min-w-0">
              <p className="text-accent m-0 text-micro uppercase tracking-widest">Vista activa</p>
              <p className="text-muted m-[0.22rem_0_0] text-caption">
                Priorizá el subconjunto que querés cerrar primero.
              </p>
            </div>

            <div className="grid w-full min-w-36 gap-1 justify-items-end min-[640px]:w-auto">
              <span className="text-muted text-micro leading-none tabular-nums">
                {formatInteger(completeCards.length)} / {formatInteger(sortedCards.length)} clasificadas
              </span>
              <div
                className="h-1.25 w-full min-w-36 overflow-hidden rounded-full bg-[rgb(var(--border-rgb)/0.9)]"
                role="progressbar"
                aria-valuenow={completeCards.length}
                aria-valuemin={0}
                aria-valuemax={sortedCards.length}
              >
                <div
                  className="h-full origin-left rounded-full bg-accent transition-transform"
                  style={{ transform: `scaleX(${classifiedPercent / 100})` }}
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {primaryFilterItems.map((item) => {
              const active = areClassificationFilterKeysEqual(activeFilter, item.key)

              return (
                <button
                  key={getClassificationFilterReactKey(item.key)}
                  type="button"
                  className={viewChip({ active, empty: item.cards.length === 0 && !active })}
                  style={getClassificationStyle(item.styleKey)}
                  onClick={() => handleFilterChange(item.key)}
                >
                  <span>{item.label}</span>
                  <span className="text-soft text-micro">{formatInteger(item.cards.length)}</span>
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {sortedCards.length === 0 ? (
        <p className={`${surface.card} m-0 px-2.5 py-2 text-small text-muted`}>
          Primero armá o importá tu Main Deck. Después vas a poder clasificar cada carta.
        </p>
      ) : (
        <section className={`${surface.panelSoft} grid min-w-0 gap-2.5 p-2.5 min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:grid-rows-[minmax(0,1fr)] min-[1101px]:overflow-hidden`}>
            {visibleQueueCards.length === 0 ? (
              <p className={[emptyStateCopy.tone, 'm-0 px-2.5 py-2 text-small'].join(' ')}>
                <strong className="block text-foreground">{emptyStateCopy.title}</strong>
                <span className="mt-1 block">{emptyStateCopy.description}</span>
              </p>
            ) : (
              <ClassificationQueue cards={visibleQueueCards} selectedId={selectedCard?.id ?? null} onSelect={handleCardSelection} />
            )}
        </section>
      )}

      <ClassificationModal
        isOpen={isDetailOpen && selectedCard !== null}
        title="Origen y roles"
        subtitle="Resolvé la carta seleccionada sin salir de la cola."
        hideHeader
        footer={detailNavigation}
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
              <p className="text-accent m-0 text-micro uppercase tracking-widest">Origen</p>
              <p className="text-muted m-[0.22rem_0_0] text-caption">
                Responde si la carta pertenece al motor principal o a un espacio externo/flexible.
              </p>
            </div>

            <div className="grid gap-2">
              {CARD_ORIGIN_DEFINITIONS.map((definition) => (
                <article
                  key={serializeGroupKey(definition.key)}
                  className={cx(ROLE_REFERENCE_GROUP, 'grid gap-2 p-2.5')}
                  style={getClassificationStyle(definition.key)}
                >
                  <div className="flex items-center gap-2">
                    <span className={ROLE_REFERENCE_MARK} />
                    <strong className="text-small leading-none text-foreground">{definition.label}</strong>
                  </div>
                  <p className="text-muted m-0 text-caption">{getOriginHelpText(definition.key.value)}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-2">
            <div>
              <p className="text-accent m-0 text-micro uppercase tracking-widest">Roles</p>
              <p className="text-muted m-[0.22rem_0_0] text-caption">
                Responden qué hace la carta dentro de tu mano, tu línea o tu plan de turno.
              </p>
            </div>

            <div className="grid gap-2">
              {ROLE_EDITOR_SECTIONS.map((section) => (
                <article key={section.title} className={cx(ROLE_REFERENCE_GROUP, 'grid gap-2 p-2.5')}>
                  <div className="grid gap-1">
                    <strong className="text-small leading-none text-foreground">{section.title}</strong>
                    <p className="text-muted m-0 text-caption">{section.description}</p>
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
