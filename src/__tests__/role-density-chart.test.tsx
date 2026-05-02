// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { RoleDensityChart, computePieSegments } from '../components/comparison/RoleDensityChart'
import type { GroupedRoleDensity, RoleDensityEntry } from '../app/build-comparison'
import type { CardRole } from '../types'

// ── Test Store Wrapper ──

function createTestStore() {
  return configureStore({
    reducer: {
      settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state,
      deckBuilder: (state = { deckName: 'Test', main: [] as never[], extra: [] as never[], side: [] as never[], isEditingDeck: false }) => state,
      patterns: (state = { patternsSeeded: false, patternsSeedVersion: 0, patterns: [] as never[] }) => state,
    },
  })
}

function renderWithStore(ui: React.ReactElement) {
  const store = createTestStore()
  return render(<Provider store={store}>{ui}</Provider>)
}

// ── Helpers ──

function makeEntry(role: CardRole, count: number, density: number): RoleDensityEntry {
  return { role, count, density }
}

function makeGrouped(
  visible: RoleDensityEntry[],
  otherCount = 0,
  otherDensity = 0,
): GroupedRoleDensity {
  return { visible, otherCount, otherDensity }
}

// ══════════════════════════════════════════════════════════════════════════════
// Compact variant renders SVG with path segments
// ══════════════════════════════════════════════════════════════════════════════

describe('RoleDensityChart — compact variant', () => {
  it('renders an SVG element with path segments for multiple entries', () => {
    const grouped = makeGrouped([
      makeEntry('starter', 12, 0.3),
      makeEntry('handtrap', 6, 0.15),
      makeEntry('brick', 4, 0.1),
    ])

    const { container } = renderWithStore(
      <RoleDensityChart grouped={grouped} variant="compact" />,
    )

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()

    const paths = svg!.querySelectorAll('path')
    expect(paths.length).toBe(3)
  })

  it('does not render a legend below the pie chart', () => {
    const grouped = makeGrouped([
      makeEntry('starter', 12, 0.3),
      makeEntry('handtrap', 6, 0.15),
    ])

    const { container } = renderWithStore(
      <RoleDensityChart grouped={grouped} variant="compact" />,
    )

    // No list role elements (legend removed)
    const listItems = container.querySelectorAll('[role="listitem"]')
    expect(listItems.length).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Full variant renders SVG without legend
// ══════════════════════════════════════════════════════════════════════════════

describe('RoleDensityChart — full variant', () => {
  it('renders SVG without legend', () => {
    const grouped = makeGrouped([
      makeEntry('starter', 12, 0.3),
      makeEntry('handtrap', 6, 0.15),
    ])

    const { container } = renderWithStore(
      <RoleDensityChart grouped={grouped} variant="full" />,
    )

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()

    // No legend
    const listItems = container.querySelectorAll('[role="listitem"]')
    expect(listItems.length).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Returns null for empty data
// ══════════════════════════════════════════════════════════════════════════════

describe('RoleDensityChart — empty data', () => {
  it('returns null when visible is empty', () => {
    const grouped = makeGrouped([], 0, 0)

    const { container } = renderWithStore(
      <RoleDensityChart grouped={grouped} variant="compact" />,
    )

    expect(container.querySelector('svg')).toBeNull()
    expect(container.innerHTML).toBe('')
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Single role entry renders a full circle
// ══════════════════════════════════════════════════════════════════════════════

describe('RoleDensityChart — single entry', () => {
  it('renders a circle element for a single role', () => {
    const grouped = makeGrouped([makeEntry('starter', 40, 1.0)])

    const { container } = renderWithStore(
      <RoleDensityChart grouped={grouped} variant="compact" />,
    )

    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()

    const circle = svg!.querySelector('circle')
    expect(circle).not.toBeNull()

    const paths = svg!.querySelectorAll('path')
    expect(paths.length).toBe(0)
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// All segments have cursor-pointer
// ══════════════════════════════════════════════════════════════════════════════

describe('RoleDensityChart — cursor pointer on all segments', () => {
  it('every path segment has cursor-pointer class', () => {
    const grouped = makeGrouped([
      makeEntry('starter', 12, 0.3),
      makeEntry('handtrap', 6, 0.15),
      makeEntry('brick', 4, 0.1),
      makeEntry('recovery', 3, 0.08),
    ])

    const { container } = renderWithStore(
      <RoleDensityChart grouped={grouped} variant="compact" />,
    )

    const paths = container.querySelectorAll('path')
    expect(paths.length).toBe(4)
    for (const path of paths) {
      expect(path.className.baseVal).toContain('cursor-pointer')
    }
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Semantic colors
// ══════════════════════════════════════════════════════════════════════════════

describe('RoleDensityChart — semantic colors', () => {
  it('starter is green and brick is red', () => {
    const segments = computePieSegments([
      makeEntry('starter', 10, 0.5),
      makeEntry('brick', 5, 0.25),
    ])

    expect(segments[0].color).toBe('#22c55e') // green
    expect(segments[1].color).toBe('#ef4444') // red
  })

  it('handtrap is blue and boardbreaker is orange', () => {
    const segments = computePieSegments([
      makeEntry('handtrap', 6, 0.3),
      makeEntry('boardbreaker', 4, 0.2),
    ])

    expect(segments[0].color).toBe('#3b82f6') // blue
    expect(segments[1].color).toBe('#f97316') // orange
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// computePieSegments unit tests
// ══════════════════════════════════════════════════════════════════════════════

describe('computePieSegments', () => {
  it('returns empty array for empty entries', () => {
    const result = computePieSegments([])
    expect(result).toEqual([])
  })

  it('computes correct angles proportional to density', () => {
    const segments = computePieSegments([
      makeEntry('starter', 10, 0.5),
      makeEntry('handtrap', 10, 0.5),
    ])

    expect(segments).toHaveLength(2)
    const angle1 = segments[0].endAngle - segments[0].startAngle
    const angle2 = segments[1].endAngle - segments[1].startAngle
    expect(angle1).toBeCloseTo(180, 5)
    expect(angle2).toBeCloseTo(180, 5)
  })

  it('total angles sum to 360 degrees', () => {
    const segments = computePieSegments([
      makeEntry('starter', 10, 0.3),
      makeEntry('handtrap', 5, 0.15),
      makeEntry('brick', 3, 0.075),
    ])

    const totalAngle = segments.reduce((s, seg) => s + (seg.endAngle - seg.startAngle), 0)
    expect(totalAngle).toBeCloseTo(360, 5)
  })
})
