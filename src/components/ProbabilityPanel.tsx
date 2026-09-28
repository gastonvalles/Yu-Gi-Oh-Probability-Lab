import { useEffect, useMemo, useState } from 'react'

import type { DeckCardInstance } from '../app/model'
import type { RoleDistributionKey } from '../app/role-distribution'
import { useToastMessage } from '../app/use-toast-message'
import { formatShortPercent } from '../app/utils'
import type { ApiCardReference, CardEntry, DeckFormat, HandPattern, TurnView } from '../types'
import { KpiDetailModal } from './comparison/KpiDetailModal'
import type { KpiRole } from './comparison/kpi-detail-helpers'
import { DeckModelStatusBadge } from './DeckModelStatusBadge'
import { StepHero } from './StepHero'
import { ConfirmDialog } from './probability/ConfirmDialog'
import { LabFailureBreakdown } from './probability/LabFailureBreakdown'
import { LabRoleDistribution } from './probability/LabRoleDistribution'
import { LabRuleList } from './probability/LabRuleList'
import { LabScoreCard } from './probability/LabScoreCard'
import { LabSuggestions } from './probability/LabSuggestions'
import { PatternEditorDrawer, formatDrawerImpactLabel } from './probability/PatternEditorDrawer'
import type { PatternEditorActions } from './probability/pattern-editor-actions'
import { buildRuleEntries } from './probability/probability-lab-helpers'
import { TurnViewToggle } from './probability/TurnViewToggle'
import { useDeckSuggestions } from './probability/use-deck-suggestions'
import { useKpiFeedback, withChangeTracking } from './probability/use-kpi-feedback'
import { useProbabilityLab } from './probability/use-probability-lab'

interface ProbabilityPanelProps {
  handSize: number
  deckFormat: DeckFormat
  patterns: HandPattern[]
  derivedMainCards: CardEntry[]
  patternActions: PatternEditorActions
  isEditingDeck: boolean
}

type DrawerMode = 'custom-create' | 'edit' | 'quick-add'

const ROLE_TO_KPI: Record<RoleDistributionKey, KpiRole> = {
  starter: 'starter',
  extender: 'extender',
  interaction: 'handtrap',
  brick: 'brick',
}

