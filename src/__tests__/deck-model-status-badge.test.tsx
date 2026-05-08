// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { DeckModelStatusBadge } from '../components/DeckModelStatusBadge'
import type { DeckModelStatus } from '../app/deck-model-status'

// ── Helpers ──

function makeCompleteStatus(overrides: Partial<DeckModelStatus> = {}): DeckModelStatus {
  return {
    status: 'complete',
    totalCards: 40,
    categorizedCards: 40,
    missingOriginCount: 0,
    missingRolesCount: 0,
    needsReviewCount: 0,
    activePatternCount: 3,
    completionPercentage: 1,
    ...overrides,
  }
}

function makeIncompleteStatus(overrides: Partial<DeckModelStatus> = {}): DeckModelStatus {
  return {
    status: 'incomplete',
    totalCards: 40,
    categorizedCards: 30,
    missingOriginCount: 4,
    missingRolesCount: 3,
    needsReviewCount: 3,
    activePatternCount: 2,
    completionPercentage: 0.75,
    ...overrides,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DeckModelStatusBadge Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('DeckModelStatusBadge', () => {
  it('compact variant with status complete shows "Modelo completo"', () => {
    /** **Validates: Requirements 2.2, 2.8** */
    const status = makeCompleteStatus()

    render(<DeckModelStatusBadge modelStatus={status} variant="compact" />)

    expect(screen.getByText('Modelo completo')).toBeInTheDocument()
  })

  it('full variant with status complete shows "Toda carta tiene grupo, función y fue revisada."', () => {
    /** **Validates: Requirements 2.2, 2.9** */
    const status = makeCompleteStatus()

    render(<DeckModelStatusBadge modelStatus={status} variant="full" />)

    expect(screen.getByText('Modelo completo')).toBeInTheDocument()
    expect(screen.getByText('Toda carta tiene grupo, función y fue revisada.')).toBeInTheDocument()
  })

  it('full variant with status incomplete shows "Modelo incompleto"', () => {
    /** **Validates: Requirements 2.3, 2.9** */
    const status = makeIncompleteStatus()

    render(<DeckModelStatusBadge modelStatus={status} variant="full" />)

    expect(screen.getByText('Modelo incompleto')).toBeInTheDocument()
  })

  it('shows "X cartas sin función definida" when missingRolesCount > 0', () => {
    /** **Validates: Requirements 2.4** */
    const status = makeIncompleteStatus({ missingRolesCount: 5 })

    render(<DeckModelStatusBadge modelStatus={status} variant="full" />)

    expect(screen.getByText('5 cartas sin función definida')).toBeInTheDocument()
  })

  it('shows "X cartas sin grupo definido" when missingOriginCount > 0', () => {
    /** **Validates: Requirements 2.5** */
    const status = makeIncompleteStatus({ missingOriginCount: 7 })

    render(<DeckModelStatusBadge modelStatus={status} variant="full" />)

    expect(screen.getByText('7 cartas sin grupo definido')).toBeInTheDocument()
  })

  it('shows "X cartas pendientes de revisión" when needsReviewCount > 0', () => {
    /** **Validates: Requirements 2.6** */
    const status = makeIncompleteStatus({ needsReviewCount: 2 })

    render(<DeckModelStatusBadge modelStatus={status} variant="full" />)

    expect(screen.getByText('2 cartas pendientes de revisión')).toBeInTheDocument()
  })

  it('shows "Revisá antes de confiar en los porcentajes" when status is incomplete', () => {
    /** **Validates: Requirements 2.7** */
    const status = makeIncompleteStatus()

    render(<DeckModelStatusBadge modelStatus={status} variant="full" />)

    expect(screen.getByText('Revisá antes de confiar en los porcentajes')).toBeInTheDocument()
  })
})
