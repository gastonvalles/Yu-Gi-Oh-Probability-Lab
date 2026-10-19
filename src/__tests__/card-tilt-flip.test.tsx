// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CardArt } from '../components/CardArt'
import { CardFlip, FlipHint, useCardFlip } from '../components/card-detail/CardFlip'
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

/** Una carta que se da vuelta con un gesto: arrastrada de costado. Ancha de 140 px (el giro entero pide 112 px de arrastre). */
let consumeClick: () => boolean

function FlippableCard() {
  const flip = useCardFlip()

  consumeClick = flip.consumeClick

  return (
    <div
      data-testid="carta"
      ref={(element) => {
        if (element) element.getBoundingClientRect = () => ({ height: 200, width: 140, top: 0, left: 0, right: 140, bottom: 200, x: 0, y: 0, toJSON: () => ({}) })
      }}
      onPointerDown={flip.onPointerDown}
      onPointerMove={flip.onPointerMove}
      onPointerUp={flip.onPointerUp}
      onPointerCancel={flip.onPointerCancel}
    >
      <CardFlip turns={flip.turns} flipperRef={flip.flipperRef}>
        <span>frente</span>
      </CardFlip>
    </div>
  )
}

const flipper = () => screen.getByTestId("carta").firstElementChild as HTMLElement

const drag = (from: number, to: number, y = 100) => {
  const carta = screen.getByTestId("carta")

  fireEvent.pointerDown(carta, { pointerId: 1, pointerType: "touch", clientX: from, clientY: y })
  fireEvent.pointerMove(carta, { pointerId: 1, pointerType: "touch", clientX: to, clientY: y })
  fireEvent.pointerUp(carta, { pointerId: 1, pointerType: "touch", clientX: to, clientY: y })
}

describe('dar vuelta la carta, con un gesto', () => {
  it('el dorso va del otro lado: el frente se esconde a los lectores de pantalla al darla vuelta', () => {
    const ref = { current: null }
    const { container, rerender } = render(
      <CardFlip turns={0} flipperRef={ref}>
        <span>frente</span>
      </CardFlip>,
    )
    const flipperElement = container.firstElementChild as HTMLElement
    const [front, back] = Array.from(flipperElement.children)

    expect(flipperElement).toHaveAttribute('data-flipped', 'false')
    expect(front).not.toHaveAttribute('aria-hidden')
    expect(back).toHaveAttribute('aria-hidden', 'true')

    rerender(
      <CardFlip turns={1} flipperRef={ref}>
        <span>frente</span>
      </CardFlip>,
    )
    expect(flipperElement).toHaveAttribute('data-flipped', 'true')
    expect(flipperElement.style.transform).toBe('perspective(3000px) rotateY(180deg)')
    expect(front).toHaveAttribute('aria-hidden', 'true')
    expect(back).not.toHaveAttribute('aria-hidden')
  })

  it('arrastrarla hacia la derecha la gira siguiendo al dedo y, al soltarla de la mitad en adelante, queda del otro lado', () => {
    render(<FlippableCard />)

    const carta = screen.getByTestId("carta")

    fireEvent.pointerDown(carta, { pointerId: 1, pointerType: "touch", clientX: 20, clientY: 100 })
    fireEvent.pointerMove(carta, { pointerId: 1, pointerType: "touch", clientX: 76, clientY: 100 })
    // A mitad de arrastre (56 de 112 px) va a medio giro y sin transición: sigue al dedo.
    expect(flipper().style.transform).toBe('perspective(3000px) rotateY(90deg)')
    expect(flipper().style.transition).toBe('none')

    fireEvent.pointerMove(carta, { pointerId: 1, pointerType: "touch", clientX: 132, clientY: 100 })
    fireEvent.pointerUp(carta, { pointerId: 1, pointerType: "touch", clientX: 132, clientY: 100 })
    expect(flipper()).toHaveAttribute('data-flipped', 'true')
    expect(flipper().style.transform).toBe('perspective(3000px) rotateY(180deg)')
    expect(flipper().style.transition).toBe('')
  })

  it('hacia la izquierda la da vuelta hacia el otro lado; un arrastre corto la deja como estaba; un tirón rápido la da vuelta aunque sea corto', () => {
    render(<FlippableCard />)

    drag(132, 20)
    expect(flipper()).toHaveAttribute('data-flipped', 'true')
    expect(flipper().style.transform).toBe('perspective(3000px) rotateY(-180deg)')

    // De vuelta al frente con otro arrastre hacia la izquierda… y uno corto no la mueve.
    drag(132, 20)
    expect(flipper()).toHaveAttribute('data-flipped', 'false')
    drag(100, 80)
    expect(flipper()).toHaveAttribute('data-flipped', 'false')

    // Un tirón de 40 px (menos de un tercio de giro) pero en un instante: la da vuelta.
    drag(20, 60)
    expect(flipper()).toHaveAttribute('data-flipped', 'true')
  })

  it('lo vertical no es el gesto (desplaza la pantalla), un toque tampoco, y el clic que deja un arrastre no cuenta como toque', () => {
    render(<FlippableCard />)

    const carta = screen.getByTestId("carta")

    fireEvent.pointerDown(carta, { pointerId: 1, pointerType: "touch", clientX: 70, clientY: 20 })
    fireEvent.pointerMove(carta, { pointerId: 1, pointerType: "touch", clientX: 78, clientY: 140 })
    fireEvent.pointerUp(carta, { pointerId: 1, pointerType: "touch", clientX: 78, clientY: 140 })
    expect(flipper()).toHaveAttribute('data-flipped', 'false')
    expect(consumeClick()).toBe(false)

    drag(20, 132)
    expect(flipper()).toHaveAttribute('data-flipped', 'true')
    expect(consumeClick()).toBe(true)
    // Una sola vez: el toque siguiente sí cuenta.
    expect(consumeClick()).toBe(false)
  })
  it('la pista del gesto sale las primeras tres veces y después ya no', () => {
    window.localStorage.clear()

    for (let time = 0; time < 3; time += 1) {
      const { unmount } = render(<FlipHint />)

      expect(screen.getByText('↔ Deslizá para dar vuelta')).toBeInTheDocument()
      unmount()
    }

    render(<FlipHint />)
    expect(screen.queryByText(/Deslizá para dar vuelta/)).not.toBeInTheDocument()
  })
})
