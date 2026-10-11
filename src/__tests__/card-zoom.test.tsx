// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import { CardZoom } from '../components/card-detail/CardZoom'
import type { ApiCardReference } from '../types'

const card = {
  ygoprodeckId: 1,
  cardType: 'Effect Monster',
  frameType: 'effect',
  description: null,
  race: null,
  attribute: null,
  level: 4,
  linkValue: null,
  atk: '0',
  def: '0',
  archetype: null,
  ygoprodeckUrl: null,
  imageUrl: null,
  imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null },
  genesys: { points: null },
} as ApiCardReference

describe('la carta en grande', () => {
  it('se cierra tocando en cualquier lado, con la X o con Escape', () => {
    const onClose = vi.fn()
    render(<CardZoom card={card} name="Maxx" onClose={onClose} />)

    const dialog = screen.getByRole('dialog', { name: 'Maxx en grande' })

    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })
})
