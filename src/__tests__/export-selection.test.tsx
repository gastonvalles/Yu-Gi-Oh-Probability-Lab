// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ExportDeckPanel } from '../components/ExportDeckPanel'

vi.mock('../app/store', () => ({ stopPersisting: () => {} }))
vi.mock('../app/use-toast-message', () => ({ useToastMessage: () => ({ showToast: () => {} }) }))

const EMPTY_DECK = { deckName: 'Vacío', main: [], extra: [], side: [], isEditingDeck: false }

beforeEach(() => {
  localStorage.clear()
  // En escritorio: el botón de arriba (que abre el diálogo también con el deck vacío) sólo existe ahí.
  window.matchMedia = ((query: string) => ({ matches: query.includes('1101'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

const openDownload = () => {
  render(<ExportDeckPanel deckBuilder={EMPTY_DECK} deckFormat="unlimited" mainDeckCount={0} onExport={async () => {}} />)
  fireEvent.click(screen.getAllByRole('button', { name: 'Descargar' })[0]!)

  return within(screen.getByRole('dialog', { name: '¿Qué descargar?' }))
}

describe('Exportar: todo o lo que se elija', () => {
  it('el usuario elige qué archivos baja: cada uno se tilda por separado y el botón de abajo dice cuáles son', () => {
    const dialog = openDownload()
    const switches = dialog.getAllByRole('switch')

    expect(switches).toHaveLength(5)
    // Vienen tildados la imagen, el PDF y el YDK; el TXT y el JSON se piden.
    expect(switches.filter((item) => item.getAttribute('aria-checked') === 'true')).toHaveLength(3)
  })

  it('«Marcar todo» tilda todos los archivos (y entonces dice «Descargar todo»), «Desmarcar todo» los destilda', () => {
    const dialog = openDownload()

    fireEvent.click(dialog.getByRole('button', { name: 'Marcar todo' }))
    expect(dialog.getAllByRole('switch').every((item) => item.getAttribute('aria-checked') === 'true')).toBe(true)
    expect(dialog.getByRole('button', { name: 'Descargar todo' })).toBeInTheDocument()

    fireEvent.click(dialog.getByRole('button', { name: 'Desmarcar todo' }))
    expect(dialog.getAllByRole('switch').every((item) => item.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(dialog.getByRole('button', { name: 'Elegí qué descargar' })).toBeInTheDocument()
  })

  it('lo que se eligió se recuerda para la próxima vez', () => {
    const dialog = openDownload()

    fireEvent.click(dialog.getByRole('button', { name: 'Marcar todo' }))
    fireEvent.click(dialog.getByRole('button', { name: 'Desmarcar todo' }))

    expect(JSON.parse(localStorage.getItem('ygo-lab:export-selection') ?? '{}')).toEqual({ image: false, pdf: false, ydk: false, txt: false, json: false })
  })
})
