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
  const [showCardList, setShowCardList] = useState(false)

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
            onClick={() => setShowCardList(true)}
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

      {showCardList && editedDeckBuilder ? (
        <BuildBCardListModal
          cards={editedDeckBuilder.main}
          editsMap={editsMap}
          onSelectCard={(card) => { setShowCardList(false); setEditingCard(card) }}
          onClose={() => setShowCardList(false)}
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
