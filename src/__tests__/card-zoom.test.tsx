// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'

import { CardZoom } from '../components/card-detail/CardZoom'
import type { ApiCardReference } from '../types'

// El aviso de límite de copias de la carta lee el formato del store.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

const card = {
  ygoprodeckId: 1,
  cardType: 'Effect Monster',
  frameType: 'effect',
  description: null,
  race: null,
  attribute: null,
  level: 4,
  linkValue: null,
  atk: '0',
  def: '0',
  archetype: null,
  ygoprodeckUrl: null,
  imageUrl: null,
  imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null },
  genesys: { points: null },
} as ApiCardReference

describe('la carta en grande', () => {
  it('se cierra con la X, con Escape o al tocar el fondo; tocar la carta no cierra nada', () => {
    const onClose = vi.fn()
    render(
      <Provider store={store}>
        <CardZoom card={card} name="Maxx" onClose={onClose} />
      </Provider>,
    )

    const dialog = screen.getByRole('dialog', { name: 'Maxx en grande' })

    // La carta se toca sin cerrar el zoom.
    fireEvent.click(screen.getByTitle(/Arrastrala/))
    expect(onClose).not.toHaveBeenCalled()

    // Afuera de la carta, el fondo, sí.
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalledTimes(2)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('con vecinos lleva las flechas a los costados (y ← → también); hacia el lado donde no hay carta la flecha no se muestra, y ninguna cierra el zoom', () => {
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    const onClose = vi.fn()

    render(
      <Provider store={store}>
        <CardZoom card={card} name="Maxx" navigation={{ onPrevious, onNext }} onClose={onClose} />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Carta anterior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Carta siguiente' }))
    expect(onPrevious).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(window, { key: 'ArrowLeft' })
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(onPrevious).toHaveBeenCalledTimes(2)
    expect(onNext).toHaveBeenCalledTimes(2)
    // Con una tecla de edición, las flechas no pasan de carta.
    fireEvent.keyDown(window, { key: 'ArrowRight', ctrlKey: true })
    expect(onNext).toHaveBeenCalledTimes(2)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('en la punta de la lista no hay flecha hacia ese lado, y sin vecinos no hay ninguna', () => {
    const { rerender } = render(
      <Provider store={store}>
        <CardZoom card={card} name="Maxx" navigation={{ onPrevious: null, onNext: () => {} }} onClose={() => {}} />
      </Provider>,
    )

    expect(screen.queryByRole('button', { name: 'Carta anterior' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Carta siguiente' })).toBeInTheDocument()

    rerender(
      <Provider store={store}>
        <CardZoom card={card} name="Maxx" onClose={() => {}} />
      </Provider>,
    )
    expect(screen.queryByRole('button', { name: /^Carta (anterior|siguiente)$/ })).not.toBeInTheDocument()
  })

  it('al pasar a otra carta vuelve al frente (la que se había dado vuelta no queda del otro lado)', () => {
    const view = render(
      <Provider store={store}>
        <CardZoom card={card} name="Maxx" onClose={() => {}} />
      </Provider>,
    )
    const flipped = () => view.container.ownerDocument.querySelector('[data-flipped]')?.getAttribute('data-flipped')

    fireEvent.keyDown(window, { key: 'f' })
    expect(flipped()).toBe('true')

    view.rerender(
      <Provider store={store}>
        <CardZoom card={{ ...card, ygoprodeckId: 2 }} name="Otra" onClose={() => {}} />
      </Provider>,
    )
    expect(flipped()).toBe('false')
  })
})

const effectCard = { ...card, description: 'When this card is Special Summoned: You can discard 1 card; draw 2 cards. You can only use this effect of "Maxx" once per turn.' } as ApiCardReference

describe('la barra de abajo de la carta en grande', () => {
  const open = (props: Partial<Parameters<typeof CardZoom>[0]> = {}) =>
    render(
      <Provider store={store}>
        <CardZoom card={effectCard} name="Maxx" onClose={vi.fn()} {...props} />
      </Provider>,
    )
  const frame = () => screen.getByTitle(/Arrastrala/)

  it('acerca y aleja de a un paso (100, 150, 200, 300 %), el porcentaje lo vuelve al 100 % y en las puntas el botón queda apagado', () => {
    open()
    const zoomIn = screen.getByRole('button', { name: 'Acercar' })
    const zoomOut = screen.getByRole('button', { name: 'Alejar' })
    const reset = screen.getByRole('button', { name: 'Volver al 100 %' })

    expect(reset).toHaveTextContent('100%')
    expect(zoomOut).toBeDisabled()
    expect(reset).toBeDisabled()

    fireEvent.click(zoomIn)
    expect(reset).toHaveTextContent('150%')
    fireEvent.click(zoomIn)
    fireEvent.click(zoomIn)
    expect(reset).toHaveTextContent('300%')
    expect(zoomIn).toBeDisabled()

    fireEvent.click(zoomOut)
    expect(reset).toHaveTextContent('200%')
    fireEvent.click(reset)
    expect(reset).toHaveTextContent('100%')
  })

  it('Ctrl + la rueda (o el pellizco del trackpad) cambia el zoom de a un paso y no acerca la página; la rueda sola no hace nada (desplaza la carta)', () => {
    open()
    const reset = screen.getByRole('button', { name: 'Volver al 100 %' })
    const canvas = screen.getByRole('dialog').querySelector('[class*="touch-action"]')!
    const wheel = (init: WheelEventInit) => {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })

      act(() => {
        canvas.dispatchEvent(event)
      })

      return event
    }

    // Sin Ctrl no hay zoom (y no se frena: la rueda desplaza).
    expect(wheel({ deltaY: -120 }).defaultPrevented).toBe(false)
    expect(reset).toHaveTextContent('100%')

    // Con Ctrl, hacia arriba acerca (y el navegador no acerca la página); un movimiento chico no alcanza para un paso; sumados, sí.
    expect(wheel({ deltaY: -120, ctrlKey: true }).defaultPrevented).toBe(true)
    expect(reset).toHaveTextContent('150%')
    wheel({ deltaY: -10, ctrlKey: true })
    expect(reset).toHaveTextContent('150%')
    wheel({ deltaY: -35, ctrlKey: true })
    expect(reset).toHaveTextContent('200%')

    // Hacia abajo aleja, de a un paso, también con Cmd.
    wheel({ deltaY: 120, metaKey: true })
    expect(reset).toHaveTextContent('150%')
  })

  it('pellizcar con dos dedos acerca o aleja de a un paso (no la página) y cancela el giro que había empezado el primer dedo', () => {
    open()
    const reset = screen.getByRole('button', { name: 'Volver al 100 %' })
    const canvas = screen.getByRole('dialog').querySelector('[class*="touch-action"]')!
    const touches = (distance: number) => [{ clientX: 100 - distance / 2, clientY: 200 }, { clientX: 100 + distance / 2, clientY: 200 }]

    expect(canvas.className).toContain('[touch-action:pan-x_pan-y]')

    // El primer dedo ya empezó a girar la carta.
    fireEvent.pointerDown(frame(), { pointerId: 1, pointerType: 'touch', clientX: 20, clientY: 100 })
    fireEvent.pointerMove(frame(), { pointerId: 1, pointerType: 'touch', clientX: 80, clientY: 100 })
    expect(frame().querySelector('[data-flipped]')!.getAttribute('style')).not.toContain('rotateY(0deg)')

    fireEvent.touchStart(canvas, { touches: touches(100) })
    expect(frame().querySelector('[data-flipped]')!.getAttribute('style')).toContain('rotateY(0deg)')

    // Abrir los dedos acerca un paso; un poco más no (hace falta otro 25 % desde ahí); cerrarlos aleja.
    fireEvent.touchMove(canvas, { touches: touches(130) })
    expect(reset).toHaveTextContent('150%')
    fireEvent.touchMove(canvas, { touches: touches(140) })
    expect(reset).toHaveTextContent('150%')
    fireEvent.touchMove(canvas, { touches: touches(80) })
    expect(reset).toHaveTextContent('100%')

    // Con un solo dedo no pasa nada.
    fireEvent.touchEnd(canvas, { touches: [] })
    fireEvent.touchStart(canvas, { touches: touches(100).slice(0, 1) })
    fireEvent.touchMove(canvas, { touches: touches(300).slice(0, 1) })
    expect(reset).toHaveTextContent('100%')
  })

  it('detrás de la carta va la misma carta agrandada y desenfocada (sólo decoración: sin texto alternativo)', () => {
    open({ card: { ...card, imageUrlSmall: 'https://images.ygoprodeck.com/images/cards_small/1.jpg' } })

    const backdrop = screen.getByRole('dialog').querySelector('img[aria-hidden="true"], span[aria-hidden="true"] > img')

    expect(backdrop).not.toBeNull()
    expect(backdrop).toHaveAttribute('alt', '')
    expect(backdrop!.className).toContain('blur')
  })

  it('las teclas + − 0 cambian el zoom; más grande que la pantalla ya no se gira (arrastrar desplaza) y al volver al 100 % sí', () => {
    open()
    const reset = screen.getByRole('button', { name: 'Volver al 100 %' })

    expect(frame().className).toContain('touch-none')
    fireEvent.keyDown(window, { key: '+' })
    fireEvent.keyDown(window, { key: '=' })
    expect(reset).toHaveTextContent('200%')
    expect(screen.queryByTitle(/Arrastrala/)).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: '-' })
    expect(reset).toHaveTextContent('150%')
    fireEvent.keyDown(window, { key: '0' })
    expect(reset).toHaveTextContent('100%')
    expect(frame().className).toContain('touch-none')
  })

  it('al 100 % el lienzo no se desplaza (al girar la carta en 3D su borde cercano pasa un poco de la pantalla y sacaba una barra que no corresponde); con zoom, sí', () => {
    open()
    // El lienzo es el que lleva `touch-action` (el diálogo va por un portal al body).
    const canvas = () => document.querySelector<HTMLElement>('[data-card-zoom] div[class*="touch-action"]')!

    expect(canvas().className).toContain('overflow-hidden')
    expect(canvas().className).not.toContain('overflow-auto')
    fireEvent.keyDown(window, { key: '+' })
    expect(canvas().className).toContain('overflow-auto')
    expect(canvas().className).not.toContain('overflow-hidden')
    fireEvent.keyDown(window, { key: '0' })
    expect(canvas().className).toContain('overflow-hidden')
  })

  it('«Leer texto de efecto» muestra el texto de la carta con sus partes resaltadas sobre la imagen, y se esconde con el mismo botón; leerlo no cierra el zoom', () => {
    const onClose = vi.fn()
    open({ onClose })
    const read = screen.getByRole('button', { name: 'Leer texto de efecto' })

    expect(read).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('region', { name: 'Texto de la carta' })).not.toBeInTheDocument()

    fireEvent.click(read)
    const panel = screen.getByRole('region', { name: 'Texto de la carta' })

    expect(read).toHaveAttribute('aria-pressed', 'true')
    expect(panel).toHaveTextContent('When this card is Special Summoned')
    expect(panel.querySelector('[data-tone="condition"]')).toHaveTextContent('When this card is Special Summoned')
    expect(panel.querySelector('[data-tone="limit"]')).not.toBeNull()
    fireEvent.click(panel)
    fireEvent.click(read)
    expect(screen.queryByRole('region', { name: 'Texto de la carta' })).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('la impresión de la carta en grande', () => {
  const edition = (market: number) => [{ edition: '1st Edition', market }]
  const arts = [
    { id: 'art-1', imageUrl: 'a', imageUrlSmall: null, label: '' },
    { id: 'print-1', imageUrl: 'b', imageUrlSmall: null, label: '', printing: { set: 'Beyond the Brave', code: 'BETB-EN044', rarity: 'Starlight Rare', variant: 'Extended Art', editions: edition(107.11) } },
    { id: 'print-2', imageUrl: 'c', imageUrlSmall: null, label: '', printing: { set: 'Beyond the Brave', code: 'BETB-EN044', rarity: 'Ultra Rare', variant: '', editions: edition(0.47) } },
  ]

  it('arriba a la izquierda dice cuál es (código, rareza, arte especial y precio) y la lista deja pasar a otra sin salir del zoom', () => {
    const onArtChange = vi.fn()
    const onClose = vi.fn()

    render(
      <Provider store={store}>
        <CardZoom card={card} name="Maxx" arts={arts} artId="print-1" onArtChange={onArtChange} onClose={onClose} />
      </Provider>,
    )

    const chip = screen.getByRole('button', { name: 'Impresiones' })

    expect(chip).toHaveTextContent('BETB-EN044')
    expect(chip).toHaveTextContent('Starlight Rare')
    expect(chip).toHaveTextContent('Extended Art')
    expect(chip).toHaveTextContent('107')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    fireEvent.click(chip)
    const options = screen.getAllByRole('option')

    expect(options).toHaveLength(2)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(options[1]!)
    expect(onArtChange).toHaveBeenCalledWith('print-2')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('Escape y el fondo cierran primero la lista y después el zoom; sin impresiones o sin con qué cambiarlas, no hay chip', () => {
    const onClose = vi.fn()
    const view = render(
      <Provider store={store}>
        <CardZoom card={card} name="Maxx" arts={arts} artId="print-1" onArtChange={vi.fn()} onClose={onClose} />
      </Provider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Impresiones' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Impresiones' }))
    fireEvent.click(screen.getByRole('dialog', { name: 'Maxx en grande' }))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    view.unmount()

    render(
      <Provider store={store}>
        <CardZoom card={card} name="Maxx" arts={[arts[0]!]} artId="art-1" onArtChange={vi.fn()} onClose={onClose} />
      </Provider>,
    )
    expect(screen.queryByRole('button', { name: 'Impresiones' })).not.toBeInTheDocument()
  })
})

describe('el brillo de la rareza en la carta en grande', () => {
  const printing = (rarity: string, variant = '') => ({ set: 'Set', code: 'XXXX-EN001', rarity, variant, editions: [] })
  const arts = [
    { id: 'art-1', imageUrl: 'a', imageUrlSmall: null, label: '' },
    { id: 'print-common', imageUrl: 'b', imageUrlSmall: null, label: '', printing: printing('Common') },
    { id: 'print-star', imageUrl: 'c', imageUrlSmall: null, label: '', printing: printing('Starlight Rare') },
    { id: 'print-ultra', imageUrl: 'd', imageUrlSmall: null, label: '', printing: printing('Ultra Rare') },
    { id: 'print-extended', imageUrl: 'e', imageUrlSmall: null, label: '', printing: printing('Ultra Rare', 'Extended Art') },
  ]
  const ui = (artId: string | null, frameType = 'effect') => (
    <Provider store={store}>
      <CardZoom card={{ ...card, frameType }} name="Maxx" arts={arts} artId={artId} onArtChange={vi.fn()} onClose={vi.fn()} />
    </Provider>
  )
  const foil = () => document.querySelector('.rarity-foil')

  it('lleva el efecto de la rareza de la impresión que se ve, pegado al frente de la carta, y cambia (o se va) con ella', () => {
    const view = render(ui('print-star'))

    expect(foil()).toHaveAttribute('data-foil', 'starlight')
    expect(foil()).toHaveAttribute('data-frame', 'monster')
    expect(foil()).toHaveAttribute('aria-hidden', 'true')
    // Va adentro del frente: la cara que se esconde al dar vuelta la carta.
    expect(foil()!.parentElement!.className).toContain('[backface-visibility:hidden]')

    view.rerender(ui('print-ultra'))
    expect(foil()).toHaveAttribute('data-foil', 'ultra')
    view.rerender(ui('print-common'))
    expect(foil()).toBeNull()
  })

  it('una impresión de arte extendido no tiene la ventana del arte: el brillo cubre toda la carta (marco «full»)', () => {
    const view = render(ui('print-extended'))

    expect(foil()).toHaveAttribute('data-foil', 'ultra')
    expect(foil()).toHaveAttribute('data-frame', 'full')
    view.rerender(ui('print-ultra'))
    expect(foil()).toHaveAttribute('data-frame', 'monster')
  })

  it('un arte que no es de una impresión (los de YGOPRODeck) o sin arte elegido no brilla; el marco del brillo sigue al de la carta', () => {
    const view = render(ui('art-1'))

    expect(foil()).toBeNull()
    view.rerender(ui(null))
    expect(foil()).toBeNull()
    view.rerender(ui('print-star', 'pendulum_effect'))
    expect(foil()).toHaveAttribute('data-frame', 'pendulum')
  })
})
