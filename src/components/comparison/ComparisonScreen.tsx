import { useMemo, useState, useCallback } from 'react'

import { compareBuild, interpretComparison } from '../../app/build-comparison'
import { applyEditsToConfig, isBuildBReady, type CardEditMap } from '../../app/build-comparison-edits'
import { toPortableConfig } from '../../app/app-state-codec'
import { selectAppState } from '../../app/store'
import { useAppSelector } from '../../app/store-hooks'
import type { AppState, DeckBuilderState, DeckCardInstance, PortableConfig } from '../../app/model'
import type { CardOrigin, CardRole } from '../../types'
import { formatInteger, formatPercent } from '../../app/utils'
import { CardArt } from '../CardArt'
import { CardDetailModal } from '../card-detail/CardDetailModal'
import { VerdictCard } from './VerdictCard'
import { InsightList } from './InsightList'
import { BuildBCardEditor } from './BuildBCardEditor'
import { DeckImportDrawer } from '../deck-mode/DeckImportDrawer'
import { Button } from '../ui/Button'
import type { ApiCardSearchResult } from '../../ygoprodeck'

function createEmptyDeckBuilder(name: string): DeckBuilderState {
  return { deckName: name, main: [], extra: [], side: [], isEditingDeck: false }
}

// Module-level cache so state survives unmount/remount on step navigation
let _cachedImportedDeck: DeckBuilderState | null = null
let _cachedEditsMap: CardEditMap = new Map()

