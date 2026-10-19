// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CardSheet } from '../components/probability/CardSheet'
import { CardMenu } from '../components/probability/MatDialogs'

vi.mock('../components/CardArt', () => ({ CardArt: () => null }))

afterEach(cleanup)

const backdropOfSheet = () => document.body.querySelector('div[aria-hidden="true"].fixed')
const backdropOfMenu = () => document.body.querySelector('[role="menu"]')!.parentElement

describe('los menús que no tapan la mesa (elegir a quién atacar tocándolo)', () => {
  it('la hoja del celular deja pasar los toques por su fondo sólo con passThrough', () => {
    const { rerender } = render(<CardSheet name="Dragón" art={null} items={[]} onClose={() => {}} />)

    expect(backdropOfSheet()).not.toHaveClass('pointer-events-none')

    rerender(<CardSheet name="Dragón" art={null} items={[]} passThrough onClose={() => {}} />)
    expect(backdropOfSheet()).toHaveClass('pointer-events-none')
  })

  it('el menú de escritorio también, y el panel sigue recibiendo toques', () => {
    const anchor = { left: 10, top: 100, width: 50, height: 70, right: 60, bottom: 170, x: 10, y: 100, toJSON: () => ({}) } as DOMRect
    const { rerender } = render(<CardMenu anchor={anchor} kicker="Campo" title="Dragón" items={[]} onClose={() => {}} />)

    expect(backdropOfMenu()).not.toHaveClass('pointer-events-none')

    rerender(<CardMenu anchor={anchor} kicker="Campo" title="Dragón" items={[]} passThrough onClose={() => {}} />)
    expect(backdropOfMenu()).toHaveClass('pointer-events-none')
    expect(document.body.querySelector('[role="menu"]')).not.toHaveClass('pointer-events-none')
  })
})
