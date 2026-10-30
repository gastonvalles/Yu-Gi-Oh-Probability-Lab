// @vitest-environment jsdom
import { act, fireEvent, render as plainRender, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSavedCombo, writeSavedCombos } from '../app/saved-combos'
import { SharedComboBar } from '../components/probability/PracticeMatPanel'
import { ReplayVideoDialog } from '../components/replays/ReplayVideo'
import type { VideoOptions } from '../components/replays/video/video-encode'
import type { VideoSubject } from '../components/replays/video/video-timeline'
import { Harness, INITIAL, render } from './support/practice-mat-harness'

// El codificador de verdad no existe en jsdom: uno falso que termina cuando la prueba quiere.
const fake = vi.hoisted(() => ({ calls: [] as { subject: VideoSubject; options: VideoOptions; finish: () => void }[] }))
vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))
vi.mock('../components/replays/video/video-support', () => ({ videoSupport: async () => ({ ok: true, codec: 'avc1.640028' }) }))
vi.mock('../components/replays/video/video-encode', () => ({
  makeReplayVideo: (subject: VideoSubject, options: VideoOptions) =>
    new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('cancelado', 'AbortError')))
      fake.calls.push({ subject, options, finish: () => resolve({ blob: new Blob([new Uint8Array(524288)], { type: 'video/mp4' }), durationMs: 8_000, frames: 30, codec: 'avc1.640028' }) })
    }),
}))

const combo = createSavedCombo({ name: 'Línea básica', deckName: 'Test', initial: INITIAL, actions: [{ type: 'draw', count: 1 }], nameOf: () => 'Ash Blossom' }, [])

beforeEach(() => {
  fake.calls = []
  localStorage.clear()
  writeSavedCombos([combo])
  URL.createObjectURL = vi.fn(() => 'blob:video')
  URL.revokeObjectURL = vi.fn()
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.cancelAnimationFrame = () => {}
})

describe('el video de un combo', () => {
  it('el ⋯ de la ficha arma el video del combo: progreso, «Video listo» y «Guardar video» con el nombre del combo', async () => {
    render(<Harness />)
    const aside = screen.getByRole('region', { name: 'Pasos y combos' })
    fireEvent.click(within(aside).getByRole('radio', { name: 'Combos' }))
    fireEvent.click(within(aside).getByRole('button', { name: 'Más opciones de Línea básica' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Descargar video' }))

    // Con la suite cargada, ver si hay soporte y empezar puede pasar el segundo de `waitFor`.
    await waitFor(() => expect(fake.calls).toHaveLength(1), { timeout: 5000 })
    expect(fake.calls[0]!.subject).toMatchObject({ kind: 'combo', combo: { name: 'Línea básica', actions: combo.actions } })
    act(() => fake.calls[0]!.options.onProgress?.(0.5))
    expect(screen.getByText('Armando el video…')).toBeInTheDocument()

    await act(async () => fake.calls[0]!.finish())
    expect(screen.getByText('Video listo (0,5 MB)')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar video' }))
    const file = vi.mocked(URL.createObjectURL).mock.calls.map(([value]) => value).find((value): value is File => value instanceof File)!
    expect(file.name).toBe(`Linea-basica-${combo.savedAt.slice(0, 10)}.mp4`)
  })

  it('el video sigue armándose aunque la mesa se vuelva a dibujar (el sujeto llega armado de nuevo en cada dibujo)', async () => {
    const { rerender } = plainRender(<ReplayVideoDialog subject={{ kind: 'combo', combo }} onClose={() => {}} />)
    await waitFor(() => expect(fake.calls).toHaveLength(1), { timeout: 5000 })
    rerender(<ReplayVideoDialog subject={{ kind: 'combo', combo }} onClose={() => {}} />)
    expect(fake.calls).toHaveLength(1)
    await act(async () => fake.calls[0]!.finish())
    expect(screen.getByText('Video listo (0,5 MB)')).toBeInTheDocument()
  })

  it('la barra de un combo compartido ofrece «Descargar video» (secundario: la principal sigue siendo guardarlo)', () => {
    const onVideo = vi.fn()
    const { id: _id, ...shared } = combo
    render(<SharedComboBar combo={shared} onSave={() => {}} onClose={() => {}} onVideo={onVideo} />)
    const bar = screen.getByRole('region', { name: 'Combo compartido' })
    fireEvent.click(within(bar).getByRole('button', { name: 'Descargar video' }))
    expect(onVideo).toHaveBeenCalledTimes(1)
  })
})
