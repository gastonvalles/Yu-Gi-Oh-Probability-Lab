// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useLayoutEffect, useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EASE_OUT } from '../app/motion'
import { EXIT_MS, Presence, useLeaving, usePresence } from '../app/use-presence'
import { CardSheet } from '../components/probability/CardSheet'
import { GHOST_CLICK_MS } from '../components/probability/MatDialogs'
import { Modal } from '../components/ui/Modal'

vi.mock('../components/CardArt', () => ({ CardArt: () => null }))

const original = { animate: Element.prototype.animate, matchMedia: window.matchMedia }

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Element.prototype.animate = original.animate
  window.matchMedia = original.matchMedia
  document.head.querySelectorAll('style[data-test]').forEach((style) => style.remove())
})

/** Una salida de mentira que se termina a mano (`finish()`), y lo que se le pidió a cada elemento. */
function fakeAnimate() {
  const calls: { element: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions; animation: Animation }[] = []
  let finish = () => {}
  const finished = new Promise<void>((resolve) => {
    finish = resolve
  })

  Element.prototype.animate = function (this: Element, keyframes, options) {
    const animation = { finished, reverse: vi.fn(), cancel: vi.fn() } as unknown as Animation

    calls.push({ element: this, keyframes: keyframes as Keyframe[], options: options as KeyframeAnimationOptions, animation })
    return animation
  }
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia

  return { calls, finish: async () => act(async () => finish()) }
}

/** Un panel con su velo, cada uno con la entrada que lo deja salir (jsdom no carga el CSS de la app ni avisa `animationstart`: el nombre de la entrada va en línea, junto a su clase). */
function Panel({ open, title }: { open: boolean; title: string }) {
  const root = useRef<HTMLDivElement>(null)

  return usePresence(
    open,
    open ? (
      <div ref={root} data-testid="root">
        <div data-testid="veil" className="animate-nav-scrim" style={{ animationName: 'nav-scrim' }} />
        <div data-testid="panel" className="animate-dialog-enter" style={{ animationName: 'dialog-enter' }}>
          {title}
        </div>
      </div>
    ) : null,
    () => [root.current],
  )
}

