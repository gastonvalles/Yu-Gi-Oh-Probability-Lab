// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMatState, replayMat, type MatAction } from '../app/practice-mat'
import { FLIGHT_MS, LANDING_AT } from '../app/use-card-flights'
import { CARDS, Harness, INITIAL, WITH_ART, endTurn, goToPhase, hand, pointer, render, status, tap, zone } from './support/practice-mat-harness'
import { tapMenu } from './support/mat-menu'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

const { playSfx } = vi.hoisted(() => ({ playSfx: vi.fn() }))

vi.mock('../app/sfx', async () => ({ ...(await vi.importActual<typeof import('../app/sfx')>('../app/sfx')), playSfx }))

beforeEach(() => {
  localStorage.clear()
  HTMLElement.prototype.setPointerCapture = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.cancelAnimationFrame = () => {}
})

describe('la mesa de práctica', () => {
  it('al avanzar un paso del replay, activar un efecto destella la carta en el centro y marcar un objetivo sólo le pone el aro', () => {
    render(<Harness actions={[{ type: 'activate', id: 'card-1-1' }, { type: 'target', id: 'card-2-1' }]} />)

    expect(document.querySelector('[data-activation]')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(document.querySelector('[data-activation="card-1-1"]')).not.toBeNull()
    expect(within(hand()).getByRole('listitem', { name: 'Ash Blossom' })).toHaveAttribute('data-flash', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(document.querySelector('[data-activation]')).toBeNull()
    expect(within(hand()).getByRole('listitem', { name: 'Maxx C (target)' })).toHaveAttribute('data-flash', 'true')
  })

  it('mostrar o declarar una carta la pone grande en el centro con una línea de lo que pasó, cada uno con su color', () => {
    render(<Harness actions={[{ type: 'activate', id: 'card-1-1' }, { type: 'reveal', id: 'card-2-1' }, { type: 'declare', id: 'card-3-1' }]} />)

    const spotlight = () => document.querySelector('[data-activation]')
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(spotlight()).toHaveAttribute('data-kind', 'activate')
    // Las cartas grandes se dibujan sobre la mesa (centradas en ella), no en un portal sobre toda la pantalla.
    expect(screen.getByRole('region', { name: 'Mesa de práctica' })).toContainElement(spotlight() as HTMLElement)
    expect(spotlight()).toHaveTextContent(/Ash Blossom/)
    expect(spotlight()?.querySelector('[data-fx="frame"]')).toHaveAttribute('data-shine', 'true')

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(spotlight()).toHaveAttribute('data-kind', 'reveal')
    expect(spotlight()).toHaveTextContent('Revelás Maxx C')
    expect(within(hand()).getByRole('listitem', { name: 'Maxx C' })).toHaveAttribute('data-flash-kind', 'reveal')

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(spotlight()).toHaveAttribute('data-kind', 'declare')
    expect(spotlight()).toHaveTextContent('Declarás Called by the Grave')
  })

  it('al reproducir un combo cada paso que mueve cartas las muestra grandes con su nombre y lo que pasó (menos el cementerio y el destierro, que sólo van al registro); las que salen del deck se dan vuelta; en vivo, no', () => {
    // Mano: Ash, Maxx C, Called, Nibiru, Droll; el deck guarda a Imperm.
    render(<Harness actions={[{ type: 'draw', count: 1 }, { type: 'move', id: 'card-2-1', to: 'gy' }]} />)

    const spotlight = () => document.querySelector('[data-activation]')
    expect(spotlight()).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(spotlight()).toHaveAttribute('data-kind', 'hand')
    expect(spotlight()).toHaveTextContent('Robás Imperm')
    expect(spotlight()?.querySelector('figcaption')).toHaveTextContent('Imperm')
    // Sale del deck: aparece de dorso y se da vuelta en 3D; la mano se enmarca porque recibió una carta.
    expect(spotlight()?.querySelector('.animate-fx-flip-in')).not.toBeNull()
    expect(document.querySelector('[data-fx="hand"]')).not.toBeNull()

    // De la mano al cementerio es la única jugada que no se muestra grande: la carta viaja a su pila, el paso queda en el registro y el centro se despeja.
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(spotlight()).toBeNull()
    expect(within(status()).getByText('Maxx C va al cementerio')).toBeInTheDocument()
  })

  it('deshacer corta lo que estaba en curso: la carta grande del paso y el destello de la zona', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })

    try {
      render(<Harness />)

      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
      expect(document.querySelector('[data-activation]')).not.toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
      expect(document.querySelector('[data-activation]')).toBeNull()

      tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
      expect(document.querySelector('[data-fx="landing"]')).not.toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
      expect(document.querySelector('[data-fx="landing"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('jugando en vivo, robar enmarca la mano pero no agranda la carta', () => {
    render(<Harness />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Main: 1' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Robar' }))
    expect(within(hand()).getByRole('listitem', { name: 'Imperm' })).toBeInTheDocument()
    expect(document.querySelector('[data-fx="hand"]')).not.toBeNull()
    expect(document.querySelector('[data-activation]')).toBeNull()
  })

  it('marcar un objetivo lo cubre con la mira; cambiar de fase muestra el cartel y una invocación cae con su destello, y se van solos', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })

    try {
      render(<Harness />)

      // La mira (con su nombre accesible) queda sobre la carta marcada y se va al quitar la marca.
      tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))
      const marked = within(hand()).getByRole('listitem', { name: 'Maxx C (target)' })
      expect(marked).toHaveAttribute('data-targeted', 'true')
      expect(within(marked).getByRole('img', { name: 'Target' })).toHaveAttribute('data-fx', 'target')
      tap(marked)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Quitar target' }))
      expect(document.querySelector('[data-fx="target"]')).toBeNull()

      // Una Invocación Normal: el destello cae en la zona (dorado) cuando la carta, que viene volando, la toca.
      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
      const burst = zone('Zona de monstruo 1').querySelector('[data-fx="landing"]')
      expect(burst).toHaveAttribute('data-tone', 'normal')
      expect(burst?.querySelector('span')).toHaveStyle({ animationDelay: `${Math.round(FLIGHT_MS * LANDING_AT)}ms` })
      expect(zone('Zona de monstruo 2').querySelector('[data-fx="landing"]')).toBeNull()

      // Una fase nueva: el cartel con su nombre y nada más (sin los círculos de las seis fases, que ya están en los botones); y de la End Phase a la Draw Phase, con el turno.
      goToPhase('Main Phase 1')
      expect(document.querySelector('[data-fx="banner"]')?.textContent).toBe('Main Phase 1')
      endTurn()
      expect(document.querySelector('[data-fx="banner"]')?.textContent).toBe('Turno 2Draw Phase')

      act(() => {
        vi.advanceTimersByTime(1500)
      })
      expect(document.querySelector('[data-fx="landing"]')).toBeNull()
      expect(document.querySelector('[data-fx="banner"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('un target se quita solo a los cinco segundos, con la jugada de quitarlo (así el rival también lo ve irse), y no cierra la hoja de otra carta que se esté mirando', () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout', 'Date'] })

    try {
      render(<Harness />)

      tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))
      expect(within(hand()).getByRole('listitem', { name: 'Maxx C (target)' })).toBeInTheDocument()

      // A los tres segundos sigue ahí; se abre la hoja de otra carta, y cuando la marca se va, la hoja queda.
      act(() => {
        vi.advanceTimersByTime(3000)
      })
      expect(within(hand()).getByRole('listitem', { name: 'Maxx C (target)' })).toBeInTheDocument()
      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      act(() => {
        vi.advanceTimersByTime(2100)
      })
      expect(within(hand()).queryByRole('listitem', { name: 'Maxx C (target)' })).not.toBeInTheDocument()
      expect(within(hand()).getByRole('listitem', { name: 'Maxx C' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Ash Blossom' })).toBeInTheDocument()
      expect(within(status()).getByText('Sacás el target de Maxx C')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('poner un target a una carta del cementerio o del destierro le pone la mira en la casilla, y el visor se cierra para verla', () => {
    render(<Harness />)

    // Maxx C al cementerio y Nibiru al destierro, desde sus menús.
    tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Descartar' }))
    tap(within(hand()).getByRole('listitem', { name: 'Nibiru' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Desterrar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Boca arriba' }))

    const gy = () => screen.getByRole('button', { name: 'GY: 1' })
    const banish = () => screen.getByRole('button', { name: 'Banish: 1' })
    expect(gy()).toHaveAttribute('data-targeted', 'false')
    expect(gy().querySelector('[data-fx="target"]')).toBeNull()

    fireEvent.click(gy())
    fireEvent.click(within(screen.getByRole('dialog', { name: 'GY · 1' })).getByRole('button', { name: 'Maxx C' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))

    // Un target no mueve la carta: el visor se cierra para ver la mira caer sobre la casilla, que la lleva.
    expect(screen.queryByRole('dialog', { name: 'GY · 1' })).not.toBeInTheDocument()
    expect(gy()).toHaveAttribute('data-targeted', 'true')
    expect(gy().querySelector('[data-fx="target"]')).not.toBeNull()
    expect(within(status()).getByText('Marcás Maxx C como target')).toBeInTheDocument()

    // El destierro, igual: su visor se abre y el target lo cierra otra vez.
    expect(banish().querySelector('[data-fx="target"]')).toBeNull()
    fireEvent.click(banish())
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Banish · 1' })).getByRole('button', { name: 'Nibiru' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))
    expect(screen.queryByRole('dialog', { name: 'Banish · 1' })).not.toBeInTheDocument()
    expect(banish().querySelector('[data-fx="target"]')).not.toBeNull()

    // Quitar el target saca la mira de las dos partes (desde el visor, que se abre de nuevo: quitarlo no lo cierra).
    fireEvent.click(banish())
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Banish · 1' })).getByRole('button', { name: 'Nibiru (target)' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Quitar target' }))
    expect(banish().querySelector('[data-fx="target"]')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Banish · 1' }).querySelector('[data-fx="target"]')).toBeNull()
    // La del cementerio sigue marcada.
    expect(gy().querySelector('[data-fx="target"]')).not.toBeNull()
  })

  it('con dos cartas en el cementerio, la casilla muestra la marcada como target aunque no sea la de arriba, y vuelve a la de arriba al quitarla', () => {
    render(<Harness cards={WITH_ART} />)

    // Maxx C y después Nibiru al cementerio: Nibiru queda arriba. El target va a Maxx C, la de abajo, desde el visor.
    tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Descartar' }))
    tap(within(hand()).getByRole('listitem', { name: 'Nibiru' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Descartar' }))

    const gy = () => screen.getByRole('button', { name: 'GY: 2' })
    expect(within(gy()).getByRole('img', { name: 'Nibiru' })).toBeInTheDocument()

    // Con arte, el nombre accesible de la tarjeta del visor suma el texto y el alt: se toca por su imagen.
    fireEvent.click(gy())
    fireEvent.click(within(screen.getByRole('dialog', { name: 'GY · 2' })).getByRole('img', { name: 'Maxx C' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))

    // El visor se cierra y la casilla muestra Maxx C, la marcada, con la mira; Nibiru ya no se ve.
    expect(screen.queryByRole('dialog', { name: 'GY · 2' })).not.toBeInTheDocument()
    expect(within(gy()).getByRole('img', { name: 'Maxx C' })).toBeInTheDocument()
    expect(within(gy()).queryByRole('img', { name: 'Nibiru' })).not.toBeInTheDocument()
    expect(gy().querySelector('[data-fx="target"]')).not.toBeNull()

    // Quitado el target (desde el visor, que se abre de nuevo), la casilla vuelve a mostrar la de arriba.
    fireEvent.click(gy())
    fireEvent.click(within(screen.getByRole('dialog', { name: 'GY · 2' })).getByRole('img', { name: 'Maxx C' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Quitar target' }))
    expect(gy().querySelector('[data-fx="target"]')).toBeNull()
    expect(within(gy()).getByRole('img', { name: 'Nibiru' })).toBeInTheDocument()
  })

  it('una carta desterrada boca abajo y marcada como target: el visor se cierra y la casilla sigue de dorso, con la mira encima', () => {
    render(<Harness cards={WITH_ART} />)

    tap(within(hand()).getByRole('listitem', { name: 'Nibiru' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Desterrar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Boca abajo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Banish: 1' }))

    const viewer = () => screen.getByRole('dialog', { name: 'Banish · 1' })
    fireEvent.click(within(viewer()).getByRole('button', { name: 'Nibiru (boca abajo)' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))

    // Boca abajo la casilla no muestra la carta (sin imagen, de dorso), y la mira cae sobre ella.
    expect(screen.queryByRole('dialog', { name: 'Banish · 1' })).not.toBeInTheDocument()
    const banish = screen.getByRole('button', { name: 'Banish: 1' })
    expect(banish.querySelector('[data-card-art]')).toBeNull()
    expect(banish.querySelector('[data-fx="target"]')).not.toBeNull()
  })

  it('las casillas de las pilas y sus cartas en el visor no van redondeadas (el reset global le da radio a todo <button>)', () => {
    render(<Harness />)

    for (const name of ['Extra: 1', 'GY: 0', 'Banish: 0']) {
      expect(screen.getByRole('button', { name })).toHaveClass('rounded-none')
    }

    fireEvent.click(screen.getByRole('button', { name: 'Extra: 1' }))
    expect(within(screen.getByRole('dialog', { name: 'Extra · 1' })).getByRole('button', { name: 'Zeus' })).toHaveClass('rounded-none')
  })

  describe('elegir varias cartas en el visor de una pila: una sola jugada para todas', () => {
    /** En el visor abierto: «Elegir varias», tocar esas cartas en ese orden (por el nombre de debajo: con arte, el nombre accesible también lleva el de la imagen) y «Elegir jugada», que abre el menú del lote. */
    const chooseSeveral = (viewer: HTMLElement, names: string[]) => {
      fireEvent.click(within(viewer).getByRole('button', { name: 'Elegir varias' }))
      for (const name of names) fireEvent.click(within(viewer).getByText(name))
      fireEvent.click(within(viewer).getByRole('button', { name: 'Elegir jugada' }))
    }
    const toGy = (ids: string[], first: MatAction[] = []) => replayMat(INITIAL, [...first, ...ids.map((id): MatAction => ({ type: 'move', id, to: 'gy' }))])
    const ZEUS_ON_FIELD: MatAction[] = [{ type: 'place', id: 'card-7-1', zone: 'mz', index: 0, pos: 'atk' }]

    it('del cementerio, tres cartas desterradas boca abajo de una vez: un paso y una línea, que un Deshacer deshace entero', () => {
      render(<Harness initial={toGy(['card-1-1', 'card-2-1', 'card-5-1'])} />)

      fireEvent.click(screen.getByRole('button', { name: 'GY: 3' }))
      chooseSeveral(screen.getByRole('dialog', { name: 'GY · 3' }), ['Ash Blossom', 'Maxx C', 'Droll'])

      // El menú del lote (en el celular, la hoja de abajo): la pila arriba y cuántas son.
      const sheet = screen.getByRole('region', { name: '3 cartas' })
      expect(within(sheet).getByText('GY')).toBeInTheDocument()
      fireEvent.click(within(sheet).getByRole('menuitem', { name: 'Desterrar' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Boca abajo' }))

      expect(screen.queryByRole('dialog', { name: 'GY · 3' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'GY: 0' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Banish: 3' })).toBeInTheDocument()
      expect(within(status()).getByText('1/1')).toBeInTheDocument()
      expect(within(status()).getByText('Desterrás Ash Blossom, Maxx C y Droll boca abajo')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
      expect(screen.getByRole('button', { name: 'GY: 3' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Banish: 0' })).toBeInTheDocument()
      expect(within(status()).queryByText('1/1')).not.toBeInTheDocument()
    })

    it('del Main, dos cartas a la mano: una sola jugada que las saca y baraja el resto, y el visor se cierra sin barajar aparte', () => {
      render(<Harness initial={createMatState(['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1'], ['card-7-1'], 2)} />)

      tap(screen.getByRole('button', { name: 'Main: 4' }))
      chooseSeveral(screen.getByRole('dialog', { name: 'Main · 4' }), ['Nibiru', 'Imperm'])
      fireEvent.click(screen.getByRole('menuitem', { name: 'A la mano' }))

      expect(screen.queryByRole('dialog', { name: 'Main · 4' })).not.toBeInTheDocument()
      expect(within(hand()).getByRole('listitem', { name: 'Nibiru' })).toBeInTheDocument()
      expect(within(hand()).getByRole('listitem', { name: 'Imperm' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Main: 2' })).toBeInTheDocument()
      // Sacarlas y barajar son un paso (no sigue otro «Barajás el deck»).
      expect(within(status()).getByText('1/1')).toBeInTheDocument()
      expect(within(status()).getByText('Buscás Nibiru y Imperm del deck a la mano y barajás')).toBeInTheDocument()
    })

    it('del cementerio, dos cartas «Al deck: al azar»: entran las dos y se baraja todo una vez, en la misma jugada', () => {
      render(<Harness initial={toGy(['card-1-1', 'card-2-1'])} />)

      fireEvent.click(screen.getByRole('button', { name: 'GY: 2' }))
      chooseSeveral(screen.getByRole('dialog', { name: 'GY · 2' }), ['Ash Blossom', 'Maxx C'])
      fireEvent.click(screen.getByRole('menuitem', { name: 'Al deck' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Al azar' }))

      expect(screen.getByRole('button', { name: 'GY: 0' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Main: 3' })).toBeInTheDocument()
      expect(within(status()).getByText('1/1')).toBeInTheDocument()
      expect(within(status()).getByText('Barajás Ash Blossom y Maxx C dentro del deck')).toBeInTheDocument()
    })

    it('tres del cementerio como target: el visor se cierra, la casilla muestra la última marcada con la mira, y a los cinco segundos vencen juntas en una jugada sin cerrar la hoja que esté abierta', () => {
      vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout', 'Date'] })
      // La mira y la carta de la casilla son hermanas: con la misma clave, React avisaba y podía confundirlas.
      const errors = vi.spyOn(console, 'error')

      try {
        render(<Harness initial={toGy(['card-1-1', 'card-2-1', 'card-5-1'])} cards={WITH_ART} />)

        const gy = () => screen.getByRole('button', { name: 'GY: 3' })
        // Droll es la de arriba; la última que se marca es Ash Blossom.
        expect(within(gy()).getByRole('img', { name: 'Droll' })).toBeInTheDocument()
        fireEvent.click(gy())
        chooseSeveral(screen.getByRole('dialog', { name: 'GY · 3' }), ['Droll', 'Maxx C', 'Ash Blossom'])
        fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))

        expect(screen.queryByRole('dialog', { name: 'GY · 3' })).not.toBeInTheDocument()
        expect(within(status()).getByText('Marcás Droll, Maxx C y Ash Blossom como target')).toBeInTheDocument()
        expect(gy()).toHaveAttribute('data-targeted', 'true')
        expect(within(gy()).getByRole('img', { name: 'Ash Blossom' })).toBeInTheDocument()
        expect(gy().querySelector('[data-fx="target"]')).not.toBeNull()

        // Se abre la hoja de una carta de la mano; cuando las marcas se van (las tres en una sola jugada), la hoja queda.
        tap(within(hand()).getByRole('listitem', { name: 'Nibiru' }))
        act(() => {
          vi.advanceTimersByTime(5100)
        })
        expect(within(status()).getByText('2/2')).toBeInTheDocument()
        expect(within(status()).getByText('Sacás el target de Droll, Maxx C y Ash Blossom')).toBeInTheDocument()
        expect(gy()).toHaveAttribute('data-targeted', 'false')
        expect(screen.getByRole('region', { name: 'Nibiru' })).toBeInTheDocument()
        expect(errors.mock.calls.filter(([message]) => String(message).includes('same key'))).toEqual([])
      } finally {
        errors.mockRestore()
        vi.useRealTimers()
      }
    })

    it('dos monstruos del cementerio adjuntados a Zeus de una vez: una sola jugada', () => {
      render(<Harness initial={toGy(['card-1-1', 'card-2-1'], ZEUS_ON_FIELD)} />)

      fireEvent.click(screen.getByRole('button', { name: 'GY: 2' }))
      chooseSeveral(screen.getByRole('dialog', { name: 'GY · 2' }), ['Ash Blossom', 'Maxx C'])
      fireEvent.click(screen.getByRole('menuitem', { name: 'Adjuntar a Zeus' }))

      expect(screen.getByRole('button', { name: 'GY: 0' })).toBeInTheDocument()
      expect(within(status()).getByText('1/1')).toBeInTheDocument()
      expect(within(status()).getByText('Adjuntás Ash Blossom y Maxx C a Zeus')).toBeInTheDocument()
    })

    it('el menú del lote: lo que no admiten todas va apagado y dice por qué (tocarlo no hace nada), y cerrarlo sin elegir deja la elección como estaba', () => {
      // Ash Blossom es un monstruo (se adjunta a Zeus); Called by the Grave, una Mágica (no).
      render(<Harness initial={toGy(['card-1-1', 'card-3-1'], ZEUS_ON_FIELD)} />)

      fireEvent.click(screen.getByRole('button', { name: 'GY: 2' }))
      const viewer = screen.getByRole('dialog', { name: 'GY · 2' })
      chooseSeveral(viewer, ['Ash Blossom', 'Called by the Grave'])

      const attach = screen.getByRole('menuitem', { name: /^Adjuntar a Zeus/ })
      expect(attach).toHaveAttribute('aria-disabled', 'true')
      expect(attach).toHaveTextContent('No va con Called by the Grave')
      fireEvent.click(attach)
      expect(screen.getByRole('button', { name: 'GY: 2' })).toBeInTheDocument()
      expect(within(status()).queryByText('1/1')).not.toBeInTheDocument()
      // Lo que admiten las dos, a un toque.
      expect(screen.getByRole('menuitem', { name: 'Al deck' })).not.toHaveAttribute('aria-disabled')

      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByRole('region', { name: '2 cartas' })).not.toBeInTheDocument()
      expect(within(viewer).getByRole('button', { name: /^Ash Blossom \(1\.ª elegida\)/ })).toHaveAttribute('aria-pressed', 'true')
      expect(within(viewer).getByRole('button', { name: /^Called by the Grave \(2\.ª elegida\)/ })).toHaveAttribute('aria-pressed', 'true')
    })
  })

  it('las zonas del centro llevan las líneas de la carta, como el tapete: las de monstruos la parada y la acostada en cruz, las de Mágicas y Trampas sólo la parada; la de campo y las pilas no (ya son una carta)', () => {
    render(<Harness />)

    // Las líneas son decoración (`aria-hidden`, sin toques) adentro de la casilla; el borde de la casilla cuadrada no se ve (se enciende al elegir o soltar).
    const lines = (name: string) => zone(name).querySelectorAll(':scope > span[aria-hidden="true"].pointer-events-none > span')

    for (const name of ['Zona de monstruo 1', 'Zona de monstruo 5', 'Zona extra de monstruo 1']) {
      expect(lines(name)).toHaveLength(2)
    }

    for (const name of ['Zona de magia y trampa 1', 'Zona de magia y trampa 3']) {
      expect(lines(name)).toHaveLength(1)
    }

    const [standing, lying] = Array.from(lines('Zona de monstruo 1'))

    expect(standing).toHaveClass('inset-y-0', 'w-[68.57%]', 'border-field-line/70')
    expect(lying).toHaveClass('inset-x-0', 'h-[68.57%]', 'border-field-line/70')
    expect(zone('Zona de monstruo 1')).toHaveClass('border-transparent')
    expect(zone('Zona de campo').querySelectorAll(':scope > span.pointer-events-none > span')).toHaveLength(0)
  })

  it('las zonas del centro son cuadradas y las de los costados, de carta: acostada en defensa, la carta mide lo mismo que parada y no pisa a la vecina', () => {
    const initial = replayMat(INITIAL, [
      { type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos: 'def' },
      { type: 'place', id: 'card-2-1', zone: 'mz', index: 1, pos: 'atk' },
      { type: 'place', id: 'card-3-1', zone: 'field', index: 0, pos: 'atk' },
    ])
    render(<Harness initial={initial} />)

    // Cuadradas: la carta parada ocupa el alto de la casilla y la acostada, el ancho; así dos en defensa, una al lado de la otra, no se tocan.
    for (const name of ['Zona de monstruo 1', 'Zona de magia y trampa 1', 'Zona extra de monstruo 1']) {
      expect(zone(name)).toHaveClass('aspect-square')
    }

    // Las de los costados tienen la forma de una carta (la de campo y las pilas nunca se acuestan), y miden 0,6857 de una del centro.
    expect(screen.getByLabelText('Campo')).toHaveClass('grid-cols-[minmax(0,0.6857fr)_repeat(5,minmax(0,1fr))_minmax(0,0.6857fr)]')
    for (const cell of [zone('Zona de campo'), ...['Main: 1', 'Extra: 1', 'GY: 0', 'Banish: 0'].map((name) => screen.getByRole('button', { name }))]) {
      expect(cell).toHaveClass('aspect-[421/614]')
      expect(cell).not.toHaveClass('aspect-square')
    }

    // En una casilla cuadrada la carta mide el alto de la casilla y 421/614 de ancho, parada o acostada; sólo cambia el giro.
    const sideways = within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom, en defensa' })
    const upright = within(zone('Zona de monstruo 2')).getByRole('button', { name: 'Maxx C' })

    for (const placed of [sideways, upright]) {
      expect(placed).toHaveClass('aspect-[421/614]', 'w-[68.57%]')
    }

    expect(sideways).toHaveClass('[transform:rotate(90deg)]')
    expect(upright).not.toHaveClass('[transform:rotate(90deg)]')
    // La casilla de campo tiene el tamaño de la carta: la llena.
    expect(within(zone('Zona de campo')).getByRole('button', { name: 'Called by the Grave' })).toHaveClass('w-full')
  })

  describe('los materiales de un Xyz, sobre el campo', () => {
    const xyzWith = (materials: string[], pos: 'atk' | 'def' = 'atk') =>
      replayMat(INITIAL, [{ type: 'place', id: 'card-7-1', zone: 'mz', index: 0, pos }, ...materials.map((id): MatAction => ({ type: 'attach', id, to: 'card-7-1' }))])
    const stackIn = (name: string) => zone(name).querySelector<HTMLElement>('[data-material-stack]')

    it('sin materiales, el Xyz no lleva pila ni contador', () => {
      render(<Harness initial={xyzWith([])} />)

      expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Zeus' })).toBeInTheDocument()
      expect(stackIn('Zona de monstruo 1')).toBeNull()
      expect(within(zone('Zona de monstruo 1')).queryByRole('img', { name: /material/ })).not.toBeInTheDocument()
    })

    it('con uno, una capa de dorso detrás de la carta y el aro con «1 material»; el nombre de la carta lo dice', () => {
      render(<Harness initial={xyzWith(['card-1-1'])} />)

      const card = within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Zeus, con 1 material' })
      const stack = stackIn('Zona de monstruo 1')!

      expect(stack.children).toHaveLength(1)
      // La pila va antes que la carta (queda detrás) y es decoración: no se toca, no la leen y no es una carta para los vuelos.
      expect(stack.nextElementSibling).toBe(card)
      expect(stack).toHaveAttribute('aria-hidden', 'true')
      expect(stack).toHaveClass('pointer-events-none', 'absolute')
      expect(stack).not.toHaveAttribute('data-card-id')
      expect(stack.querySelector('[data-card-id]')).toBeNull()
      // El contador es de la carta (viaja con ella) y tampoco recibe toques.
      const ring = within(card).getByRole('img', { name: '1 material' })
      expect(ring.parentElement).toHaveClass('pointer-events-none', 'absolute')
      expect(ring).toHaveTextContent('1')
    })

    it('con tres, tres capas y el aro en tres tramos; con más, la pila no crece (lo dice el número)', () => {
      const { unmount } = render(<Harness initial={xyzWith(['card-1-1', 'card-2-1', 'card-4-1'])} />)

      const card = within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Zeus, con 3 materiales' })
      expect(stackIn('Zona de monstruo 1')!.children).toHaveLength(3)
      // Un tramo por material, más el fondo del aro.
      expect(within(card).getByRole('img', { name: '3 materiales' }).querySelectorAll('circle')).toHaveLength(4)
      unmount()

      render(<Harness initial={xyzWith(['card-1-1', 'card-2-1', 'card-4-1', 'card-5-1'])} />)
      expect(stackIn('Zona de monstruo 1')!.children).toHaveLength(3)
      expect(within(zone('Zona de monstruo 1')).getByRole('img', { name: '4 materiales' })).toHaveTextContent('4')
    })

    it('en defensa la pila se acuesta con la carta y el número queda derecho', () => {
      render(<Harness initial={xyzWith(['card-1-1', 'card-2-1'], 'def')} />)

      const card = within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Zeus, en defensa, con 2 materiales' })
      expect(card).toHaveClass('[transform:rotate(90deg)]')
      expect(stackIn('Zona de monstruo 1')).toHaveClass('[transform:rotate(90deg)]')
      expect(within(card).getByRole('img', { name: '2 materiales' }).parentElement).toHaveClass('-rotate-90')
    })

    it('una carta que no es Xyz no muestra nada aunque tenga materiales', () => {
      const initial = replayMat(INITIAL, [
        { type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos: 'atk' },
        { type: 'attach', id: 'card-2-1', to: 'card-1-1' },
      ])
      expect(initial.mz[0]!.materials).toEqual(['card-2-1'])
      render(<Harness initial={initial} />)

      expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
      expect(stackIn('Zona de monstruo 1')).toBeNull()
      expect(within(zone('Zona de monstruo 1')).queryByRole('img', { name: /material/ })).not.toBeInTheDocument()
    })
  })

  describe('los controles del replay (como los de YGOPocket)', () => {
    // Mano inicial, robar, y las fases Battle, End y Draw (que empieza el turno 2).
    const ACTIONS: MatAction[] = [{ type: 'draw', count: 1 }, { type: 'phase', phase: 'battle' }, { type: 'phase', phase: 'end' }, { type: 'phase', phase: 'draw' }]
    const slider = () => screen.getByRole('slider', { name: 'Línea de tiempo del replay' })

    it('viendo un combo hay reiniciar, anterior, reproducir, siguiente, la línea de tiempo, la lista de pasos y la velocidad; en vivo, no', () => {
      const { unmount } = render(<Harness />)
      expect(screen.queryByRole('group', { name: 'Controles del replay' })).not.toBeInTheDocument()
      unmount()

      render(<Harness actions={ACTIONS} />)
      const bar = screen.getByRole('group', { name: 'Controles del replay' })

      expect(within(bar).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
        'Volver al principio',
        'Anterior',
        'Reproducir',
        'Siguiente',
        'Ver los pasos',
        'Velocidad: 1×',
      ])
      // Al principio no hay a dónde volver.
      expect(within(bar).getByRole('button', { name: 'Volver al principio' })).toBeDisabled()
      expect(within(bar).getByRole('button', { name: 'Anterior' })).toBeDisabled()
    })

    it('la línea de tiempo tiene una pastilla por paso (y la mano inicial), marca los cambios de fase y separa los turnos', () => {
      render(<Harness actions={ACTIONS} />)

      const pills = [...slider().querySelectorAll('[data-state]')]
      expect(pills).toHaveLength(5)
      expect(pills.map((pill) => pill.getAttribute('data-state'))).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming'])
      expect(pills.map((pill) => pill.hasAttribute('data-phase'))).toEqual([false, false, true, true, true])
      // El turno 2 empieza con la última jugada: una sola línea, antes de su pastilla.
      expect(slider().querySelectorAll('[data-fx="turn"]')).toHaveLength(1)
      expect(slider().querySelector('[data-fx="turn"]')?.nextElementSibling).toBe(pills[4])

      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
      expect([...slider().querySelectorAll('[data-state]')].map((pill) => pill.getAttribute('data-state'))).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming'])
    })

    it('cada pastilla lleva el color de lo que hace el paso (el de su destello en la mesa): vivo lo ya visto, apagado lo que falta; la mano inicial verde y el paso actual ámbar y más alto', () => {
      const COMBO: MatAction[] = [
        { type: 'draw', count: 1 },
        { type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos: 'atk', how: 'normal' },
        { type: 'activate', id: 'card-1-1' },
        { type: 'move', id: 'card-2-1', to: 'gy' },
        { type: 'position', id: 'card-1-1', pos: 'def' },
        { type: 'phase', phase: 'battle' },
      ]
      render(<Harness actions={COMBO} />)
      const pills = () => [...slider().querySelectorAll('[data-state]')] as HTMLElement[]

      // Mano inicial (verde), robar (celeste), Invocación Normal y activar (dorado), cementerio (violeta); cambiar de posición y la fase, sin color.
      expect(pills().map((pill) => pill.getAttribute('data-tone'))).toEqual(['green', 'cyan', 'gold', 'gold', 'violet', 'none', 'none'])
      // El color llega por `--pill` (lo pinta `rgb(var(--pill) / alfa)`); sin color no hay variable.
      expect(pills()[1]!.style.getPropertyValue('--pill')).toBe('56 189 248')
      expect(pills()[2]!.style.getPropertyValue('--pill')).toBe('250 204 21')
      expect(pills()[5]!.style.getPropertyValue('--pill')).toBe('')

      // Al principio el actual es la mano inicial: ámbar y más alta; las que faltan, apagadas (con su color y sin color).
      expect(pills()[0]).toHaveClass('h-3.5', 'bg-info')
      expect(pills()[1]).toHaveClass('bg-[rgb(var(--pill)/0.3)]')
      expect(pills()[5]).toHaveClass('bg-tint/22')

      // Dos pasos después: lo ya visto, vivo; el actual, ámbar (no el dorado de su destello).
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
      fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
      expect(pills()[1]).toHaveClass('bg-[rgb(var(--pill)/0.95)]')
      expect(pills()[2]).toHaveClass('h-3.5', 'bg-info')
      expect(pills()[2]).not.toHaveClass('bg-[rgb(var(--pill)/0.95)]')
      // El botón de reproducir es ámbar, como el actual.
      expect(screen.getByRole('button', { name: 'Reproducir' })).toHaveClass('bg-magenta')
    })

    it('la línea de tiempo se maneja con el teclado como un deslizador y se toca o arrastra para ir a un paso', () => {
      render(<Harness actions={ACTIONS} />)
      const status = () => within(screen.getByRole('status', { name: 'Paso actual' }))

      expect(slider()).toHaveAttribute('aria-valuenow', '0')
      expect(slider()).toHaveAttribute('aria-valuetext', 'Mano inicial')
      fireEvent.keyDown(slider(), { key: 'ArrowRight' })
      expect(slider()).toHaveAttribute('aria-valuenow', '1')
      expect(slider()).toHaveAttribute('aria-valuetext', 'Paso 1 de 4: Robás Imperm')
      expect(status().getByText('1/4')).toBeInTheDocument()
      fireEvent.keyDown(slider(), { key: 'End' })
      expect(slider()).toHaveAttribute('aria-valuenow', '4')
      fireEvent.keyDown(slider(), { key: 'ArrowLeft' })
      expect(slider()).toHaveAttribute('aria-valuenow', '3')
      fireEvent.keyDown(slider(), { key: 'Home' })
      expect(slider()).toHaveAttribute('aria-valuenow', '0')

      // Tocar la línea: la posición dice el paso (cinco pastillas en 500 px).
      slider().getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 36, width: 500, height: 36, x: 0, y: 0, toJSON: () => ({}) })
      fireEvent.pointerDown(slider(), { ...pointer, clientX: 250 })
      expect(slider()).toHaveAttribute('aria-valuenow', '2')
      fireEvent.pointerMove(slider(), { ...pointer, clientX: 499 })
      expect(slider()).toHaveAttribute('aria-valuenow', '4')
      fireEvent.pointerUp(slider(), { ...pointer, clientX: 499 })
      // Soltada, ya no sigue al puntero.
      fireEvent.pointerMove(slider(), { ...pointer, clientX: 10 })
      expect(slider()).toHaveAttribute('aria-valuenow', '4')
    })

    it('volver al principio, la lista de pasos que se abre aparte y la velocidad con su menú', () => {
      render(<Harness actions={ACTIONS} />)

      fireEvent.keyDown(slider(), { key: 'End' })
      fireEvent.click(screen.getByRole('button', { name: 'Volver al principio' }))
      expect(slider()).toHaveAttribute('aria-valuenow', '0')

      fireEvent.click(screen.getByRole('button', { name: 'Ver los pasos' }))
      expect(screen.getByRole('dialog', { name: 'Pasos y combos' })).toBeInTheDocument()
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByRole('dialog', { name: 'Pasos y combos' })).not.toBeInTheDocument()

      // 0,5× · 1× · 1,5× · 2×, con el elegido tildado.
      fireEvent.click(screen.getByRole('button', { name: 'Velocidad: 1×' }))
      const menu = screen.getByRole('menu', { name: 'Velocidad' })
      expect(within(menu).getAllByRole('menuitemradio').map((item) => [item.textContent, item.getAttribute('aria-checked')])).toEqual([['0,5×', 'false'], ['1×', 'true'], ['1,5×', 'false'], ['2×', 'false']])
      fireEvent.keyDown(window, { key: 'Escape' })
      expect(screen.queryByRole('menu', { name: 'Velocidad' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Velocidad: 1×' }))
      fireEvent.click(within(screen.getByRole('menu', { name: 'Velocidad' })).getByRole('menuitemradio', { name: '0,5×' }))
      expect(screen.queryByRole('menu', { name: 'Velocidad' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Velocidad: 0,5×' })).toBeInTheDocument()
    })

    it('reproduce solo: cada paso espera 1,4 s a velocidad normal, la mitad a 2× y el doble a 0,5×; pausar lo frena', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })

      try {
        render(<Harness actions={ACTIONS} />)

        fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }))
        act(() => {
          vi.advanceTimersByTime(1399)
        })
        expect(slider()).toHaveAttribute('aria-valuenow', '0')
        act(() => {
          vi.advanceTimersByTime(1)
        })
        expect(slider()).toHaveAttribute('aria-valuenow', '1')

        fireEvent.click(screen.getByRole('button', { name: 'Velocidad: 1×' }))
        fireEvent.click(screen.getByRole('menuitemradio', { name: '2×' }))
        act(() => {
          vi.advanceTimersByTime(700)
        })
        expect(slider()).toHaveAttribute('aria-valuenow', '2')

        fireEvent.click(screen.getByRole('button', { name: 'Velocidad: 2×' }))
        fireEvent.click(screen.getByRole('menuitemradio', { name: '0,5×' }))
        act(() => {
          vi.advanceTimersByTime(2799)
        })
        expect(slider()).toHaveAttribute('aria-valuenow', '2')
        act(() => {
          vi.advanceTimersByTime(1)
        })
        expect(slider()).toHaveAttribute('aria-valuenow', '3')

        fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
        act(() => {
          vi.advanceTimersByTime(10_000)
        })
        expect(slider()).toHaveAttribute('aria-valuenow', '3')
      } finally {
        vi.useRealTimers()
      }
    })
  })

  it('el visor del deck: sacar una carta de ahí baraja el resto en la misma jugada; cerrarlo sin sacar nada baraja aparte', () => {
    render(<Harness />)

    tap(screen.getByRole('button', { name: 'Main: 1' }))

    const viewer = screen.getByRole('dialog', { name: 'Main · 1' })
    fireEvent.click(within(viewer).getByRole('button', { name: 'Imperm' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'A la mano' }))

    expect(within(hand()).getByRole('listitem', { name: 'Imperm' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Main · 1' })).not.toBeInTheDocument()
    expect(within(status()).getByText('1/1')).toBeInTheDocument()
    expect(within(status()).getByText('Buscás Imperm del deck a la mano y barajás')).toBeInTheDocument()

    // Un solo paso: deshacer devuelve la carta al deck.
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(screen.getByRole('button', { name: 'Main: 1' })).toBeInTheDocument()
    expect(within(status()).queryByText('1/1')).not.toBeInTheDocument()

    tap(screen.getByRole('button', { name: 'Main: 1' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Main · 1' })).getByRole('button', { name: 'Cerrar' }))
    expect(within(status()).getByText('1/1')).toBeInTheDocument()
    expect(within(status()).getByText('Barajás el deck')).toBeInTheDocument()
  })

  it('cada visor arranca sin filtro: lo buscado en el deck no se hereda al abrirlo de nuevo', () => {
    // Doce cartas: el deck queda con diez y muestra el buscador (sale con más de ocho).
    const ids = [...CARDS.keys(), 'card-1-2', 'card-2-2', 'card-3-2', 'card-4-2', 'card-5-2']
    render(<Harness initial={createMatState(ids, [], 2)} />)

    const openDeck = () => {
      tap(screen.getByRole('button', { name: 'Main: 10' }))
      return screen.getByRole('dialog', { name: 'Main · 10' })
    }

    const viewer = openDeck()
    fireEvent.change(within(viewer).getByRole('searchbox', { name: 'Buscar carta' }), { target: { value: 'nib' } })
    expect(within(viewer).getAllByRole('listitem')).toHaveLength(2)
    fireEvent.click(within(viewer).getByRole('button', { name: 'Cerrar' }))
    expect(within(status()).getByText('Barajás el deck')).toBeInTheDocument()

    const reopened = openDeck()
    expect(within(reopened).getByRole('searchbox', { name: 'Buscar carta' })).toHaveValue('')
    expect(within(reopened).getAllByRole('listitem')).toHaveLength(10)
  })

  it('guarda el combo con nombre, lo lista y lo reproduce paso a paso', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'En defensa' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
    tap(within(hand()).getByRole('listitem', { name: 'Called by the Grave' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Colocar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de magia y trampa 1: elegir' }))

    tapMenu('Guardar combo')
    const dialog = screen.getByRole('dialog', { name: 'Guardar combo' })
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Línea básica' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    expect(screen.queryByRole('dialog', { name: 'Guardar combo' })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('ygo-lab:practice-combos') ?? '[]')).toHaveLength(1)

    // El panel lateral lista el combo; cargarlo vuelve a la mano inicial y se avanza con Siguiente.
    const aside = screen.getByRole('region', { name: 'Pasos y combos' })
    fireEvent.click(within(aside).getByRole('radio', { name: 'Combos' }))
    expect(within(aside).getByText('Línea básica')).toBeInTheDocument()
    fireEvent.click(within(aside).getByRole('button', { name: 'Cargar Línea básica' }))

    expect(within(status()).getByText('0/2')).toBeInTheDocument()
    expect(within(status()).getByText('Mano inicial')).toBeInTheDocument()
    expect(within(hand()).getAllByRole('listitem')).toHaveLength(5)

    // Se reproduce solo, con los controles del replay (el botón grande, la línea de tiempo y la velocidad); la lista de pasos lleva la última jugada arriba.
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Línea de tiempo del replay' })).toHaveAttribute('aria-valuemax', '2')
    fireEvent.click(screen.getByRole('button', { name: 'Velocidad: 1×' }))
    fireEvent.click(screen.getByRole('menuitemradio', { name: '2×' }))
    expect(screen.getByRole('button', { name: 'Velocidad: 2×' })).toBeInTheDocument()
    fireEvent.click(within(aside).getByRole('radio', { name: 'Pasos' }))
    expect(within(within(aside).getByRole('list', { name: 'Jugadas' })).getAllByRole('button').map((item) => item.textContent)).toEqual(['2Colocás Called by the Grave', '1Invocación Especial de Ash Blossom en defensa', '0Mano inicial'])

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(screen.getByRole('button', { name: 'Reproducir' })).toBeInTheDocument()
    expect(within(status()).getByText('1/2')).toBeInTheDocument()
    expect(within(status()).getByText('Invocación Especial de Ash Blossom en defensa')).toBeInTheDocument()
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom, en defensa' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(within(status()).getByText('2/2')).toBeInTheDocument()
    expect(within(zone('Zona de magia y trampa 1')).getByRole('button', { name: 'Called by the Grave, boca abajo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled()

    // Una jugada nueva a mitad de la reproducción deja de lado lo que seguía.
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    tap(within(hand()).getByRole('listitem', { name: 'Nibiru' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 2: elegir' }))
    expect(within(status()).getByText('2/2')).toBeInTheDocument()
    expect(within(status()).getByText('Invocación Normal de Nibiru')).toBeInTheDocument()
    expect(within(hand()).getByRole('listitem', { name: 'Called by the Grave' })).toBeInTheDocument()
  })

  it('un combo guardado se renombra desde la lista, sin tocar sus jugadas', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
    tapMenu('Guardar combo')
    const saving = screen.getByRole('dialog', { name: 'Guardar combo' })
    fireEvent.change(within(saving).getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Línea básica' } })
    fireEvent.click(within(saving).getByRole('button', { name: 'Guardar' }))

    const aside = screen.getByRole('region', { name: 'Pasos y combos' })
    fireEvent.click(within(aside).getByRole('radio', { name: 'Combos' }))

    // El nombre lleva todo el ancho de la fila (las acciones van abajo, no al lado) y, si se corta, se lee entero en el título.
    const listed = within(aside).getByText('Línea básica')
    expect(listed).toHaveAttribute('title', 'Línea básica')
    expect(listed.closest('li')).not.toHaveClass('grid-cols-[minmax(0,1fr)_auto]')

    fireEvent.click(within(aside).getByRole('button', { name: 'Renombrar Línea básica' }))

    // El campo arranca con el nombre de siempre y no repite el aviso de qué se guarda.
    const dialog = screen.getByRole('dialog', { name: 'Renombrar combo' })
    expect(within(dialog).getByRole('textbox', { name: 'Nombre' })).toHaveValue('Línea básica')
    expect(within(dialog).queryByText(/Se guardan la mano/)).not.toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Apertura Ash' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    expect(screen.queryByRole('dialog', { name: 'Renombrar combo' })).not.toBeInTheDocument()
    expect(within(aside).getByText('Apertura Ash')).toBeInTheDocument()
    expect(within(aside).queryByText('Línea básica')).not.toBeInTheDocument()

    const [saved] = JSON.parse(localStorage.getItem('ygo-lab:practice-combos') ?? '[]') as Array<{ name: string; actions: unknown[] }>
    expect(saved?.name).toBe('Apertura Ash')
    expect(saved?.actions).toHaveLength(1)
  })

  it('atacar: un monstruo en ataque ofrece "Ataque directo" sólo en la Battle Phase, y el ataque queda en la lista de pasos', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))

    // Antes de la Battle Phase no se ofrece.
    tap(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' }))
    expect(screen.queryByRole('menuitem', { name: 'Ataque directo' })).not.toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    goToPhase('Battle Phase')
    tap(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' }))
    // Sin rival (la práctica) no hay a quién elegir: sólo el directo, y primero.
    expect(screen.queryByRole('menuitem', { name: 'Atacar' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('menuitem')[0]).toHaveTextContent('Ataque directo')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ataque directo' }))

    expect(within(status()).getByText('Atacás directo con Ash Blossom')).toBeInTheDocument()
    const list = within(screen.getByRole('region', { name: 'Pasos y combos' })).getByRole('list', { name: 'Jugadas' })
    expect(within(list).getAllByRole('button')[0]).toHaveTextContent('Atacás directo con Ash Blossom')
    // La carta sigue donde estaba: atacar no la mueve.
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
  })

  it('atacar no agranda la carta en el centro: la espada cruza la mesa desde el atacante, y pidiendo menos movimiento no se dibuja', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
    goToPhase('Battle Phase')
    const attackDirectly = () => {
      tap(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Ataque directo' }))
    }

    // Pidiendo menos movimiento (como en el resto de estas pruebas): el ataque se anota y la carta destella en su lugar, pero no hay espada ni carta grande.
    attackDirectly()
    expect(within(status()).getByText('Atacás directo con Ash Blossom')).toBeInTheDocument()
    expect(document.querySelector('[data-fx="strike"]')).toBeNull()
    expect(document.querySelector('[data-activation]')).toBeNull()

    // Aceptando el movimiento: la espada sale del atacante; en la práctica no hay rival, así que el directo llega al borde de arriba de la mesa. Y sigue sin carta grande.
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    attackDirectly()
    expect(document.querySelector('[data-fx="strike"]')).not.toBeNull()
    expect(document.querySelector('[data-kind="attack"]')).toBeNull()
    expect(document.querySelector('[data-activation]')).toBeNull()

    // Deshacer corta la espada que estaba en curso.
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(document.querySelector('[data-fx="strike"]')).toBeNull()
  })

  describe('contadores', () => {
    const plusButton = () => screen.getByRole('button', { name: 'Ficha' })
    const rows = () => within(within(screen.getByRole('region', { name: 'Pasos y combos' })).getByRole('list', { name: 'Jugadas' })).getAllByRole('button')

    /** Ash Blossom invocada en la zona 1: devuelve su carta. */
    function summon() {
      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
      return within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' })
    }

    it('«Poner contadores» se ve siempre en el +: sin ninguna carta en el campo dice qué falta (no se esconde) y no se puede elegir; con una carta, sí', () => {
      render(<Harness />)

      tap(plusButton())
      const menu = within(screen.getByRole('menu', { name: 'Agregar' }))
      const counters = menu.getByRole('menuitem', { name: /Poner contadores/ })

      expect(menu.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Ficha', 'Poner contadoresPoné una carta en el campo primero'])
      expect(counters).toHaveAttribute('aria-disabled', 'true')

      // Tocarla no hace nada: el menú sigue y no se entra en el modo de elegir carta.
      fireEvent.click(counters)
      expect(screen.getByRole('menu', { name: 'Agregar' })).toBeInTheDocument()
      expect(screen.queryByText('Tocá una carta para ponerle un contador')).not.toBeInTheDocument()

      fireEvent.keyDown(document, { key: "Escape" })
      summon()
      tap(plusButton())
      expect(screen.getByRole('menuitem', { name: 'Poner contadores' })).not.toHaveAttribute('aria-disabled')
    })

    it('el botón + los pone y los quita, tocando cartas hasta "Listo"; el menú de la carta no tiene contadores', () => {
      render(<Harness />)
      const card = summon()

      // Al tocar una carta no hay contadores en su menú.
      tap(card)
      expect(within(screen.getByRole('menu', { name: 'Ash Blossom' })).queryByRole('menuitem', { name: /contador/i })).not.toBeInTheDocument()
      fireEvent.keyDown(document, { key: 'Escape' })

      // El +: una ficha o poner contadores (quitar sólo si alguna carta tiene).
      tap(plusButton())
      expect(within(screen.getByRole('menu', { name: 'Agregar' })).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Ficha', 'Poner contadores'])
      fireEvent.click(screen.getByRole('menuitem', { name: 'Poner contadores' }))
      expect(within(status()).getByText('Tocá una carta para ponerle un contador')).toBeInTheDocument()
      expect(zone('Zona de monstruo 1')).toHaveAttribute('data-pick', 'true')
      expect(zone('Zona de monstruo 2')).toHaveAttribute('data-pick', 'false')
      // La carta que se elige lleva las esquinas del visor pero no el rombo (taparía la carta); la zona vacía de al lado, nada.
      expect(zone('Zona de monstruo 1').querySelector('.mat-pick-marks')).not.toBeNull()
      expect(zone('Zona de monstruo 1').querySelector('.mat-pick-diamond')).toBeNull()
      expect(zone('Zona de monstruo 2').querySelector('.mat-pick-marks')).toBeNull()

      // Cada toque suma uno y el modo sigue; una carta de la mano no hace nada.
      const before = rows().length
      tap(card)
      tap(card)
      tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
      expect(rows()).toHaveLength(before + 2)
      expect(rows()[0]).toHaveTextContent('Contador en Ash Blossom: 2')
      expect(within(status()).getByText('Tocá una carta para ponerle un contador')).toBeInTheDocument()
      fireEvent.click(within(status()).getByRole('button', { name: 'Listo' }))
      expect(screen.queryByText('Tocá una carta para ponerle un contador')).not.toBeInTheDocument()

      // Ahora hay con qué quitar: cada toque resta uno, y una carta sin contadores no se enciende ni cambia.
      tap(plusButton())
      expect(within(screen.getByRole('menu', { name: 'Agregar' })).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Ficha', 'Poner contadores', 'Quitar contadores'])
      fireEvent.click(screen.getByRole('menuitem', { name: 'Quitar contadores' }))
      expect(within(status()).getByText('Tocá una carta para quitarle un contador')).toBeInTheDocument()
      tap(card)
      expect(rows()[0]).toHaveTextContent('Contador en Ash Blossom: 1')
      tap(card)
      expect(rows()[0]).toHaveTextContent('Contador en Ash Blossom: 0')
      const total = rows().length
      expect(zone('Zona de monstruo 1')).toHaveAttribute('data-pick', 'false')
      tap(card)
      expect(rows()).toHaveLength(total)

      // Escape cierra el modo.
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(screen.queryByText('Tocá una carta para quitarle un contador')).not.toBeInTheDocument()
    })

    it('arrastrar el + sobre una carta del campo le pone un contador; con el campo vacío, el + sólo ofrece la ficha', () => {
      render(<Harness />)
      const card = summon()
      const target = zone('Zona de monstruo 1')

      document.elementFromPoint = () => target
      document.elementsFromPoint = () => [target]
      fireEvent.pointerDown(plusButton(), { ...pointer, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(plusButton(), { ...pointer, clientX: 80, clientY: 120 })
      fireEvent.pointerUp(plusButton(), { ...pointer, clientX: 80, clientY: 120 })

      expect(rows()[0]).toHaveTextContent('Contador en Ash Blossom: 1')
      expect(card).toBeInTheDocument()
    })
  })
})
