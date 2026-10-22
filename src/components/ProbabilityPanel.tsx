import { useEffect, useMemo, useState } from 'react'

import { useAppSelector } from '../app/store-hooks'
import type { DeckCardInstance } from '../app/model'
import { createPattern } from '../app/pattern-factory'
import type { RoleDistribution } from '../app/role-distribution'
import { Presence } from '../app/use-presence'
import { useToastMessage } from '../app/use-toast-message'
import type { PatternEditorDefaults } from '../app/use-pattern-editor-actions'
import { t } from '../i18n'
import type { ApiCardReference, CardEntry, CardOrigin, CardRole, HandPattern, TurnView } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'
import { CardDetailModal } from './card-detail/CardDetailModal'
import { KpiDetailModal } from './comparison/KpiDetailModal'
import { StepHero } from './StepHero'
import { Button } from './ui/Button'
import { Callout } from './ui/Callout'
import { EmptyState } from './ui/EmptyState'
import { StepPage } from './ui/StepPage'
import { ConfirmDialog } from './probability/ConfirmDialog'
import { LabDisclaimerDialog, useLabDisclaimer } from './probability/LabDisclaimerDialog'
import { LabFailureBreakdown } from './probability/LabFailureBreakdown'
import { LabSuggestion } from './probability/LabSuggestion'
import { LabRoleDistribution } from './probability/LabRoleDistribution'
import { LabRuleList } from './probability/LabRuleList'
import { LabScoreCard } from './probability/LabScoreCard'
import { LabPendingClassification } from './probability/LabPendingClassification'
import { PatternEditorDrawer } from './probability/PatternEditorDrawer'
import type { PatternEditorActions } from './probability/pattern-editor-actions'
import { formatCardCount } from './probability/lab-copy'
import { buildPatternCompactSummary } from './probability/pattern-helpers'
import { buildRuleEntryGroups, type RuleEntry } from './probability/probability-lab-helpers'
import { QuickCalculator } from './probability/QuickCalculator'
import { TurnViewToggle } from './probability/TurnViewToggle'
import { useDraftImpact } from './probability/use-draft-impact'
import { useLabelCards } from './probability/use-label-cards'
import { usePatternDraft } from './probability/use-pattern-draft'
import { useProbabilityLab } from './probability/use-probability-lab'
import { surface } from './ui/surfaces'

interface ProbabilityPanelProps {
  handSize: number
  patterns: HandPattern[]
  disabledGenericRuleIds: string[]
  onSetGenericRuleEnabled: (ruleId: string, enabled: boolean) => void
  /** Nombres propios de las reglas universales (id del catálogo → nombre). */
  systemRuleNames: Record<string, string>
  onRenameSystemRule: (ruleId: string, name: string) => void
  derivedMainCards: CardEntry[]
  patternActions: PatternEditorActions
  patternEditorDefaults: PatternEditorDefaults
  isEditingDeck: boolean
  onSetOrigin: (ygoprodeckId: number, origin: CardOrigin) => void
  onToggleRole: (ygoprodeckId: number, role: CardRole) => void
  onConfirmClassification: (ygoprodeckId: number) => void
  onConfirmAllClassifications: () => void
}

type DrawerMode = 'custom-create' | 'edit'