describe('usePresence: lo que se cierra también sale', () => {
  it('sin la Web Animations API (jsdom) se desmonta enseguida, como antes', () => {
    const view = render(<Panel open title="Abierto" />)

    view.rerender(<Panel open={false} title="" />)
    expect(screen.queryByTestId('root')).not.toBeInTheDocument()
  })

  it('con el movimiento reducido también se desmonta enseguida, sin animar nada', () => {
    const { calls } = fakeAnimate()
    window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
    const view = render(<Panel open title="Abierto" />)

    view.rerender(<Panel open={false} title="" />)
    expect(screen.queryByTestId('root')).not.toBeInTheDocument()
    expect(calls).toHaveLength(0)
  })

  it('un `animate` de mentira sin `finished` (el de otras pruebas) no cuenta: se desmonta enseguida', () => {
    Element.prototype.animate = (() => ({ cancel() {} })) as unknown as typeof Element.prototype.animate
    const view = render(<Panel open title="Abierto" />)

    view.rerender(<Panel open={false} title="" />)
    expect(screen.queryByTestId('root')).not.toBeInTheDocument()
  })

  it('sale con la inversa de su entrada (150 ms, EASE_OUT), quieto, inerte y sin atajar toques, y se desmonta cuando termina', async () => {
    const { calls, finish } = fakeAnimate()
    const view = render(<Panel open title="Abierto" />)

    view.rerender(<Panel open={false} title="" />)

    const root = screen.getByTestId('root')
    // Lo que se ve mientras sale es lo último que se vio abierto, no lo que dicen las props de cerrado.
    expect(screen.getByTestId('panel')).toHaveTextContent('Abierto')
    expect(root.inert).toBe(true)
    expect(root).toHaveAttribute('data-leaving')
    expect(root.style.pointerEvents).toBe('none')
    expect(calls.map(({ element, keyframes }) => [(element as HTMLElement).dataset.testid, keyframes])).toEqual([
      ['veil', [{ opacity: 0 }]],
      ['panel', [{ opacity: 0, transform: 'scale(0.96)' }]],
    ])
    expect(calls.every(({ options }) => options.duration === EXIT_MS && EXIT_MS <= 150 && options.easing === EASE_OUT && options.fill === 'forwards')).toBe(true)

    await finish()
    expect(screen.queryByTestId('root')).not.toBeInTheDocument()
  })

  it('cerrar no lee el estilo computado: cada salida es la inversa de la entrada que avisó su `animationstart`', () => {
    const { calls } = fakeAnimate()
    const exits: Record<string, Keyframe> = {
      'dialog-enter': { opacity: 0, transform: 'scale(0.96)' },
      pop: { opacity: 0, transform: 'scale(0.7)' },
      'sheet-in': { opacity: 0, transform: 'translateY(10px)' },
      'sheet-up': { transform: 'translateY(100%)' },
      'side-drawer': { transform: 'translateX(100%)' },
      'drawer-enter': { opacity: 0, transform: 'translateX(1.35rem)' },
      'nav-drawer': { transform: 'translateX(-100%)' },
      'nav-scrim': { opacity: 0 },
    }
    function Many({ open }: { open: boolean }) {
      const root = useRef<HTMLDivElement>(null)

      return usePresence(
        open,
        open ? (
          <div ref={root} data-testid="root">
            {Object.keys(exits).map((name) => (
              <div key={name} data-testid={name} />
            ))}
            <div data-testid="still" />
          </div>
        ) : null,
        () => [root.current],
      )
    }
    const view = render(<Many open />)

    // Lo que avisa el navegador al arrancar cada entrada (jsdom no anima: el evento va a mano y sube hasta la raíz).
    for (const name of Object.keys(exits)) screen.getByTestId(name).dispatchEvent(Object.assign(new Event('animationstart', { bubbles: true }), { animationName: name }))
    const computed = vi.spyOn(window, 'getComputedStyle')

    view.rerender(<Many open={false} />)
    expect(computed).not.toHaveBeenCalled()
    expect(Object.fromEntries(calls.map(({ element, keyframes }) => [(element as HTMLElement).dataset.testid, keyframes[0]]))).toEqual(exits)
    computed.mockRestore()
  })

  it('si la salida no avisa que terminó, la red lo desmonta a su duración más un margen', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fakeAnimate()
    const view = render(<Panel open title="Abierto" />)

    view.rerender(<Panel open={false} title="" />)
    act(() => {
      vi.advanceTimersByTime(EXIT_MS + 99)
    })
    expect(screen.getByTestId('root')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.queryByTestId('root')).not.toBeInTheDocument()
  })

  it('si se vuelve a abrir mientras sale, vuelve el mismo nodo (no se monta otro) y la salida va al revés', () => {
    const { calls } = fakeAnimate()
    const view = render(<Panel open title="Primero" />)
    const root = screen.getByTestId('root')

    view.rerender(<Panel open={false} title="" />)
    view.rerender(<Panel open title="Segundo" />)

    expect(screen.getByTestId('root')).toBe(root)
    expect(screen.getByTestId('panel')).toHaveTextContent('Segundo')
    expect(root.inert).toBe(false)
    expect(root).not.toHaveAttribute('data-leaving')
    expect(root.style.pointerEvents).toBe('')
    expect(calls.map(({ animation }) => (animation.reverse as ReturnType<typeof vi.fn>).mock.calls.length)).toEqual([1, 1])
  })
})

describe('Modal: el foco vuelve sin esperar la salida', () => {
  it('al cerrarse, mientras todavía sale, el foco ya está en lo que lo abrió y el velo no ataja toques', () => {
    fakeAnimate()
    // jsdom no carga index.css: las dos entradas, como en la app.
    const style = Object.assign(document.createElement('style'), { textContent: '.animate-nav-scrim { animation-name: nav-scrim } .animate-dialog-enter { animation-name: dialog-enter }' })
    style.dataset.test = ''
    document.head.append(style)

    function Screen() {
      const [open, setOpen] = useState(false)

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Abrir
          </button>
          <Modal isOpen={open} onClose={() => setOpen(false)} size="sm" title="Diálogo">
            <button type="button" onClick={() => setOpen(false)}>
              Listo
            </button>
          </Modal>
        </>
      )
    }

    render(<Screen />)
    const opener = screen.getByRole('button', { name: 'Abrir' })
    opener.focus()
    act(() => opener.click())
    const dialog = screen.getByRole('dialog', { name: 'Diálogo' })
    act(() => screen.getByRole('button', { name: 'Listo' }).click())

    // Sigue montado (sale), pero ya no es un diálogo abierto: inerte, sin atajar toques, y el foco volvió.
    expect(dialog).toBeInTheDocument()
    expect(dialog.parentElement!.inert).toBe(true)
    expect(dialog.parentElement!.style.pointerEvents).toBe('none')
    expect(document.activeElement).toBe(opener)
  })
})

