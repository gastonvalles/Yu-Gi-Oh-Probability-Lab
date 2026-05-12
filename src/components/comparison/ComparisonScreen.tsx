import { useEffect, useMemo, useState, useCallback, useRef } from 'react'

import { compareBuild, interpretComparison } from '../../app/build-comparison'
import type { Verdict, RoleDistribution, Insight } from '../../app/build-comparison'
import { KpiDetailModal } from './KpiDetailModal'
import { KpiCard, type KpiTone } from './KpiCard'
import type { KpiRole } from './kpi-detail-helpers'
import { applyEditsToConfig, isBuildBReady, type CardEditMap } from '../../app/build-comparison-edits'
import { toPortableConfig } from '../../app/app-state-codec'
import { selectAppState } from '../../app/store'
import { useAppSelector } from '../../app/store-hooks'
import type { AppState, DeckBuilderState, DeckCardInstance, PortableConfig } from '../../app/model'
import type { CardOrigin, CardRole } from '../../types'
import { formatInteger, formatPercent } from '../../app/utils'
import { CardArt } from '../CardArt'
import { CardDetailModal } from '../card-detail/CardDetailModal'
import { BuildBCardEditor } from './BuildBCardEditor'
import { DeckImportDrawer } from '../deck-mode/DeckImportDrawer'
import { Button } from '../ui/Button'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { getDeckModelStatus } from '../../app/deck-model-status'
import { DeckModelStatusBadge } from '../DeckModelStatusBadge'
import { deriveMainDeckCardsFromZone } from '../../app/calculator-state'

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
  const [showCardList, setShowCardList] = useState(false)
  const [kpiModalState, setKpiModalState] = useState<{ role: CardRole; side: 'A' | 'B' } | null>(null)
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false)

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

  const configA = useMemo(() => {
    const base = toPortableConfig(currentAppState)
    // For comparison: only use patterns with generic matchers (role, origin, card_type, etc.)
    // Exclude patterns that reference specific cards (card, card_pool matchers)
    // because those are custom rules that don't apply universally.
    return { ...base, patterns: filterToGenericPatterns(base.patterns) }
  }, [currentAppState])
  const configB = useMemo(() => portableConfigFromImport(editedDeckBuilder, currentAppState), [editedDeckBuilder, currentAppState])

  // Single comparison: generic patterns, base handSize — fair evaluation for both decks
  const resultGeneral = useMemo(() => {
    if (!configB) return null
    return compareBuild(configA, configB)
  }, [configA, configB])
  const interpGeneral = useMemo(() => (resultGeneral ? interpretComparison(resultGeneral) : null), [resultGeneral])

  // Use general as the base result
  const result = resultGeneral
  const interp = interpGeneral

  const kpiA = useMemo(() => extractKpi(configA, result, 'A'), [configA, result])
  const kpiB = useMemo(() => (configB && result ? extractKpi(configB, result, 'B') : null), [configB, result])

  // Model status for Build A and Build B
  const modelStatusA = useMemo(() => {
    const derived = deriveMainDeckCardsFromZone(currentAppState.deckBuilder.main)
    return getDeckModelStatus(derived, currentAppState.patterns?.filter(p => !p.needsReview) ?? [])
  }, [currentAppState])

  const modelStatusB = useMemo(() => {
    if (!editedDeckBuilder) return null
    const derived = deriveMainDeckCardsFromZone(editedDeckBuilder.main)
    const patterns = currentAppState.patterns?.filter(p => !p.needsReview) ?? []
    return getDeckModelStatus(derived, patterns)
  }, [editedDeckBuilder, currentAppState])

  // Auto-open comparison modal when interpretation first becomes available
  const prevBuildBReady = useRef(false)
  useEffect(() => {
    if (interp && buildBReady && !prevBuildBReady.current) {
      setComparisonModalOpen(true)
    }
    prevBuildBReady.current = buildBReady
  }, [interp, buildBReady])

  // Boardbreaker counts for KPI
  const boardbreakersA = useMemo(() => {
    return result ? (result.rolesA.boardbreaker ?? 0) : currentAppState.deckBuilder.main.filter(c => c.roles.includes('boardbreaker')).length
  }, [result, currentAppState.deckBuilder.main])

  const boardbreakersB = useMemo(() => {
    if (!result) return 0
    return result.rolesB.boardbreaker ?? 0
  }, [result])

  const showBoardbreakerKpi = boardbreakersA > 0 || boardbreakersB > 0

  const roleTotalA = kpiA.starters + kpiA.extenders + kpiA.handtraps + kpiA.bricks + boardbreakersA
  const roleTotalB = kpiB ? kpiB.starters + kpiB.extenders + kpiB.handtraps + kpiB.bricks + boardbreakersB : 0

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
    <div className="comparison-layout grid h-full min-h-0 w-full gap-0 grid-rows-[minmax(0,1fr)]" style={{ gridTemplateColumns: 'minmax(170px, 210px) minmax(0, 1fr) minmax(170px, 210px)' }}>

      {/* ── Left: Build A KPIs + Verdict ── */}
      <aside className="grid content-start gap-2 overflow-y-auto min-h-0 p-2">
        <p className="m-0 text-[0.62rem] uppercase tracking-widest text-(--text-muted)">Tu deck actual</p>
        <DeckModelStatusBadge modelStatus={modelStatusA} variant="compact" />
        <KpiCard label="Main Deck" value={`${formatInteger(kpiA.main)} (100%)`} tone="neutral" />
        <KpiCard label="Starters" value={kpiWithPct(kpiA.starters, roleTotalA)} tone="positive" clickable onClick={() => setKpiModalState({ role: 'starter', side: 'A' })} />
        <KpiCard label="Extenders" value={kpiWithPct(kpiA.extenders, roleTotalA)} tone="extender" clickable onClick={() => setKpiModalState({ role: 'extender', side: 'A' })} />
        <KpiCard label="Handtraps" value={kpiWithPct(kpiA.handtraps, roleTotalA)} tone="info" clickable onClick={() => setKpiModalState({ role: 'handtrap', side: 'A' })} />
        <KpiCard label="Bricks" value={kpiWithPct(kpiA.bricks, roleTotalA)} tone="negative" clickable onClick={() => setKpiModalState({ role: 'brick', side: 'A' })} />
        {showBoardbreakerKpi ? <KpiCard label="Boardbreakers" value={kpiWithPct(boardbreakersA, roleTotalA)} tone="boardbreaker" clickable onClick={() => setKpiModalState({ role: 'boardbreaker', side: 'A' })} /> : null}

        <KpiPieChart
          starters={kpiA.starters}
          extenders={kpiA.extenders}
          handtraps={kpiA.handtraps}
          bricks={kpiA.bricks}
          boardbreakers={boardbreakersA}
          mainDeckSize={kpiA.main}
          onSegmentClick={(role) => setKpiModalState({ role, side: 'A' })}
        />

        {interp && buildBReady ? (
          <Button variant="secondary" size="sm" onClick={() => setComparisonModalOpen(true)}>Ver comparación</Button>
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
      <aside className="grid content-start gap-2 overflow-y-auto min-h-0 p-2">
        <p className="m-0 text-[0.62rem] uppercase tracking-widest text-(--text-muted)">Deck importado</p>
        {modelStatusB ? <DeckModelStatusBadge modelStatus={modelStatusB} variant="compact" /> : null}
        {kpiB ? (
          <>
            <KpiCard label="Main Deck" value={`${formatInteger(kpiB.main)} (100%)`} tone="neutral" />
            <KpiCard label="Starters" value={kpiWithPct(kpiB.starters, roleTotalB)} tone="positive" clickable={!!importedDeckBuilder} onClick={() => setKpiModalState({ role: 'starter', side: 'B' })} />
            <KpiCard label="Extenders" value={kpiWithPct(kpiB.extenders, roleTotalB)} tone="extender" clickable={!!importedDeckBuilder} onClick={() => setKpiModalState({ role: 'extender', side: 'B' })} />
            <KpiCard label="Handtraps" value={kpiWithPct(kpiB.handtraps, roleTotalB)} tone="info" clickable={!!importedDeckBuilder} onClick={() => setKpiModalState({ role: 'handtrap', side: 'B' })} />
            <KpiCard label="Bricks" value={kpiWithPct(kpiB.bricks, roleTotalB)} tone="negative" clickable={!!importedDeckBuilder} onClick={() => setKpiModalState({ role: 'brick', side: 'B' })} />
            {showBoardbreakerKpi ? <KpiCard label="Boardbreakers" value={kpiWithPct(boardbreakersB, roleTotalB)} tone="boardbreaker" clickable={!!importedDeckBuilder} onClick={() => setKpiModalState({ role: 'boardbreaker', side: 'B' })} /> : null}
          </>
        ) : (
          <KpiCard label="Esperando" value="—" tone="neutral" />
        )}

        {kpiB ? (
          <KpiPieChart
            starters={kpiB.starters}
            extenders={kpiB.extenders}
            handtraps={kpiB.handtraps}
            bricks={kpiB.bricks}
            boardbreakers={boardbreakersB}
            mainDeckSize={kpiB.main}
            onSegmentClick={(role) => setKpiModalState({ role, side: 'B' })}
          />
        ) : null}

        {importedDeckBuilder && pendingCount > 0 ? (
          <div
            className="comparison-kpi-card grid gap-1 px-2.5 py-2 cursor-pointer hover:brightness-125 transition-[filter] border-l-2 border-primary"
            style={{ background: 'rgb(var(--background-rgb))' }}
            onClick={() => setShowCardList(true)}
          >
            <strong className="text-[0.76rem] text-(--text-muted)">{formatInteger(pendingCount)} carta{pendingCount === 1 ? '' : 's'} sin revisar</strong>
            <p className="m-0 text-[0.68rem] text-(--text-muted)">La comparación puede no ser confiable. Click para categorizar.</p>
          </div>
        ) : null}

      </aside>

      {kpiModalState !== null ? (
        <KpiDetailModal
          isOpen
          role={kpiModalState.role}
          side={kpiModalState.side}
          mainDeck={
            kpiModalState.side === 'A'
              ? currentAppState.deckBuilder.main
              : (editedDeckBuilder?.main ?? [])
          }
          editsMap={kpiModalState.side === 'B' ? editsMap : undefined}
          onCardClick={(apiCard, name) => {
            setKpiModalState(null)
            setDetailCard({ name, ...apiCard })
          }}
          onClose={() => setKpiModalState(null)}
        />
      ) : null}

      {comparisonModalOpen && interp && result ? (
        <ComparisonResultModal
          rolesA={result.rolesA}
          rolesB={result.rolesB}
          deckSizeA={result.deckSizeA}
          deckSizeB={result.deckSizeB}
          deckNameA={currentAppState.deckBuilder.deckName || 'Build A'}
          deckNameB={importedDeckBuilder?.deckName || 'Build B'}
          insights={interp.insights}
          cleanProbA={result.cleanProbabilityA}
          cleanProbB={result.cleanProbabilityB}
          problemProbA={result.totalProblemProbabilityA}
          problemProbB={result.totalProblemProbabilityB}
          onClose={() => setComparisonModalOpen(false)}
        />
      ) : null}

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

      {showCardList && editedDeckBuilder ? (
        <BuildBCardListModal
          cards={editedDeckBuilder.main}
          editsMap={editsMap}
          onSelectCard={(card) => { setShowCardList(false); setEditingCard(card) }}
          onClose={() => setShowCardList(false)}
        />
      ) : null}

      <DeckImportDrawer
        deckBuilder={createEmptyDeckBuilder('Deck importado')}
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

export { KpiCard, type KpiTone } from './KpiCard'

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
      }}
    >
      {cards.map((card, i) => {
        const needsReview = card.origin === null || card.roles.length === 0 || card.needsReview
        return (
          <div
            key={`${card.instanceId}-${i}`}
            className={[
              'min-w-0 cursor-pointer relative',
              needsReview ? 'rounded-sm hover:brightness-125 transition-[filter]' : '',
            ].join(' ')}
            onClick={() => onCardClick?.(card)}
          >
            <CardArt remoteUrl={card.apiCard.imageUrlSmall} name={card.name} className="block aspect-[0.72] w-full min-w-0 bg-input object-cover" limitCard={card.apiCard} limitBadgeSize="sm" />
            {needsReview ? <div className="absolute inset-0 rounded-sm bg-[rgb(var(--primary-rgb)/0.25)] pointer-events-none ring-1 ring-inset ring-[rgb(var(--primary-rgb)/0.4)]" /> : null}
          </div>
        )
      })}
    </div>
  )
}

