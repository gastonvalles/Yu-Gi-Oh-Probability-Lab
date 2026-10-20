// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CardArt } from '../components/CardArt'
import { CardFlip, FlipHint, useCardFlip } from '../components/card-detail/CardFlip'
import { foilFollowsTurn, foilReleased, tiltHandlers, tiltInPlaceHandlers } from '../components/card-detail/card-tilt'

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

/** Una carta que se gira con un gesto: arrastrada hacia donde sea. De 140 × 200 px (el giro entero pide 112 px de arrastre de costado o 160 de arriba abajo). */
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

const flipper = () => screen.getByTestId('carta').firstElementChild as HTMLElement

/** Arrastra la carta de un punto a otro (con un solo movimiento, como un tirón: la velocidad la fija el reloj de la prueba). */
const drag = (from: [number, number], to: [number, number]) => {
  const carta = screen.getByTestId('carta')

  fireEvent.pointerDown(carta, { pointerId: 1, pointerType: 'touch', clientX: from[0], clientY: from[1] })
  fireEvent.pointerMove(carta, { pointerId: 1, pointerType: 'touch', clientX: to[0], clientY: to[1] })
  fireEvent.pointerUp(carta, { pointerId: 1, pointerType: 'touch', clientX: to[0], clientY: to[1] })
}

