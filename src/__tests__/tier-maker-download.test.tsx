// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TIERLIST_VERSION, addCards, moveCard, newList, writeStore } from '../app/tierlist-maker'
import { TierMakerScreen } from '../components/meta/TierMakerScreen'

const { toast, renderImage } = vi.hoisted(() => ({ toast: vi.fn(), renderImage: vi.fn() }))

vi.mock('../components/CardArt', () => ({ CardArt: () => <img alt="" /> }))
vi.mock('../app/use-toast-message', () => ({ showToastMessage: toast, useToastMessage: () => ({ showToast: toast }) }))
vi.mock('../ygoprodeck', () => ({ searchCards: vi.fn(async () => ({ hasMore: false, results: [] })) }))
// jsdom no dibuja en un lienzo (la imagen en sí se prueba aparte, en `tierlist-image.test.ts`): acá importa el formato y el nombre del archivo que se baja.
vi.mock('../app/tierlist-image', () => ({ renderTierListImage: renderImage }))

const blobs: Blob[] = []
const downloads: string[] = []

beforeEach(() => {
  localStorage.clear()
  toast.mockClear()
  blobs.length = 0
  downloads.length = 0
  Element.prototype.scrollIntoView = () => {}
  URL.createObjectURL = (blob: Blob | MediaSource) => (blobs.push(blob as Blob), 'blob:tier-list')
  URL.revokeObjectURL = () => {}
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download)
  })

  // Una carta en la fila S, para que haya algo que descargar.
  const base = addCards(newList('Mi tier list'), [{ id: 101, name: 'Crossout Designator', image: null }])
  const list = moveCard(base, 101, { kind: 'tier', id: base.tiers[0]?.id ?? '' })

  writeStore({ version: TIERLIST_VERSION, activeId: list.id, lists: [list] })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
})

describe('la imagen de la tier list se baja como JPG (Gastón, 2026-10-22: «debe ser un jpg»)', () => {
  it('es un image/jpeg de calidad alta y el archivo se llama tier-list.jpg, no .png', async () => {
    const toBlob = vi.fn((done: BlobCallback, type?: string) => done(new Blob(['jpg'], { type })))

    renderImage.mockResolvedValue({ toBlob })
    render(<TierMakerScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar imagen' }))

    await waitFor(() => expect(downloads).toEqual(['tier-list.jpg']))
    expect(toBlob).toHaveBeenCalledTimes(1)
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.95)
    expect(blobs[0]?.type).toBe('image/jpeg')
  })

  it('si el navegador no arma la imagen, avisa en vez de bajar un archivo vacío', async () => {
    renderImage.mockResolvedValue({ toBlob: (done: BlobCallback) => done(null) })
    render(<TierMakerScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar imagen' }))

    await waitFor(() => expect(toast).toHaveBeenLastCalledWith('No pude armar la imagen. Probá de nuevo.', 'error'))
    expect(downloads).toEqual([])
  })
})
