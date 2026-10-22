import { useMemo, useState } from 'react'

import { useAppSelector } from '../app/store-hooks'
import type { DeckCardInstance } from '../app/model'
import type { RoleDistribution } from '../app/role-distribution'
import { Presence } from '../app/use-presence'
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
import { Icon } from './ui/Icon'
import { IconButton } from './ui/IconButton'
import { Skeleton } from './ui/Skeleton'
import { StepPage } from './ui/StepPage'
import { LabDisclaimerDialog, useLabDisclaimer } from './probability/LabDisclaimerDialog'
import { LabSuggestion } from './probability/LabSuggestion'
import { LabRoleDistribution } from './probability/LabRoleDistribution'
import { LabRules } from './probability/LabRules'
import { LabScoreCard } from './probability/LabScoreCard'
import { LabPendingClassification } from './probability/LabPendingClassification'
import type { PatternEditorActions } from './probability/pattern-editor-actions'
import { buildRuleEntryGroups } from './probability/probability-lab-helpers'
import { QuickCalculator } from './probability/QuickCalculator'
import { useLabelCards } from './probability/use-label-cards'
import { useProbabilityLab } from './probability/use-probability-lab'

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
  // Mientras hay una carta abierta en la lista de pendientes no se pasa a los resultados.
  const [isClassifyingPending, setIsClassifyingPending] = useState(false)
  const [kpiModal, setKpiModal] = useState<RoleDistribution | null>(null)
  // Detalle de una carta tocada en la lista del KPI: se abre encima y la lista queda abierta.
  const [kpiDetailCard, setKpiDetailCard] = useState<ApiCardSearchResult | null>(null)
  // La calculadora rápida no necesita deck ni roles: se abre también con el Lab vacío (arranca de cero cada vez que se abre).
  const [quickCalculator, setQuickCalculator] = useState(false)
  const deckFormat = useAppSelector((state) => state.settings.deckFormat)
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

  return (
    <StepPage as="article">
      <StepHero
        title={t('lab.panel.title')}
        icon="flask"
        subtitle={t('lab.panel.subtitle')}
        sideVariant="inline"
        side={(
          <>
            {/* En el celular (y a 1100 px, con el armazón del celular) la calculadora es un ícono en el renglón del título; desde 1101 px, el botón con su nombre. */}
            <IconButton tone="ghost" className="min-[1101px]:hidden" aria-label={t('lab.panel.quickCalculator')} title={t('lab.panel.quickCalculator')} onClick={() => setQuickCalculator(true)}>
              <Icon name="sliders" />
            </IconButton>
            <Button variant="secondary" size="sm" icon="sliders" className="max-[1101px]:hidden" onClick={() => setQuickCalculator(true)}>
              {t('lab.panel.quickCalculator')}
            </Button>
          </>
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
        /*
         * Desde 768 px, dos filas de dos (veredicto | qué probar; qué robás | reglas), de la misma altura en cada fila; en el celular, una columna en ese orden.
         * El lugar de la tarjeta de reglas (8 de 12) se lo pasa este panel como clase: no es la última hija de la grilla (`LabRules` suma el aviso de «Deshacer»).
         */
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-12 md:gap-5">
          <LabScoreCard className="md:col-span-6" results={results} view={activeTurnView} onViewChange={setActiveTurnView} isRecalculating={lab.isStale} handSize={handSize} onOpenDisclaimer={disclaimer.open} />
          <LabSuggestion
            className="md:col-span-6"
            deckFormat={deckFormat}
            cards={derivedMainCards}
            checks={lab.allChecks}
            handSize={handSize}
            view={activeTurnView}
            result={currentResult}
            first={results.first}
            second={results.second}
            roles={lab.roleDistributions[activeTurnView]}
            onOpenRole={setKpiModal}
          />
          <LabRoleDistribution
            className="md:col-span-4"
            distributions={lab.roleDistributions[activeTurnView]}
            onOpenRole={setKpiModal}
          />
          <LabRules
            className="md:col-span-8"
            groups={ruleGroups}
            patterns={patterns}
            customPatterns={lab.customPatterns}
            presets={lab.availablePresets}
            cards={derivedMainCards}
            labelCards={labelCards}
            disabledGenericRuleIds={disabledGenericRuleIds}
            handSize={handSize}
            results={results}
            patternActions={patternActions}
            patternEditorDefaults={patternEditorDefaults}
            onToggleGenericRule={onSetGenericRuleEnabled}
            onRenameSystemRule={onRenameSystemRule}
          />
        </div>
      ) : lab.canCalculate ? (
        <LabSkeleton />
      ) : (
        <EmptyState icon="flask" title={t('lab.panel.noData.title')}>
          {t('lab.panel.noData.body')}
        </EmptyState>
      )}

      <LabDisclaimerDialog isOpen={disclaimer.isOpen} onClose={disclaimer.close} />

      <QuickCalculator
        isOpen={quickCalculator}
        onClose={() => setQuickCalculator(false)}
        deckSize={derivedMainCards.reduce((total, card) => total + card.copies, 0)}
        handSize={handSize}
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

/** Mientras el cálculo exacto corre en segundo plano: las cuatro tarjetas con la forma del resultado (sin saltos al llegar). */
function LabSkeleton() {
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-12 md:gap-5" role="status" aria-busy="true" aria-label={t('lab.panel.calculating')}>
      <Skeleton radius="panel" className="h-96 md:col-span-6" />
      <Skeleton radius="panel" className="h-64 md:col-span-6 md:h-96" />
      <Skeleton radius="panel" className="h-64 md:col-span-4 md:h-96" />
      <Skeleton radius="panel" className="h-24 md:col-span-8 md:h-96" />
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
