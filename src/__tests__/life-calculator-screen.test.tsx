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
  // La calculadora recuerda a quién iba la última operación: cada prueba arranca con Vos.
  fireEvent.click(duelist(/^Vos:/))

  return onClose
}

describe('la calculadora de LP', () => {
  it('arranca con los dos en 8000, el teclado de dígitos con la columna de operaciones y «Tecleá la cantidad»', () => {
    renderScreen()

    expect(duelist(/^Vos: 8000 LP/)).toHaveAttribute('aria-pressed', 'true')
    expect(duelist(/^Rival: 8000 LP/)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('Tecleá la cantidad')).toBeInTheDocument()

    for (const digit of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(pad().getByRole('button', { name: digit })).toBeInTheDocument()
    }

    expect(pad().getByRole('button', { name: 'Restar' })).toHaveAttribute('aria-pressed', 'true')
    expect(pad().getByRole('button', { name: 'Sumar' })).toHaveAttribute('aria-pressed', 'false')
    expect(pad().getByRole('button', { name: 'Dejar a Vos con la mitad' })).toBeInTheDocument()
    expect(pad().getByRole('button', { name: 'Borrar el último dígito' })).toBeInTheDocument()
    // Sin monto, «=» está apagado.
    expect(pad().getByRole('button', { name: /^Aplicar: restar 0/ })).toBeDisabled()
  })

  it('se teclea un monto (con menos de tres cifras son centenas), se resta con «=» y el cambio queda a mano en «Reciente»', () => {
    renderScreen()

    tap('1')
    tap('2')
    expect(screen.getByRole('status', { name: 'Vos: 8000 menos 1200' })).toBeInTheDocument()

    tap(/^Aplicar: restar 1200 a Vos/)
    expect(duelist(/^Vos: 6800 LP/)).toBeInTheDocument()
    expect(duelist(/^Rival: 8000 LP/)).toBeInTheDocument()

    // El mismo cambio, repetido con un toque desde «Reciente».
    fireEvent.click(within(screen.getByRole('group', { name: 'Repetir un cambio reciente' })).getByRole('button', { name: 'Restar 1200 a Vos' }))
    expect(duelist(/^Vos: 5600 LP/)).toBeInTheDocument()
  })

  it('con Sumar y el rival elegido la cuenta va para él, y borrar saca de a un dígito', () => {
    renderScreen()

    fireEvent.click(duelist(/^Rival: 8000 LP/))
    tap('Sumar')
    tap('5')
    tap('0')
    // 50 es 5000; sin el 0, 5 es 500.
    expect(screen.getByRole('status', { name: 'Rival: 8000 más 5000' })).toBeInTheDocument()
    tap('Borrar el último dígito')
    expect(screen.getByRole('status', { name: 'Rival: 8000 más 500' })).toBeInTheDocument()

    tap(/^Aplicar: sumar 500 a Rival/)
    expect(duelist(/^Rival: 8500 LP/)).toBeInTheDocument()
    expect(duelist(/^Vos: 8000 LP/)).toBeInTheDocument()
  })

  it('la mitad se aplica sola y Deshacer vuelve atrás', () => {
    renderScreen()

    tap('Dejar a Vos con la mitad')
    expect(duelist(/^Vos: 4000 LP/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(duelist(/^Vos: 8000 LP/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deshacer' })).toBeDisabled()
  })

  it('la moneda, el dado y los avisos son un solo botón de arriba que abre un panel (no tres botones abajo que abrían lo mismo)', () => {
    renderScreen()

    expect(screen.queryByRole('button', { name: 'Moneda' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Dado' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Moneda, dado y avisos' }))
    const panel = () => within(screen.getByRole('dialog', { name: 'Moneda, dado y avisos' }))
    expect(panel().getByText('Tocá para tirar.')).toBeInTheDocument()

    fireEvent.click(panel().getByRole('button', { name: 'Moneda' }))
    expect(panel().getByText(/^(Cara|Cruz)$/)).toBeInTheDocument()

    fireEvent.click(panel().getByRole('button', { name: 'Dado' }))
    expect(panel().getByText(/^Salió [1-6]$/)).toBeInTheDocument()
  })

  it('Deshacer está junto a los últimos cambios y los avisos de la ronda siguen en el panel', () => {
    renderScreen()

    const recent = within(screen.getByRole('group', { name: 'Repetir un cambio reciente' }))
    expect(recent.getByRole('button', { name: 'Deshacer' })).toBeDisabled()
  })

  it('el registro: al costado a la vista y, desde el ícono, en una hoja; «Reiniciar vidas» pide confirmar', () => {
    renderScreen()

    tap('8')
    tap(/^Aplicar: restar 800 a Vos/)

    // El registro del costado (en el celular se esconde con CSS y se abre desde el ícono).
    expect(within(screen.getByRole('complementary', { name: 'Registro del duelo' })).getByText('7200')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver el registro del duelo' }))
    const sheet = within(screen.getByRole('dialog', { name: 'Registro del duelo' }))
    expect(sheet.getByText('Vos')).toBeInTheDocument()
    // Reiniciar las vidas vive en el registro (borra la ronda): al pie de la hoja en el celular, y al costado en escritorio.
    expect(sheet.getByRole('button', { name: 'Reiniciar vidas' })).toBeEnabled()
    fireEvent.keyDown(document, { key: 'Escape' })

    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar vidas' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reiniciar vidas' }))
    expect(duelist(/^Vos: 8000 LP/)).toBeInTheDocument()
  })
})
