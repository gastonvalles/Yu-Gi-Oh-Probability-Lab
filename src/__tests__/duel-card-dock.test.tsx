// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
/** El ancho de la carta grande: con el panel de siempre (20 rem), lo que entra hasta 15,5 rem y 24 dvh (el alto de la ventana); con el panel más ancho (`--mat-left`), crece con él hasta 32 dvh. */
const ART_WIDTH = 'w-[min(100%,calc(var(--mat-left,20rem)*31/40),calc(24dvh+max(0px,var(--mat-left,20rem)-20rem)),32dvh)]'
const art = () => screen.getByTitle(/^Arrastrala hacia donde quieras/)
const flipper = () => art().querySelector('[data-flipped]') as HTMLElement

describe('el detalle fijo de la izquierda: la carta se ve como en cualquier detalle', () => {
  it('es un lector: el título del panel arriba y la carta grande dentro de su marco, del ancho que deja el alto de la ventana', () => {
    render(<DuelCardDock peek={peek(blue)} />)

    expect(screen.getByText('Detalle de la carta')).toBeInTheDocument()
    expect(screen.getByTestId('duel-dock-art')).toHaveClass(ART_WIDTH)
    // El marco (el bisel) rodea el hueco donde se inclina la carta.
    expect(art().parentElement?.parentElement).toHaveClass('p-1.5')
  })

  it('el tipo va solo y los números aparte, rotulados: nivel (rango en una Xyz), ATK y DEF; un Link lleva su valor y no tiene DEF; una Mágica, ninguno', () => {
    const stats = () => Array.from(document.querySelectorAll('dl > div')).map((element) => element.textContent)
    const view = render(<DuelCardDock peek={peek(blue)} />)

    expect(screen.getByText('[Normal Monster] Dragon/LIGHT')).toBeInTheDocument()
    expect(stats()).toEqual(['Nivel8', 'ATK3000', 'DEF2500'])

    view.rerender(<DuelCardDock peek={peek({ ...blue, ygoprodeckId: 1, cardType: 'XYZ Monster' })} />)
    expect(stats()).toEqual(['Rango8', 'ATK3000', 'DEF2500'])

    view.rerender(<DuelCardDock peek={peek({ ...blue, ygoprodeckId: 2, cardType: 'Link Monster', level: null, linkValue: 2, def: null })} />)
    expect(stats()).toEqual(['Link2', 'ATK3000'])

    view.rerender(<DuelCardDock peek={peek({ ...blue, ygoprodeckId: 3, cardType: 'Spell Card', race: 'Field', attribute: null, level: null, atk: null, def: null })} />)
    expect(stats()).toEqual([])
  })

  it('se inclina en 3D hacia el mouse y vuelve al irse', async () => {
    render(<DuelCardDock peek={peek(blue)} />)

    fireEvent.pointerMove(art(), { pointerType: 'mouse', clientX: 40, clientY: 10 })
    // La inclinación espera su cuadro (`requestAnimationFrame`).
    await waitFor(() => expect(art().style.rotate).toContain('deg'))

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

    expect(screen.getByTestId('duel-dock-art')).toHaveClass(ART_WIDTH)
    expect(screen.queryByRole('button', { name: ZOOM })).not.toBeInTheDocument()

    view.rerender(<DuelCardDock peek={{ name: 'Carta sin datos', card: null }} />)
    expect(screen.queryByRole('button', { name: ZOOM })).not.toBeInTheDocument()
  })
})