describe('Presence: lo que el padre monta sólo abierto', () => {
  function Child({ label }: { label: string }) {
    const leaving = useLeaving()
    const [mountedAs] = useState(label)

    return <p data-testid="child">{`${label} · montado como ${mountedAs} · ${leaving ? 'saliendo' : 'abierto'}`}</p>
  }

  it('sin la Web Animations API, se va enseguida (como antes)', () => {
    const view = render(<Presence>{<Child label="A" />}</Presence>)

    view.rerender(<Presence>{null}</Presence>)
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
  })

  it('conserva el último hijo mientras sale (adentro, `useLeaving()` da true) y lo suelta a la duración más el margen', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fakeAnimate()
    const view = render(<Presence>{<Child label="A" />}</Presence>)

    view.rerender(<Presence>{null}</Presence>)
    expect(screen.getByTestId('child')).toHaveTextContent('A · montado como A · saliendo')

    act(() => {
      vi.advanceTimersByTime(EXIT_MS + 100)
    })
    expect(screen.queryByTestId('child')).not.toBeInTheDocument()
  })

  it('si vuelve a abrirse mientras sale, es el mismo hijo (no se monta otro)', () => {
    fakeAnimate()
    const view = render(<Presence>{<Child label="A" />}</Presence>)

    view.rerender(<Presence>{null}</Presence>)
    view.rerender(<Presence>{<Child label="B" />}</Presence>)
    expect(screen.getByTestId('child')).toHaveTextContent('B · montado como A · abierto')
  })

  it('la hoja de la carta que vuelve mientras baja ya no atiende toques en el mismo dibujo que la trae (el click fantasma del celular llega antes que un efecto)', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fakeAnimate()
    // Lo que tiene la hoja en cada dibujo de la pantalla (al final de cada commit, antes de los efectos).
    const seen: string[] = []
    function Spy() {
      useLayoutEffect(() => {
        const section = document.body.querySelector('section')
        if (section) seen.push(`${section.getAttribute('aria-label')}: ${section.classList.contains('pointer-events-none') ? 'sin toques' : 'con toques'}`)
      })

      return null
    }
    const sheet = (name: string | null) => (
      <>
        <Presence>{name ? <CardSheet name={name} art={null} items={[{ label: 'Invocación Normal', onSelect: () => {} }]} onClose={() => {}} /> : null}</Presence>
        <Spy />
      </>
    )
    const view = render(sheet('Dragón'))

    act(() => {
      vi.advanceTimersByTime(GHOST_CLICK_MS)
    })
    expect(document.body.querySelector('section')).not.toHaveClass('pointer-events-none')

    view.rerender(sheet(null))
    view.rerender(sheet('Mago'))
    expect(seen.at(-1)).toBe('Mago: sin toques')

    act(() => {
      vi.advanceTimersByTime(GHOST_CLICK_MS)
    })
    expect(document.body.querySelector('section')).not.toHaveClass('pointer-events-none')
  })

  it('un diálogo que el padre monta sólo abierto (un Modal con `isOpen={!useLeaving()}`) sigue en el DOM mientras sale, inerte y con data-leaving, se desmonta al terminar, y reabrirlo mientras sale vuelve el mismo nodo', async () => {
    const { calls, finish } = fakeAnimate()
    // jsdom no carga index.css: las dos entradas, como en la prueba del Modal.
    const style = Object.assign(document.createElement('style'), { textContent: '.animate-nav-scrim { animation-name: nav-scrim } .animate-dialog-enter { animation-name: dialog-enter }' })
    style.dataset.test = ''
    document.head.append(style)

    function Dialog() {
      const leaving = useLeaving()

      return (
        <Modal isOpen={!leaving} onClose={() => {}} size="sm" title="Regla">
          <p>Contenido</p>
        </Modal>
      )
    }
    const dialogs = (open: boolean) => <Presence>{open ? <Dialog /> : null}</Presence>
    const view = render(dialogs(true))
    const dialog = screen.getByRole('dialog', { name: 'Regla' })

    view.rerender(dialogs(false))
    // Sigue montado mientras sale: inerte, sin atajar toques, y con la salida (la inversa de la entrada).
    expect(dialog).toBeInTheDocument()
    expect(dialog.parentElement!.inert).toBe(true)
    expect(dialog.parentElement).toHaveAttribute('data-leaving')
    expect(calls).toHaveLength(2)

    // Se vuelve a abrir mientras sale: es el mismo nodo y la salida vuelve al revés (no se monta otro).
    view.rerender(dialogs(true))
    expect(screen.getByRole('dialog', { name: 'Regla' })).toBe(dialog)
    expect(dialog.parentElement!.inert).toBe(false)
    expect(dialog.parentElement).not.toHaveAttribute('data-leaving')
    expect(calls.map(({ animation }) => (animation.reverse as ReturnType<typeof vi.fn>).mock.calls.length)).toEqual([1, 1])

    // Se cierra de nuevo y, al terminar la salida, se desmonta.
    view.rerender(dialogs(false))
    await finish()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
