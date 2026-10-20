// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'

import { DuelCardDock } from '../components/duel/DuelCardDock'
import { CardMenu } from '../components/probability/MatDialogs'
import { CardSheet } from '../components/probability/CardSheet'
import type { ApiCardReference } from '../types'

const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

const ash = {
  ygoprodeckId: 14558127,
  cardType: 'Tuner Monster',
  frameType: 'effect',
  description: 'When a card or effect is activated that includes any of these effects (Quick Effect): You can discard this card; negate that effect. You can only use this effect of "Ash Blossom & Joyous Spring" once per turn.',
  race: 'Zombie',
  attribute: 'FIRE',
  level: 3,
  linkValue: null,
  atk: '0',
  def: '1800',
  archetype: null,
  ygoprodeckUrl: null,
  imageUrl: null,
  imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null },
  genesys: { points: null },
} as ApiCardReference

const inStore = (ui: React.ReactElement) => render(<Provider store={store}>{ui}</Provider>)

describe('los rasgos confirmados de una carta salen donde se decide jugarla', () => {
  it('en la hoja del celular (junto a su tipo)', async () => {
    inStore(<CardSheet name="Ash Blossom" kicker="Mano" art={null} apiCard={ash} items={[]} onClose={vi.fn()} />)

    expect(await screen.findByText('Efecto rápido')).toBeInTheDocument()
    expect(screen.getByText('1 vez por turno, por nombre')).toBeInTheDocument()
    expect(screen.getByText('Con costo')).toBeInTheDocument()
  })

  it('el menú pegado a la carta (escritorio) no los repite: el detalle de la carta (fijo a la izquierda, o «Ver carta») ya los dice', async () => {
    inStore(<CardMenu anchor={new DOMRect(100, 100, 60, 90)} kicker="Mano" title="Ash Blossom" items={[]} onClose={vi.fn()} />)
    // Se da tiempo a que lleguen los datos.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(screen.getByRole('menu', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(screen.queryByText('Efecto rápido')).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Rasgos confirmados de los efectos' })).not.toBeInTheDocument()
  })

  it('en el detalle fijo del duelo, arriba del texto; una carta boca abajo no lleva nada', async () => {
    const view = inStore(<DuelCardDock peek={{ name: 'Ash Blossom', card: ash }} />)

    expect(await screen.findByText('Efecto rápido')).toBeInTheDocument()

    view.rerender(
      <Provider store={store}>
        <DuelCardDock peek={{ faceDown: true }} />
      </Provider>,
    )
    expect(screen.queryByText('Efecto rápido')).not.toBeInTheDocument()
  })

  it('una carta sin nada confirmado no suma ningún rasgo', async () => {
    inStore(<CardSheet name="Blue-Eyes" kicker="Mano" art={null} apiCard={{ ...ash, ygoprodeckId: 89631139, description: 'This legendary dragon is a powerful engine of destruction.' }} items={[]} onClose={vi.fn()} />)
    // Se da tiempo a que lleguen los datos.
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(screen.queryByRole('list', { name: 'Rasgos confirmados de los efectos' })).not.toBeInTheDocument()
  })
})