// ── Build B Card List Modal ──

function BuildBCardListModal({ cards, editsMap, onSelectCard, onClose }: {
  cards: DeckCardInstance[]
  editsMap: CardEditMap
  onSelectCard: (card: DeckCardInstance) => void
  onClose: () => void
}) {
  // Deduplicate by ygoprodeckId, count copies
  const uniqueCards = cards.reduce<{ card: DeckCardInstance; copies: number; needsReview: boolean }[]>((acc, c) => {
    const existing = acc.find((x) => x.card.apiCard.ygoprodeckId === c.apiCard.ygoprodeckId)
    if (existing) {
      existing.copies++
    } else {
      const edit = editsMap.get(c.apiCard.ygoprodeckId)
      const effectiveOrigin = edit?.origin ?? c.origin
      const effectiveRoles = edit?.roles ?? c.roles
      const nr = effectiveOrigin === null || effectiveRoles.length === 0 || (!edit && c.needsReview)
      acc.push({ card: c, copies: 1, needsReview: nr })
    }
    return acc
  }, [])

  const pending = uniqueCards.filter((x) => x.needsReview)
  const classified = uniqueCards.filter((x) => !x.needsReview)

  return (
    <div className="fixed inset-0 z-150 grid place-items-center bg-[rgb(var(--background-rgb)/0.76)] px-4 py-5" onClick={onClose}>
      <div
        className="surface-panel relative flex w-full max-w-lg min-h-0 max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0 shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute right-4 top-4 z-10">
          <button type="button" aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-[rgb(var(--foreground-rgb)/0.06)] transition-colors" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
          <div className="grid gap-3">
            <div className="grid gap-1 pr-10">
              <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-[0.12em]">Build B</p>
              <h3 className="m-0 text-[1.45rem] leading-[0.98] tracking-[-0.03em] text-(--text-main)">Cartas del deck</h3>
              <p className="app-muted m-0 text-[0.76rem]">{formatInteger(uniqueCards.length)} cartas únicas · {formatInteger(pending.length)} pendiente{pending.length === 1 ? '' : 's'}</p>
            </div>

            {pending.length > 0 ? (
              <section className="grid gap-1.5">
                <span className="text-[0.68rem] font-semibold uppercase tracking-widest text-amber-300">Pendientes ({formatInteger(pending.length)})</span>
                <div className="grid gap-px">
                  {pending.map((x) => (
                    <button key={x.card.apiCard.ygoprodeckId} type="button" className="app-list-item grid min-w-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 px-1.5 py-1.5 text-left" onClick={() => onSelectCard(x.card)}>
                      <div className="w-[36px]">
                        <CardArt remoteUrl={x.card.apiCard.imageUrlSmall} name={x.card.name} className="block h-auto w-full bg-input" limitCard={x.card.apiCard} limitBadgeSize="sm" />
                      </div>
                      <div className="grid min-w-0 gap-0.5">
                        <strong className="truncate text-[0.8rem] leading-[1.04] text-(--text-main)">{x.card.name}</strong>
                        <p className="app-muted m-0 truncate text-[0.66rem] leading-none">Sin clasificar</p>
                      </div>
                      <span className="app-chip shrink-0 px-1.5 py-0.5 text-[0.62rem]">{formatInteger(x.copies)}x</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            {classified.length > 0 ? (
              <section className="grid gap-1.5">
                <span className="text-[0.68rem] font-semibold uppercase tracking-widest text-(--text-muted)">Clasificadas ({formatInteger(classified.length)})</span>
                <div className="grid gap-px">
                  {classified.map((x) => (
                    <button key={x.card.apiCard.ygoprodeckId} type="button" className="app-list-item grid min-w-0 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2 px-1.5 py-1.5 text-left" onClick={() => onSelectCard(x.card)}>
                      <div className="w-[36px]">
                        <CardArt remoteUrl={x.card.apiCard.imageUrlSmall} name={x.card.name} className="block h-auto w-full bg-input" limitCard={x.card.apiCard} limitBadgeSize="sm" />
                      </div>
                      <div className="grid min-w-0 gap-0.5">
                        <strong className="truncate text-[0.8rem] leading-[1.04] text-(--text-main)">{x.card.name}</strong>
                        <p className="app-muted m-0 truncate text-[0.66rem] leading-none">✓ Clasificada</p>
                      </div>
                      <span className="app-chip shrink-0 px-1.5 py-0.5 text-[0.62rem]">{formatInteger(x.copies)}x</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── KPI Pie Chart (glass aesthetic matching app theme) ──

const KPI_PIE_SEGMENTS: { role: KpiRole; label: string; color: string; rgb: string }[] = [
  { role: 'starter', label: 'Starters', color: 'rgb(0, 255, 163)', rgb: '0, 255, 163' },
  { role: 'extender', label: 'Extenders', color: 'rgb(168, 85, 247)', rgb: '168, 85, 247' },
  { role: 'handtrap', label: 'Handtraps', color: 'rgb(59, 130, 246)', rgb: '59, 130, 246' },
  { role: 'brick', label: 'Bricks', color: 'rgb(239, 68, 68)', rgb: '239, 68, 68' },
  { role: 'boardbreaker', label: 'Boardbreakers', color: 'rgb(245, 158, 11)', rgb: '245, 158, 11' },
]

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const x1 = cx + r * Math.cos(rad(startAngle))
  const y1 = cy + r * Math.sin(rad(startAngle))
  const x2 = cx + r * Math.cos(rad(endAngle))
  const y2 = cy + r * Math.sin(rad(endAngle))
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`
}

function describeRing(cx: number, cy: number, r: number, startAngle: number, endAngle: number, thickness: number): string {
  const rad = (deg: number) => (deg * Math.PI) / 180
  const rOuter = r
  const rInner = r - thickness
  const x1o = cx + rOuter * Math.cos(rad(startAngle))
  const y1o = cy + rOuter * Math.sin(rad(startAngle))
  const x2o = cx + rOuter * Math.cos(rad(endAngle))
  const y2o = cy + rOuter * Math.sin(rad(endAngle))
  const x1i = cx + rInner * Math.cos(rad(endAngle))
  const y1i = cy + rInner * Math.sin(rad(endAngle))
  const x2i = cx + rInner * Math.cos(rad(startAngle))
  const y2i = cy + rInner * Math.sin(rad(startAngle))
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return [
    `M ${x1o} ${y1o}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${x2o} ${y2o}`,
    `L ${x1i} ${y1i}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${x2i} ${y2i}`,
    'Z',
  ].join(' ')
}

function KpiPieChart({ starters, extenders, handtraps, bricks, boardbreakers, mainDeckSize: _mainDeckSize, onSegmentClick }: {
  starters: number
  extenders: number
  handtraps: number
  bricks: number
  boardbreakers: number
  mainDeckSize: number
  onSegmentClick?: (role: KpiRole) => void
}) {
  const data = KPI_PIE_SEGMENTS
    .map((seg) => ({
      ...seg,
      count: seg.role === 'starter' ? starters : seg.role === 'extender' ? extenders : seg.role === 'handtrap' ? handtraps : seg.role === 'brick' ? bricks : boardbreakers,
    }))
    .filter((d) => d.count > 0)

  if (data.length === 0) return null

  const segmentTotal = data.reduce((s, d) => s + d.count, 0)
  const cx = 50
  const cy = 50
  const r = 46
  const innerR = 20
  const filterId = `pie-glow-${Math.random().toString(36).slice(2, 6)}`

  let currentAngle = -90
  const segments = data.map((d) => {
    const angle = (d.count / segmentTotal) * 360
    const pct = segmentTotal > 0 ? Math.round((d.count / segmentTotal) * 100) : 0
    const seg = { ...d, startAngle: currentAngle, endAngle: currentAngle + angle, pct }
    currentAngle += angle
    return seg
  })

  // Single segment → full donut
  if (segments.length === 1) {
    const seg = segments[0]
    const tooltip = `${seg.label}: ${formatInteger(seg.count)}`
    return (
      <svg viewBox="0 0 100 100" className="mx-auto block w-full max-w-[170px] aspect-square" role="img" aria-label="Distribución de roles">
        <defs>
          <filter id={filterId}>
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx={cx} cy={cy} r={(r + innerR) / 2} fill="none" stroke={seg.color} strokeWidth={r - innerR} strokeOpacity="0.75" filter={`url(#${filterId})`} className="cursor-pointer transition-all hover:[stroke-opacity:1]" onClick={() => onSegmentClick?.(seg.role)}>
          <title>{tooltip}</title>
        </circle>
        <circle cx={cx} cy={cy} r={innerR} fill="rgb(var(--background-rgb))" fillOpacity="0.85" />
        <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fill="white" fontSize="9" fontWeight="700">{seg.pct}%</text>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 100 100" className="mx-auto block w-full max-w-[170px] aspect-square" role="img" aria-label="Distribución de roles">
      <defs>
        <filter id={filterId}>
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Donut segments */}
      {segments.map((seg, i) => {
        const angleDiff = seg.endAngle - seg.startAngle
        const tooltip = `${seg.label}: ${formatInteger(seg.count)}`
        const d = describeRing(cx, cy, r, seg.startAngle, seg.endAngle, r - innerR)

        if (angleDiff >= 359.99) {
          return (
            <circle key={i} cx={cx} cy={cy} r={(r + innerR) / 2} fill="none" stroke={seg.color} strokeWidth={r - innerR} strokeOpacity="0.75" filter={`url(#${filterId})`} className="cursor-pointer transition-all hover:[stroke-opacity:1]" onClick={() => onSegmentClick?.(seg.role)}>
              <title>{tooltip}</title>
            </circle>
          )
        }

        return (
          <path key={i} d={d} fill={seg.color} fillOpacity="0.75" filter={`url(#${filterId})`} className="cursor-pointer transition-all hover:[fill-opacity:1]" onClick={() => onSegmentClick?.(seg.role)}>
            <title>{tooltip}</title>
          </path>
        )
      })}

      {/* Inner dark circle */}
      <circle cx={cx} cy={cy} r={innerR} fill="rgb(var(--background-rgb))" fillOpacity="0.85" />

      {/* Percentage labels inside each segment */}
      {segments.map((seg, i) => {
        const angleDiff = seg.endAngle - seg.startAngle
        if (angleDiff < 15) return null // too small for text
        const midAngle = seg.startAngle + angleDiff / 2
        const rad = (midAngle * Math.PI) / 180
        const labelR = (r + innerR) / 2
        const lx = cx + labelR * Math.cos(rad)
        const ly = cy + labelR * Math.sin(rad)
        const fontSize = angleDiff < 30 ? 5.5 : angleDiff < 60 ? 7 : 8
        return (
          <text key={`lbl-${i}`} x={lx} y={ly} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={fontSize} fontWeight="700" style={{ pointerEvents: 'none', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
            {seg.pct}%
          </text>
        )
      })}
    </svg>
  )
}

// ── Comparison Result Modal (reuses KpiCard) ──

const COMPARISON_STATS: { key: string; label: string; tone: KpiTone; getRoles: (r: RoleDistribution) => number; better: 'neutral' | 'higher' | 'lower' }[] = [
  { key: 'starters', label: 'Starters', tone: 'positive', getRoles: (r) => r.starter ?? 0, better: 'neutral' },
  { key: 'handtraps', label: 'Handtraps', tone: 'info', getRoles: (r) => r.handtrap ?? 0, better: 'neutral' },
  { key: 'bricks', label: 'Bricks', tone: 'negative', getRoles: (r) => (r.brick ?? 0) + (r.garnet ?? 0), better: 'neutral' },
  { key: 'boardbreakers', label: 'Boardbreakers', tone: 'boardbreaker', getRoles: (r) => r.boardbreaker ?? 0, better: 'neutral' },
  { key: 'extenders', label: 'Extenders', tone: 'positive', getRoles: (r) => r.extender ?? 0, better: 'neutral' },
]

function buildComparisonVerdictMessage(
  verdict: Verdict,
  winnerName: string,
  _loserName: string,
  rolesA: RoleDistribution,
  rolesB: RoleDistribution,
  insights: Insight[],
  openingProbA: number,
  openingProbB: number,
): string {
  if (verdict.type === 'equivalent') {
    return 'Las diferencias entre ambos builds son marginales. Elegí por preferencia o match-up.'
  }

  if (verdict.type === 'tradeoff') {
    return verdict.tradeoffDetail ?? 'Cada build tiene ventajas y desventajas. La elección depende de qué priorizás.'
  }

  // Multi-dimensional analysis for a_better / b_better
  const isA = verdict.type === 'a_better'
  const w = isA ? rolesA : rolesB
  const l = isA ? rolesB : rolesA
  const wOpenings = isA ? openingProbA : openingProbB
  const lOpenings = isA ? openingProbB : openingProbA

  const advantages: string[] = []

  // Consistency
  const openingDiff = wOpenings - lOpenings
  if (openingDiff >= 0.03) {
    advantages.push('más consistente en apertura')
  }

  // Interaction (handtraps)
  const handtrapDiff = (w.handtrap ?? 0) - (l.handtrap ?? 0)
  if (handtrapDiff >= 2) {
    advantages.push('mejor interacción yendo segundo')
  }

  // Bricks
  const wBricks = (w.brick ?? 0) + (w.garnet ?? 0)
  const lBricks = (l.brick ?? 0) + (l.garnet ?? 0)
  if (lBricks - wBricks >= 2) {
    advantages.push('menos riesgo de manos muertas')
  }

  // Extenders / resilience
  const extenderDiff = (w.extender ?? 0) - (l.extender ?? 0)
  if (extenderDiff >= 3) {
    advantages.push('más resiliente tras interrupción')
  }

  // Boardbreakers
  const bbDiff = (w.boardbreaker ?? 0) - (l.boardbreaker ?? 0)
  if (bbDiff >= 2) {
    advantages.push('mejor respuesta contra campos establecidos')
  }

  if (advantages.length === 0) {
    // Fallback: use the insights text if available
    if (insights.length > 0) {
      return `${winnerName} tiene ventaja según tu modelo. Los motivos principales están detallados abajo.`
    }
    return `${winnerName} tiene mejor balance general según tu clasificación de cartas.`
  }

  if (advantages.length === 1) {
    return `${winnerName} gana porque ${advantages[0]}.`
  }

  const last = advantages.pop()!
  return `${winnerName} gana porque ${advantages.join(', ')} y ${last}.`
}

function ComparisonResultModal({ rolesA, rolesB, deckSizeA, deckSizeB, deckNameA, deckNameB, insights, cleanProbA, cleanProbB, problemProbA, problemProbB, onClose }: {
  rolesA: RoleDistribution
  rolesB: RoleDistribution
  deckSizeA: number
  deckSizeB: number
  deckNameA: string
  deckNameB: string
  insights: Insight[]
  cleanProbA: number
  cleanProbB: number
  problemProbA: number
  problemProbB: number
  onClose: () => void
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Derive the winner from the visible KPI (cleanProbability)
  const cleanDiff = cleanProbA - cleanProbB
  const aIsWinner = cleanDiff > 0.005
  const bIsWinner = cleanDiff < -0.005
  const isEquivalent = !aIsWinner && !bIsWinner
  const winnerName = aIsWinner ? deckNameA : bIsWinner ? deckNameB : ''
  const loserName = aIsWinner ? deckNameB : bIsWinner ? deckNameA : ''

  // Verdict badge
  const verdictBadge = isEquivalent ? 'Equivalentes' : `${winnerName} gana`

  const verdictToneClass = isEquivalent ? 'probability-kpi-tone-good' : 'probability-kpi-tone-excellent'

  // Build contextual message based on the visible data
  const verdictMessage = isEquivalent
    ? 'Las diferencias entre ambos builds son marginales. Elegí por preferencia o match-up.'
    : buildComparisonVerdictMessage(
        { type: aIsWinner ? 'a_better' : 'b_better', summary: '', openingDeltaFormatted: '', bricksDelta: 0, tradeoffDetail: null, recommendation: null },
        winnerName, loserName, rolesA, rolesB, insights, cleanProbA, cleanProbB,
      )

  return (
    <div className="fixed inset-0 z-150 grid items-start justify-center bg-[rgb(var(--background-rgb)/0.76)] px-4 pt-[10vh]" onClick={onClose}>
      <div
        className="surface-panel-strong relative flex w-full max-w-lg min-h-0 max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <div className="absolute right-3 top-3 z-10">
          <button type="button" aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-[rgb(var(--foreground-rgb)/0.06)] transition-colors" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Hero section — like Probability Lab */}
          <div className="grid gap-4 px-5 pt-5 pb-4 border-b border-(--border-subtle)">
            <div className="grid gap-2">
              <p className="app-kicker m-0 text-[0.68rem] uppercase tracking-widest">Comparación</p>

              {/* Badge + Verdict */}
              <div className="flex flex-wrap items-center gap-2">
                <span className={['probability-kpi-tone', verdictToneClass].join(' ')}>
                  {verdictBadge}
                </span>
              </div>

              {/* Main message */}
              <p className="probability-kpi-message m-0 text-[0.96rem]">
                {verdictMessage}
              </p>

              {/* Recommendation */}
              {!isEquivalent ? (
                <p className="probability-kpi-note m-0">
                  Recomendado si priorizás manos jugables sin problemas
                </p>
              ) : null}
            </div>

            {/* Insights — the "why", rewritten for clarity */}
            {insights.length > 0 && !isEquivalent ? (
              <div className="grid gap-1.5">
                {insights.map((insight, i) => {
                  // Rewrite insight text to be clear about who benefits.
                  const moreIsBetter = insight.category === 'starters' || insight.category === 'extenders' || insight.category === 'handtraps' || insight.category === 'boardbreakers' || insight.category === 'openings'
                  const advantageTo = moreIsBetter
                    ? (insight.delta > 0 ? deckNameA : deckNameB)
                    : (insight.delta > 0 ? deckNameB : deckNameA)
                  const isAdvantageToWinner = advantageTo === winnerName

                  const readableText = buildReadableInsight(insight, deckNameA, deckNameB)

                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 rounded-md px-3 py-2"
                      style={{
                        background: isAdvantageToWinner
                          ? 'rgb(0, 255, 163, 0.06)'
                          : 'rgb(239, 68, 68, 0.06)',
                        borderLeft: `3px solid ${isAdvantageToWinner ? 'rgb(0, 255, 163, 0.5)' : 'rgb(239, 68, 68, 0.5)'}`,
                      }}
                    >
                      <span className="text-[0.8rem] text-(--text-main)">{readableText}</span>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>

          {/* Probability KPI — the main comparison metric */}
          <div className="grid gap-3 px-5 py-4 border-b border-(--border-subtle)">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="grid gap-0.5 text-center">
                <strong className={['text-[1.8rem] font-extrabold leading-none tracking-tight', aIsWinner ? 'text-accent' : 'text-(--text-main)'].join(' ')}>
                  {formatPercent(cleanProbA)}
                </strong>
                <span className="text-[0.66rem] text-(--text-muted)">Jugable</span>
              </div>
              <span className="text-[0.64rem] uppercase tracking-widest text-(--text-soft)">vs</span>
              <div className="grid gap-0.5 text-center">
                <strong className={['text-[1.8rem] font-extrabold leading-none tracking-tight', bIsWinner ? 'text-accent' : 'text-(--text-main)'].join(' ')}>
                  {formatPercent(cleanProbB)}
                </strong>
                <span className="text-[0.66rem] text-(--text-muted)">Jugable</span>
              </div>
            </div>
            {(problemProbA > 0 || problemProbB > 0) ? (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="text-center">
                  <span className="text-[0.8rem] font-semibold text-destructive">{formatPercent(problemProbA)}</span>
                  <span className="text-[0.64rem] text-(--text-muted) ml-1">problemas</span>
                </div>
                <span className="text-[0.64rem] text-(--text-soft)">·</span>
                <div className="text-center">
                  <span className="text-[0.8rem] font-semibold text-destructive">{formatPercent(problemProbB)}</span>
                  <span className="text-[0.64rem] text-(--text-muted) ml-1">problemas</span>
                </div>
              </div>
            ) : null}
          </div>

          {/* Stats section — compact role comparison */}
          <div className="grid gap-3 px-5 py-4">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="text-center">
                {aIsWinner ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5" style={{ background: 'rgba(0, 255, 163, 0.1)', border: '1px solid rgba(0, 255, 163, 0.25)' }}>
                    <span className="text-[0.58rem]">👑</span>
                    <strong className="text-[0.74rem] text-[rgb(0,255,163)]">{deckNameA}</strong>
                  </span>
                ) : (
                  <strong className="text-[0.74rem] text-(--text-muted)">{deckNameA}</strong>
                )}
              </div>
              <span className="text-[0.64rem] uppercase tracking-widest text-(--text-soft)">vs</span>
              <div className="text-center">
                {bIsWinner ? (
                  <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5" style={{ background: 'rgba(0, 255, 163, 0.1)', border: '1px solid rgba(0, 255, 163, 0.25)' }}>
                    <span className="text-[0.58rem]">👑</span>
                    <strong className="text-[0.74rem] text-[rgb(0,255,163)]">{deckNameB}</strong>
                  </span>
                ) : (
                  <strong className="text-[0.74rem] text-(--text-muted)">{deckNameB}</strong>
                )}
              </div>
            </div>

            {/* Stat rows — compact inline format */}
            <div className="grid gap-1.5">
              <ComparisonStatRow label="Main Deck" valueA={deckSizeA} valueB={deckSizeB} better="neutral" />
              {COMPARISON_STATS.map((row) => {
                const a = row.getRoles(rolesA)
                const b = row.getRoles(rolesB)
                if (a === 0 && b === 0) return null
                return (
                  <ComparisonStatRow key={row.key} label={row.label} valueA={a} valueB={b} better={row.better} />
                )
              })}
            </div>

            {/* Opening probability comparison if available */}
          </div>
        </div>
      </div>
    </div>
  )
}

function buildReadableInsight(insight: Insight, deckNameA: string, deckNameB: string): string {
  const absDelta = Math.abs(insight.delta)
  const moreIsBetter = insight.category === 'starters' || insight.category === 'extenders' || insight.category === 'handtraps' || insight.category === 'boardbreakers' || insight.category === 'openings'
  const advantageTo = moreIsBetter
    ? (insight.delta > 0 ? deckNameA : deckNameB)
    : (insight.delta > 0 ? deckNameB : deckNameA)

  switch (insight.category) {
    case 'starters':
      return `${advantageTo} tiene +${absDelta} ${absDelta === 1 ? 'starter' : 'starters'} → más acceso al plan principal`
    case 'extenders':
      return `${advantageTo} tiene +${absDelta} ${absDelta === 1 ? 'extender' : 'extenders'} → más recuperación tras interrupción`
    case 'handtraps':
      return `${advantageTo} tiene +${absDelta} handtraps → mejor interacción yendo segundo`
    case 'boardbreakers':
      return `${advantageTo} tiene +${absDelta} boardbreakers → mejor contra campos establecidos`
    case 'bricks':
      return `${advantageTo} tiene ${absDelta} ${absDelta === 1 ? 'brick' : 'bricks'} menos → menos manos muertas`
    case 'openings':
      return `${advantageTo} tiene +${(absDelta * 100).toFixed(1)}% consistencia de openings`
    case 'problems':
      return `${advantageTo} tiene ${(absDelta * 100).toFixed(1)}% menos manos problemáticas`
    default:
      return `${advantageTo} tiene ventaja en ${insight.category}`
  }
}

function ComparisonStatRow({ label, valueA, valueB, better }: {
  label: string
  valueA: number
  valueB: number
  better: 'higher' | 'lower' | 'neutral'
}) {
  const diff = valueA - valueB
  const aWins = better === 'neutral' ? false : better === 'higher' ? diff > 0 : diff < 0
  const bWins = better === 'neutral' ? false : better === 'higher' ? diff < 0 : diff > 0
  const isDraw = diff === 0

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
      <div className="text-center">
        <span className={[
          'text-[0.88rem] font-semibold tabular-nums',
          aWins ? 'text-accent' : isDraw ? 'text-(--text-main)' : 'text-(--text-muted)',
        ].join(' ')}>
          {formatInteger(valueA)}
        </span>
      </div>
      <span className="text-[0.68rem] font-medium text-(--text-soft) min-w-22 text-center">{label}</span>
      <div className="text-center">
        <span className={[
          'text-[0.88rem] font-semibold tabular-nums',
          bWins ? 'text-accent' : isDraw ? 'text-(--text-main)' : 'text-(--text-muted)',
        ].join(' ')}>
          {formatInteger(valueB)}
        </span>
      </div>
    </div>
  )
}

// ── Helpers ──

function kpiWithPct(count: number, roleTotal: number): string {
  if (roleTotal <= 0) return formatInteger(count)
  const pct = ((count / roleTotal) * 100).toFixed(1)
  return `${formatInteger(count)} (${pct}%)`
}

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

  // Use the same generic patterns as Build A (filtered from user's patterns)
  const allPatterns: PortableConfig['patterns'] = app.patterns
    .filter(p => !p.needsReview)
    .map(p => ({ name: p.name, kind: p.kind, turnContext: p.turnContext, logic: p.logic, minimumConditionMatches: p.minimumConditionMatches, reusePolicy: p.reusePolicy, needsReview: false, conditions: p.conditions.map(c => ({ matcher: c.matcher, quantity: c.quantity, kind: c.kind, distinct: c.distinct === true })) }))

  return {
    version: 15, handSize: app.handSize, deckFormat: app.deckFormat as PortableConfig['deckFormat'],
    patternsSeeded: app.patternsSeeded, patternsSeedVersion: app.patternsSeedVersion,
    deckBuilder: { deckName: deck.deckName, main: m(deck.main), extra: m(deck.extra), side: m(deck.side) },
    patterns: filterToGenericPatterns(allPatterns),
  }
}

/**
 * Filters patterns to only those with generic matchers (role, origin, card_type,
 * attribute, level, monster_type, atk, def). Removes patterns that have ANY
 * condition with a card-specific matcher (card, card_pool) since those are
 * custom rules that only apply to a specific deck.
 */
function filterToGenericPatterns(patterns: PortableConfig['patterns']): PortableConfig['patterns'] {
  return patterns.filter(p => {
    // Keep patterns where ALL conditions use generic matchers
    return p.conditions.every(c => {
      if (!c.matcher) return false // unconfigured conditions → skip
      return c.matcher.type !== 'card' && c.matcher.type !== 'card_pool'
    })
  })
}
