// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DuelCardDock } from '../components/duel/DuelCardDock'
import type { ApiCardSearchResult } from '../ygoprodeck'

// El arte real lee el store (el aviso de la banlist) y los rasgos piden datos: acá sólo importa cómo se comporta la carta.
vi.mock('../components/CardArt', () => ({
  CardArt: ({ name, remoteUrl }: { name: string; remoteUrl: string | null }) => <img alt={name} src={remoteUrl ?? ''} />,
}))
vi.mock('../components/card-detail/CardEffectTraits', () => ({ CardEffectTraits: () => null }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const cardOf = (ygoprodeckId: number, name: string): ApiCardSearchResult => ({
  name,
  ygoprodeckId,
  cardType: 'Normal Monster',
  frameType: 'normal',
  description: `Texto de ${name}.`,
  race: 'Dragon',
  attribute: 'LIGHT',
  level: 8,
  linkValue: null,
  atk: '3000',
  def: '2500',
  archetype: null,
  ygoprodeckUrl: null,
  imageUrl: `https://images.ygoprodeck.com/images/cards/${ygoprodeckId}.jpg`,
  imageUrlSmall: `https://images.ygoprodeck.com/images/cards_small/${ygoprodeckId}.jpg`,
  banlist: { tcg: null, ocg: null, goat: null },
  genesys: { points: null },
})

const blue = cardOf(89631139, 'Blue-Eyes White Dragon')
const ash = cardOf(14558127, 'Ash Blossom & Joyous Spring')
const peek = (card: ApiCardSearchResult) => ({ name: card.name, card })

const ZOOM = 'Ver la carta en grande'
const art = () => screen.getByTestId('duel-dock-art').firstElementChild as HTMLElement
const flipper = () => art().querySelector('[data-flipped]') as HTMLElement

describe('el detalle fijo de la izquierda: la carta se ve como en cualquier detalle', () => {
  it('no queda pegada al borde de arriba: empieza más abajo, a una altura que no depende del texto de la carta', () => {
    render(<DuelCardDock peek={peek(blue)} />)

    expect(screen.getByTestId('duel-dock-art').parentElement).toHaveClass('pt-[clamp(0.5rem,12dvh,8rem)]')
  })

  it('se inclina en 3D hacia el mouse y vuelve al irse', () => {
    render(<DuelCardDock peek={peek(blue)} />)

    fireEvent.pointerMove(art(), { pointerType: 'mouse', clientX: 40, clientY: 10 })
    expect(art().style.rotate).toContain('deg')

    fireEvent.pointerLeave(art(), { pointerType: 'mouse' })
    expect(art().style.rotate).toBe('')
  })

  it('al tocarla se agranda (la carta en grande, afuera del detalle) y Escape la cierra', () => {
    render(<DuelCardDock peek={peek(blue)} />)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: ZOOM }))
    expect(screen.getByRole('dialog', { name: 'Blue-Eyes White Dragon en grande' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('la carta en grande sigue siendo la que se abrió aunque el detalle pase a otra (el mouse sigue señalando cartas de la mesa por detrás)', () => {
    const view = render(<DuelCardDock peek={peek(blue)} />)

    fireEvent.click(screen.getByRole('button', { name: ZOOM }))
    view.rerender(<DuelCardDock peek={peek(ash)} />)

    expect(screen.getByRole('dialog', { name: 'Blue-Eyes White Dragon en grande' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ash Blossom & Joyous Spring' })).toBeInTheDocument()
  })

  describe('se da vuelta arrastrándola', () => {
    const rect = { height: 200, width: 140, top: 0, left: 0, right: 140, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }
    const dragSideways = () => {
      fireEvent.pointerDown(art(), { pointerId: 1, pointerType: 'touch', clientX: 0, clientY: 100 })
      fireEvent.pointerMove(art(), { pointerId: 1, pointerType: 'touch', clientX: 140, clientY: 100 })
      fireEvent.pointerUp(art(), { pointerId: 1, pointerType: 'touch', clientX: 140, clientY: 100 })
    }

    it('el arrastre la da vuelta y no la agranda; el toque siguiente sí, también de dorso', () => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect)
      render(<DuelCardDock peek={peek(blue)} />)

      expect(flipper()).toHaveAttribute('data-flipped', 'false')

      dragSideways()
      expect(flipper()).toHaveAttribute('data-flipped', 'true')

      // El clic que deja el arrastre no es un toque.
      fireEvent.click(art())
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

      // Un toque de verdad, con la carta de dorso, la agranda.
      fireEvent.click(art())
      expect(screen.getByRole('dialog', { name: 'Blue-Eyes White Dragon en grande' })).toBeInTheDocument()
    })

    it('al pasar a otra carta vuelve al frente: la que se dio vuelta no deja a la siguiente de dorso', () => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(rect)

      const view = render(<DuelCardDock peek={peek(blue)} />)

      dragSideways()
      expect(flipper()).toHaveAttribute('data-flipped', 'true')

      view.rerender(<DuelCardDock peek={peek(ash)} />)
      expect(flipper()).toHaveAttribute('data-flipped', 'false')
    })
  })

  it('lo que no se conoce (boca abajo, o la carta que todavía no llegó) se ve quieto y no se agranda', () => {
    const view = render(<DuelCardDock peek={{ faceDown: true }} />)

    expect(screen.getByTestId('duel-dock-art').parentElement).toHaveClass('pt-[clamp(0.5rem,12dvh,8rem)]')
    expect(screen.queryByRole('button', { name: ZOOM })).not.toBeInTheDocument()

    view.rerender(<DuelCardDock peek={{ name: 'Carta sin datos', card: null }} />)
    expect(screen.queryByRole('button', { name: ZOOM })).not.toBeInTheDocument()
  })
})
