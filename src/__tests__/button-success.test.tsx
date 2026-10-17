// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { Button } from '../components/ui/Button'

describe('el botón que se vuelve verde al apuntarlo («Listo» del siding)', () => {
  it('es violeta y pasa a verde (con texto blanco) al pasar el mouse', () => {
    render(
      <Button variant="primary" color="confirm">
        Listo
      </Button>,
    )

    const button = screen.getByRole('button', { name: 'Listo' })

    expect(button).toHaveClass('bg-primary', 'hover:bg-success-solid', 'hover:text-white')
  })
})

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
