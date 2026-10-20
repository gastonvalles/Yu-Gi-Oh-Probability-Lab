// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { describe, expect, it } from 'vitest'

import { CardEffectTraits, visibleTraits } from '../components/card-detail/CardEffectTraits'

describe('visibleTraits: qué rasgos se muestran de los hechos confirmados', () => {
  it('«por nombre» ya dice «una vez por turno»: no se muestran los dos; el resto, en el orden de siempre', () => {
    expect(visibleTraits(['quick', 'once', 'hardOnce', 'cost', 'target']).map((trait) => trait.fact)).toEqual(['quick', 'hardOnce', 'cost', 'target'])
    expect(visibleTraits(['once']).map((trait) => trait.fact)).toEqual(['once'])
    expect(visibleTraits([])).toEqual([])
  })

  it('cada rasgo lleva el tono con que el texto resalta esa parte: ámbar el rápido, rojo el costo, violeta el objetivo; los límites, sin color', () => {
    const tones = Object.fromEntries(visibleTraits(['quick', 'hardOnce', 'perDuel', 'cost', 'target']).map((trait) => [trait.fact, trait.tone]))

    expect(tones).toEqual({ quick: 'warning', hardOnce: 'neutral', perDuel: 'neutral', cost: 'danger', target: 'brand' })
  })
})

describe('CardEffectTraits: los rasgos confirmados de una carta', () => {
  it('Ash Blossom (14558127): efecto rápido, una vez por turno por nombre y con costo, cada uno con su explicación', async () => {
    render(<CardEffectTraits ygoprodeckId={14558127} />)

    const list = await screen.findByRole('list', { name: 'Rasgos confirmados de los efectos' })
    const traits = within(list).getAllByRole('listitem').map((item) => item.textContent)

    expect(traits).toEqual(['Efecto rápido', '1 vez por turno, por nombre', 'Con costo'])
    expect(within(list).getByText('Efecto rápido')).toHaveAttribute('title', 'Se puede activar en respuesta, también en el turno del rival.')
  })

  it('una carta sin nada confirmado, sin número o inexistente no muestra nada', async () => {
    const view = render(
      <>
        <CardEffectTraits ygoprodeckId={89631139} />
        <CardEffectTraits ygoprodeckId={null} />
        <CardEffectTraits ygoprodeckId={undefined} />
        <CardEffectTraits ygoprodeckId={-5} />
      </>,
    )

    // Se espera a que lleguen los datos (otra carta con rasgos sí los muestra) y las de arriba siguen sin nada.
    view.rerender(
      <>
        <CardEffectTraits ygoprodeckId={89631139} />
        <CardEffectTraits ygoprodeckId={null} />
        <CardEffectTraits ygoprodeckId={undefined} />
        <CardEffectTraits ygoprodeckId={-5} />
        <CardEffectTraits ygoprodeckId={14558127} />
      </>,
    )
    await screen.findByText('Efecto rápido')

    expect(screen.getAllByRole('list')).toHaveLength(1)
  })
})
