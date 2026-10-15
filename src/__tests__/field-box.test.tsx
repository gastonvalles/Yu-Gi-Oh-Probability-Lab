// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it } from 'vitest'

import { FieldBox } from '../components/ui/FieldBox'

afterEach(cleanup)

describe('FieldBox', () => {
  it('de una línea tiene alto fijo y centra el campo', () => {
    render(
      <FieldBox>
        <input aria-label="Nombre" />
      </FieldBox>,
    )

    const box = screen.getByLabelText('Nombre').closest('label')!

    expect(box).toHaveClass('h-10', 'items-center')
  })

  it('con varias líneas crece con el texto: sin alto fijo, o el campo se saldría de la caja', () => {
    render(
      <FieldBox multiline>
        <textarea aria-label="Deck" rows={4} />
      </FieldBox>,
    )

    const box = screen.getByLabelText('Deck').closest('label')!

    expect(box).not.toHaveClass('h-10')
    expect(box).toHaveClass('items-start')
  })
})
