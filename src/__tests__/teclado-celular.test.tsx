// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { afterEach, describe, expect, it } from 'vitest'

import { PileViewer, SaveComboDialog } from '../components/probability/MatDialogs'
import { Modal } from '../components/ui/Modal'

// Abrir un menú, una hoja o un visor en el celular no abre el teclado: con puntero táctil el foco inicial nunca va a un campo de texto (sólo al tocarlo), salvo una superficie que
// existe para escribir (`data-initial-focus="type"`, el buscador de la app). Con mouse, el buscador de un visor sigue recibiendo el foco al abrirse.
const store = configureStore({ reducer: { settings: (state = { handSize: 5, deckFormat: 'unlimited' as const }) => state } })
const original = window.matchMedia

const pointer = (kind: 'coarse' | 'fine') => {
  window.matchMedia = ((query: string) => ({ matches: query.includes(`pointer: ${kind}`), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
}
const typing = () => document.activeElement?.matches('input, textarea') ?? false

afterEach(() => {
  window.matchMedia = original
})

const pile = () =>
  render(
    <Provider store={store}>
      <PileViewer pile="deck" ids={['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']} info={(id) => ({ name: `Carta ${id}`, art: null })} targeted={new Set()} onPick={() => {}} onClose={() => {}} />
    </Provider>,
  )

describe('abrir algo en el celular no abre el teclado', () => {
  it('el visor de una pila con buscador: con el dedo, la primera carta; con mouse, el buscador', async () => {
    pointer('coarse')
    const touch = pile()

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Carta a/ })))
    expect(typing()).toBe(false)
    touch.unmount()

    pointer('fine')
    pile()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('searchbox')))
  })

  it('un diálogo con un campo (guardar combo): con el dedo, un botón dentro del diálogo; con mouse, el campo', async () => {
    pointer('coarse')
    const touch = render(<SaveComboDialog isOpen defaultName="Combo" onSave={() => {}} onClose={() => {}} />)

    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement))
    expect(document.activeElement?.tagName).toBe('BUTTON')
    touch.unmount()

    pointer('fine')
    render(<SaveComboDialog isOpen defaultName="Combo" onSave={() => {}} onClose={() => {}} />)
    await waitFor(() => expect(typing()).toBe(true))
  })

  it('el buscador de la app (`data-initial-focus="type"`) sí recibe el foco con el dedo: existe para escribir', async () => {
    pointer('coarse')
    render(
      <Modal isOpen onClose={() => {}} ariaLabel="Buscar">
        <input aria-label="Buscar" data-initial-focus="type" />
      </Modal>,
    )

    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Buscar' })))
  })
})
