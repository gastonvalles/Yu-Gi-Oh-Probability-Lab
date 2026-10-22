import { useMemo, useState } from 'react'

import { draftFromChanges } from '../app/build-draft'
import type { DeckChangeToken } from '../app/deck-change-actions'
import type { Outcome } from '../app/lab-suggestion'
import { useAppSelector } from '../app/store-hooks'
import type { DeckCardInstance } from '../app/model'
import type { RoleDistribution } from '../app/role-distribution'
import { deckCardsSignature } from '../app/saved-builds'
import { useLabDraft } from '../app/use-lab-draft'
import { useMediaQuery } from '../app/use-media-query'
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
import { cx } from './ui/cx'
import { EmptyState } from './ui/EmptyState'
import { Icon } from './ui/Icon'
import { IconButton } from './ui/IconButton'
import { Skeleton } from './ui/Skeleton'
import { StepPage } from './ui/StepPage'
import { LabAppliedNotice } from './probability/LabAppliedNotice'
import { LabChangeBar, LabChangeCard, LabChangeStale } from './probability/LabChangeCard'
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

/** El celular del Lab (el complemento de `md`, donde la página pasa a dos filas de dos): las acciones del cambio van en una barra fija abajo. */
const PHONE_MEDIA_QUERY = '(width < 768px)'

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
  // «Probar el cambio»: con un borrador, TODO el Lab mide tu deck con el cambio (`trial`) y tu deck de verdad (`lab`, que ya estaba medido: sale del caché por
  // contenido) queda como el «antes». Tu deck no se toca hasta «Aplicar al deck».
  const labDraft = useLabDraft()
  const draftCards = labDraft.status === 'active' ? labDraft.cards : null
  const drafting = draftCards !== null
  const labCards = draftCards ?? derivedMainCards
  const lab = useProbabilityLab(derivedMainCards, patterns, disabledGenericRuleIds, handSize, isEditingDeck, systemRuleNames)
  // Sin borrador mide lo mismo que `lab` (la misma clave del caché: no calcula dos veces). Con el borrador, lo suyo vale recién cuando es de estas cartas: mientras se
  // pone al día (el primer cuadro, con las cartas de antes todavía diferidas, o mientras calcula) el Lab está «midiendo», nunca muestra el número de tu deck como el nuevo.
  const trial = useProbabilityLab(labCards, patterns, disabledGenericRuleIds, handSize, isEditingDeck, systemRuleNames)
  const trialSettled = drafting && !trial.isStale
  const shown = drafting ? trial : lab
  const shownComputation = drafting ? (trialSettled ? trial.computation : null) : lab.computation
  const deckBuilder = useAppSelector((state) => state.deckBuilder)
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY)
  // «Aplicaste el cambio · Deshacer»: vive mientras el deck siga como quedó (si lo editás, deshacer ya no corresponde).
  const [applied, setApplied] = useState<DeckChangeToken | null>(null)
  const undoable = useMemo(() => applied !== null && deckCardsSignature(deckBuilder) === applied.resultSignature, [applied, deckBuilder])
  // El botón que se tocó («Probar el cambio», «Deshacer») se va con lo que cambia: el foco pasa a la tarjeta del cambio en vez de perderse.
  const [focusChange, setFocusChange] = useState(false)
  const [activeTurnView, setActiveTurnView] = useState<TurnView>('average')
  // Mientras hay una carta abierta en la lista de pendientes no se pasa a los resultados.
  const [isClassifyingPending, setIsClassifyingPending] = useState(false)
  const [kpiModal, setKpiModal] = useState<RoleDistribution | null>(null)
  // Detalle de una carta tocada en la lista del KPI: se abre encima y la lista queda abierta.
  const [kpiDetailCard, setKpiDetailCard] = useState<ApiCardSearchResult | null>(null)
  // La calculadora rápida no necesita deck ni roles: se abre también con el Lab vacío (arranca de cero cada vez que se abre).
  const [quickCalculator, setQuickCalculator] = useState(false)
  const deckFormat = useAppSelector((state) => state.settings.deckFormat)
  const { showToast } = useToastMessage()
  const disclaimer = useLabDisclaimer()

  const realResults = lab.computation?.status === 'ok' ? lab.computation.results : null
  const trialResults = trialSettled && trial.computation?.status === 'ok' ? trial.computation.results : null
  const results = drafting ? trialResults : realResults
  // Mientras se mide el deck con el cambio, la página queda armada con la forma de tu deck pero sin sus números (esqueletos): nada se corre de lugar.
  const measuring = drafting && trialResults === null && realResults !== null
  const layoutResults = results ?? (measuring ? realResults : null)
  const currentResult = layoutResults?.[activeTurnView] ?? null
  const shownResult = results?.[activeTurnView] ?? null
  // Con el cambio a prueba (o ya imposible), su tarjeta tapa la sugerencia, que queda invisible y sin foco en la misma celda.
  const hideSuggestion = drafting || labDraft.problem !== null

  const labelCards = useLabelCards(patterns, derivedMainCards)
  const ruleGroups = useMemo(
    () =>
      buildRuleEntryGroups({
        presets: shown.availablePresets,
        customPatterns: shown.customPatterns,
        unavailablePatterns: shown.unavailablePatterns,
        disabledGenericRuleIds,
        derivedMainCards: labelCards,
        patternResults: shownResult?.patternResults ?? [],
        viewPatternResults: {
          first: results?.first.patternResults ?? [],
          second: results?.second.patternResults ?? [],
        },
        view: activeTurnView,
      }),
    [activeTurnView, shownResult, results, shown.unavailablePatterns, labelCards, disabledGenericRuleIds, shown.availablePresets, shown.customPatterns],
  )

  // «Probar el cambio» de la sugerencia: todo el Lab pasa a tu deck con ese cambio (no se guarda nada).
  const startDraft = (outcome: Outcome) => {
    const next = draftFromChanges(outcome.changes)

    if (next) {
      setApplied(null)
      setFocusChange(true)
      labDraft.start(next)
    }
  }
  const discardDraft = () => {
    setFocusChange(false)
    labDraft.discard()
  }
  // «Comparar con mi deck»: A = tu deck, B = con el cambio (Comparar lee el borrador); al volver, el Lab sigue en el borrador.
  const compareDraft = () => {
    labDraft.compare()
    window.location.hash = '#workspace'
  }
  const compareOutcome = (outcome: Outcome) => {
    startDraft(outcome)
    compareDraft()
  }
  const applyDraft = () => {
    const result = labDraft.apply()

    if (result?.ok) {
      setFocusChange(false)
      setApplied(result.token)
    } else if (result?.reason === 'not-allowed') {
      showToast(result.issue, 'error')
    }
  }
  // «Deshacer»: vuelve tu deck y el borrador (el Lab vuelve a mostrar el cambio).
  const undoApply = () => {
    if (applied && labDraft.undo(applied)) {
      setFocusChange(true)
    }

    setApplied(null)
  }

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
      ) : shownComputation?.status === 'blocked' ? (
        <div className="grid gap-2">
          {shownComputation.issues.map((issue) => (
            <Callout key={issue.message} tone="danger">
              {issue.message}
            </Callout>
          ))}
        </div>
      ) : layoutResults && currentResult ? (
        /*
         * Desde 768 px, dos filas de dos (veredicto | qué probar; qué robás | reglas), de la misma altura en cada fila; en el celular, una columna en ese orden.
         * El lugar de la tarjeta de reglas (8 de 12) se lo pasa este panel como clase: no es la última hija de la grilla (`LabRules` suma el aviso de «Deshacer»).
         * Con el cambio a prueba en el celular, el final queda libre para la barra fija de las acciones.
         */
        <div className={cx('grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-12 md:gap-5', drafting && isPhone && 'pb-20')}>
          <LabScoreCard
            className="md:col-span-6"
            results={layoutResults}
            before={drafting && realResults ? realResults : undefined}
            measuring={measuring}
            view={activeTurnView}
            onViewChange={setActiveTurnView}
            isRecalculating={shown.isStale}
            handSize={handSize}
            onOpenDisclaimer={disclaimer.open}
          />
          {/*
           * El cambio (a prueba o ya imposible) ocupa el lugar de «Lo que más te frena», encimado en la misma celda: la sugerencia sigue ahí, invisible, así la
           * fila mide lo mismo con y sin el cambio y nada de abajo se corre al entrar o salir del modo (regla 7). Su `result` es el de tu deck de verdad.
           */}
          <div className="grid min-w-0 md:col-span-6 [&>*]:col-start-1 [&>*]:row-start-1">
            <div className={cx('grid min-w-0', hideSuggestion && 'invisible')} inert={hideSuggestion} aria-hidden={hideSuggestion || undefined}>
              {realResults ? (
                <LabSuggestion
                  deckFormat={deckFormat}
                  deck={deckBuilder}
                  cards={derivedMainCards}
                  checks={lab.allChecks}
                  handSize={handSize}
                  view={activeTurnView}
                  result={realResults[activeTurnView]}
                  first={realResults.first}
                  second={realResults.second}
                  roles={lab.roleDistributions[activeTurnView]}
                  onOpenRole={setKpiModal}
                  onTry={startDraft}
                  onCompare={compareOutcome}
                />
              ) : null}
            </div>
            {drafting ? (
              <LabChangeCard lines={labDraft.lines} actionsInCard={!isPhone} autoFocus={focusChange} onDiscard={discardDraft} onCompare={compareDraft} onApply={applyDraft} />
            ) : labDraft.problem ? (
              <LabChangeStale problem={labDraft.problem} onDiscard={discardDraft} />
            ) : null}
            {/* Va al `body` (portal): no ocupa lugar en la grilla. */}
            {drafting && isPhone ? <LabChangeBar onDiscard={discardDraft} onCompare={compareDraft} onApply={applyDraft} /> : null}
          </div>
          <LabRoleDistribution
            className="md:col-span-4"
            distributions={shown.roleDistributions[activeTurnView]}
            before={drafting ? lab.roleDistributions[activeTurnView] : undefined}
            onOpenRole={setKpiModal}
          />
          <LabRules
            className="md:col-span-8"
            groups={ruleGroups}
            patterns={patterns}
            customPatterns={shown.customPatterns}
            presets={shown.availablePresets}
            cards={labCards}
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

      <LabAppliedNotice open={undoable} onUndo={undoApply} onClose={() => setApplied(null)} />

      <QuickCalculator
        isOpen={quickCalculator}
        onClose={() => setQuickCalculator(false)}
        deckSize={labCards.reduce((total, card) => total + card.copies, 0)}
        handSize={handSize}
      />

      <Presence>
        {kpiModal !== null ? (
          <KpiDetailModal
            isOpen
            label={kpiModal.label}
            roles={kpiModal.roles}
            mainDeck={cardEntriesToDeckInstances(labCards)}
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
