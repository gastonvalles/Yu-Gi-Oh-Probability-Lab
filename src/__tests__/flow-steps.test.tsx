// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { FlowSteps } from '../components/shell/FlowSteps'
import type { NavGroup } from '../components/shell/nav-model'
import { applyLocale } from '../i18n'

const GROUP: NavGroup = {
  key: 'deck',
  label: 'Tu deck',
  icon: 'cards',
  items: [
    { key: 'deck-builder', label: 'Deck', title: 'Deck Builder', icon: 'cards' },
    { key: 'categorization', label: 'Roles', title: 'Roles', icon: 'tag' },
    { key: 'probability-lab', label: 'Lab', title: 'Probability Lab', icon: 'flask' },
    { key: 'workspace', label: 'Comparar', title: 'Comparar', icon: 'columns' },
    { key: 'export', label: 'Exportar', title: 'Exportar', icon: 'download' },
  ],
}

beforeEach(() => applyLocale('es'))

describe('FlowSteps', () => {
  it('anuncia el paso de ahora y marca con aria-current el botón del paso (en escritorio, con «N · nombre»)', () => {
    render(<FlowSteps group={GROUP} activeKey="categorization" onSelect={() => {}} />)

    expect(screen.getByText('Paso 2 de 5: Roles')).toBeInTheDocument()
    const nav = screen.getByRole('navigation', { name: 'Pasos del deck' })

    expect(within(nav).getByRole('button', { name: /^2 · Roles$/ })).toHaveAttribute('aria-current', 'step')
    expect(within(nav).getByRole('button', { name: /^1 · Deck$/ })).not.toHaveAttribute('aria-current')
  })

  it('cada paso lleva a su pantalla', () => {
    const onSelect = vi.fn()

    render(<FlowSteps group={GROUP} activeKey="deck-builder" onSelect={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: /^5 · Exportar$/ }))

    expect(onSelect).toHaveBeenCalledWith('export')
  })

  it('no se dibuja fuera de los pasos del deck', () => {
    const { container } = render(<FlowSteps group={GROUP} activeKey="meta" onSelect={() => {}} />)

    expect(container).toBeEmptyDOMElement()
  })
})