export function ComparisonScreen() {
  const currentAppState = useAppSelector(selectAppState)
  const deckFormat = useAppSelector((state) => state.settings.deckFormat)
  const [importedDeckBuilder, _setImportedDeckBuilder] = useState<DeckBuilderState | null>(_cachedImportedDeck)
  const [isImportDrawerOpen, setIsImportDrawerOpen] = useState(false)
  const [detailCard, setDetailCard] = useState<ApiCardSearchResult | null>(null)
  const [editsMap, _setEditsMap] = useState<CardEditMap>(_cachedEditsMap)
  const [editingCard, setEditingCard] = useState<DeckCardInstance | null>(null)

  // Wrappers that sync module-level cache
  const setImportedDeckBuilder = useCallback((deck: DeckBuilderState | null) => {
    _cachedImportedDeck = deck
    _setImportedDeckBuilder(deck)
  }, [])

  const setEditsMap = useCallback((updater: CardEditMap | ((prev: CardEditMap) => CardEditMap)) => {
    _setEditsMap((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      _cachedEditsMap = next
      return next
    })
  }, [])

  // Build A card click → detail modal
  const handleBuildACardClick = useCallback((card: DeckCardInstance) => {
    setDetailCard({ name: card.name, ...card.apiCard })
  }, [])

  // Build B card click → editor
  const handleBuildBCardClick = useCallback((card: DeckCardInstance) => {
    setEditingCard(card)
  }, [])

  // Apply edits to importedDeckBuilder before generating configB
  const editedDeckBuilder = useMemo(() => {
    if (!importedDeckBuilder) return null
    return applyEditsToConfig(importedDeckBuilder, editsMap)
  }, [importedDeckBuilder, editsMap])

  const buildBReady = useMemo(() => {
    if (!editedDeckBuilder) return false
    return isBuildBReady(editedDeckBuilder)
  }, [editedDeckBuilder])

  // Count pending cards in Build B (after edits)
  const pendingCount = useMemo(() => {
    if (!editedDeckBuilder) return 0
    return editedDeckBuilder.main.filter(
      (c) => c.origin === null || c.roles.length === 0 || c.needsReview,
    ).length
  }, [editedDeckBuilder])

  const configA = useMemo(() => toPortableConfig(currentAppState), [currentAppState])
  const configB = useMemo(() => portableConfigFromImport(editedDeckBuilder, currentAppState), [editedDeckBuilder, currentAppState])

  const result = useMemo(() => (configB ? compareBuild(configA, configB) : null), [configA, configB])
  const interp = useMemo(() => (result ? interpretComparison(result) : null), [result])

  const kpiA = useMemo(() => extractKpi(configA, result, 'A'), [configA, result])
  const kpiB = useMemo(() => (configB && result ? extractKpi(configB, result, 'B') : null), [configB, result])

  // Handle import: reset editsMap
  const handleApplyImport = useCallback((deck: DeckBuilderState) => {
    setImportedDeckBuilder(deck)
    setEditsMap(new Map())
    setIsImportDrawerOpen(false)
  }, [])

  // Handle editor save
  const handleEditorSave = useCallback((ygoprodeckId: number, origin: CardOrigin, roles: CardRole[]) => {
    setEditsMap((prev) => new Map(prev).set(ygoprodeckId, { origin, roles }))
    setEditingCard(null)
  }, [])

  // Get current edit for editing card
  const currentEditForCard = editingCard
    ? editsMap.get(editingCard.apiCard.ygoprodeckId)
    : undefined

  return (
    <div className="comparison-layout grid h-full min-h-0 w-full gap-0" style={{ gridTemplateColumns: 'minmax(170px, 210px) minmax(0, 1fr) minmax(170px, 210px)' }}>

      {/* ── Left: Build A KPIs + Verdict ── */}
      <aside className="grid content-start gap-2 overflow-y-auto p-2">
        <SideLabel text="Build A" sub={currentAppState.deckBuilder.deckName || 'Deck actual'} />
        <KpiCard label="Main Deck" value={formatInteger(kpiA.main)} tone="neutral" />
        <KpiCard label="Starters" value={formatInteger(kpiA.starters)} tone="positive" />
        <KpiCard label="Handtraps" value={formatInteger(kpiA.handtraps)} tone="info" />
        <KpiCard label="Bricks" value={formatInteger(kpiA.bricks)} tone="negative" />
        {kpiA.openings !== null ? <KpiCard label="Openings" value={formatPercent(kpiA.openings)} tone="positive" /> : null}
        {kpiA.problems !== null ? <KpiCard label="Problems" value={formatPercent(kpiA.problems)} tone="negative" /> : null}

        {interp && buildBReady ? (
          <>
            <VerdictCard verdict={interp.verdict} />
            <InsightList insights={interp.insights} />
          </>
        ) : null}
      </aside>

      {/* ── Center: Both decks side by side, single scroll, aligned zones ── */}
      <div className="min-h-0 overflow-y-auto border-x border-(--border-subtle) p-2">
        <div className="grid gap-3">
          {/* Pending review message removed */}

          {/* Main Deck row */}
          <div className="grid items-start gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="grid content-start gap-1">
              <div className="flex h-7 items-center justify-between gap-2">
                <span className="text-[0.72rem] font-semibold text-(--text-muted)">Main [{formatInteger(currentAppState.deckBuilder.main.length)}]</span>
              </div>
              <DeckGrid cards={currentAppState.deckBuilder.main} zone="main" onCardClick={handleBuildACardClick} />
            </div>
            <div className="grid content-start gap-1">
              {importedDeckBuilder ? (
                <>
                  <div className="flex h-7 items-center justify-between gap-2">
                    <span className="text-[0.72rem] font-semibold text-(--text-muted)">Main [{formatInteger(importedDeckBuilder.main.length)}]</span>
                    <Button variant="secondary" size="sm" onClick={() => { setImportedDeckBuilder(null); setEditsMap(new Map()); setIsImportDrawerOpen(true) }}>Cambiar</Button>
                  </div>
                  <DeckGridB cards={editedDeckBuilder?.main ?? importedDeckBuilder.main} zone="main" onCardClick={handleBuildBCardClick} />
                </>
              ) : (
                <div className="grid min-h-[200px] place-items-center">
                  <div className="grid gap-3 text-center">
                    <p className="app-muted m-0 text-[0.84rem]">Importá una build</p>
                    <Button variant="primary" size="sm" onClick={() => setIsImportDrawerOpen(true)}>Importar</Button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Extra Deck row */}
          {(currentAppState.deckBuilder.extra.length > 0 || (importedDeckBuilder && importedDeckBuilder.extra.length > 0)) ? (
            <div className="grid items-start gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="grid content-start gap-1">
                <span className="text-[0.68rem] font-semibold text-(--text-muted)">Extra [{formatInteger(currentAppState.deckBuilder.extra.length)}]</span>
                <DeckGrid cards={currentAppState.deckBuilder.extra} zone="extra" onCardClick={handleBuildACardClick} />
              </div>
              <div className="grid content-start gap-1">
                {importedDeckBuilder ? (
                  <>
                    <span className="text-[0.68rem] font-semibold text-(--text-muted)">Extra [{formatInteger(importedDeckBuilder.extra.length)}]</span>
                    <DeckGrid cards={editedDeckBuilder?.extra ?? importedDeckBuilder.extra} zone="extra" onCardClick={handleBuildBCardClick} />
                  </>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Side Deck row */}
          {(currentAppState.deckBuilder.side.length > 0 || (importedDeckBuilder && importedDeckBuilder.side.length > 0)) ? (
            <div className="grid items-start gap-2" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="grid content-start gap-1">
                <span className="text-[0.68rem] font-semibold text-(--text-muted)">Side [{formatInteger(currentAppState.deckBuilder.side.length)}]</span>
                <DeckGrid cards={currentAppState.deckBuilder.side} zone="side" onCardClick={handleBuildACardClick} />
              </div>
              <div className="grid content-start gap-1">
                {importedDeckBuilder ? (
                  <>
                    <span className="text-[0.68rem] font-semibold text-(--text-muted)">Side [{formatInteger(importedDeckBuilder.side.length)}]</span>
                    <DeckGrid cards={editedDeckBuilder?.side ?? importedDeckBuilder.side} zone="side" onCardClick={handleBuildBCardClick} />
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Right: Build B KPIs + Changes ── */}
      <aside className="grid content-start gap-2 overflow-y-auto p-2">
        <SideLabel text="Build B" sub={importedDeckBuilder?.deckName || 'Sin importar'} />
        {kpiB ? (
          <>
            <KpiCard label="Main Deck" value={formatInteger(kpiB.main)} tone="neutral" />
            <KpiCard label="Starters" value={formatInteger(kpiB.starters)} tone="positive" />
            <KpiCard label="Handtraps" value={formatInteger(kpiB.handtraps)} tone="info" />
            <KpiCard label="Bricks" value={formatInteger(kpiB.bricks)} tone="negative" />
            {kpiB.openings !== null ? <KpiCard label="Openings" value={formatPercent(kpiB.openings)} tone="positive" /> : null}
            {kpiB.problems !== null ? <KpiCard label="Problems" value={formatPercent(kpiB.problems)} tone="negative" /> : null}
          </>
        ) : (
          <KpiCard label="Esperando" value="—" tone="neutral" />
        )}

        {importedDeckBuilder && !buildBReady && pendingCount > 0 ? (
          <div
            className="comparison-kpi-card grid gap-1 px-2.5 py-2 cursor-pointer hover:brightness-125 transition-[filter] border-l-2 border-amber-400"
            style={{ background: 'rgb(var(--background-rgb))' }}
            onClick={() => {
              const first = editedDeckBuilder?.main.find(c => c.origin === null || c.roles.length === 0 || c.needsReview)
              if (first) setEditingCard(first)
            }}
          >
            <strong className="text-[0.76rem] text-amber-300">Build B necesita revisión</strong>
            <p className="m-0 text-[0.68rem] text-(--text-muted)">{formatInteger(pendingCount)} carta{pendingCount === 1 ? '' : 's'} pendiente{pendingCount === 1 ? '' : 's'}. Click para categorizar.</p>
          </div>
        ) : null}

      </aside>

      <CardDetailModal
        card={detailCard}
        deckFormat={deckFormat}
        isOpen={detailCard !== null}
        showActions={false}
        onAddToZone={() => false}
        onClose={() => setDetailCard(null)}
      />

      {editingCard ? (
        <BuildBCardEditor
          card={editingCard}
          currentEdit={currentEditForCard}
          allCards={editedDeckBuilder?.main ?? []}
          onSave={handleEditorSave}
          onNavigate={(card) => setEditingCard(card)}
          onClose={() => setEditingCard(null)}
        />
      ) : null}

      <DeckImportDrawer
        deckBuilder={createEmptyDeckBuilder('Build B')}
        deckFormat={deckFormat}
        isOpen={isImportDrawerOpen}
        onApplyImport={handleApplyImport}
        onClose={() => setIsImportDrawerOpen(false)}
      />
    </div>
  )
}

// ── Side Label ──

function SideLabel({ text, sub }: { text: string; sub: string }) {
  return (
    <div className="grid gap-0.5 px-1">
      <strong className="text-[0.82rem] text-(--text-main)">{text}</strong>
      <span className="truncate text-[0.68rem] text-(--text-muted)">{sub}</span>
    </div>
  )
}

// ── KPI Card (styled like Probability Lab cards) ──

type KpiTone = 'positive' | 'negative' | 'info' | 'neutral'

function KpiCard({ label, value, tone }: { label: string; value: string; tone: KpiTone }) {
  return (
    <div className={`comparison-kpi-card comparison-kpi-${tone} grid gap-0.5 px-2.5 py-2`}>
      <span className="text-[0.66rem] uppercase tracking-widest text-(--text-muted)">{label}</span>
      <strong className="text-[1rem] leading-none tabular-nums text-(--text-main)">{value}</strong>
    </div>
  )
}

// ── Deck Grid (Build A — no highlighting) ──

const ZONE_TINTS: Record<string, { bg: string; border: string }> = {
  main: { bg: 'var(--zone-main-background)', border: 'var(--zone-main-border)' },
  extra: { bg: 'var(--zone-extra-background)', border: 'var(--zone-extra-border)' },
  side: { bg: 'var(--zone-side-background)', border: 'var(--zone-side-border)' },
}

function DeckGrid({ cards, zone, onCardClick }: { cards: DeckCardInstance[]; zone: 'main' | 'extra' | 'side'; onCardClick?: (card: DeckCardInstance) => void }) {
  if (cards.length === 0) return null
  const t = ZONE_TINTS[zone]
  return (
    <div
      className="grid w-full content-start gap-[0.15rem] p-[0.15rem] grid-cols-10"
      style={{
        background: `linear-gradient(180deg, ${t.bg}, rgb(var(--background-rgb) / 0.98))`,
        border: `1px solid ${t.border}`,
        borderRadius: 'var(--radius-panel)',
      }}
    >
      {cards.map((card, i) => (
        <div
          key={`${card.instanceId}-${i}`}
          className="min-w-0 cursor-pointer"
          onClick={() => onCardClick?.(card)}
        >
          <CardArt remoteUrl={card.apiCard.imageUrlSmall} name={card.name} className="block aspect-[0.72] w-full min-w-0 bg-input object-cover" limitCard={card.apiCard} limitBadgeSize="sm" />
        </div>
      ))}
    </div>
  )
}

// ── Deck Grid B (Build B — with highlighting for cards needing review) ──

function DeckGridB({ cards, zone, onCardClick }: { cards: DeckCardInstance[]; zone: 'main' | 'extra' | 'side'; onCardClick?: (card: DeckCardInstance) => void }) {
  if (cards.length === 0) return null
  const t = ZONE_TINTS[zone]
  return (
    <div
      className="grid w-full content-start gap-[0.15rem] p-[0.15rem] grid-cols-10"
      style={{
        background: `linear-gradient(180deg, ${t.bg}, rgb(var(--background-rgb) / 0.98))`,
        border: `1px solid ${t.border}`,
        borderRadius: 'var(--radius-panel)',
      }}
    >
      {cards.map((card, i) => {
        const needsReview = card.origin === null || card.roles.length === 0 || card.needsReview
        return (
          <div
            key={`${card.instanceId}-${i}`}
            className={[
              'min-w-0 cursor-pointer relative',
              needsReview ? 'rounded-sm' : '',
            ].join(' ')}
            onClick={() => onCardClick?.(card)}
          >
            <CardArt remoteUrl={card.apiCard.imageUrlSmall} name={card.name} className="block aspect-[0.72] w-full min-w-0 bg-input object-cover" limitCard={card.apiCard} limitBadgeSize="sm" />
            {needsReview ? <div className="absolute inset-0 rounded-sm bg-amber-400/30 pointer-events-none" /> : null}
          </div>
        )
      })}
    </div>
  )
}

// ── Helpers ──

interface Kpi { main: number; starters: number; extenders: number; handtraps: number; bricks: number; openings: number | null; problems: number | null }

function extractKpi(config: PortableConfig, res: { rolesA: Record<string, number>; rolesB: Record<string, number>; totalOpeningProbabilityA: number; totalOpeningProbabilityB: number; totalProblemProbabilityA: number; totalProblemProbabilityB: number } | null, side: 'A' | 'B'): Kpi {
  const roles = res ? (side === 'A' ? res.rolesA : res.rolesB) : null
  let s = 0, e = 0, h = 0, b = 0
  if (roles) {
    s = (roles as Record<string, number>).starter ?? 0
    e = (roles as Record<string, number>).extender ?? 0
    h = (roles as Record<string, number>).handtrap ?? 0
    b = ((roles as Record<string, number>).brick ?? 0) + ((roles as Record<string, number>).garnet ?? 0)
  } else {
    for (const c of config.deckBuilder.main) for (const r of c.roles) { if (r === 'starter') s++; if (r === 'extender') e++; if (r === 'handtrap') h++; if (r === 'brick' || r === 'garnet') b++ }
  }
  return { main: config.deckBuilder.main.length, starters: s, extenders: e, handtraps: h, bricks: b, openings: res ? (side === 'A' ? res.totalOpeningProbabilityA : res.totalOpeningProbabilityB) : null, problems: res ? (side === 'A' ? res.totalProblemProbabilityA : res.totalProblemProbabilityB) : null }
}

function portableConfigFromImport(deck: DeckBuilderState | null, app: AppState): PortableConfig | null {
  if (!deck) return null
  const m = (cards: DeckCardInstance[]) => cards.map(c => ({
    name: c.name, apiCard: { ...c.apiCard }, origin: c.origin, roles: [...c.roles],
    needsReview: c.needsReview,
  }))
  return {
    version: 15, handSize: app.handSize, deckFormat: app.deckFormat as PortableConfig['deckFormat'],
    patternsSeeded: app.patternsSeeded, patternsSeedVersion: app.patternsSeedVersion,
    deckBuilder: { deckName: deck.deckName, main: m(deck.main), extra: m(deck.extra), side: m(deck.side) },
    patterns: app.patterns.map(p => ({ name: p.name, kind: p.kind, logic: p.logic, minimumConditionMatches: p.minimumConditionMatches, reusePolicy: p.reusePolicy, needsReview: p.needsReview, conditions: p.conditions.map(c => ({ matcher: c.matcher, quantity: c.quantity, kind: c.kind, distinct: c.distinct })) })),
  }
}
