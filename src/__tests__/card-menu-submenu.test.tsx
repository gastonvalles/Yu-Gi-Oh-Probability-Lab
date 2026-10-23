// @vitest-environment jsdom
// El menú pegado a la carta (escritorio) con sus submenús de «cómo», y la hoja del celular con la flecha de los grupos y la de volver.
import { act, fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CardMenu, type MenuItem } from '../components/probability/MatDialogs'
import { Harness, hand, render, status, tap } from './support/practice-mat-harness'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

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

afterEach(() => {
  vi.useRealTimers()
})

// jsdom no trae `DOMRect`: la carta tocada, con sus medidas.
const ANCHOR = { x: 400, y: 400, left: 400, top: 400, width: 60, height: 90, right: 460, bottom: 490, toJSON: () => ({}) } as DOMRect

/** Un menú de muestra: apoyo, envíos y jugadas, con dos grupos (Desterrar e Invocación Especial). */
function sampleItems(picked: string[] = []): MenuItem[] {
  const pick = (label: string) => () => picked.push(label)
  const answers = (group: string, labels: string[]) => labels.map((label) => ({ label, onSelect: pick(`${group}: ${label}`) }))

  return [
    { label: 'Revelar', onSelect: pick('Revelar') },
    { label: 'Target', onSelect: pick('Target') },
    { label: 'Descartar', onSelect: pick('Descartar'), divider: true },
    { label: 'Desterrar', onSelect: pick('Desterrar'), children: answers('Desterrar', ['Boca arriba', 'Boca abajo']) },
    { label: 'Invocación Especial', onSelect: pick('Invocación Especial'), children: answers('Invocación Especial', ['En ataque', 'En defensa']), divider: true },
    { label: 'Invocación Normal', onSelect: pick('Invocación Normal') },
  ]
}

const menuOf = (name: string) => screen.getByRole('menu', { name })
const key = (target: Element, name: string) => fireEvent.keyDown(target, { key: name })

