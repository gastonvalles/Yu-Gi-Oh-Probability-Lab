// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { Button } from '../components/ui/Button'

describe('el botón verde («Estoy listo»)', () => {
  it('lleva el texto en blanco sobre un verde hondo (el blanco sobre el verde claro de la paleta no se lee)', () => {
    render(
      <Button variant="primary" color="success">
        Estoy listo
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Estoy listo' })

    expect(button).toHaveClass('bg-success-solid', 'text-white')
    expect(button).not.toHaveClass('text-background')
  })
})
