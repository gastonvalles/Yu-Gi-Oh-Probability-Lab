import { useEffect, useMemo, useState } from 'react'

import type { DeckCardInstance } from '../app/model'
import type { RoleDistributionKey } from '../app/role-distribution'
import { useToastMessage } from '../app/use-toast-message'
import { formatShortPercent } from '../app/utils'
import type { ApiCardReference, CardEntry, HandPattern, TurnView } from '../types'
import { KpiDetailModal } from './comparison/KpiDetailModal'
import type { KpiRole } from './comparison/kpi-detail-helpers'
import { DeckModelStatusBadge } from './DeckModelStatusBadge'
import { StepHero } from './StepHero'
import { ConfirmDialog } from './probability/ConfirmDialog'
import { LabDisclaimerDialog, useLabDisclaimer } from './probability/LabDisclaimerDialog'
import { LabFailureBreakdown } from './probability/LabFailureBreakdown'
import { LabRoleDistribution } from './probability/LabRoleDistribution'
import { LabRuleList } from './probability/LabRuleList'
import { LabScoreCard } from './probability/LabScoreCard'
import { PatternEditorDrawer, formatDrawerImpactLabel } from './probability/PatternEditorDrawer'
import type { PatternEditorActions } from './probability/pattern-editor-actions'
import { buildPatternCompactSummary } from './probability/pattern-helpers'
import { buildRuleEntryGroups } from './probability/probability-lab-helpers'
import { TurnViewToggle } from './probability/TurnViewToggle'
import { useProbabilityLab } from './probability/use-probability-lab'

interface ProbabilityPanelProps {
  handSize: number
  patterns: HandPattern[]
  disabledGenericRuleIds: string[]
  onSetGenericRuleEnabled: (ruleId: string, enabled: boolean) => void
  derivedMainCards: CardEntry[]
  patternActions: PatternEditorActions
  isEditingDeck: boolean
}

type DrawerMode = 'custom-create' | 'edit'

const ROLE_TO_KPI: Record<RoleDistributionKey, KpiRole> = {
  starter: 'starter',
  extender: 'extender',
  interaction: 'handtrap',
  brick: 'brick',
}

export function ProbabilityPanel({
  handSize,
  patterns,
  disabledGenericRuleIds,
  onSetGenericRuleEnabled,
  derivedMainCards,
  patternActions,
  isEditingDeck,
}: ProbabilityPanelProps) {
  const lab = useProbabilityLab(derivedMainCards, patterns, disabledGenericRuleIds, handSize, isEditingDeck)
  const [activeTurnView, setActiveTurnView] = useState<TurnView>('average')
  const [drawerMode, setDrawerMode] = useState<DrawerMode | null>(null)
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null)
  const [pendingCreatedPatternId, setPendingCreatedPatternId] = useState<string | null>(null)
  const [pendingDeletePatternId, setPendingDeletePatternId] = useState<string | null>(null)
  const [kpiModalRole, setKpiModalRole] = useState<KpiRole | null>(null)
  const { showToast } = useToastMessage()
  const disclaimer = useLabDisclaimer()

  const results = lab.computation?.status === 'ok' ? lab.computation.results : null
  const currentResult = results?.[activeTurnView] ?? null

  const ruleGroups = useMemo(
    () =>
      buildRuleEntryGroups({
        presets: lab.availablePresets,
        customPatterns: lab.customPatterns,
        disabledGenericRuleIds,
        derivedMainCards,
        patternResults: currentResult?.patternResults ?? [],
        view: activeTurnView,
      }),
    [activeTurnView, currentResult, derivedMainCards, disabledGenericRuleIds, lab.availablePresets, lab.customPatterns],
  )

  const selectedPattern = patterns.find((pattern) => pattern.id === selectedPatternId) ?? null
  const selectedProbability =
    currentResult?.patternResults.find((result) => result.patternId === selectedPatternId)?.probability ?? null

  // Si la regla abierta desaparece (p. ej. la curaron), se cierra el editor.
  useEffect(() => {
    const exists =
      !selectedPatternId ||
      selectedPatternId === pendingCreatedPatternId ||
      patterns.some((pattern) => pattern.id === selectedPatternId)

    if (!exists) {
      setSelectedPatternId(null)
      setDrawerMode(null)
    }
  }, [patterns, pendingCreatedPatternId, selectedPatternId])

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

  // Al cerrar: una regla nueva sin condiciones se descarta; si tiene condiciones pero no
  // nombre, se nombra sola con su resumen para no perder el trabajo.
  const handleCloseDrawer = () => {
    const pendingPattern = patterns.find((pattern) => pattern.id === pendingCreatedPatternId)

    if (pendingCreatedPatternId === selectedPatternId && pendingPattern && pendingPattern.name.trim().length === 0) {
      const hasConditions = pendingPattern.conditions.some((condition) => condition.matcher !== null)

      if (hasConditions) {
        const cardById = new Map(derivedMainCards.map((card) => [card.id, card]))
        patternActions.setPatternName(pendingPattern.id, buildPatternCompactSummary(pendingPattern, cardById))
      } else {
        patternActions.removePattern(pendingPattern.id)
        showToast('Regla vacía descartada')
      }
    }

    setPendingCreatedPatternId(null)
    setSelectedPatternId(null)
    setDrawerMode(null)
  }

  const handleConfirmDelete = () => {
    if (!pendingDeletePatternId) {
      return
    }

    patternActions.removePattern(pendingDeletePatternId)

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
        title="Qué tan bien abre tu deck y por qué falla"
        description="Cálculo exacto de todas las manos posibles, yendo primero (5 cartas) y segundo (6)."
        variant="compact"
        side={<DeckModelStatusBadge modelStatus={lab.modelStatus} variant="compact" />}
        sideVariant="inline"
      />

      {lab.readiness.status === 'empty-deck' ? (
        <LabNotice kicker="Antes de medir" title="Cargá el Main Deck primero">
          Cuando tengas cartas en el Main Deck vas a ver el % de manos jugables y por qué fallan.
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
            <button type="button" className="lab-help-link" onClick={disclaimer.open}>
              ¿Cómo leer estos %?
            </button>
          </div>

          {/* Desktop: resultado y reparto lado a lado (misma altura); roles y reglas a lo ancho. */}
          <LabScoreCard results={results} view={activeTurnView} isRecalculating={lab.isStale} />
          <LabFailureBreakdown result={currentResult} />
          <LabRoleDistribution
            distributions={lab.roleDistributions[activeTurnView]}
            onOpenRole={(role) => setKpiModalRole(ROLE_TO_KPI[role])}
          />
          <LabRuleList
            groups={ruleGroups}
            onEditRule={(patternId) => {
              setSelectedPatternId(patternId)
              setDrawerMode('edit')
            }}
            onToggleGenericRule={onSetGenericRuleEnabled}
            onCreateCustom={handleOpenCustomCreate}
          />
        </div>
      ) : null}

      <PatternEditorDrawer
        actions={patternActions}
        currentImpactLabel={selectedPattern ? formatDrawerImpactLabel(selectedProbability, selectedPattern.kind) : null}
        derivedMainCards={derivedMainCards}
        drawerMode={drawerMode}
        isPendingCreation={selectedPatternId === pendingCreatedPatternId}
        onClose={handleCloseDrawer}
        onRequestDelete={setPendingDeletePatternId}
        pattern={selectedPattern}
      />

      <LabDisclaimerDialog isOpen={disclaimer.isOpen} onAcknowledge={disclaimer.acknowledge} />

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