describe('el submenú del menú pegado a la carta', () => {
  it('una opción de «cómo» lleva la flecha sólo-ícono y avisa que abre un menú, con el mismo nombre accesible; las demás, no', () => {
    renderBare(<CardMenu anchor={ANCHOR} kicker="Mano" title="Ash Blossom" items={sampleItems()} onClose={() => {}} />)

    const group = screen.getByRole('menuitem', { name: 'Invocación Especial' })
    const plain = screen.getByRole('menuitem', { name: 'Invocación Normal' })

    expect(group).toHaveAttribute('aria-haspopup', 'menu')
    expect(group).toHaveAttribute('aria-expanded', 'false')
    expect(group.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(group.textContent).toBe('Invocación Especial')
    expect(plain).not.toHaveAttribute('aria-haspopup')
    expect(plain.querySelector('svg')).toBeNull()
    // Todo al medio, con el relleno parejo; la línea fina entre bloques es decorativa (no es una opción).
    expect(group).toHaveClass('text-center', 'px-4')
    expect(plain).toHaveClass('text-center', 'px-2')
    expect(menuOf('Ash Blossom').querySelectorAll('[aria-hidden="true"].border-t')).toHaveLength(2)
  })

  it('un clic abre el submenú al costado (otro menú, con sus respuestas) y elegir una hace lo de esa respuesta', () => {
    const picked: string[] = []

    renderBare(<CardMenu anchor={ANCHOR} kicker="Mano" title="Ash Blossom" items={sampleItems(picked)} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))

    const sub = menuOf('Invocación Especial')

    expect(screen.getByRole('menuitem', { name: 'Invocación Especial' })).toHaveAttribute('aria-expanded', 'true')
    expect(within(sub).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['En ataque', 'En defensa'])
    // Va al lado del panel, no adentro (el panel scrollea y lo cortaría).
    expect(menuOf('Ash Blossom').contains(sub)).toBe(false)
    // El clic del teclado (Enter) pasa el foco a la primera respuesta.
    expect(document.activeElement).toBe(within(sub).getByRole('menuitem', { name: 'En ataque' }))

    fireEvent.click(within(sub).getByRole('menuitem', { name: 'En defensa' }))
    expect(picked).toEqual(['Invocación Especial: En defensa'])
  })

  it('con el teclado: ↑ ↓ Inicio y Fin recorren (dando la vuelta), → abre el submenú, ← lo cierra y vuelve a su fila; Escape cierra primero el submenú y después el menú', () => {
    const onClose = vi.fn()

    renderBare(<CardMenu anchor={ANCHOR} kicker="Mano" title="Ash Blossom" items={sampleItems()} onClose={onClose} />)

    const menu = menuOf('Ash Blossom')
    const row = (name: string) => within(menu).getByRole('menuitem', { name })

    row('Revelar').focus()
    key(menu, 'ArrowDown')
    expect(document.activeElement).toBe(row('Target'))
    key(menu, 'End')
    expect(document.activeElement).toBe(row('Invocación Normal'))
    key(menu, 'Home')
    expect(document.activeElement).toBe(row('Revelar'))
    // Desde la primera, ↑ va a la última: la jugada principal, abajo.
    key(menu, 'ArrowUp')
    expect(document.activeElement).toBe(row('Invocación Normal'))

    row('Desterrar').focus()
    key(menu, 'ArrowRight')
    const sub = menuOf('Desterrar')

    expect(document.activeElement).toBe(within(sub).getByRole('menuitem', { name: 'Boca arriba' }))
    key(sub, 'ArrowDown')
    expect(document.activeElement).toBe(within(sub).getByRole('menuitem', { name: 'Boca abajo' }))
    key(sub, 'ArrowLeft')
    expect(screen.queryByRole('menu', { name: 'Desterrar' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(row('Desterrar'))

    key(menu, 'ArrowRight')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu', { name: 'Desterrar' })).not.toBeInTheDocument()
    expect(document.activeElement).toBe(row('Desterrar'))
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('con el mouse: se abre al pasar (con una espera, no al pasar de largo), no se cierra al ir hacia él y se cierra al irse de la fila y del submenú', () => {
    vi.useFakeTimers()
    renderBare(<CardMenu anchor={ANCHOR} kicker="Mano" title="Ash Blossom" items={sampleItems()} onClose={() => {}} />)

    const group = screen.getByRole('menuitem', { name: 'Invocación Especial' })
    const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms))

    // Pasar de largo por la fila no lo abre.
    fireEvent.mouseEnter(group)
    wait(60)
    fireEvent.mouseLeave(group)
    fireEvent.mouseEnter(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    wait(200)
    expect(screen.queryByRole('menu', { name: 'Invocación Especial' })).not.toBeInTheDocument()

    fireEvent.mouseEnter(group)
    wait(130)
    const sub = menuOf('Invocación Especial')

    // Salir de la fila y llegar al submenú antes de la espera: sigue abierto.
    fireEvent.mouseLeave(group)
    wait(60)
    fireEvent.mouseEnter(sub)
    wait(300)
    expect(menuOf('Invocación Especial')).toBe(sub)

    fireEvent.mouseLeave(sub)
    wait(130)
    expect(screen.queryByRole('menu', { name: 'Invocación Especial' })).not.toBeInTheDocument()
  })

  it('una opción apagada no abre submenú aunque tenga respuestas', () => {
    const items = sampleItems().map((item) => (item.label === 'Desterrar' ? { ...item, disabled: true, hint: 'No va con Ash' } : item))

    renderBare(<CardMenu anchor={ANCHOR} kicker="GY" title="2 cartas" items={items} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('menuitem', { name: /^Desterrar/ }))

    expect(screen.getByRole('menuitem', { name: /^Desterrar/ })).not.toHaveAttribute('aria-haspopup')
    expect(screen.queryByRole('menu', { name: 'Desterrar' })).not.toBeInTheDocument()
  })
})

describe('los menús de la mesa con submenús', () => {
  const asDesktop = () => {
    const matchMedia = window.matchMedia

    window.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: query.includes('1101') || query.includes('reduce') })) as typeof window.matchMedia
    return () => {
      window.matchMedia = matchMedia
    }
  }

  it('escritorio: una carta de la mano va en bloques (apoyo, envíos, jugadas con la Invocación Normal abajo) y el submenú juega lo mismo que el segundo paso', () => {
    const restore = asDesktop()

    try {
      render(<Harness />)
      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))

      const menu = menuOf('Ash Blossom')

      expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Revelar', 'Target', 'Al deck', 'Descartar', 'Desterrar', 'Activar efecto', 'Invocación Especial', 'Colocar', 'Invocación Normal', 'Ver carta'])
      expect(['Al deck', 'Desterrar', 'Invocación Especial'].map((name) => within(menu).getByRole('menuitem', { name }).getAttribute('aria-haspopup'))).toEqual(['menu', 'menu', 'menu'])

      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Invocación Especial' }))
      fireEvent.click(within(menuOf('Invocación Especial')).getByRole('menuitem', { name: 'En ataque' }))
      // La misma jugada que el segundo paso de siempre, con su nombre completo.
      expect(within(status()).getByText('Tocá la zona para Invocación Especial: en ataque')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 2: elegir' }))
      expect(within(screen.getByRole('group', { name: 'Zona de monstruo 2' })).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
    } finally {
      restore()
    }
  })

  it('celular: los botones de «cómo» llevan la flecha (el mismo botón y el mismo nombre), y el segundo paso lleva la de volver a las jugadas', () => {
    render(<Harness />)
    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))

    const sheet = screen.getByRole('region', { name: 'Ash Blossom' })
    const special = within(sheet).getByRole('menuitem', { name: 'Invocación Especial' })

    expect(special.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(within(sheet).getByRole('menuitem', { name: 'Colocar' }).querySelector('svg')).toBeNull()
    expect(within(sheet).queryByRole('button', { name: 'Volver' })).not.toBeInTheDocument()

    fireEvent.click(special)
    expect(within(sheet).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['En ataque', 'En defensa'])
    fireEvent.click(within(sheet).getByRole('button', { name: 'Volver' }))
    expect(within(sheet).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Invocación Normal', 'Colocar', 'Invocación Especial', 'Activar efecto', 'Revelar', 'Target', 'Descartar', 'Desterrar', 'Al deck'])
    expect(document.activeElement).toBe(within(sheet).getByRole('menuitem', { name: 'Invocación Normal' }))
  })
})
