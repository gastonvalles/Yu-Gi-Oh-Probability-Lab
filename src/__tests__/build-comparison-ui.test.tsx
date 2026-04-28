// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { VerdictCard } from '../components/comparison/VerdictCard'
import { InsightList } from '../components/comparison/InsightList'
import type { Verdict, Insight } from '../app/build-comparison'

// ── 10.1: VerdictCard tests ──

describe('VerdictCard', () => {
  it('renders "Build A es mejor" for a_better verdict', () => {
    const verdict: Verdict = {
      type: 'a_better',
      summary: 'Build A es más consistente',
      openingDeltaFormatted: '+5.2%',
      bricksDelta: -1,
      tradeoffDetail: null,
      recommendation: 'Recomendado si priorizás consistencia',
    }

    render(<VerdictCard verdict={verdict} />)
    expect(screen.getByText('Build A es mejor')).toBeInTheDocument()
    expect(screen.getByText(/\+5\.2%/)).toBeInTheDocument()
    expect(screen.getByText(/-1/)).toBeInTheDocument()
  })

  it('renders "Build B es mejor" for b_better verdict', () => {
    const verdict: Verdict = {
      type: 'b_better',
      summary: 'Build B es más consistente',
      openingDeltaFormatted: '-3.1%',
      bricksDelta: 0,
      tradeoffDetail: null,
      recommendation: null,
    }

    render(<VerdictCard verdict={verdict} />)
    expect(screen.getByText('Build B es mejor')).toBeInTheDocument()
  })

  it('renders "Equivalentes" for equivalent verdict', () => {
    const verdict: Verdict = {
      type: 'equivalent',
      summary: 'Las diferencias son marginales',
      openingDeltaFormatted: '+0.2%',
      bricksDelta: 0,
      tradeoffDetail: null,
      recommendation: null,
    }

    render(<VerdictCard verdict={verdict} />)
    expect(screen.getByText('Equivalentes')).toBeInTheDocument()
  })

  it('renders "Trade-off" and shows tradeoffDetail in a warning card', () => {
    const verdict: Verdict = {
      type: 'tradeoff',
      summary: 'Build A mejora openings pero suma bricks',
      openingDeltaFormatted: '+4.0%',
      bricksDelta: 2,
      tradeoffDetail: 'Build A gana consistencia de apertura a costa de más manos muertas',
      recommendation: 'Elegí Build A si priorizás consistencia; Build B si querés menos bricks',
    }

    render(<VerdictCard verdict={verdict} />)
    expect(screen.getByText('Trade-off')).toBeInTheDocument()
    expect(screen.getByText('Build A gana consistencia de apertura a costa de más manos muertas')).toBeInTheDocument()
  })

  it('shows recommendation text when not null', () => {
    const verdict: Verdict = {
      type: 'a_better',
      summary: 'Build A es más consistente',
      openingDeltaFormatted: '+5.2%',
      bricksDelta: -1,
      tradeoffDetail: null,
      recommendation: 'Recomendado si priorizás consistencia',
    }

    render(<VerdictCard verdict={verdict} />)
    expect(screen.getByText('Recomendado si priorizás consistencia')).toBeInTheDocument()
  })

  it('does NOT show recommendation section when null', () => {
    const verdict: Verdict = {
      type: 'b_better',
      summary: 'Build B es más consistente',
      openingDeltaFormatted: '-3.1%',
      bricksDelta: 0,
      tradeoffDetail: null,
      recommendation: null,
    }

    render(<VerdictCard verdict={verdict} />)
    // The recommendation text should not be present
    const articles = document.querySelectorAll('p.italic')
    expect(articles.length).toBe(0)
  })
})


// ── 10.2: InsightList tests ──

describe('InsightList', () => {
  it('renders max 3 insights', () => {
    const insights: Insight[] = [
      { priority: 'critical', text: '+2 starters → más manos jugables', delta: 2, category: 'starters' },
      { priority: 'high', text: '+1 extender → más capacidad de seguir combos', delta: 1, category: 'extenders' },
      { priority: 'normal', text: '-1 engine → menos consistencia del motor', delta: -1, category: 'engine' },
    ]

    render(<InsightList insights={insights} />)
    expect(screen.getByText('+2 starters → más manos jugables')).toBeInTheDocument()
    expect(screen.getByText('+1 extender → más capacidad de seguir combos')).toBeInTheDocument()
    expect(screen.getByText('-1 engine → menos consistencia del motor')).toBeInTheDocument()
  })

  it('each insight shows its text in causa → efecto format', () => {
    const insights: Insight[] = [
      { priority: 'critical', text: '-2 bricks → menos manos muertas', delta: -2, category: 'bricks' },
    ]

    render(<InsightList insights={insights} />)
    expect(screen.getByText('-2 bricks → menos manos muertas')).toBeInTheDocument()
  })

  it('shows priority icons: ⚠️ for critical, 📊 for high, ℹ️ for normal', () => {
    const insights: Insight[] = [
      { priority: 'critical', text: 'Critical insight', delta: 3, category: 'starters' },
      { priority: 'high', text: 'High insight', delta: 2, category: 'extenders' },
      { priority: 'normal', text: 'Normal insight', delta: 1, category: 'engine' },
    ]

    render(<InsightList insights={insights} />)
    expect(screen.getByText('⚠️')).toBeInTheDocument()
    expect(screen.getByText('📊')).toBeInTheDocument()
    expect(screen.getByText('ℹ️')).toBeInTheDocument()
  })

  it('returns null when insights array is empty', () => {
    const { container } = render(<InsightList insights={[]} />)
    expect(container.innerHTML).toBe('')
  })
})
