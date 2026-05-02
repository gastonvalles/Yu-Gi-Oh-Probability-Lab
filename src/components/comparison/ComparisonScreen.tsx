import { useEffect, useMemo, useState, useCallback, useRef } from 'react'

import { compareBuild, interpretComparison } from '../../app/build-comparison'
import type { Verdict, RoleDistribution } from '../../app/build-comparison'
import { KpiDetailModal } from './KpiDetailModal'
import type { KpiRole } from './kpi-detail-helpers'
import { applyEditsToConfig, isBuildBReady, type CardEditMap } from '../../app/build-comparison-edits'
import { toPortableConfig } from '../../app/app-state-codec'
import { selectAppState } from '../../app/store'
import { useAppSelector } from '../../app/store-hooks'
import type { AppState, DeckBuilderState, DeckCardInstance, PortableConfig } from '../../app/model'
import type { CardOrigin, CardRole } from '../../types'
import { formatInteger } from '../../app/utils'
import { CardArt } from '../CardArt'
import { CardDetailModal } from '../card-detail/CardDetailModal'
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

  const configA = useMemo(() => toPortableConfig(currentAppState), [currentAppState])
  const configB = useMemo(() => portableConfigFromImport(editedDeckBuilder, currentAppState), [editedDeckBuilder, currentAppState])

  const result = useMemo(() => (configB ? compareBuild(configA, configB) : null), [configA, configB])
  const interp = useMemo(() => (result ? interpretComparison(result) : null), [result])

  const kpiA = useMemo(() => extractKpi(configA, result, 'A'), [configA, result])
  const kpiB = useMemo(() => (configB && result ? extractKpi(configB, result, 'B') : null), [configB, result])

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
        <KpiCard label="Main Deck" value={formatInteger(kpiA.main)} tone="neutral" />
        <KpiCard label="Starters" value={formatInteger(kpiA.starters)} tone="positive" clickable onClick={() => setKpiModalState({ role: 'starter', side: 'A' })} />
        <KpiCard label="Handtraps" value={formatInteger(kpiA.handtraps)} tone="info" clickable onClick={() => setKpiModalState({ role: 'handtrap', side: 'A' })} />
        <KpiCard label="Bricks" value={formatInteger(kpiA.bricks)} tone="negative" clickable onClick={() => setKpiModalState({ role: 'brick', side: 'A' })} />
        {showBoardbreakerKpi ? <KpiCard label="Boardbreakers" value={formatInteger(boardbreakersA)} tone="boardbreaker" clickable onClick={() => setKpiModalState({ role: 'boardbreaker', side: 'A' })} /> : null}

        <KpiPieChart
          starters={kpiA.starters}
          handtraps={kpiA.handtraps}
          bricks={kpiA.bricks}
          boardbreakers={boardbreakersA}
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
        {kpiB ? (
          <>
            <KpiCard label="Main Deck" value={formatInteger(kpiB.main)} tone="neutral" />
            <KpiCard label="Starters" value={formatInteger(kpiB.starters)} tone="positive" clickable={!!importedDeckBuilder} onClick={() => setKpiModalState({ role: 'starter', side: 'B' })} />
            <KpiCard label="Handtraps" value={formatInteger(kpiB.handtraps)} tone="info" clickable={!!importedDeckBuilder} onClick={() => setKpiModalState({ role: 'handtrap', side: 'B' })} />
            <KpiCard label="Bricks" value={formatInteger(kpiB.bricks)} tone="negative" clickable={!!importedDeckBuilder} onClick={() => setKpiModalState({ role: 'brick', side: 'B' })} />
            {showBoardbreakerKpi ? <KpiCard label="Boardbreakers" value={formatInteger(boardbreakersB)} tone="boardbreaker" clickable={!!importedDeckBuilder} onClick={() => setKpiModalState({ role: 'boardbreaker', side: 'B' })} /> : null}
          </>
        ) : (
          <KpiCard label="Esperando" value="—" tone="neutral" />
        )}

        {kpiB ? (
          <KpiPieChart
            starters={kpiB.starters}
            handtraps={kpiB.handtraps}
            bricks={kpiB.bricks}
            boardbreakers={boardbreakersB}
            onSegmentClick={(role) => setKpiModalState({ role, side: 'B' })}
          />
        ) : null}

        {importedDeckBuilder && !buildBReady && pendingCount > 0 ? (
          <div
            className="comparison-kpi-card grid gap-1 px-2.5 py-2 cursor-pointer hover:brightness-125 transition-[filter] border-l-2 border-amber-400"
            style={{ background: 'rgb(var(--background-rgb))' }}
            onClick={() => setShowCardList(true)}
          >
            <strong className="text-[0.76rem] text-amber-300">Build B necesita revisión</strong>
            <p className="m-0 text-[0.68rem] text-(--text-muted)">{formatInteger(pendingCount)} carta{pendingCount === 1 ? '' : 's'} pendiente{pendingCount === 1 ? '' : 's'}. Click para categorizar.</p>
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
          verdict={interp.verdict}
          rolesA={result.rolesA}
          rolesB={result.rolesB}
          deckSizeA={result.deckSizeA}
          deckSizeB={result.deckSizeB}
          deckNameA={currentAppState.deckBuilder.deckName || 'Build A'}
          deckNameB={importedDeckBuilder?.deckName || 'Build B'}
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

export type KpiTone = 'positive' | 'negative' | 'info' | 'neutral' | 'boardbreaker'

export function KpiCard({ label, value, tone, hint, clickable = false, onClick }: { label: string; value: string; tone: KpiTone; hint?: string | null; clickable?: boolean; onClick?: () => void }) {
  const cls = `comparison-kpi-card comparison-kpi-${tone} grid gap-0.5 place-items-center px-2.5 py-2 text-center${clickable ? ' cursor-pointer hover:brightness-125 transition-[filter]' : ''}`

  if (clickable) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        <span className="text-[0.66rem] uppercase tracking-widest text-(--text-muted)">{label}</span>
        <strong className="text-[1rem] leading-none tabular-nums text-(--text-main)">{value}</strong>
        {hint ? <span className="text-[0.6rem] leading-none text-(--text-muted)">{hint}</span> : null}
      </button>
    )
  }

  return (
    <div className={cls}>
      <span className="text-[0.66rem] uppercase tracking-widest text-(--text-muted)">{label}</span>
      <strong className="text-[1rem] leading-none tabular-nums text-(--text-main)">{value}</strong>
      {hint ? <span className="text-[0.6rem] leading-none text-(--text-muted)">{hint}</span> : null}
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

function KpiPieChart({ starters, handtraps, bricks, boardbreakers, onSegmentClick }: {
  starters: number
  handtraps: number
  bricks: number
  boardbreakers: number
  onSegmentClick?: (role: KpiRole) => void
}) {
  const data = KPI_PIE_SEGMENTS
    .map((seg) => ({
      ...seg,
      count: seg.role === 'starter' ? starters : seg.role === 'handtrap' ? handtraps : seg.role === 'brick' ? bricks : boardbreakers,
    }))
    .filter((d) => d.count > 0)

  if (data.length === 0) return null

  const total = data.reduce((s, d) => s + d.count, 0)
  const cx = 50
  const cy = 50
  const r = 44
  const thickness = 14
  const filterId = `pie-glow-${Math.random().toString(36).slice(2, 6)}`

  // Build segments
  let currentAngle = -90
  const segments = data.map((d) => {
    const angle = (d.count / total) * 360
    const seg = { ...d, startAngle: currentAngle, endAngle: currentAngle + angle }
    currentAngle += angle
    return seg
  })

  // Single segment → full donut ring
  if (segments.length === 1) {
    const seg = segments[0]
    const tooltip = `${seg.label}: ${formatInteger(seg.count)}`
    return (
      <svg viewBox="0 0 100 100" className="mx-auto block w-full max-w-[170px] aspect-square" role="img" aria-label="Distribución de roles">
        <defs>
          <filter id={filterId}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id={`${filterId}-bg`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`rgba(${seg.rgb}, 0.06)`} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={`url(#${filterId}-bg)`} />
        <circle cx={cx} cy={cy} r={r - thickness / 2} fill="none" stroke={seg.color} strokeWidth={thickness} strokeOpacity="0.7" filter={`url(#${filterId})`} className="cursor-pointer transition-all hover:stroke-opacity-100" onClick={() => onSegmentClick?.(seg.role)}>
          <title>{tooltip}</title>
        </circle>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 100 100" className="mx-auto block w-full max-w-[170px] aspect-square" role="img" aria-label="Distribución de roles">
      <defs>
        <filter id={filterId}>
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {segments.map((seg, i) => (
          <radialGradient key={i} id={`${filterId}-g${i}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={`rgba(${seg.rgb}, 0.12)`} />
            <stop offset="100%" stopColor="rgba(0,0,0,0)" />
          </radialGradient>
        ))}
      </defs>

      {/* Subtle background glow per segment */}
      {segments.map((seg, i) => {
        const angleDiff = seg.endAngle - seg.startAngle
        if (angleDiff < 1) return null
        const midAngle = seg.startAngle + angleDiff / 2
        const rad = (midAngle * Math.PI) / 180
        const glowX = cx + (r - thickness / 2) * 0.6 * Math.cos(rad)
        const glowY = cy + (r - thickness / 2) * 0.6 * Math.sin(rad)
        return (
          <circle key={`glow-${i}`} cx={glowX} cy={glowY} r="18" fill={`rgba(${seg.rgb}, 0.08)`} />
        )
      })}

      {/* Donut ring segments */}
      {segments.map((seg, i) => {
        const angleDiff = seg.endAngle - seg.startAngle
        const tooltip = `${seg.label}: ${formatInteger(seg.count)}`

        if (angleDiff >= 359.99) {
          return (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={r - thickness / 2}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeOpacity="0.75"
              filter={`url(#${filterId})`}
              className="cursor-pointer transition-all hover:[stroke-opacity:1]"
              onClick={() => onSegmentClick?.(seg.role)}
            >
              <title>{tooltip}</title>
            </circle>
          )
        }

        const d = describeRing(cx, cy, r, seg.startAngle, seg.endAngle, thickness)
        return (
          <path
            key={i}
            d={d}
            fill={seg.color}
            fillOpacity="0.75"
            filter={`url(#${filterId})`}
            className="cursor-pointer transition-all hover:[fill-opacity:1]"
            onClick={() => onSegmentClick?.(seg.role)}
          >
            <title>{tooltip}</title>
          </path>
        )
      })}

      {/* Inner dark circle for donut hole */}
      <circle cx={cx} cy={cy} r={r - thickness} fill="rgb(var(--background-rgb))" fillOpacity="0.85" />
    </svg>
  )
}

// ── Comparison Result Modal (reuses KpiCard) ──

const COMPARISON_STATS: { key: string; label: string; tone: KpiTone; getRoles: (r: RoleDistribution) => number; better: 'higher' | 'lower' }[] = [
  { key: 'starters', label: 'Starters', tone: 'positive', getRoles: (r) => r.starter ?? 0, better: 'higher' },
  { key: 'handtraps', label: 'Handtraps', tone: 'info', getRoles: (r) => r.handtrap ?? 0, better: 'higher' },
  { key: 'bricks', label: 'Bricks', tone: 'negative', getRoles: (r) => (r.brick ?? 0) + (r.garnet ?? 0), better: 'lower' },
  { key: 'boardbreakers', label: 'Boardbreakers', tone: 'boardbreaker', getRoles: (r) => r.boardbreaker ?? 0, better: 'higher' },
  { key: 'extenders', label: 'Extenders', tone: 'positive', getRoles: (r) => r.extender ?? 0, better: 'higher' },
]

function buildVerdictSummary(
  verdict: Verdict,
  winnerName: string,
  rolesA: RoleDistribution,
  rolesB: RoleDistribution,
): string {
  if (verdict.type === 'equivalent') return 'Ambos decks son equivalentes en composición.'
  if (verdict.type === 'tradeoff') return verdict.tradeoffDetail ?? 'Cada deck tiene ventajas y desventajas.'

  const isA = verdict.type === 'a_better'
  const w = isA ? rolesA : rolesB
  const l = isA ? rolesB : rolesA

  const reasons: string[] = []
  const starterDiff = (w.starter ?? 0) - (l.starter ?? 0)
  const brickDiffW = ((w.brick ?? 0) + (w.garnet ?? 0))
  const brickDiffL = ((l.brick ?? 0) + (l.garnet ?? 0))
  const handtrapDiff = (w.handtrap ?? 0) - (l.handtrap ?? 0)

  if (starterDiff > 0) reasons.push('es más consistente en apertura')
  if (brickDiffW < brickDiffL) reasons.push('brickea menos')
  if (handtrapDiff > 0) reasons.push('tiene más interacción')
  if (starterDiff <= 0 && brickDiffW >= brickDiffL && handtrapDiff <= 0) {
    reasons.push('tiene mejor composición general')
  }

  return `${winnerName} ${reasons.join(', ')}.`
}

function ComparisonResultModal({ verdict, rolesA, rolesB, deckSizeA, deckSizeB, deckNameA, deckNameB, onClose }: {
  verdict: Verdict
  rolesA: RoleDistribution
  rolesB: RoleDistribution
  deckSizeA: number
  deckSizeB: number
  deckNameA: string
  deckNameB: string
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

  const aIsWinner = verdict.type === 'a_better'
  const bIsWinner = verdict.type === 'b_better'
  const winnerName = aIsWinner ? deckNameA : bIsWinner ? deckNameB : ''

  const verdictLabel = aIsWinner ? `${deckNameA} es mejor`
    : bIsWinner ? `${deckNameB} es mejor`
    : verdict.type === 'tradeoff' ? 'Trade-off'
    : 'Equivalentes'

  const summary = buildVerdictSummary(verdict, winnerName, rolesA, rolesB)

  return (
    <div className="fixed inset-0 z-150 grid place-items-center bg-[rgb(var(--background-rgb)/0.76)] px-4 py-5" onClick={onClose}>
      <div
        className="surface-panel relative flex w-full max-w-xl min-h-0 max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0 shadow-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <div className="absolute right-3 top-3 z-10">
          <button type="button" aria-label="Cerrar" className="grid h-8 w-8 place-items-center rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-[rgb(var(--foreground-rgb)/0.06)] transition-colors" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
          <div className="grid gap-4">

            {/* Verdict */}
            <div className="grid gap-1.5 text-center pr-8">
              <strong className="text-[1.2rem] leading-tight tracking-[-0.02em] text-(--text-main)">{verdictLabel}</strong>
              <p className="m-0 text-[0.72rem] text-(--text-muted)">{summary}</p>
            </div>

            {/* Column headers — winner gets accent color */}
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                {aIsWinner ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1" style={{ background: 'rgba(0, 255, 163, 0.1)', border: '1px solid rgba(0, 255, 163, 0.25)' }}>
                    <span className="text-[0.6rem]">👑</span>
                    <strong className="text-[0.76rem] text-[rgb(0,255,163)]">{deckNameA}</strong>
                  </span>
                ) : (
                  <strong className="text-[0.76rem] text-(--text-muted)">{deckNameA}</strong>
                )}
              </div>
              <div className="text-center">
                {bIsWinner ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1" style={{ background: 'rgba(0, 255, 163, 0.1)', border: '1px solid rgba(0, 255, 163, 0.25)' }}>
                    <span className="text-[0.6rem]">👑</span>
                    <strong className="text-[0.76rem] text-[rgb(0,255,163)]">{deckNameB}</strong>
                  </span>
                ) : (
                  <strong className="text-[0.76rem] text-(--text-muted)">{deckNameB}</strong>
                )}
              </div>
            </div>

            {/* Main Deck row */}
            <div className="grid grid-cols-2 gap-3">
              <KpiCard label="Main Deck" value={formatInteger(deckSizeA)} tone="neutral" />
              <KpiCard label="Main Deck" value={formatInteger(deckSizeB)} tone="neutral" />
            </div>

            {/* Stat rows using KpiCard */}
            {COMPARISON_STATS.map((row) => {
              const a = row.getRoles(rolesA)
              const b = row.getRoles(rolesB)
              if (a === 0 && b === 0) return null
              return (
                <div key={row.key} className="grid grid-cols-2 gap-3">
                  <KpiCard label={row.label} value={formatInteger(a)} tone={row.tone} />
                  <KpiCard label={row.label} value={formatInteger(b)} tone={row.tone} />
                </div>
              )
            })}

            {/* Tradeoff detail */}
            {verdict.tradeoffDetail && verdict.type === 'tradeoff' ? (
              <p className="m-0 rounded-lg px-3 py-2 text-[0.72rem] text-(--text-muted)" style={{ background: 'rgb(var(--foreground-rgb) / 0.04)', borderLeft: '3px solid rgb(245, 158, 11)' }}>
                {verdict.tradeoffDetail}
              </p>
            ) : null}
          </div>
        </div>
      </div>
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

  // Build a set of card names in Build B (normalized) for filtering card-specific matchers
  const buildBCardNames = new Set(deck.main.map(c => c.name.trim().toLowerCase()))

  // Filter patterns: remove conditions that reference specific cards not in Build B
  const filteredPatterns = app.patterns
    .filter(p => !p.needsReview)
    .map(p => {
      const filteredConditions = p.conditions.filter(c => {
        if (!c.matcher) return true
        if (c.matcher.type === 'card') return buildBCardNames.has(c.matcher.value.trim().toLowerCase())
        if (c.matcher.type === 'card_pool') return c.matcher.value.some(name => buildBCardNames.has(name.trim().toLowerCase()))
        // role, origin, attribute, level, etc. matchers are always valid
        return true
      })
      return { ...p, conditions: filteredConditions }
    })
    // Remove patterns with no conditions left
    .filter(p => p.conditions.length > 0)

  return {
    version: 15, handSize: app.handSize, deckFormat: app.deckFormat as PortableConfig['deckFormat'],
    patternsSeeded: app.patternsSeeded, patternsSeedVersion: app.patternsSeedVersion,
    deckBuilder: { deckName: deck.deckName, main: m(deck.main), extra: m(deck.extra), side: m(deck.side) },
    patterns: filteredPatterns.map(p => ({ name: p.name, kind: p.kind, logic: p.logic, minimumConditionMatches: p.minimumConditionMatches, reusePolicy: p.reusePolicy, needsReview: false, conditions: p.conditions.map(c => ({ matcher: c.matcher, quantity: c.quantity, kind: c.kind, distinct: c.distinct })) })),
  }
}