export function ProbabilityPanel({
  handSize,
  patterns,
  disabledGenericRuleIds,
  onSetGenericRuleEnabled,
  systemRuleNames,
  onRenameSystemRule,
  derivedMainCards,
  patternActions,
  patternEditorDefaults,
  isEditingDeck,
  onSetOrigin,
  onToggleRole,
  onConfirmClassification,
  onConfirmAllClassifications,
}: ProbabilityPanelProps) {
  const lab = useProbabilityLab(derivedMainCards, patterns, disabledGenericRuleIds, handSize, isEditingDeck, systemRuleNames)
  const [activeTurnView, setActiveTurnView] = useState<TurnView>('average')
  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null)
  const [replacedGenericId, setReplacedGenericId] = useState<string | null>(null)
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false)
  const [pendingDeletePatternId, setPendingDeletePatternId] = useState<string | null>(null)
  // Mientras hay una carta abierta en la lista de pendientes no se pasa a los resultados.
  const [isClassifyingPending, setIsClassifyingPending] = useState(false)
  const [kpiModal, setKpiModal] = useState<RoleDistribution | null>(null)
  // Detalle de una carta tocada en la lista del KPI: se abre encima y la lista queda abierta.
  const [kpiDetailCard, setKpiDetailCard] = useState<ApiCardSearchResult | null>(null)
  // La calculadora rápida no necesita deck ni roles: se abre también con el Lab vacío (con `key` arranca de cero cada vez).
  const [quickCalculator, setQuickCalculator] = useState(0)
  const deckFormat = useAppSelector((state) => state.settings.deckFormat)
  const { showToast } = useToastMessage()
  const disclaimer = useLabDisclaimer()

  const results = lab.computation?.status === 'ok' ? lab.computation.results : null
  const currentResult = results?.[activeTurnView] ?? null

  const labelCards = useLabelCards(patterns, derivedMainCards)
  const ruleGroups = useMemo(
    () =>
      buildRuleEntryGroups({
        presets: lab.availablePresets,
        customPatterns: lab.customPatterns,
        unavailablePatterns: lab.unavailablePatterns,
        disabledGenericRuleIds,
        derivedMainCards: labelCards,
        patternResults: currentResult?.patternResults ?? [],
        viewPatternResults: {
          first: results?.first.patternResults ?? [],
          second: results?.second.patternResults ?? [],
        },
        view: activeTurnView,
      }),
    [activeTurnView, currentResult, results, lab.unavailablePatterns, labelCards, disabledGenericRuleIds, lab.availablePresets, lab.customPatterns],
  )

  const draft = usePatternDraft(patternEditorDefaults)
  const draftPattern = draft.draft
  const draftImpact = useDraftImpact({
    draft: draftPattern,
    cards: derivedMainCards,
    customPatterns: lab.customPatterns,
    disabledGenericRuleIds,
    handSize,
    cleanBefore: results?.average.cleanProbability ?? null,
  })
  const draftHasConditions = draftPattern?.conditions.some((condition) => condition.matcher !== null) ?? false
  const canSaveDraft = draftHasConditions && (drawerMode === 'custom-create' ? !replacedGenericId || draft.isDirty : draft.isDirty)

  const closeDrawer = () => {
    draft.close()
    setDrawerMode(null)
    setReplacedGenericId(null)
    setConfirmDiscardOpen(false)
  }

  // Si la regla abierta desaparece del store (p. ej. la curaron), se cierra el editor.
  useEffect(() => {
    if (drawerMode === 'edit' && draftPattern && !patterns.some((pattern) => pattern.id === draftPattern.id)) {
      draft.close()
      setDrawerMode(null)
    }
  }, [draft, draftPattern, drawerMode, patterns])

  const handleOpenCustomCreate = () => {
    draft.open(createPattern('', undefined, 'opening'))
    setDrawerMode('custom-create')
  }

  // Editar una genérica = editar su versión propia: la primera vez se arma desde la del catálogo
  // y, al guardar, reemplaza a la original en su lugar (sigue siendo genérica, con su interruptor).
  const handleEditGeneric = (entry: RuleEntry) => {
    if (patterns.some((pattern) => pattern.id === entry.patternId)) {
      handleEditRule(entry.patternId)
      return
    }

    const preset = lab.availablePresets.find((candidate) => candidate.id === entry.presetId)

    if (preset) {
      draft.open({
        ...preset.pattern,
        id: createPattern('').id,
        systemRuleId: preset.id,
        conditions: preset.pattern.conditions.map((condition) => ({ ...condition })),
      })
      setReplacedGenericId(preset.id)
      setDrawerMode('custom-create')
    }
  }

  const handleEditRule = (patternId: string) => {
    const pattern = patterns.find((candidate) => candidate.id === patternId)

    if (pattern) {
      draft.open(pattern)
      setDrawerMode('edit')
    }
  }

  // Guardar es el único momento en que la regla llega al store (y se recalcula).
  const handleSaveDraft = () => {
    if (!draftPattern || !canSaveDraft) {
      return
    }

    const cardById = new Map(labelCards.map((card) => [card.id, card]))
    const saved =
      draftPattern.name.trim().length > 0
        ? draftPattern
        : { ...draftPattern, name: buildPatternCompactSummary(draftPattern, cardById) }

    if (drawerMode === 'custom-create') {
      patternActions.appendPattern(saved)
    } else {
      patternActions.replacePatterns(patterns.map((pattern) => (pattern.id === saved.id ? saved : pattern)))
    }

    showToast(drawerMode === 'custom-create' ? t('lab.panel.toast.created') : t('lab.panel.toast.saved'), 'success')
    closeDrawer()
  }

  const handleRequestClose = () => {
    const hasUnsavedWork = drawerMode === 'custom-create' && !replacedGenericId ? draftHasConditions : draft.isDirty

    if (hasUnsavedWork) {
      setConfirmDiscardOpen(true)
      return
    }

    closeDrawer()
  }

  const handleConfirmDelete = () => {
    if (!pendingDeletePatternId) {
      return
    }

    patternActions.removePattern(pendingDeletePatternId)

    if (draftPattern?.id === pendingDeletePatternId) {
      closeDrawer()
    }

    setPendingDeletePatternId(null)
  }

  return (
    <StepPage as="article">
      <StepHero
        title={t('lab.panel.title')}
        icon="flask"
        subtitle={t('lab.panel.subtitle')}
        side={(
          <Button variant="secondary" size="sm" icon="sliders" onClick={() => setQuickCalculator((count) => count + 1)}>
            {t('lab.panel.quickCalculator')}
          </Button>
        )}
      />

      {lab.readiness.status === 'empty-deck' ? (
        <EmptyState icon="cards" title={t('lab.panel.emptyDeck.title')}>
          {t('lab.panel.emptyDeck.body')}
        </EmptyState>
      ) : lab.readiness.status === 'needs-classification' || isClassifyingPending ? (
        <LabPendingClassification
          cards={derivedMainCards}
          message={lab.readiness.status === 'needs-classification' ? lab.readiness.message : ''}
          onSetOrigin={onSetOrigin}
          onToggleRole={onToggleRole}
          onConfirm={onConfirmClassification}
          onConfirmAll={onConfirmAllClassifications}
          onEditingChange={setIsClassifyingPending}
        />
      ) : lab.computation?.status === 'blocked' ? (
        <div className="grid gap-2">
          {lab.computation.issues.map((issue) => (
            <Callout key={issue.message} tone="danger">
              {issue.message}
            </Callout>
          ))}
        </div>
      ) : results && currentResult ? (
        <div className="grid min-w-0 gap-4 min-[1101px]:grid-cols-12 min-[1101px]:items-stretch min-[1101px]:gap-5">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 min-[1101px]:col-span-full">
            <TurnViewToggle
              activeView={activeTurnView}
              onChange={setActiveTurnView}
              details={{ first: formatCardCount(5), second: formatCardCount(6), average: '50/50' }}
            />
          </div>

          {/* Desktop: resultado y reparto lado a lado (misma altura); roles y reglas a lo ancho. */}
          <LabScoreCard results={results} view={activeTurnView} isRecalculating={lab.isStale} handSize={handSize} onOpenDisclaimer={disclaimer.open} />
          <LabFailureBreakdown result={currentResult} />
          <LabSuggestion deckFormat={deckFormat} cards={derivedMainCards} checks={lab.allChecks} handSize={handSize} view={activeTurnView} result={currentResult} first={results.first} second={results.second} />
          <LabRoleDistribution
            distributions={lab.roleDistributions[activeTurnView]}
            onOpenRole={setKpiModal}
          />
          <LabRuleList
            groups={ruleGroups}
            onEditRule={handleEditRule}
            onToggleGenericRule={onSetGenericRuleEnabled}
            onEditGenericRule={handleEditGeneric}
            onRenameSystemRule={onRenameSystemRule}
            onCreateCustom={handleOpenCustomCreate}
          />
        </div>
      ) : lab.canCalculate ? (
        <LabSkeleton />
      ) : null}

      <PatternEditorDrawer
        actions={draft.actions}
        canSave={canSaveDraft}
        impact={draftImpact}
        derivedMainCards={labelCards}
        drawerMode={drawerMode}
        isPendingCreation={drawerMode === 'custom-create'}
        saveLabel={replacedGenericId ? t('lab.panel.saveChanges') : undefined}
        hint={draftHasConditions ? t('lab.panel.hint.ready') : t('lab.panel.hint.needsCondition')}
        onClose={handleRequestClose}
        onRequestDelete={setPendingDeletePatternId}
        onSave={handleSaveDraft}
        pattern={draftPattern}
      />

      <ConfirmDialog
        cancelLabel={t('lab.panel.discard.keepEditing')}
        confirmLabel={t('lab.panel.discard.confirm')}
        confirmColor="danger"
        description={t('lab.panel.discard.description')}
        isOpen={confirmDiscardOpen}
        onCancel={() => setConfirmDiscardOpen(false)}
        onConfirm={closeDrawer}
        title={t('lab.panel.discard.title')}
      />

      <LabDisclaimerDialog isOpen={disclaimer.isOpen} onClose={disclaimer.close} />

      <QuickCalculator
        key={quickCalculator}
        isOpen={quickCalculator > 0}
        onClose={() => setQuickCalculator(0)}
        deckSize={derivedMainCards.reduce((total, card) => total + card.copies, 0)}
        handSize={handSize}
      />

      <ConfirmDialog
        confirmLabel={t('lab.panel.delete.confirm')}
        confirmColor="danger"
        description={t('lab.panel.delete.description')}
        isOpen={pendingDeletePatternId !== null}
        onCancel={() => setPendingDeletePatternId(null)}
        onConfirm={handleConfirmDelete}
        title={t('lab.panel.delete.title')}
      />

      <Presence>
        {kpiModal !== null ? (
          <KpiDetailModal
            isOpen
            label={kpiModal.label}
            roles={kpiModal.roles}
            mainDeck={cardEntriesToDeckInstances(derivedMainCards)}
            onCardClick={(card, name) => setKpiDetailCard({ ...card, name })}
            onClose={() => setKpiModal(null)}
          />
        ) : null}
      </Presence>

      <CardDetailModal
        card={kpiDetailCard}
        deckFormat={deckFormat}
        isOpen={kpiDetailCard !== null}
        showActions={false}
        onAddToZone={() => false}
        onClose={() => setKpiDetailCard(null)}
      />
    </StepPage>
  )
}

