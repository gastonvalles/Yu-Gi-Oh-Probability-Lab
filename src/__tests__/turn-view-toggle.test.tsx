// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom'
import { TurnViewToggle } from '../components/probability/TurnViewToggle'
import { DeckQualityHero } from '../components/probability/DeckQualityHero'
import type { ProbabilityCausalEntry } from '../components/probability/probability-lab-helpers'
import type { TurnContext, TurnView } from '../types'

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════
//
// Integration-lite harness: we render `DeckQualityHero` directly with
// fabricated `ProbabilityCausalEntry` values so we do not need the Redux
// provider or the upstream probability calculation. The Hero is the surface
// where the toggle's visibility, the default-view labeling, and the per-card
// turn-context badge are asserted. A thin `HeroHarness` component owns
// `activeTurnView` state via `useState<TurnView>('average')` mirroring the
// one-line contract in `ProbabilityPanel`.
//
// For "switching KPI" (7.6.4), we pass the `deckSummary` prop derived from the
// harness's active view so flipping the toggle visibly changes the rendered
// cleanProbability.

function makeEntry(
  partial: Partial<ProbabilityCausalEntry> & Pick<ProbabilityCausalEntry, 'patternId'>,
): ProbabilityCausalEntry {
  return {
    definitionKey: `def:${partial.patternId}`,
    description: 'Descripción técnica',
    id: `preset:${partial.patternId}`,
    isCore: false,
    kind: 'opening',
    name: `Regla ${partial.patternId}`,
    patternId: partial.patternId,
    possible: true,
    probability: 0.5,
    presetId: null,
    technicalSubtitle: 'subtítulo técnico',
    turnContext: 'either',
    ...partial,
  }
}

interface HarnessProps {
  /** All entries that the hero *could* display before per-view filtering. */
  allOpenings: ProbabilityCausalEntry[]
  /** Value exposed by `hasAsymmetricRulesFn(activePatterns)` — controls visibility. */
  hasAsymmetricRules: boolean
  /**
   * Per-view clean-probability snapshot. Mirrors what `ProbabilityPanel`
   * feeds into `deckSummary` based on the `activeTurnView` branch.
   */
  probabilityByView: Record<TurnView, number>
  /**
   * `ProbabilityPanel` applies `selectPatternsForView`-style filtering before
   * handing cards to the hero. We mirror that here so 7.6.6 can assert
   * second-only cards disappear under the 'first' view.
   */
  filterByView?: boolean
}

/**
 * Mirrors the state contract from `ProbabilityPanel`:
 * `useState<TurnView>('average')` + derived filtered entries + derived KPI.
 * Remounting this harness (via a `key` prop) effectively remounts the state,
 * giving us the 7.6.5 assertion for free.
 */
function HeroHarness({
  allOpenings,
  hasAsymmetricRules,
  probabilityByView,
  filterByView = false,
}: HarnessProps) {
  const [activeTurnView, setActiveTurnView] = useState<TurnView>('average')

  const openingEntries = filterByView
    ? filterEntriesForTestView(allOpenings, activeTurnView)
    : allOpenings

  return (
    <DeckQualityHero
      deckSummary={{
        cleanProbability: probabilityByView[activeTurnView],
        cleanHands: Math.round(probabilityByView[activeTurnView] * 100),
        totalHands: 100,
        basedOnActiveRules: true,
      }}
      feedback={null}
      isEditMode={false}
      onEditPattern={() => {}}
      onToggleEditMode={() => {}}
      onOpenQuickAdd={() => {}}
      onOpenCustomCreate={() => {}}
      openingEntries={openingEntries}
      problemEntries={[]}
      activeTurnView={activeTurnView}
      onChangeTurnView={setActiveTurnView}
      hasAsymmetricRules={hasAsymmetricRules}
    />
  )
}

