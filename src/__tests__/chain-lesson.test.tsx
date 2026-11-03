// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { describe, expect, it, vi } from 'vitest'

import { ChainNotice, type ChainNoticeRow } from '../components/auto/ChainNotice'

// El ⓘ de la cadena abre «Cómo se resuelve»: la línea clave y dos pares de órdenes con su veredicto escrito. En el cartel de escritorio y en la hoja del celular; leerla retiene la cadena.

const PONIX: ChainNoticeRow = { number: 1, who: 'Vos', mine: true, name: 'Ponix', art: null, state: 'chained' }
const ASH: ChainNoticeRow = { number: 2, who: 'Rival', mine: false, name: 'Ash Blossom', art: null, state: 'chained' }
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })

const notice = (rows: ChainNoticeRow[], compact: boolean, onOpenChange = vi.fn()) => {
  const ui = (next: ChainNoticeRow[]) => (
    <Provider store={store}>
      <ChainNotice rows={next} focus={next.length - 1} resolving={false} open compact={compact} onOpenChange={onOpenChange} onPick={() => {}} />
    </Provider>
  )
  const view = render(ui(rows))

  return { onOpenChange, rerender: (next: ChainNoticeRow[]) => view.rerender(ui(next)) }
}

const info = () => screen.getByRole('button', { name: 'Cómo se resuelve una cadena' })

function expectLesson() {
  const dialog = screen.getByRole('dialog', { name: 'Cómo se resuelve' })

  expect(within(dialog).getByText(/el último eslabón que se suma es el primero que resuelve/)).toBeInTheDocument()
  for (const [name, note] of [
    ['A · Esperá. Sale bien', /respondé con Veiler/],
    ['B · No dispares primero. Sale mal', /Si activás Veiler antes/],
    ['A · Respondé ya. Sale bien', /el rival no roba/],
    ['B · Después es tarde. Sale mal', /desterrarlo después no frena/],
  ] as const) {
    const region = within(dialog).getByRole('region', { name })

    expect(within(region).getByText(note)).toBeInTheDocument()
  }
  // Cartas reales: el Efecto Rápido es de Mirrorjade; Veiler responde y lo deja sin efecto.
  expect(within(within(dialog).getByRole('region', { name: 'A · Esperá. Sale bien' })).getAllByRole('listitem').map((item) => item.querySelector('.sr-only')?.textContent)).toEqual([
    'Eslabón 2: Effect Veiler, tuyo. Resuelta',
    'Eslabón 1: Mirrorjade the Iceblade Dragon, del rival. Sin efecto · por CL2',
  ])
  return dialog
}

describe('ChainLesson: «Cómo se resuelve» desde la cadena', () => {
  it('escritorio: el ⓘ va en la cabeza del cartel, abre la hoja, retiene la pila y Escape la cierra con el foco de vuelta en el ⓘ', async () => {
    const { onOpenChange, rerender } = notice([PONIX, ASH], false)
    const button = info()

    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    expect(button).toHaveClass('size-11')
    button.focus()
    fireEvent.click(button)
    expectLesson()
    expect(onOpenChange).toHaveBeenCalledWith(true)

    // La cadena sigue a su ritmo mientras se lee: un eslabón nuevo entra en la pila y la hoja sigue abierta.
    rerender([PONIX, ASH, { ...PONIX, number: 3 }])
    expect(within(screen.getByTestId('chain-notice')).getByRole('list', { name: /Eslabones de la cadena/ }).children).toHaveLength(3)
    expect(screen.getByRole('dialog', { name: 'Cómo se resuelve' })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(info()).toHaveFocus()
    // Cerrarla en escritorio no pliega la pila.
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('celular: el ⓘ va en la cabeza de la hoja; tocarlo no la baja, abre la lección y al cerrarla suelta la cadena', async () => {
    const { onOpenChange } = notice([PONIX, ASH], true)
    const grip = screen.getByRole('button', { name: 'Bajar la hoja' })

    fireEvent.click(info())
    expect(grip).toHaveAttribute('aria-expanded', 'true')
    expectLesson()
    expect(onOpenChange).toHaveBeenLastCalledWith(true)

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
  })

  it('celular: arrastrar desde el ⓘ sigue bajando la hoja y no abre la lección', () => {
    notice([PONIX, ASH], true)
    const base = { pointerId: 5, pointerType: 'touch', isPrimary: true }
    const button = info()

    fireEvent.pointerDown(button, { ...base, button: 0, buttons: 1, clientX: 120, clientY: 300 })
    fireEvent.pointerMove(button, { ...base, buttons: 1, clientX: 120, clientY: 360 })
    fireEvent.pointerMove(button, { ...base, buttons: 1, clientX: 120, clientY: 420 })
    fireEvent.pointerUp(button, { ...base, button: 0, buttons: 0, clientX: 120, clientY: 420 })
    fireEvent.click(button)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Subir la hoja/ })).toHaveAttribute('aria-expanded', 'false')
  })
})
