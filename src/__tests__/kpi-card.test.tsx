// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { KpiCard } from '../components/comparison/KpiCard'

describe('KpiCard with hint', () => {
  it('renders the interpretation text when hint is provided', () => {
    render(<KpiCard label="Starters" value="13" tone="positive" hint="arranque" />)
    expect(screen.getByText('arranque')).toBeInTheDocument()
    expect(screen.getByText('Starters')).toBeInTheDocument()
    expect(screen.getByText('13')).toBeInTheDocument()
  })

  it('does not render additional text when hint is not provided', () => {
    const { container } = render(<KpiCard label="Main Deck" value="40" tone="neutral" />)
    expect(screen.getByText('Main Deck')).toBeInTheDocument()
    expect(screen.getByText('40')).toBeInTheDocument()
    // The hint span should not exist
    const spans = container.querySelectorAll('span')
    const hintSpans = Array.from(spans).filter(
      (s) => s.textContent !== 'Main Deck' && s.textContent !== '40' && s.classList.contains('text-[0.6rem]'),
    )
    expect(hintSpans.length).toBe(0)
  })

  it('does not render hint when hint is null', () => {
    const { container } = render(<KpiCard label="Openings" value="85%" tone="positive" hint={null} />)
    expect(screen.getByText('Openings')).toBeInTheDocument()
    expect(screen.getByText('85%')).toBeInTheDocument()
    const spans = container.querySelectorAll('span')
    const hintSpans = Array.from(spans).filter(
      (s) => s.classList.contains('text-[0.6rem]'),
    )
    expect(hintSpans.length).toBe(0)
  })
})
