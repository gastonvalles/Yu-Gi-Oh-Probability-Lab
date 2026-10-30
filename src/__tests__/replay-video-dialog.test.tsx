// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildDuelReplay } from '../app/duel-replay'
import { createMatState } from '../app/practice-mat'
import { ReplayVideoDialog } from '../components/replays/ReplayVideo'
import { SaveReplayDialog } from '../components/replays/SaveReplayDialog'
import type { VideoOptions } from '../components/replays/video/video-encode'
import type { VideoSupport } from '../components/replays/video/video-support'
import type { VideoSubject } from '../components/replays/video/video-timeline'

// El codificador de verdad no existe en jsdom: uno falso que avisa el progreso y termina (o se cancela) cuando la prueba quiere.
const fake = vi.hoisted(() => ({
  support: { ok: true, codec: 'avc1.640028' } as VideoSupport,
  calls: [] as { subject: VideoSubject; options: VideoOptions; finish: () => void }[],
}))
vi.mock('../components/replays/video/video-support', () => ({ videoSupport: async () => fake.support }))
vi.mock('../components/replays/video/video-encode', () => ({
  makeReplayVideo: (subject: VideoSubject, options: VideoOptions) =>
    new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('cancelado', 'AbortError')))
      fake.calls.push({ subject, options, finish: () => resolve({ blob: new Blob([new Uint8Array(1048576)], { type: 'video/mp4' }), durationMs: 12_000, frames: 40, codec: 'avc1.640028' }) })
    }),
}))

const mine = createMatState(Array.from({ length: 20 }, (_, i) => `card-${14558127 + (i % 4)}-${Math.floor(i / 4) + 1}`), [], 5)
const replayOf = (view: 'public' | 'mine') =>
  buildDuelReplay({
    mode: 'solo-auto',
    view,
    players: ['Ana', 'Beto'],
    starter: 0,
    mine: { initial: mine, actions: [{ type: 'phase', phase: 'main1' }, { type: 'place', id: mine.hand[0]!, zone: 'mz', index: 0, pos: 'atk', how: 'normal' }] },
    theirs: { initial: createMatState(Array.from({ length: 20 }, (_, i) => `c${i + 1}`), [], 5), acts: [] },
    order: ['mine', 'mine'],
    life: [{ at: 0, lp: [8000, 8000] }],
    nameOf: () => 'Carta',
    now: new Date('2026-10-29T12:00:00Z'),
  })
/** Uno de más de 6 minutos de video. */
const long = (view: 'public' | 'mine') => {
  const replay = replayOf(view)
  return { ...replay, steps: Array.from({ length: 800 }, () => replay.steps[1]!) }
}

beforeEach(() => {
  fake.support = { ok: true, codec: 'avc1.640028' }
  fake.calls = []
  URL.createObjectURL = vi.fn(() => 'blob:video')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(navigator, 'canShare')
})

const progress = (value: number) => act(() => fake.calls.at(-1)!.options.onProgress?.(value))
const finish = () => act(async () => fake.calls.at(-1)!.finish())