export function ProbabilityPanel({
  handSize,
  deckFormat,
  patterns,
  derivedMainCards,
  patternActions,
  isEditingDeck,
}: ProbabilityPanelProps) {
  const lab = useProbabilityLab(derivedMainCards, patterns, handSize, isEditingDeck)
  const [activeTurnView, setActiveTurnView] = useState<TurnView>('average')
  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null)
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null)
  const [pendingCreatedPatternId, setPendingCreatedPatternId] = useState<string | null>(null)
  const [pendingDeletePatternId, setPendingDeletePatternId] = useState<string | null>(null)
  const [kpiModalRole, setKpiModalRole] = useState<KpiRole | null>(null)
  const { showToast } = useToastMessage()

  const results = lab.computation?.status === 'ok' ? lab.computation.results : null
  const currentResult = results?.[activeTurnView] ?? null
  const { feedback, trackChange } = useKpiFeedback(currentResult?.cleanProbability ?? null)
  const trackedActions = useMemo(() => withChangeTracking(patternActions, trackChange), [patternActions, trackChange])
  const suggestions = useDeckSuggestions(derivedMainCards, lab.allChecks, handSize, deckFormat, lab.canCalculate)

  const ruleEntries = useMemo(() => {
    const entries = buildRuleEntries({
      allChecks: lab.allChecks,
      availablePresets: lab.availablePresets,
      derivedMainCards,
      patternResults: currentResult?.patternResults ?? [],
    })
    const appliesToView = (turnContext: string) =>
      activeTurnView === 'average' || turnContext === 'either' || turnContext === activeTurnView

    return {
      openings: entries.openings.filter((entry) => appliesToView(entry.turnContext)),
      problems: entries.problems.filter((entry) => appliesToView(entry.turnContext)),
    }
  }, [activeTurnView, currentResult, derivedMainCards, lab.allChecks, lab.availablePresets])

  const selectedPattern =
    patterns.find((pattern) => pattern.id === selectedPatternId) ??
    lab.allChecks.find((check) => check.id === selectedPatternId) ??
    null
  const selectedProbability =
    currentResult?.patternResults.find((result) => result.patternId === selectedPatternId)?.probability ?? null

  // Si la regla abierta desaparece (p. ej. la curaron), se cierra el editor.
  useEffect(() => {
    const exists =
      !selectedPatternId ||
      selectedPatternId === pendingCreatedPatternId ||
      patterns.some((pattern) => pattern.id === selectedPatternId) ||
      lab.allChecks.some((check) => check.id === selectedPatternId)

    if (!exists) {
      setSelectedPatternId(null)
      setDrawerMode((current) => (current === 'quick-add' ? current : null))
    }
  }, [lab.allChecks, patterns, pendingCreatedPatternId, selectedPatternId])

  useEffect(() => {
    const pendingPattern = patterns.find((pattern) => pattern.id === pendingCreatedPatternId)

    if (pendingCreatedPatternId && pendingPattern && pendingPattern.name.trim().length > 0) {
      setPendingCreatedPatternId(null)
    }
  }, [patterns, pendingCreatedPatternId])

  const handleOpenCustomCreate = () => {
    if (pendingCreatedPatternId && patterns.some((pattern) => pattern.id === pendingCreatedPatternId)) {
      setSelectedPatternId(pendingCreatedPatternId)
      setDrawerMode('custom-create')
      return
    }

    const patternId = patternActions.addPattern('opening')
    setPendingCreatedPatternId(patternId)
    setSelectedPatternId(patternId)
    setDrawerMode('custom-create')
  }

  const handleCloseDrawer = () => {
    const pendingPattern = patterns.find((pattern) => pattern.id === pendingCreatedPatternId)

    if (pendingCreatedPatternId === selectedPatternId && pendingPattern && pendingPattern.name.trim().length === 0) {
      patternActions.removePattern(pendingPattern.id)
      showToast('Regla vacía descartada')
    }

    setPendingCreatedPatternId(null)
    setSelectedPatternId(null)
    setDrawerMode(null)
  }

  const handleConfirmDelete = () => {
    if (!pendingDeletePatternId) {
      return
    }

    trackedActions.removePattern(pendingDeletePatternId)

    if (selectedPatternId === pendingDeletePatternId) {
      setSelectedPatternId(null)
      setDrawerMode(null)
    }

    if (pendingCreatedPatternId === pendingDeletePatternId) {
      setPendingCreatedPatternId(null)
    }

    setPendingDeletePatternId(null)
  }

  return (
    <article className="surface-panel deck-mobile-step-shell lab-shell grid h-full min-h-0 content-start gap-3 p-0 min-[1101px]:p-3">
      <StepHero
        step="Probability Lab"
        title="Qué tan bien abre tu deck y cómo mejorarlo"
        description="Cálculo exacto de todas las manos posibles, yendo primero (5 cartas) y segundo (6)."
        variant="compact"
        side={<DeckModelStatusBadge modelStatus={lab.modelStatus} variant="compact" />}
        sideVariant="inline"
      />

      {lab.readiness.status === 'empty-deck' ? (
        <LabNotice kicker="Antes de medir" title="Cargá el Main Deck primero">
          Cuando tengas cartas en el Main Deck vas a ver el % de manos jugables, por qué fallan y qué cambios lo mejoran.
        </LabNotice>
      ) : lab.readiness.status === 'needs-classification' ? (
        <LabNotice kicker="Paso 2 pendiente" title="Terminá de clasificar todas las cartas">
          {lab.readiness.message} Mientras tanto podés robar manos de prueba con el botón de práctica.
        </LabNotice>
      ) : lab.computation?.status === 'blocked' ? (
        <div className="grid gap-1.5">
          {lab.computation.issues.map((issue) => (
            <p key={issue.message} className="surface-card-danger m-0 px-3 py-2 text-[0.8rem] text-destructive">
              {issue.message}
            </p>
          ))}
        </div>
      ) : results && currentResult ? (
        <div className="lab-layout">
          <div className="lab-toolbar">
            <TurnViewToggle
              activeView={activeTurnView}
              onChange={setActiveTurnView}
              details={{
                first: `5 cartas · ${formatShortPercent(results.first.cleanProbability)}`,
                second: `6 cartas · ${formatShortPercent(results.second.cleanProbability)}`,
                average: `50/50 · ${formatShortPercent(results.average.cleanProbability)}`,
              }}
            />
          </div>

          <LabScoreCard
            results={results}
            view={activeTurnView}
            feedback={feedback}
            isRecalculating={lab.isStale}
          />
          <LabSuggestions state={suggestions} />
          <LabFailureBreakdown result={currentResult} />
          <LabRoleDistribution
            distributions={lab.roleDistributions[activeTurnView]}
            onOpenRole={(role) => setKpiModalRole(ROLE_TO_KPI[role])}
          />
          <LabRuleList
            openings={ruleEntries.openings}
            problems={ruleEntries.problems}
            highlightedPatternId={feedback?.patternId ?? null}
            onEditRule={(patternId) => {
              setSelectedPatternId(patternId)
              setDrawerMode('edit')
            }}
            onAddRecommended={() => {
              setSelectedPatternId(null)
              setDrawerMode('quick-add')
            }}
            onCreateCustom={handleOpenCustomCreate}
          />
        </div>
      ) : null}

      <PatternEditorDrawer
        actions={trackedActions}
        availablePresets={lab.availablePresets}
        currentImpactLabel={selectedPattern ? formatDrawerImpactLabel(selectedProbability, selectedPattern.kind) : null}
        derivedMainCards={derivedMainCards}
        drawerMode={drawerMode}
        feedbackLabel={feedback && feedback.patternId === selectedPatternId ? feedback.label : null}
        isPendingCreation={selectedPatternId === pendingCreatedPatternId}
        onClose={handleCloseDrawer}
        onCreateCustom={handleOpenCustomCreate}
        onRequestDelete={setPendingDeletePatternId}
        onSelectPreset={(preset) => trackedActions.appendPattern(preset.pattern)}
        pattern={selectedPattern}
        patterns={patterns}
      />

      <ConfirmDialog
        confirmLabel="Eliminar regla"
        description="Se va a quitar esta regla del análisis y el resultado se recalculará en el momento."
        isOpen={pendingDeletePatternId !== null}
        onCancel={() => setPendingDeletePatternId(null)}
        onConfirm={handleConfirmDelete}
        title="Eliminar regla"
      />

      {kpiModalRole !== null ? (
        <KpiDetailModal
          isOpen
          role={kpiModalRole}
          side="A"
          mainDeck={cardEntriesToDeckInstances(derivedMainCards)}
          onCardClick={() => setKpiModalRole(null)}
          onClose={() => setKpiModalRole(null)}
        />
      ) : null}
    </article>
  )
}

function LabNotice({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="surface-panel-strong grid gap-1 px-4 py-4">
      <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">{kicker}</p>
      <h3 className="m-0 text-[1rem] leading-tight text-(--text-main)">{title}</h3>
      <p className="app-muted m-0 text-[0.82rem] leading-[1.3]">{children}</p>
    </section>
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