describe('girar la carta, con un gesto, en todas las direcciones', () => {
  it('el dorso va del otro lado: el frente se esconde a los lectores de pantalla al darla vuelta, sobre cualquier eje', () => {
    const ref = { current: null }
    const { container, rerender } = render(
      <CardFlip turns={{ x: 0, y: 0 }} flipperRef={ref}>
        <span>frente</span>
      </CardFlip>,
    )
    const flipperElement = container.firstElementChild as HTMLElement
    const [front, back] = Array.from(flipperElement.children)
    const show = (x: number, y: number) =>
      rerender(
        <CardFlip turns={{ x, y }} flipperRef={ref}>
          <span>frente</span>
        </CardFlip>,
      )

    expect(flipperElement).toHaveAttribute('data-flipped', 'false')
    expect(front).not.toHaveAttribute('aria-hidden')
    expect(back).toHaveAttribute('aria-hidden', 'true')

    show(0, 1)
    expect(flipperElement).toHaveAttribute('data-flipped', 'true')
    expect(flipperElement.style.transform).toBe('perspective(3000px) rotateX(0deg) rotateY(180deg)')
    expect(front).toHaveAttribute('aria-hidden', 'true')
    expect(back).not.toHaveAttribute('aria-hidden')

    // De arriba abajo también muestra el dorso; con los dos ejes dados vuelta, otra vez el frente.
    show(1, 0)
    expect(flipperElement).toHaveAttribute('data-flipped', 'true')
    expect(flipperElement.style.transform).toBe('perspective(3000px) rotateX(180deg) rotateY(0deg)')
    show(1, 1)
    expect(flipperElement).toHaveAttribute('data-flipped', 'false')
  })

  it('arrastrarla hacia la derecha la gira de costado siguiendo al dedo y, al soltarla de la mitad en adelante, queda del otro lado', () => {
    render(<FlippableCard />)

    const carta = screen.getByTestId('carta')

    fireEvent.pointerDown(carta, { pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 100 })
    fireEvent.pointerMove(carta, { pointerId: 1, pointerType: 'touch', clientX: 76, clientY: 100 })
    // A mitad de arrastre (56 de 112 px) va a medio giro y sin transición: sigue al dedo.
    expect(flipper().style.transform).toBe('perspective(3000px) rotateX(0deg) rotateY(90deg)')
    expect(flipper().style.transition).toBe('none')

    fireEvent.pointerMove(carta, { pointerId: 1, pointerType: 'touch', clientX: 132, clientY: 100 })
    fireEvent.pointerUp(carta, { pointerId: 1, pointerType: 'touch', clientX: 132, clientY: 100 })
    expect(flipper()).toHaveAttribute('data-flipped', 'true')
    expect(flipper().style.transform).toBe('perspective(3000px) rotateX(0deg) rotateY(180deg)')
    expect(flipper().style.transition).toBe('')
  })

  it('de arriba abajo también: arrastrarla hacia arriba la gira sobre su eje horizontal (hacia abajo, al revés) y la deja del otro lado', () => {
    render(<FlippableCard />)

    const carta = screen.getByTestId('carta')

    fireEvent.pointerDown(carta, { pointerId: 1, pointerType: 'touch', clientX: 70, clientY: 180 })
    fireEvent.pointerMove(carta, { pointerId: 1, pointerType: 'touch', clientX: 70, clientY: 100 })
    // 80 de 160 px: medio giro sobre X, sin tocar el otro eje.
    expect(flipper().style.transform).toBe('perspective(3000px) rotateX(90deg) rotateY(0deg)')

    fireEvent.pointerMove(carta, { pointerId: 1, pointerType: 'touch', clientX: 70, clientY: 20 })
    fireEvent.pointerUp(carta, { pointerId: 1, pointerType: 'touch', clientX: 70, clientY: 20 })
    expect(flipper()).toHaveAttribute('data-flipped', 'true')
    expect(flipper().style.transform).toBe('perspective(3000px) rotateX(180deg) rotateY(0deg)')

    // Hacia abajo gira para el otro lado.
    drag([70, 20], [70, 180])
    expect(flipper()).toHaveAttribute('data-flipped', 'false')
    expect(flipper().style.transform).toBe('perspective(3000px) rotateX(0deg) rotateY(0deg)')
    drag([70, 20], [70, 180])
    expect(flipper().style.transform).toBe('perspective(3000px) rotateX(-180deg) rotateY(0deg)')
  })

  it('en diagonal gira los dos ejes a la vez; y al soltar cada eje termina en su medio giro más cercano', () => {
    render(<FlippableCard />)

    const carta = screen.getByTestId('carta')

    fireEvent.pointerDown(carta, { pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 180 })
    fireEvent.pointerMove(carta, { pointerId: 1, pointerType: 'touch', clientX: 76, clientY: 100 })
    expect(flipper().style.transform).toBe('perspective(3000px) rotateX(90deg) rotateY(90deg)')

    // Suelta con el costado pasado la mitad (a 3/4 de giro) y el de arriba abajo corto (a 1/4): queda dada vuelta de costado y no de arriba abajo.
    fireEvent.pointerMove(carta, { pointerId: 1, pointerType: 'touch', clientX: 104, clientY: 160 })
    fireEvent.pointerUp(carta, { pointerId: 1, pointerType: 'touch', clientX: 104, clientY: 160 })
    expect(flipper().style.transform).toBe('perspective(3000px) rotateX(0deg) rotateY(180deg)')
    expect(flipper()).toHaveAttribute('data-flipped', 'true')
  })

  it('hacia la izquierda la gira hacia el otro lado; un arrastre corto la deja como estaba; un tirón rápido la da vuelta aunque sea corto, también de arriba abajo', () => {
    render(<FlippableCard />)

    drag([132, 100], [20, 100])
    expect(flipper()).toHaveAttribute('data-flipped', 'true')
    expect(flipper().style.transform).toBe('perspective(3000px) rotateX(0deg) rotateY(-180deg)')

    // De vuelta al frente con otro arrastre hacia la izquierda… y uno corto no la mueve.
    drag([132, 100], [20, 100])
    expect(flipper()).toHaveAttribute('data-flipped', 'false')
    drag([100, 100], [80, 100])
    drag([100, 100], [100, 85])
    expect(flipper()).toHaveAttribute('data-flipped', 'false')

    // Un tirón de 40 px (menos de un tercio de giro) pero en un instante: la da vuelta, de costado o de arriba abajo.
    drag([20, 100], [60, 100])
    expect(flipper()).toHaveAttribute('data-flipped', 'true')
    drag([70, 60], [70, 100])
    expect(flipper()).toHaveAttribute('data-flipped', 'false')
  })

  it('un toque no es el gesto, y el clic que deja un arrastre (hacia donde sea) no cuenta como toque', () => {
    render(<FlippableCard />)

    const carta = screen.getByTestId('carta')

    fireEvent.pointerDown(carta, { pointerId: 1, pointerType: 'touch', clientX: 70, clientY: 100 })
    fireEvent.pointerUp(carta, { pointerId: 1, pointerType: 'touch', clientX: 72, clientY: 101 })
    expect(flipper()).toHaveAttribute('data-flipped', 'false')
    expect(consumeClick()).toBe(false)

    drag([20, 100], [132, 100])
    expect(flipper()).toHaveAttribute('data-flipped', 'true')
    expect(consumeClick()).toBe(true)
    // Una sola vez: el toque siguiente sí cuenta.
    expect(consumeClick()).toBe(false)

    drag([70, 180], [70, 20])
    expect(consumeClick()).toBe(true)
  })

  it('el brillo va pegado al frente de la carta (gira con ella y se esconde con el dorso), no suelto afuera donde quedaba flotando', () => {
    const { container } = render(
      <CardFlip turns={{ x: 0, y: 0 }} flipperRef={{ current: null }}>
        <span>frente</span>
      </CardFlip>,
    )
    const [front, back] = Array.from((container.firstElementChild as HTMLElement).children)

    expect(front!.querySelector('[class*="glare"]')).not.toBeNull()
    expect(back!.querySelector('[class*="glare"]')).toBeNull()
  })

  it('mientras se arrastra, la inclinación hacia el mouse (y su brillo) queda apagada aunque el mouse siga moviéndose; al soltar vuelve a seguirlo', () => {
    function Both() {
      const flip = useCardFlip()

      return (
        <div
          data-testid="carta"
          ref={(element) => {
            if (element) element.getBoundingClientRect = () => ({ height: 200, width: 140, top: 0, left: 0, right: 140, bottom: 200, x: 0, y: 0, toJSON: () => ({}) })
          }}
          onPointerDown={(event) => {
            tiltHandlers.onPointerDown(event)
            flip.onPointerDown(event)
          }}
          onPointerMove={(event) => {
            tiltHandlers.onPointerMove(event)
            flip.onPointerMove(event)
          }}
          onPointerUp={flip.onPointerUp}
          onPointerCancel={flip.onPointerCancel}
        >
          <CardFlip turns={flip.turns} flipperRef={flip.flipperRef}>
            <span>frente</span>
          </CardFlip>
        </div>
      )
    }

    render(<Both />)

    const carta = screen.getByTestId('carta')
    const mouse = { pointerId: 1, pointerType: 'mouse', buttons: 1 }

    // Pasando por encima, sin arrastrar, se inclina hacia el mouse.
    fireEvent.pointerMove(carta, { ...mouse, buttons: 0, clientX: 90, clientY: 100 })
    expect(carta.dataset.tilting).toBe('true')

    fireEvent.pointerDown(carta, { ...mouse, button: 0, clientX: 70, clientY: 100 })
    fireEvent.pointerMove(carta, { ...mouse, clientX: 100, clientY: 100 })
    expect(carta.dataset.tilting).toBe('false')
    // Cada movimiento del mouse la volvería a encender: tiene que seguir apagada.
    fireEvent.pointerMove(carta, { ...mouse, clientX: 110, clientY: 104 })
    fireEvent.pointerMove(carta, { ...mouse, clientX: 120, clientY: 106 })
    expect(carta.dataset.tilting).toBe('false')

    fireEvent.pointerUp(carta, { ...mouse, buttons: 0, clientX: 120, clientY: 106 })
    fireEvent.pointerMove(carta, { ...mouse, buttons: 0, clientX: 90, clientY: 100 })
    expect(carta.dataset.tilting).toBe('true')
  })

  it('mientras se gira, la luz del foil sigue la orientación de la carta (no vuelve a la deriva), y al terminar se suelta', () => {
    render(<FlippableCard />)

    const carta = screen.getByTestId('carta')
    const light = () => [flipper().style.getPropertyValue('--foil-px'), flipper().style.getPropertyValue('--foil-py'), flipper().style.getPropertyValue('--foil-d')]

    expect(light()).toEqual(['', '', ''])

    // Arrastrada hacia la derecha (medio giro por 112 px): la luz va hacia la derecha a medida que se hunde ese lado, y llega al borde casi de canto.
    fireEvent.pointerDown(carta, { pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 100 })
    fireEvent.pointerMove(carta, { pointerId: 1, pointerType: 'touch', clientX: 40, clientY: 100 })
    const [slightX, slightY, slightD] = light()

    expect(parseFloat(slightX!)).toBeGreaterThan(50)
    expect(slightY).toBe('50%')
    expect(Number(slightD)).toBeGreaterThan(0)

    fireEvent.pointerMove(carta, { pointerId: 1, pointerType: 'touch', clientX: 70, clientY: 100 })
    const [farX, , farD] = light()

    expect(parseFloat(farX!)).toBeGreaterThan(parseFloat(slightX!))
    expect(Number(farD)).toBeGreaterThan(Number(slightD))

    // De arriba abajo, la luz va hacia abajo; hacia la izquierda, hacia la izquierda.
    fireEvent.pointerMove(carta, { pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 140 })
    expect(parseFloat(flipper().style.getPropertyValue('--foil-py'))).toBeGreaterThan(50)
    expect(flipper().style.getPropertyValue('--foil-px')).toBe('50%')
    fireEvent.pointerMove(carta, { pointerId: 1, pointerType: 'touch', clientX: -20, clientY: 100 })
    expect(parseFloat(flipper().style.getPropertyValue('--foil-px'))).toBeLessThan(50)

    // Al soltar, el foil vuelve a moverse solo.
    fireEvent.pointerUp(carta, { pointerId: 1, pointerType: 'touch', clientX: -20, clientY: 100 })
    expect(light()).toEqual(['', '', ''])
  })

  it('foilFollowsTurn: plana la luz está en el centro; con medio giro (de frente o de dorso) vuelve a estar plana; foilReleased la suelta', () => {
    const element = document.createElement('div')
    const read = () => [element.style.getPropertyValue('--foil-px'), element.style.getPropertyValue('--foil-py'), element.style.getPropertyValue('--foil-d')]

    foilFollowsTurn(element, 0, 0)
    expect(read()).toEqual(['50%', '50%', '0'])
    foilFollowsTurn(element, 0, 180)
    expect(read()).toEqual(['50%', '50%', '0'])
    foilFollowsTurn(element, 360, -180)
    expect(read()).toEqual(['50%', '50%', '0'])

    // Casi de canto (80°): la luz llega al borde derecho; de canto del otro lado (−80°), al izquierdo.
    foilFollowsTurn(element, 0, 80)
    expect(read()).toEqual(['100%', '50%', '1'])
    foilFollowsTurn(element, 0, -80)
    expect(read()).toEqual(['0%', '50%', '1'])

    foilReleased(element)
    expect(read()).toEqual(['', '', ''])
  })

  it('cancelar el gesto (un segundo dedo que viene a pellizcar) deja la carta como estaba y suelta el foil', () => {
    let cancel = () => {}

    function Cancelable() {
      const flip = useCardFlip()

      cancel = flip.cancel

      return (
        <div data-testid="carta" onPointerDown={flip.onPointerDown} onPointerMove={flip.onPointerMove} onPointerUp={flip.onPointerUp}>
          <CardFlip turns={flip.turns} flipperRef={flip.flipperRef}>
            <span>frente</span>
          </CardFlip>
        </div>
      )
    }

    render(<Cancelable />)

    const carta = screen.getByTestId('carta')

    fireEvent.pointerDown(carta, { pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 100 })
    fireEvent.pointerMove(carta, { pointerId: 1, pointerType: 'touch', clientX: 70, clientY: 100 })
    expect(flipper().style.transform).not.toBe('perspective(3000px) rotateX(0deg) rotateY(0deg)')

    act(() => cancel())
    expect(flipper().style.transform).toBe('perspective(3000px) rotateX(0deg) rotateY(0deg)')
    expect(flipper().style.getPropertyValue('--foil-px')).toBe('')
    expect(flipper()).toHaveAttribute('data-flipped', 'false')

    // Sin gesto en curso no hace nada.
    act(() => cancel())
    expect(flipper().style.transform).toBe('perspective(3000px) rotateX(0deg) rotateY(0deg)')
  })

  it('la pista del gesto sale las primeras tres veces y después ya no', () => {
    window.localStorage.clear()

    for (let time = 0; time < 3; time += 1) {
      const { unmount } = render(<FlipHint />)

      expect(screen.getByText('✥ Arrastrá para girarla')).toBeInTheDocument()
      unmount()
    }

    render(<FlipHint />)
    expect(screen.queryByText(/Arrastrá para girarla/)).not.toBeInTheDocument()
  })
})

