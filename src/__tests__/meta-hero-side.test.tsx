// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setMetaRegion, useMetaRegion } from '../app/use-meta-region'
import { MetaHeroSide } from '../components/meta/MetaHeroSide'

// La fila de datos del encabezado de Tier lists, Torneos y Banlists: la fecha y «Región: TCG», una sola elección para las tres.
function Row(props: { date?: string; dateTitle?: string }) {
  const region = useMetaRegion('tcg')

  return (
    <>
      <MetaHeroSide region={region} {...props} />
      <output>{region}</output>
    </>
  )
}

beforeEach(() => setMetaRegion('tcg'))
afterEach(cleanup)

describe('MetaHeroSide', () => {
  it('es un selector «Región: TCG» (no una barra de pastillas) y elegir OCG cambia la región de las tres pantallas', () => {
    render(<Row />)
    const chip = screen.getByRole('combobox', { name: 'Región: TCG' })

    expect(chip).toHaveDisplayValue('TCG')
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()

    fireEvent.change(chip, { target: { value: 'ocg' } })
    expect(screen.getByRole('combobox', { name: 'Región: OCG' })).toHaveDisplayValue('OCG')
    expect(screen.getByRole('status')).toHaveTextContent('ocg')
  })

  it('sin fecha dice la de los decks del meta; con fecha, la que le pasan con su título', () => {
    const view = render(<Row />)

    expect(view.container.querySelector('[title="Fecha de la última actualización de los decks"]')).toHaveTextContent(/^Actualizado el \d{2}\/\d{2}\/\d{4}$/)
    cleanup()

    render(<Row date="Datos al 19/10/2026" dateTitle="Cuándo se bajaron las listas" />)
    expect(screen.getByText('Datos al 19/10/2026')).toHaveAttribute('title', 'Cuándo se bajaron las listas')
  })
})
