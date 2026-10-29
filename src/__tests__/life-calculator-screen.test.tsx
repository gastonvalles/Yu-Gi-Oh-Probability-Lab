// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { dispatchLife } from '../app/life-store'
import { LifeCalculatorScreen } from '../components/life/LifeCalculatorScreen'

beforeEach(() => dispatchLife({ type: 'reset' }))
afterEach(cleanup)

const pad = () => within(screen.getByRole('group', { name: 'Teclado' }))
const tap = (name: string | RegExp) => fireEvent.click(pad().getByRole('button', { name }))
const duelist = (name: RegExp) => screen.getByRole('button', { name })

function renderScreen(onClose = vi.fn()) {
  render(<LifeCalculatorScreen onClose={onClose} />)
  // La calculadora recuerda a quién iba la última operación: cada prueba arranca con el Duelista 1.
  fireEvent.click(duelist(/^Duelista 1:/))

  return onClose
}

describe('la calculadora de LP', () => {
  it('arranca con los dos duelistas en 8000 (el 1 a la izquierda con », el 2 a la derecha con «) y el teclado de siempre: Borrar, operaciones, dígitos, ceros rápidos y «=»', () => {
    renderScreen()

    expect(duelist(/^Duelista 1: 8000 LP/)).toHaveAttribute('aria-pressed', 'true')
    expect(duelist(/^Duelista 2: 8000 LP/)).toHaveAttribute('aria-pressed', 'false')
    expect(duelist(/^Duelista 1:/)).toHaveTextContent('Duelista 1 »')
    expect(duelist(/^Duelista 2:/)).toHaveTextContent('« Duelista 2')

    // El teclado, en su orden: Borrar 7 8 9 / + 4 5 6 / − 1 2 3 / ÷2 0 00 000.
    expect(pad().getAllByRole('button').map((key) => key.textContent)).toEqual(['Borrar', '7', '8', '9', '+', '4', '5', '6', '−', '1', '2', '3', '÷2', '0', '00', '000'])
    // Sin monto, «=» está apagado.
    expect(screen.getByRole('button', { name: /^Aplicar: restar 0/ })).toBeDisabled()
  })

  it('las teclas son rectas, sin esquinas redondeadas (el «=» y los botones del medio también)', () => {
    renderScreen()

    for (const key of pad().getAllByRole('button')) {
      expect(key).toHaveClass('rounded-none')
      expect(key.className).not.toMatch(/rounded-(control|card|panel|tag|full)/)
    }

    expect(screen.getByRole('button', { name: /^Aplicar:/ })).toHaveClass('rounded-none')
    expect(screen.getByRole('button', { name: 'Reiniciar' })).toHaveClass('rounded-none')
    expect(screen.getByRole('button', { name: 'Deshacer' })).toHaveClass('rounded-none')
  })

  it('se teclea un monto (uno o dos dígitos sin 0 son centenas) y se resta con «=»; entre el número y el teclado no queda ninguna fila (la de los cambios recientes ya no está)', () => {
    renderScreen()

    tap('1')
    tap('2')
    expect(screen.getByRole('status', { name: 'Duelista 1: 8000 menos 1200' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^Aplicar: restar 1200 a Duelista 1/ }))
    expect(duelist(/^Duelista 1: 6800 LP/)).toBeInTheDocument()
    expect(duelist(/^Duelista 2: 8000 LP/)).toBeInTheDocument()

    // El número que se escribe va pegado al teclado: la fila de en medio se borró del DOM (no se esconde).
    expect(screen.getByRole('status').parentElement?.nextElementSibling).toBe(screen.getByRole('group', { name: 'Teclado' }))
    expect(screen.queryByRole('button', { name: /^Restar 1200 a/ })).not.toBeInTheDocument()
  })

  it('como en Neuron: «5» es 500 con el «00» apagado, «50» y «500» son literales (500 no resta 5000) y «185» es 185', () => {
    renderScreen()

    tap('5')
    const status = screen.getByRole('status', { name: 'Duelista 1: 8000 menos 500' })
    expect(status).toHaveTextContent('8000−500')
    expect(status.querySelector('.text-soft')).toHaveTextContent(/^00$/)

    tap('0')
    expect(screen.getByRole('status', { name: 'Duelista 1: 8000 menos 50' }).querySelector('.text-soft')).toBeNull()

    tap('0')
    expect(screen.getByRole('status', { name: 'Duelista 1: 8000 menos 500' }).querySelector('.text-soft')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Aplicar: restar 500 a Duelista 1/ }))
    expect(duelist(/^Duelista 1: 7500 LP/)).toBeInTheDocument()

    tap('1')
    tap('8')
    tap('5')
    expect(screen.getByRole('status', { name: 'Duelista 1: 7500 menos 185' }).querySelector('.text-soft')).toBeNull()

    tap('Borrar lo tecleado')
    tap('5')
    tap('00')
    expect(screen.getByRole('status', { name: 'Duelista 1: 7500 menos 500' })).toBeInTheDocument()
  })

  it('los ceros rápidos (00 y 000), Sumar con el otro duelista elegido y Borrar', () => {
    renderScreen()

    fireEvent.click(duelist(/^Duelista 2:/))
    tap('Sumar')
    tap('5')
    tap('000')
    expect(screen.getByRole('status', { name: 'Duelista 2: 8000 más 5000' })).toBeInTheDocument()

    // «Borrar» saca todo lo tecleado.
    tap('Borrar lo tecleado')
    expect(screen.getByRole('status', { name: 'Duelista 2: 8000 LP' })).toBeInTheDocument()

    // Borrar también vuelve a Restar: se vuelve a elegir Sumar.
    tap('Sumar')
    tap('3')
    tap('00')
    tap('0')
    fireEvent.click(screen.getByRole('button', { name: /^Aplicar: sumar 3000 a Duelista 2/ }))
    expect(duelist(/^Duelista 2: 11000 LP/)).toBeInTheDocument()
    expect(duelist(/^Duelista 1: 8000 LP/)).toBeInTheDocument()
  })

  it('«÷2» deja al elegido con la mitad al instante', () => {
    renderScreen()

    tap('Dejar a Duelista 1 con la mitad')
    expect(duelist(/^Duelista 1: 4000 LP/)).toBeInTheDocument()
  })

  it('Reiniciar está en el medio, entre los dos: pide confirmar y vuelve las dos vidas a 8000 (cancelar no cambia nada)', () => {
    renderScreen()

    tap('Dejar a Duelista 1 con la mitad')
    tap('Dejar a Duelista 1 con la mitad')
    expect(duelist(/^Duelista 1: 2000 LP/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar' }))
    const confirm = within(screen.getByRole('alertdialog'))
    expect(confirm.getByText('¿Reiniciar las vidas?')).toBeInTheDocument()

    fireEvent.click(confirm.getByRole('button', { name: 'Cancelar' }))
    expect(duelist(/^Duelista 1: 2000 LP/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reiniciar vidas' }))
    expect(duelist(/^Duelista 1: 8000 LP/)).toBeInTheDocument()
    expect(duelist(/^Duelista 2: 8000 LP/)).toBeInTheDocument()
  })

  it('Deshacer, también en el medio: está apagado sin cambios y vuelve atrás el último', () => {
    renderScreen()

    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeDisabled()
    tap('Dejar a Duelista 1 con la mitad')
    expect(duelist(/^Duelista 1: 4000 LP/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(duelist(/^Duelista 1: 8000 LP/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeDisabled()
  })

  it('arriba: el reloj de la ronda, el registro del duelo y la moneda, el dado y los avisos (cada uno abre su hoja)', () => {
    const onClose = renderScreen()

    expect(screen.getByRole('button', { name: 'Poner a correr el reloj de la ronda' })).toHaveTextContent('50:00')

    tap('8')
    fireEvent.click(screen.getByRole('button', { name: /^Aplicar: restar 800 a Duelista 1/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Ver el registro del duelo' }))
    const log = within(screen.getByRole('dialog', { name: 'Registro del duelo' }))
    expect(log.getByText(/→ 7200/)).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: 'Herramientas' }))
    expect(screen.getByRole('dialog', { name: 'Herramientas' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar la calculadora' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('Herramientas, en pestañas: Dados + Monedas (se tira tocando la figura y el resultado queda abajo), Contadores y Avisos', () => {
    renderScreen()

    fireEvent.click(screen.getByRole('button', { name: 'Herramientas' }))
    const tools = within(screen.getByRole('dialog', { name: 'Herramientas' }))
    const tabs = within(tools.getByRole('radiogroup', { name: 'Herramientas' }))
    expect(tabs.getAllByRole('radio').map((tab) => tab.textContent)).toEqual(['Dados + Monedas', 'Contadores', 'Avisos'])
    expect(tabs.getByRole('radio', { name: 'Dados + Monedas' })).toHaveAttribute('aria-checked', 'true')

    // Sin tirar, cada resultado es una raya; tocar la figura tira y el resultado queda en su recuadro.
    expect(tools.getByText('Tocá para tirar.')).toBeInTheDocument()
    fireEvent.click(tools.getByRole('button', { name: 'Tirar la moneda' }))
    expect(tools.getByText(/^(Cara|Cruz)$/)).toBeInTheDocument()
    fireEvent.click(tools.getByRole('button', { name: 'Tirar el dado' }))
    expect(tools.getByText(/^Salió [1-6]$/)).toBeInTheDocument()
    // Las otras pestañas están montadas pero escondidas (el diálogo no cambia de alto): no se leen ni se tocan.
    expect(tools.queryByRole('button', { name: 'Contador 1: más' })).not.toBeInTheDocument()

    fireEvent.click(tabs.getByRole('radio', { name: 'Avisos' }))
    expect(tools.getByText('Probar los avisos de la ronda')).toBeInTheDocument()
    expect(tools.getByRole('button', { name: '10 min' })).toBeInTheDocument()
    expect(tools.queryByRole('button', { name: 'Tirar el dado' })).not.toBeInTheDocument()
  })

  it('los cuatro contadores: «−» apagado en 0, «+» y «−» de a uno; siguen al cerrar y reabrir y Reiniciar los vuelve a 0', () => {
    renderScreen()
    const openCounters = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Herramientas' }))
      const tools = within(screen.getByRole('dialog', { name: 'Herramientas' }))
      fireEvent.click(tools.getByRole('radio', { name: 'Contadores' }))
      return tools
    }

    let tools = openCounters()
    expect(tools.getAllByRole('status').filter((value) => /^Contador/.test(value.getAttribute('aria-label') ?? ''))).toHaveLength(4)
    expect(tools.getByRole('button', { name: 'Contador 1: menos' })).toBeDisabled()
    for (let i = 0; i < 5; i += 1) fireEvent.click(tools.getByRole('button', { name: 'Contador 1: más' }))
    fireEvent.click(tools.getByRole('button', { name: 'Contador 1: menos' }))
    fireEvent.click(tools.getByRole('button', { name: 'Contador 4: más' }))
    expect(tools.getByRole('status', { name: 'Contador 1' })).toHaveTextContent('4')
    expect(tools.getByRole('status', { name: 'Contador 4' })).toHaveTextContent('1')
    fireEvent.keyDown(document, { key: 'Escape' })

    tools = openCounters()
    expect(tools.getByRole('status', { name: 'Contador 1' })).toHaveTextContent('4')
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reiniciar vidas' }))
    tools = openCounters()
    expect(tools.getByRole('status', { name: 'Contador 1' })).toHaveTextContent('0')
    expect(tools.getByRole('status', { name: 'Contador 4' })).toHaveTextContent('0')
  })

  describe('con el celular acostado', () => {
    const original = window.matchMedia

    beforeEach(() => {
      window.matchMedia = ((query: string) => ({ matches: query.includes('orientation: landscape'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    })
    afterEach(() => {
      window.matchMedia = original
    })

    it('es un marcador sin teclado: el reloj, las dos vidas con Reiniciar y Deshacer en el medio y abajo Registro, Herramientas y Calcular', () => {
      renderScreen()

      expect(screen.queryByRole('group', { name: 'Teclado' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Poner a correr el reloj de la ronda' })).toHaveTextContent('50:00')
      expect(duelist(/^Duelista 1: 8000 LP/)).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Reiniciar' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Deshacer' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Registro' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Herramientas' })).toBeInTheDocument()
    })

    it('Calcular abre el teclado aparte; aplicar cambia la vida del elegido y lo cierra', () => {
      renderScreen()

      fireEvent.click(duelist(/^Duelista 2:/))
      fireEvent.click(screen.getByRole('button', { name: 'Calcular' }))
      const dialog = within(screen.getByRole('dialog', { name: 'Calcular' }))
      fireEvent.click(within(dialog.getByRole('group', { name: 'Teclado' })).getByRole('button', { name: '5' }))
      fireEvent.click(dialog.getByRole('button', { name: /^Aplicar: restar 500 a Duelista 2/ }))

      expect(screen.queryByRole('dialog', { name: 'Calcular' })).not.toBeInTheDocument()
      expect(duelist(/^Duelista 2: 7500 LP/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Deshacer' })).toBeEnabled()
    })
  })
})