/** Local copy of `ProbabilityPanel.filterEntriesForView` for integration-lite tests. */
function filterEntriesForTestView(
  entries: ProbabilityCausalEntry[],
  view: TurnView,
): ProbabilityCausalEntry[] {
  if (view === 'average') {
    return entries
  }
  return entries.filter(
    (entry) => entry.turnContext === view || entry.turnContext === 'either',
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('TurnViewToggle (isolation)', () => {
  it('renders three radios with labels "Primero", "Segundo", "Promedio"', () => {
    /** **Validates: Requirements 3.2, 3.4** */
    render(<TurnViewToggle activeView="average" onChange={() => {}} />)

    expect(screen.getByRole('radio', { name: 'Primero' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Segundo' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Promedio' })).toBeInTheDocument()
  })

  it('emits onChange with the clicked view value', () => {
    const onChange = vi.fn()
    render(<TurnViewToggle activeView="average" onChange={onChange} />)

    fireEvent.click(screen.getByRole('radio', { name: 'Primero' }))
    expect(onChange).toHaveBeenLastCalledWith('first')

    fireEvent.click(screen.getByRole('radio', { name: 'Segundo' }))
    expect(onChange).toHaveBeenLastCalledWith('second')

    fireEvent.click(screen.getByRole('radio', { name: 'Promedio' }))
    expect(onChange).toHaveBeenLastCalledWith('average')
  })

  it('marks the active view as aria-checked="true" and others as "false"', () => {
    const { rerender } = render(<TurnViewToggle activeView="first" onChange={() => {}} />)

    expect(screen.getByRole('radio', { name: 'Primero' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: 'Segundo' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByRole('radio', { name: 'Promedio' })).toHaveAttribute(
      'aria-checked',
      'false',
    )

    rerender(<TurnViewToggle activeView="average" onChange={() => {}} />)

    expect(screen.getByRole('radio', { name: 'Promedio' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })
})

describe('DeckQualityHero — turn view toggle wiring', () => {
  it('7.6.1: hides the toggle when every pattern has turnContext === "either"', () => {
    /** **Validates: Requirement 3.3** */
    render(
      <HeroHarness
        allOpenings={[
          makeEntry({ patternId: 'p1', turnContext: 'either' }),
          makeEntry({ patternId: 'p2', turnContext: 'either' }),
        ]}
        hasAsymmetricRules={false}
        probabilityByView={{ first: 0.4, second: 0.6, average: 0.5 }}
      />,
    )

    expect(screen.queryByRole('radio', { name: 'Primero' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Segundo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'Promedio' })).not.toBeInTheDocument()
  })

  it('7.6.2: renders the toggle when at least one pattern has turnContext !== "either"', () => {
    /** **Validates: Requirement 3.2** */
    render(
      <HeroHarness
        allOpenings={[
          makeEntry({ patternId: 'p1', turnContext: 'either' }),
          makeEntry({ patternId: 'p2', turnContext: 'first' }),
        ]}
        hasAsymmetricRules={true}
        probabilityByView={{ first: 0.4, second: 0.6, average: 0.5 }}
      />,
    )

    expect(screen.getByRole('radio', { name: 'Primero' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Segundo' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Promedio' })).toBeInTheDocument()
  })

  it('7.6.3: default active view is "Promedio"', () => {
    /** **Validates: Requirement 3.1** */
    render(
      <HeroHarness
        allOpenings={[makeEntry({ patternId: 'p1', turnContext: 'first' })]}
        hasAsymmetricRules={true}
        probabilityByView={{ first: 0.4, second: 0.6, average: 0.5 }}
      />,
    )

    expect(screen.getByRole('radio', { name: 'Promedio' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByRole('radio', { name: 'Primero' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(screen.getByRole('radio', { name: 'Segundo' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
  })

  it('7.6.4: clicking "Primero" switches the KPI display to the first-view probability', () => {
    /** **Validates: Requirements 3.4, 4.1, 4.4** */
    render(
      <HeroHarness
        allOpenings={[makeEntry({ patternId: 'p1', turnContext: 'first' })]}
        hasAsymmetricRules={true}
        // Distinct per-view probabilities so the KPI label uniquely identifies
        // which branch fed the hero. Avoid 0.5 (which collides with the rule
        // card's own 50.00% probability label).
        probabilityByView={{ first: 0.12, second: 0.88, average: 0.37 }}
      />,
    )

    // Default view is 'average' → 37%.
    expect(screen.getByText('37.00%')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Primero' }))

    expect(screen.getByText('12.00%')).toBeInTheDocument()
    expect(screen.queryByText('37.00%')).not.toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Primero' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Segundo' }))

    expect(screen.getByText('88.00%')).toBeInTheDocument()
    expect(screen.queryByText('12.00%')).not.toBeInTheDocument()
  })

  it('7.6.5: remounting the harness resets the active view to "Promedio"', () => {
    /** **Validates: Requirement 3.5** */
    function RemountWrapper({ mountKey }: { mountKey: number }) {
      return (
        <HeroHarness
          key={mountKey}
          allOpenings={[makeEntry({ patternId: 'p1', turnContext: 'first' })]}
          hasAsymmetricRules={true}
          probabilityByView={{ first: 0.12, second: 0.88, average: 0.37 }}
        />
      )
    }

    const { rerender } = render(<RemountWrapper mountKey={0} />)

    // Flip to a non-default view before the remount.
    fireEvent.click(screen.getByRole('radio', { name: 'Primero' }))
    expect(screen.getByRole('radio', { name: 'Primero' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    // Changing the `key` unmounts the harness and mounts a fresh instance, so
    // `useState<TurnView>('average')` runs again from scratch.
    rerender(<RemountWrapper mountKey={1} />)

    expect(screen.getByRole('radio', { name: 'Promedio' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    expect(screen.getByText('37.00%')).toBeInTheDocument()
  })

  it("7.6.6: in 'first' view, cards derived from 'second' rules are hidden", () => {
    /** **Validates: Requirements 6.1, 6.2, 6.3** */
    const entries: ProbabilityCausalEntry[] = [
      makeEntry({ patternId: 'p-either', name: 'Rule Either', turnContext: 'either' }),
      makeEntry({ patternId: 'p-first', name: 'Rule First', turnContext: 'first' }),
      makeEntry({ patternId: 'p-second', name: 'Rule Second', turnContext: 'second' }),
    ]

    render(
      <HeroHarness
        allOpenings={entries}
        hasAsymmetricRules={true}
        probabilityByView={{ first: 0.4, second: 0.6, average: 0.5 }}
        filterByView={true}
      />,
    )

    // Default 'average' view shows every rule.
    expect(screen.getByText('Rule Either')).toBeInTheDocument()
    expect(screen.getByText('Rule First')).toBeInTheDocument()
    expect(screen.getByText('Rule Second')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Primero' }))

    expect(screen.getByText('Rule Either')).toBeInTheDocument()
    expect(screen.getByText('Rule First')).toBeInTheDocument()
    expect(screen.queryByText('Rule Second')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Segundo' }))

    expect(screen.getByText('Rule Either')).toBeInTheDocument()
    expect(screen.queryByText('Rule First')).not.toBeInTheDocument()
    expect(screen.getByText('Rule Second')).toBeInTheDocument()
  })

  it("7.6.7: in 'average' view, first-context rule cards show the '1º' indicator", () => {
    /** **Validates: Requirement 6.4** */
    const entries: ProbabilityCausalEntry[] = [
      makeEntry({ patternId: 'p-either', name: 'Rule Either', turnContext: 'either' }),
      makeEntry({ patternId: 'p-first', name: 'Rule First', turnContext: 'first' }),
      makeEntry({ patternId: 'p-second', name: 'Rule Second', turnContext: 'second' }),
    ]

    render(
      <HeroHarness
        allOpenings={entries}
        hasAsymmetricRules={true}
        probabilityByView={{ first: 0.4, second: 0.6, average: 0.5 }}
      />,
    )

    // Badges only appear for turnContext !== 'either'. Exactly one '1º' for
    // the first-context rule and one '2º' for the second-context rule.
    expect(screen.getByLabelText('Aplica al ir primero')).toHaveTextContent('1º')
    expect(screen.getByLabelText('Aplica al ir segundo')).toHaveTextContent('2º')

    // No badge for the either-context rule (sanity check): only two badges in
    // total.
    const firstBadges = screen.getAllByLabelText(/Aplica al ir/i)
    expect(firstBadges).toHaveLength(2)
  })

  it('badges use the TurnContext values consistently across views', () => {
    // Sanity test that a single-view mode still renders the indicator for
    // visible cards. This backs the "IN single-view mode" arm of Req 6.4.
    const entries: ProbabilityCausalEntry[] = [
      makeEntry({ patternId: 'p-first', name: 'Rule First', turnContext: 'first' }),
      makeEntry({ patternId: 'p-either', name: 'Rule Either', turnContext: 'either' }),
    ]

    render(
      <HeroHarness
        allOpenings={entries}
        hasAsymmetricRules={true}
        probabilityByView={{ first: 0.4, second: 0.6, average: 0.5 }}
        filterByView={true}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Primero' }))

    expect(screen.getByLabelText('Aplica al ir primero')).toHaveTextContent('1º')
    // Either-context rules are not badged even when visible in a single-view
    // mode; the indicator is scoped to asymmetric rules.
    expect(screen.queryByLabelText('Aplica al ir segundo')).not.toBeInTheDocument()
  })
})

// Type assertion: `makeEntry` must produce a valid TurnContext discriminator.
// Keeps the file honest if TurnContext ever grows a new variant.
const _typeCheck: TurnContext = 'either'
void _typeCheck