describe('«Descargar video» en «Guardar replay»', () => {
  it('sin soporte, el botón queda apagado y dice por qué; guardar el replay sigue andando', async () => {
    fake.support = { ok: false, reason: 'webcodecs' }
    render(<SaveReplayDialog isOpen onClose={() => {}} build={replayOf} />)

    expect(await screen.findByText(/Este navegador no puede armar videos/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar video' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Guardar replay' })).toBeEnabled()
    // Los dos van juntos, en su propia fila (no se parten entre ellos en el celular).
    const save = screen.getByRole('button', { name: 'Guardar replay' })
    expect(screen.getByRole('button', { name: 'Descargar video' }).parentElement).toBe(save.parentElement)
    expect(save.parentElement?.tagName).toBe('DIV')
  })

  it('arma el video con la vista elegida: progreso, «No cierres…» y «Cancelar», que corta y vuelve a las opciones', async () => {
    const build = vi.fn(replayOf)
    render(<SaveReplayDialog isOpen onClose={() => {}} build={build} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Descargar video' })).toBeEnabled())

    fireEvent.click(screen.getByRole('switch', { name: 'Incluir mi mano y mis cartas boca abajo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Descargar video' }))
    await waitFor(() => expect(fake.calls).toHaveLength(1))
    expect(build).toHaveBeenLastCalledWith('mine')
    expect(fake.calls[0]!.options.speed).toBe(1)

    progress(0.42)
    expect(screen.getByText('Armando el video…')).toBeInTheDocument()
    expect(screen.getByText(/No cierres ni cambies de pestaña/)).toBeInTheDocument()
    expect(screen.getByRole('meter', { name: 'Video armado al 42 %' })).toHaveAttribute('aria-valuenow', '42')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(fake.calls[0]!.options.signal?.aborted).toBe(true)
    expect(screen.getByRole('button', { name: 'Guardar replay' })).toBeInTheDocument()
  })

  it('listo: dice cuánto pesa y ofrece «Guardar video» (y «Compartir video» sólo si el sistema puede)', async () => {
    render(<SaveReplayDialog isOpen onClose={() => {}} build={replayOf} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Descargar video' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Descargar video' }))
    await waitFor(() => expect(fake.calls).toHaveLength(1))
    await finish()

    expect(screen.getByText('Video listo (1,0 MB)')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Compartir video' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar video' }))
    const file = vi.mocked(URL.createObjectURL).mock.calls[0]![0] as File
    expect(file.name).toBe('Ana-vs-Beto-2026-10-29.mp4')
    expect(file.type).toBe('video/mp4')
    // «Volver» lleva a las opciones, para guardarlo también.
    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.getByRole('button', { name: 'Guardar replay' })).toBeInTheDocument()
  })

  it('con la hoja de compartir del sistema, también «Compartir video»', async () => {
    Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true })
    render(<SaveReplayDialog isOpen onClose={() => {}} build={replayOf} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Descargar video' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Descargar video' }))
    await waitFor(() => expect(fake.calls).toHaveLength(1))
    await finish()
    const share = screen.getByRole('button', { name: 'Compartir video' })
    // Compartir y Guardar van juntos (no se parten entre ellos en el celular) y «Volver» queda aparte, a la izquierda.
    expect(share.parentElement).toBe(screen.getByRole('button', { name: 'Guardar video' }).parentElement)
    expect(screen.getByRole('button', { name: 'Volver' }).parentElement).not.toBe(share.parentElement)
  })

  it('un duelo de más de 6 minutos de video ofrece «Rápido (2×)», prendido', async () => {
    render(<SaveReplayDialog isOpen onClose={() => {}} build={long} />)
    const fast = await screen.findByRole('switch', { name: 'Rápido (2×)' })
    expect(fast).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/^Cada jugada a la mitad: el video dura 6:0\d en vez de 12:0\d\.$/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Descargar video' }))
    await waitFor(() => expect(fake.calls).toHaveLength(1))
    expect(fake.calls[0]!.options.speed).toBe(2)
  })

  it('cerrar el diálogo cancela el video', async () => {
    const onClose = vi.fn()
    render(<SaveReplayDialog isOpen onClose={onClose} build={replayOf} />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Descargar video' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Descargar video' }))
    await waitFor(() => expect(fake.calls).toHaveLength(1))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
    expect(fake.calls[0]!.options.signal?.aborted).toBe(true)
  })
})

describe('«Descargar video» de un replay guardado', () => {
  it('uno corto se arma al abrir; uno largo pregunta primero', async () => {
    const { unmount } = render(<ReplayVideoDialog subject={{ kind: 'duel', replay: replayOf('public') }} onClose={() => {}} />)
    await waitFor(() => expect(fake.calls).toHaveLength(1))
    expect(fake.calls[0]!.options.speed).toBe(1)
    // Cerrarlo (desmontarlo) también corta.
    unmount()
    expect(fake.calls[0]!.options.signal?.aborted).toBe(true)

    render(<ReplayVideoDialog subject={{ kind: 'duel', replay: long('public') }} onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Armar video' }))
    await waitFor(() => expect(fake.calls).toHaveLength(2))
    expect(fake.calls[1]!.options.speed).toBe(2)
  })

  it('sin soporte, el motivo', async () => {
    fake.support = { ok: false, reason: 'h264' }
    render(<ReplayVideoDialog subject={{ kind: 'duel', replay: replayOf('public') }} onClose={() => {}} />)
    expect(await screen.findByText(/no tiene el códec de video H\.264/)).toBeInTheDocument()
    expect(fake.calls).toHaveLength(0)
  })
})