describe('la carta nunca se queda trabada a medio giro (Gastón, 2026-10-20: «volvimos a tener este problema»: la carta quedó de canto)', () => {
  const touch = (pointerId: number, clientX: number, clientY: number, extra: Record<string, unknown> = {}) => ({ pointerId, pointerType: 'touch', clientX, clientY, ...extra })
  /** Un giro cabal: el medio giro más cercano, sin quedar a medias (múltiplo de 180°). */
  const settled = () => {
    const [x, y] = [...flipper().style.transform.matchAll(/rotate[XY]\((-?[\d.]+)deg\)/g)].map((match) => Number(match[1]))

    return Math.abs(x! % 180) < 0.01 && Math.abs(y! % 180) < 0.01
  }

  it('con dos dedos: el segundo no pisa al primero y, al soltar el primero, el giro termina en un medio giro', () => {
    render(<FlippableCard />)
    const carta = screen.getByTestId('carta')

    fireEvent.pointerDown(carta, touch(11, 20, 100))
    fireEvent.pointerMove(carta, touch(11, 90, 100))
    expect(settled()).toBe(false)

    // Baja un segundo dedo: no cambia el gesto en curso.
    fireEvent.pointerDown(carta, touch(12, 30, 150))
    fireEvent.pointerMove(carta, touch(11, 110, 100))
    fireEvent.pointerUp(carta, touch(11, 110, 100, { buttons: 0 }))
    expect(settled()).toBe(true)

    // Y el «soltar» del segundo dedo ya no cambia nada.
    const after = flipper().style.transform

    fireEvent.pointerUp(carta, touch(12, 30, 150, { buttons: 0 }))
    expect(flipper().style.transform).toBe(after)
  })

  it('el «soltar» de otro dedo no termina el giro del primero (sigue girando) y el del primero sí', () => {
    render(<FlippableCard />)
    const carta = screen.getByTestId('carta')

    fireEvent.pointerDown(carta, touch(21, 70, 20))
    fireEvent.pointerMove(carta, touch(21, 70, 100))
    fireEvent.pointerDown(carta, touch(22, 30, 30))
    fireEvent.pointerUp(carta, touch(22, 30, 30, { buttons: 0 }))
    expect(settled()).toBe(false)

    fireEvent.pointerMove(carta, touch(21, 70, 120))
    expect(settled()).toBe(false)
    fireEvent.pointerUp(carta, touch(21, 70, 120, { buttons: 0 }))
    expect(settled()).toBe(true)
  })

  it('si el «soltar» cae en otro lado (otro elemento se quedó con el puntero), la ventana lo ve y el giro termina', () => {
    render(<FlippableCard />)
    const carta = screen.getByTestId('carta')

    fireEvent.pointerDown(carta, touch(31, 70, 20))
    fireEvent.pointerMove(carta, touch(31, 70, 100))
    expect(settled()).toBe(false)

    fireEvent.pointerUp(window, touch(31, 70, 100, { buttons: 0 }))
    expect(settled()).toBe(true)
    // El gesto terminó: un movimiento más no vuelve a girarla.
    const after = flipper().style.transform

    fireEvent.pointerMove(carta, touch(31, 70, 180))
    expect(flipper().style.transform).toBe(after)
  })

  it('si el navegador cancela el toque o la ventana pierde el foco a mitad del gesto, la carta vuelve a su medio giro de antes', () => {
    render(<FlippableCard />)
    const carta = screen.getByTestId('carta')

    fireEvent.pointerDown(carta, touch(41, 70, 20))
    fireEvent.pointerMove(carta, touch(41, 70, 100))
    fireEvent.pointerCancel(window, touch(41, 70, 100))
    expect(flipper().style.transform).toBe('perspective(3000px) rotateX(0deg) rotateY(0deg)')

    fireEvent.pointerDown(carta, touch(42, 20, 100))
    fireEvent.pointerMove(carta, touch(42, 90, 100))
    expect(settled()).toBe(false)
    fireEvent.blur(window)
    expect(flipper().style.transform).toBe('perspective(3000px) rotateX(0deg) rotateY(0deg)')
  })

  it('el mouse que se movió sin el botón apretado (el «soltar» se perdió fuera de la ventana) ya no sigue girando la carta', () => {
    render(<FlippableCard />)
    const carta = screen.getByTestId('carta')
    const mouse = (clientX: number, buttons: number) => ({ pointerId: 1, pointerType: 'mouse', button: 0, buttons, clientX, clientY: 100 })

    fireEvent.pointerDown(carta, mouse(20, 1))
    fireEvent.pointerMove(carta, mouse(90, 1))
    expect(settled()).toBe(false)

    fireEvent.pointerMove(carta, mouse(110, 0))
    expect(settled()).toBe(true)

    const after = flipper().style.transform

    fireEvent.pointerMove(carta, mouse(40, 0))
    expect(flipper().style.transform).toBe(after)
  })
})