/** Mientras el cálculo exacto corre en segundo plano: bloques con la forma del resultado (sin saltos al llegar). */
function LabSkeleton() {
  const block = `${surface.card} animate-pulse motion-reduce:animate-none`

  return (
    <div className="grid min-w-0 gap-4 min-[1101px]:grid-cols-12 min-[1101px]:gap-5" role="status" aria-busy="true" aria-label={t('lab.panel.calculating')}>
      <div className={`${block} h-11 min-[1101px]:col-span-full`} />
      <div className={`${block} h-[17rem] min-[1101px]:col-span-5`} />
      <div className={`${block} h-[5.5rem] min-[1101px]:col-span-7 min-[1101px]:h-[17rem]`} />
      <div className={`${block} h-[8rem] min-[1101px]:col-span-full`} />
    </div>
  )
}

function cardEntriesToDeckInstances(cards: CardEntry[]): DeckCardInstance[] {
  return cards.flatMap((card) => {
    const apiCard = card.apiCard ?? buildFallbackApiCard(card)

    return Array.from({ length: card.copies }, (_, index) => ({
      instanceId: `${card.id}-kpi-${index}`,
      name: card.name,
      apiCard,
      origin: card.origin,
      roles: card.roles,
      needsReview: card.needsReview,
    }))
  })
}

function buildFallbackApiCard(card: CardEntry): ApiCardReference {
  return {
    ygoprodeckId: fallbackCardId(card.id),
    cardType: '',
    frameType: '',
    description: null,
    race: null,
    attribute: null,
    level: null,
    linkValue: null,
    atk: null,
    def: null,
    archetype: null,
    ygoprodeckUrl: null,
    imageUrl: null,
    imageUrlSmall: null,
    banlist: { tcg: null, ocg: null, goat: null },
    genesys: { points: null },
  }
}

function fallbackCardId(id: string): number {
  let hash = 0

  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0
  }

  return hash < 0 ? hash : -Math.max(1, hash)
}
