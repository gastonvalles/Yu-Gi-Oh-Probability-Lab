// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ExportDeckPanel } from '../components/ExportDeckPanel'

const stopPersisting = vi.fn()
const showToast = vi.fn()

vi.mock('../app/store', () => ({ stopPersisting: () => stopPersisting() }))
// Los toasts se dibujan en un <Toaster> que acá no está montado: se mira qué se pidió mostrar.
vi.mock('../app/use-toast-message', () => ({ useToastMessage: () => ({ showToast: (...args: unknown[]) => showToast(...args) }) }))

const EMPTY_DECK = { deckName: 'Vacío', main: [], extra: [], side: [], isEditingDeck: false }

beforeEach(() => {
  localStorage.clear()
  stopPersisting.mockClear()
  showToast.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('la copia de seguridad en Exportar', () => {
  it('descarga un JSON con lo guardado en este navegador', async () => {
    localStorage.setItem('ygo-lab:saved-builds', '[1]')
    localStorage.setItem('ygo-probability-lab:api-cache:v2', '{}')
    const blobs: Blob[] = []
    vi.stubGlobal('URL', { ...URL, createObjectURL: (blob: Blob) => (blobs.push(blob), 'blob:copia'), revokeObjectURL: () => {} })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<ExportDeckPanel deckBuilder={EMPTY_DECK} deckFormat="unlimited" mainDeckCount={0} onExport={async () => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar copia' }))

    expect(click).toHaveBeenCalledTimes(1)
    const saved = JSON.parse(await blobs[0]!.text()) as { app: string; entries: Record<string, string> }
    expect(saved.app).toBe('ygo-probability-lab')
    // Lo guardado va (la pantalla también guarda qué archivos tildaste); las cachés, no.
    expect(saved.entries['ygo-lab:saved-builds']).toBe('[1]')
    expect(Object.keys(saved.entries)).not.toContain('ygo-probability-lab:api-cache:v2')
  })

  it('restaurar pide confirmación, escribe la copia sin que el estado en memoria la pise y avisa si el archivo no sirve', async () => {
    render(<ExportDeckPanel deckBuilder={EMPTY_DECK} deckFormat="unlimited" mainDeckCount={0} onExport={async () => {}} />)
    const input = screen.getByLabelText('Archivo de la copia')

    fireEvent.change(input, { target: { files: [new File(['no es json'], 'mala.json', { type: 'application/json' })] } })
    await waitFor(() => expect(showToast).toHaveBeenCalledWith('El archivo no es un JSON válido.', 'error'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    const copy = JSON.stringify({ app: 'ygo-probability-lab', version: 1, savedAt: '2026-10-12T10:00:00.000Z', entries: { 'ygo-lab:saved-builds': '[2]' } })
    fireEvent.change(input, { target: { files: [new File([copy], 'copia.json', { type: 'application/json' })] } })

    const dialog = await screen.findByRole('alertdialog', { name: '¿Restaurar la copia?' })
    expect(dialog).toHaveTextContent('del 12/10/2026')
    fireEvent.click(screen.getByRole('button', { name: 'Restaurar' }))

    await waitFor(() => expect(localStorage.getItem('ygo-lab:saved-builds')).toBe('[2]'))
    expect(stopPersisting).toHaveBeenCalledTimes(1)
  })
})
