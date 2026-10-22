import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import {
  areGroupKeysEqual,
  cardMatchesGroup,
  CARD_ORIGIN_DEFINITIONS,
  getCardRoleDefinition,
  serializeGroupKey,
} from '../app/deck-groups'
import { confirmAllDeckCardClassifications, reclassifyAllCards, resuggestAllCards } from '../app/deck-builder-slice'
import {
  isCardFullyClassified,
  isCardMissingOrigin,
  isCardMissingRoles,
  isCardPendingReview,
} from '../app/role-step'
import { useAppDispatch } from '../app/store-hooks'
import { useToastMessage } from '../app/use-toast-message'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../app/use-media-query'
import { Presence } from '../app/use-presence'
import { formatInteger, formatWholePercent } from '../app/utils'
import { t } from '../i18n'
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
import { ConfirmDialog } from './probability/ConfirmDialog'
import { StepHero } from './StepHero'
import { Button } from './ui/Button'
import { Icon } from './ui/Icon'
import { IconButton } from './ui/IconButton'
import { Card } from './ui/Card'
import { EmptyState } from './ui/EmptyState'
import { ProgressRing } from './ui/ProgressRing'
import { Modal } from './ui/Modal'
import { overline, supportText } from './ui/typography'
import {
  ROLE_REFERENCE_MARK,
  viewChip,
} from './classification-styles'
import { cx } from './ui/cx'

interface DeckRolesPanelProps {
  cards: CardEntry[]
  onSetOrigin: (ygoprodeckId: number, origin: CardOrigin) => void
  onToggleRole: (ygoprodeckId: number, role: CardRole) => void
  onConfirm: (ygoprodeckId: number) => void
  /** Pasa al Lab (el paso siguiente); lo usa la tarjeta destacada cuando ya está todo clasificado. */
  onOpenLab?: () => void
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
      title: t('roles.panel.empty.unclassified.title'),
      description: t('roles.panel.empty.unclassified.text'),
      tone: 'text-success-soft',
    }
  }

  if (filterKey === 'missing-origin') {
    return {
      title: t('roles.panel.empty.missingOrigin.title'),
      description: t('roles.panel.empty.missingOrigin.text'),
      tone: 'text-success-soft',
    }
  }

  if (filterKey === 'missing-role') {
    return {
      title: t('roles.panel.empty.missingRole.title'),
      description: t('roles.panel.empty.missingRole.text'),
      tone: 'text-success-soft',
    }
  }

  if (filterKey === 'review') {
    return {
      title: t('roles.panel.empty.review.title'),
      description: t('roles.panel.empty.review.text'),
      tone: 'text-success-soft',
    }
  }

  if (filterKey === 'complete') {
    return {
      title: t('roles.panel.empty.complete.title'),
      description: t('roles.panel.empty.complete.text'),
      tone: 'text-muted',
    }
  }

  if (filterKey === 'all') {
    return {
      title: t('roles.panel.empty.all.title'),
      description: t('roles.panel.empty.all.text'),
      tone: 'text-muted',
    }
  }

  return {
    title: t('roles.panel.empty.group.title'),
    description: t('roles.panel.empty.group.text'),
    tone: 'text-muted',
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
    return t('roles.panel.overview.all')
  }

  if (filterKey === 'unclassified') {
    return t('roles.panel.overview.unclassified')
  }

  if (filterKey === 'missing-origin') {
    return t('roles.panel.overview.missingOrigin')
  }

  if (filterKey === 'missing-role') {
    return t('roles.panel.overview.missingRole')
  }

  if (filterKey === 'review') {
    return t('roles.panel.overview.review')
  }

  if (filterKey === 'complete') {
    return t('roles.panel.overview.complete')
  }

  return getGroupHelpText(filterKey)
}

