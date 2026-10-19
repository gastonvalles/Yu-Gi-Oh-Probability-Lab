// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CardArt } from '../components/CardArt'
import { CardFlip, CardFlipButton } from '../components/card-detail/CardFlip'
import { tiltHandlers, tiltInPlaceHandlers } from '../components/card-detail/card-tilt'

// El aviso de la banlist lee el store: acá sólo importa cómo se mueve la carta.
vi.mock('../components/CardLimitBadge', () => ({ CardLimitBadge: () => null }))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  // @ts-expect-error: se vuelve a como lo deja jsdom (sin `matchMedia`).
  delete window.matchMedia
})

const tilting = (element: HTMLElement) => element.dataset.tilting

describe('la carta se inclina en 3D', () => {
  it('con el mouse, hacia el puntero mientras pasa por encima, y vuelve al irse', () => {
    render(<div data-testid="carta" {...tiltInPlaceHandlers} />)

    const carta = screen.getByTestId('carta')

    fireEvent.pointerMove(carta, { pointerType: 'mouse', clientX: 40, clientY: 10 })
    expect(carta.style.transform).toContain('perspective(900px) rotate3d(')
    expect(tilting(carta)).toBe('true')

    fireEvent.pointerLeave(carta, { pointerType: 'mouse' })
    expect(carta.style.transform).toBe('')
    expect(tilting(carta)).toBe('false')
  })

  it('con el dedo, se hunde del lado que se toca y vuelve a su lugar al soltarlo (donde se suelte)', () => {
    render(<div data-testid="carta" {...tiltInPlaceHandlers} />)

    const carta = screen.getByTestId('carta')

    fireEvent.pointerDown(carta, { pointerType: 'touch', clientX: 40, clientY: 10 })
    expect(carta.style.transform).toContain('rotate3d(')
    expect(tilting(carta)).toBe('true')

    // El puntero lo puede haber capturado otra cosa (arrastrar la carta): lo suelta la ventana.
    fireEvent.pointerUp(window, { pointerType: 'touch' })
    expect(carta.style.transform).toBe('')
    expect(tilting(carta)).toBe('false')
  })

  it('un dedo que no está tocando no inclina nada, y si el navegador cancela el toque (se desplaza la pantalla) la carta vuelve', () => {
    render(<div data-testid="carta" {...tiltInPlaceHandlers} />)

    const carta = screen.getByTestId('carta')

    fireEvent.pointerMove(carta, { pointerType: 'touch', buttons: 0, clientX: 40, clientY: 10 })
    expect(carta.style.transform).toBe('')

    fireEvent.pointerDown(carta, { pointerType: 'touch', clientX: 40, clientY: 10 })
    fireEvent.pointerCancel(window, { pointerType: 'touch' })
    expect(tilting(carta)).toBe('false')
  })

  it('con movimiento reducido no se inclina', () => {
    // jsdom no trae `matchMedia`.
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia
    render(<div data-testid="carta" {...tiltInPlaceHandlers} />)

    const carta = screen.getByTestId('carta')

    fireEvent.pointerMove(carta, { pointerType: 'mouse', clientX: 40, clientY: 10 })
    fireEvent.pointerDown(carta, { pointerType: 'touch', clientX: 40, clientY: 10 })
    expect(carta.style.transform).toBe('')
  })

  it('la carta grande se inclina por `rotate` (el vuelo del detalle usa `transform`)', () => {
    render(<div data-testid="carta" {...tiltHandlers} />)

    const carta = screen.getByTestId('carta')

    fireEvent.pointerDown(carta, { pointerType: 'touch', clientX: 40, clientY: 10 })
    expect(carta.style.rotate).toContain('deg')
    fireEvent.pointerUp(window, { pointerType: 'touch' })
    expect(carta.style.rotate).toBe('')
  })

  it('`CardArt` con `tilt` lleva la inclinación y el brillo; sin él, no', () => {
    const { container, unmount } = render(<CardArt tilt remoteUrl="https://images.ygoprodeck.com/images/cards/1.jpg" name="Carta" />)
    const frame = container.firstElementChild as HTMLElement

    fireEvent.pointerMove(frame, { pointerType: 'mouse', clientX: 30, clientY: 20 })
    expect(frame.style.transform).toContain('perspective(900px)')
    expect(frame.querySelector('[class*="glare"]')).not.toBeNull()

    unmount()

    const { container: other } = render(<CardArt remoteUrl="https://images.ygoprodeck.com/images/cards/1.jpg" name="Carta" />)
    const plain = other.firstElementChild as HTMLElement

    fireEvent.pointerMove(plain, { pointerType: 'mouse', clientX: 30, clientY: 20 })
    expect(plain.style.transform).toBe('')
  })
})

describe('dar vuelta la carta', () => {
  it('muestra el dorso del otro lado: el frente se esconde a los lectores de pantalla al darla vuelta', () => {
    const { container, rerender } = render(
      <CardFlip flipped={false}>
        <span>frente</span>
      </CardFlip>,
    )
    const flipper = container.firstElementChild as HTMLElement
    const [front, back] = Array.from(flipper.children)

    expect(flipper).toHaveAttribute('data-flipped', 'false')
    expect(front).not.toHaveAttribute('aria-hidden')
    expect(back).toHaveAttribute('aria-hidden', 'true')

    rerender(
      <CardFlip flipped>
        <span>frente</span>
      </CardFlip>,
    )
    expect(flipper).toHaveAttribute('data-flipped', 'true')
    expect(flipper.style.transform).toBe('rotateY(180deg)')
    expect(front).toHaveAttribute('aria-hidden', 'true')
    expect(back).not.toHaveAttribute('aria-hidden')
  })

  it('el botón dice qué hace, avisa si está dada vuelta y no agranda la carta que tiene debajo', () => {
    const onToggle = vi.fn()
    const onParentClick = vi.fn()
    const { rerender } = render(
      <div onClick={onParentClick}>
        <CardFlipButton flipped={false} onToggle={onToggle} />
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Dar vuelta: ver el dorso' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onParentClick).not.toHaveBeenCalled()

    rerender(
      <div onClick={onParentClick}>
        <CardFlipButton flipped onToggle={onToggle} />
      </div>,
    )
    expect(screen.getByRole('button', { name: 'Dar vuelta: ver el frente' })).toHaveAttribute('aria-pressed', 'true')
  })
})