function renderReferenceRoles(roleKeys: readonly CardRole[]) {
  return roleKeys.map((roleKey) => {
    const definition = getCardRoleDefinition(roleKey)

    return (
      <article
        key={serializeGroupKey(definition.key)}
        className="grid gap-0.5 py-1.5"
        style={getClassificationStyle(definition.key)}
      >
        <div className="flex items-center gap-2">
          <span className={ROLE_REFERENCE_MARK} />
          <strong className="block text-body leading-none text-foreground">
            {definition.label}
          </strong>
        </div>
        <p className="text-muted m-0 text-micro">{getRoleHelpText(roleKey)}</p>
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

export function DeckRolesPanel({
  cards,
  onSetOrigin,
  onToggleRole,
  onConfirm,
  onOpenLab,
}: DeckRolesPanelProps) {
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const buttonSize = isDesktop ? 'md' : 'sm'
  const dispatch = useAppDispatch()
  const { showToast } = useToastMessage()
  const [activeFilter, setActiveFilter] = useState<ClassificationFilterKey>(() =>
    cards.some((card) => !isCardFullyClassified(card)) ? 'unclassified' : 'complete',
  )
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [drawerMode, setDrawerMode] = useState<ClassificationDrawerMode>(null)
  const [isDetailOpen, setIsDetailOpen] = useState(false)
  const [confirmResuggest, setConfirmResuggest] = useState(false)

  const resuggestAll = () => {
    setConfirmResuggest(false)
    dispatch(resuggestAllCards())
    showToast(t('roles.panel.resuggested', { count: cards.length }), 'success')
  }

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
        t('roles.panel.filter.unclassified'),
        getOverviewDescription('unclassified'),
        unclassifiedCards,
        'unclassified',
      ),
      buildOverviewItem(
        'missing-origin',
        t('roles.status.noOrigin'),
        getOverviewDescription('missing-origin'),
        sortedCards.filter((card) => isCardMissingOrigin(card)),
        'missing-origin',
      ),
      buildOverviewItem(
        'missing-role',
        t('roles.panel.filter.missingRole'),
        getOverviewDescription('missing-role'),
        sortedCards.filter((card) => isCardMissingRoles(card)),
        'missing-role',
      ),
      buildOverviewItem(
        'review',
        t('roles.panel.filter.review'),
        getOverviewDescription('review'),
        sortedCards.filter((card) => isCardPendingReview(card)),
        'review',
      ),
      buildOverviewItem(
        'complete',
        t('roles.panel.filter.complete'),
        getOverviewDescription('complete'),
        completeCards,
        'complete',
      ),
      buildOverviewItem(
        'all',
        t('roles.panel.filter.all'),
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
  const filteredCards = useMemo(() => activeOverview?.cards ?? [], [activeOverview])
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
  // Una carta cuenta como "lista" cuando está completa y confirmada: es la misma cuenta que usa el Lab.
  const pendingReviewCards = useMemo(() => completeCards.filter((card) => card.needsReview), [completeCards])
  const readyCount = completeCards.length - pendingReviewCards.length
  // Sólo faltan confirmar sugerencias (todo tiene origen y roles): el banner ofrece «Confirmar» y «Revisar», dos botones.
  const suggestionsOnly = unclassifiedCards.length === 0 && pendingReviewCards.length > 0
  const classifiedShare = sortedCards.length > 0 ? readyCount / sortedCards.length : 0
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

  // Un filtro sin cartas es ruido: se muestran los que tienen y el elegido; con uno solo no hay nada que filtrar.
  const visibleFilterItems = useMemo(
    () => primaryFilterItems.filter((item) => item.cards.length > 0 || areClassificationFilterKeysEqual(activeFilter, item.key)),
    [activeFilter, primaryFilterItems],
  )
  const hasFilters = visibleFilterItems.length > 1
  // En escritorio los filtros van dentro del banner; en celular, debajo de la tarjeta.
  const filtersInCard = hasFilters && isDesktop

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

  const handleCardSelection = (cardId: string) => {
    setSelectedCardId(cardId)
    setIsDetailOpen(true)
  }

  const handleSelectPreviousCard = useCallback(() => {
    if (!previousCard) {
      return
    }

    setSelectedCardId(previousCard.id)
    setIsDetailOpen(true)
  }, [previousCard])

  const handleSelectNextCard = useCallback(() => {
    if (!nextCard) {
      return
    }

    setSelectedCardId(nextCard.id)
    setIsDetailOpen(true)
  }, [nextCard])

  useEffect(() => {
    // La guía de roles se abre encima de la carta (que se oculta mientras tanto): las flechas sólo valen con la carta a la vista.
    if (!isDetailOpen || drawerMode !== null) {
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
  }, [drawerMode, isDetailOpen, handleSelectPreviousCard, handleSelectNextCard])

  const filterChips = hasFilters ? (
    <div className={cx(filtersInCard ? 'col-span-2 col-start-2 flex flex-wrap items-center gap-2' : 'grid gap-2')}>
      <p className={cx('m-0', filtersInCard ? 'text-micro font-semibold uppercase tracking-[0.08em] text-primary-foreground/75' : overline)}>{t('roles.panel.activeView')}</p>
      <div className="flex flex-wrap gap-2">
        {visibleFilterItems.map((item) => {
          const active = areClassificationFilterKeysEqual(activeFilter, item.key)

          return (
            <button
              key={getClassificationFilterReactKey(item.key)}
              type="button"
              className={viewChip({ active, onBrand: filtersInCard })}
              style={getClassificationStyle(item.styleKey)}
              onClick={() => handleFilterChange(item.key)}
            >
              <span>{item.label}</span>
              <span className={cx('text-micro tabular-nums', filtersInCard ? 'opacity-75' : 'text-soft')}>{formatInteger(item.cards.length)}</span>
            </button>
          )
        })}
      </div>
    </div>
  ) : null

  return (
    <section className="stagger mx-auto grid w-full min-w-0 max-w-content content-start gap-4 overflow-x-hidden px-gutter pb-6 pt-4 min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:grid-rows-[auto_auto_minmax(0,1fr)] min-[1101px]:gap-5 min-[1101px]:overflow-hidden min-[1101px]:px-6 min-[1101px]:pb-6 min-[1101px]:pt-6">
      <StepHero
        title={t('roles.panel.title')}
        icon="tag"
        subtitle={t('roles.panel.subtitle')}
        titleAction={
          sortedCards.length > 0 ? (
            <IconButton tone="ghost" size="sm" aria-label={t('roles.guide.title')} title={t('roles.guide.title')} onClick={() => setDrawerMode('help')}>
              <Icon name="info" size={18} />
            </IconButton>
          ) : null
        }
      />

      {sortedCards.length > 0 ? (
        <div className="grid gap-4">
          <Card
            level="hero"
            padding={isDesktop ? 'lg' : 'md'}
            className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 min-[1101px]:grid-cols-[auto_minmax(0,1fr)_auto] min-[1101px]:gap-x-8 min-[1101px]:gap-y-4"
          >
            {/* El aro (verde: se lee de un vistazo cuánto falta, y 100 % = listo) va junto al mensaje. En celular las acciones van abajo, en una fila. En escritorio es un banner de todo el ancho: aro, mensaje y acciones a la derecha, y los filtros (si hay) en una segunda fila. */}
            <div className={cx(filtersInCard && 'min-[1101px]:row-span-2')}>
              <ProgressRing
                tone="onBrand"
                color="var(--success-rgb)"
                size={isDesktop ? 112 : 76}
                strokeWidth={isDesktop ? 10 : 8}
                value={classifiedShare}
                format={(value) => (
                  <span className="grid justify-items-center leading-none">
                    <span className="text-lead font-bold tracking-[-0.02em] text-info-soft min-[1101px]:text-title">{formatWholePercent(value)}</span>
                    <span className="mt-0.5 text-[0.625rem] font-medium text-primary-foreground/75 min-[1101px]:mt-1 min-[1101px]:text-micro">{hasCardsNeedingClassification ? t('roles.panel.ringPartial') : t('roles.panel.ringDone')}</span>
                  </span>
                )}
                label={t('roles.panel.ringLabel')}
              />
            </div>
            <p className="m-0 min-w-0 text-lead leading-snug min-[1101px]:text-title min-[1101px]:leading-tight">
                {unclassifiedCards.length > 0
                  ? t('roles.panel.remaining', { count: unclassifiedCards.length })
                  : pendingReviewCards.length > 0
                    ? t('roles.panel.confirmSuggestions', { count: pendingReviewCards.length })
                    : t('roles.panel.allDone')}
            </p>
            {/* Con dos acciones (confirmar todas y revisar) la columna mide lo que miden los botones, que no parten su texto; en el celular, si no entran en una fila, la principal pasa a la de abajo. */}
            <div className={cx('col-span-2 flex flex-wrap items-center gap-2 min-[1101px]:col-span-1 min-[1101px]:col-start-3', suggestionsOnly ? 'min-[1101px]:w-auto min-[1101px]:flex-nowrap' : 'min-[1101px]:w-72')}>
              {unclassifiedCards.length > 0 ? (
                <Button variant="onBrand" size={buttonSize} icon="tag" className="flex-1" onClick={() => dispatch(reclassifyAllCards())}>
                  {t('roles.panel.classifyAll')}
                </Button>
              ) : pendingReviewCards.length > 0 ? (
                <>
                  {/* Revisar una por una abre la primera sugerencia (desde ahí «Siguiente» recorre el resto); confirmar todas las da por buenas de un toque. La principal va al final. */}
                  <Button variant="tertiary" size={buttonSize} className="flex-1 basis-40 whitespace-nowrap text-primary-foreground" onClick={() => handleCardSelection(pendingReviewCards[0]!.id)}>
                    {t('roles.panel.reviewSuggestions')}
                  </Button>
                  <Button variant="onBrand" size={buttonSize} icon="check" className="flex-1 basis-48 whitespace-nowrap" onClick={() => dispatch(confirmAllDeckCardClassifications())}>
                    {t('roles.panel.confirmAll', { count: pendingReviewCards.length })}
                  </Button>
                </>
              ) : onOpenLab ? (
                <Button variant="onBrand" size={buttonSize} iconEnd="arrow-right" className="flex-1" onClick={onOpenLab}>
                  {t('roles.panel.goToLab')}
                </Button>
              ) : null}
              {/* Vuelve a sugerir todo con las reglas de hoy; pisa lo confirmado, por eso pregunta. */}
              <IconButton
                tone="ghost"
                size="md"
                aria-label={t('roles.panel.reclassifyAll')}
                title={t('roles.panel.reclassifyAll')}
                className="text-primary-foreground"
                onClick={() => setConfirmResuggest(true)}
              >
                <Icon name="refresh" size={20} />
              </IconButton>
            </div>
            {filtersInCard ? filterChips : null}
          </Card>

          {filtersInCard ? null : filterChips}
        </div>
      ) : null}

      {sortedCards.length === 0 ? (
        <EmptyState icon="cards" title={t('roles.panel.noCardsTitle')}>
          {t('roles.panel.noCardsText')}
        </EmptyState>
      ) : (
        <section className="grid min-w-0 gap-3 min-[1101px]:h-full min-[1101px]:min-h-0 min-[1101px]:grid-rows-[minmax(0,1fr)] min-[1101px]:overflow-hidden">
            {visibleQueueCards.length === 0 ? (
              <p className={[emptyStateCopy.tone, 'm-0 px-3 py-2.5 text-body'].join(' ')}>
                <strong className="block text-foreground">{emptyStateCopy.title}</strong>
                <span className="mt-1 block">{emptyStateCopy.description}</span>
              </p>
            ) : (
              <ClassificationQueue cards={visibleQueueCards} selectedId={selectedCard?.id ?? null} onSelect={handleCardSelection} />
            )}
        </section>
      )}

      {/* La ayuda se abre debajo de la carta: la carta se va con su vuelo (`Presence`) y vuelve al cerrar la ayuda. */}
      <Presence>{isDetailOpen && selectedCard !== null && drawerMode === null ? (
        <ClassificationEditor
          card={selectedCard}
          position={selectedCardIndexInFullList + 1}
          total={stableNavigationCards.length}
          onSetOrigin={onSetOrigin}
          onToggleRole={onToggleRole}
          onConfirm={onConfirm}
          onPrevious={previousCard ? handleSelectPreviousCard : undefined}
          onNext={nextCard ? handleSelectNextCard : undefined}
          onOpenHelp={() => setDrawerMode('help')}
          onClose={() => setIsDetailOpen(false)}
        />
      ) : null}</Presence>

      <ClassificationDrawer
        kicker={t('roles.guide.kicker')}
        title={t('roles.guide.title')}
        subtitle={t('roles.guide.subtitle')}
        isOpen={drawerMode === 'help'}
        onClose={() => setDrawerMode(null)}
      >
        <div className="grid gap-4">
          <section className="grid gap-2">
            <div>
              <p className={cx('m-0', overline)}>{t('roles.guide.originTitle')}</p>
              <p className={cx(supportText, 'mt-0.5 text-micro')}>
                {t('roles.guide.originText')}
              </p>
            </div>

            <div className="grid gap-2">
              {CARD_ORIGIN_DEFINITIONS.map((definition) => (
                <article
                  key={serializeGroupKey(definition.key)}
                  className="grid gap-2 border-t border-border-subtle pt-3 first:border-t-0 first:pt-0"
                  style={getClassificationStyle(definition.key)}
                >
                  <div className="flex items-center gap-2">
                    <span className={ROLE_REFERENCE_MARK} />
                    <strong className="text-body leading-none text-foreground">{definition.label}</strong>
                  </div>
                  <p className="text-muted m-0 text-micro">{getOriginHelpText(definition.key.value)}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-2">
            <div>
              <p className={cx('m-0', overline)}>{t('roles.guide.rolesTitle')}</p>
              <p className={cx(supportText, 'mt-0.5 text-micro')}>
                {t('roles.guide.rolesText')}
              </p>
            </div>

            <div className="grid gap-2">
              {ROLE_EDITOR_SECTIONS.map((section) => (
                <article key={section.title} className="grid gap-2 border-t border-border-subtle pt-3 first:border-t-0 first:pt-0">
                  <div className="grid gap-1">
                    <strong className="text-body leading-none text-foreground">{section.title}</strong>
                    <p className="text-muted m-0 text-micro">{section.description}</p>
                  </div>

                  <div className="grid gap-1.5">{renderReferenceRoles(section.roles)}</div>
                </article>
              ))}
            </div>
          </section>
        </div>
      </ClassificationDrawer>

      <ConfirmDialog
        isOpen={confirmResuggest}
        title={t('roles.panel.confirmTitle')}
        description={t('roles.panel.confirmText', { count: cards.length })}
        confirmLabel={t('roles.panel.confirmAction')}
        confirmColor="danger"
        onCancel={() => setConfirmResuggest(false)}
        onConfirm={resuggestAll}
      />
    </section>
  )
}
