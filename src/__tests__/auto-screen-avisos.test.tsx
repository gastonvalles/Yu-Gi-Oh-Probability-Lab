// @vitest-environment jsdom
import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'

import type { CoreAsk } from '../app/auto/protocol'
import { core, lane, renderAuto } from './support/auto-screen-harness'

// Lo que salió mal, en la línea: con palabras de la mesa; el detalle técnico (la nota del adaptador, el mensaje del núcleo, el tipo de la pregunta) va a la consola.

const ANNOUNCE: CoreAsk = { type: 'announce_card', player: 0, opcodes: ['46986414'] }

describe('auto-screen · los avisos de la línea', () => {
  it('lo que la mesa no pudo mostrar, un error del núcleo, una respuesta rechazada y una pregunta sin respuesta: nunca el texto interno', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = renderAuto()

    core(() => fake.set({ status: 'ready', replaying: false, unmapped: ['unsupported: swap'] }))
    expect(lane()).toHaveTextContent('La mesa no pudo mostrar una jugada del núcleo; el duelo sigue igual.')
    expect(lane()).not.toHaveTextContent('swap')
    expect(warn).toHaveBeenCalledWith('[auto] la mesa no pudo mostrar:', 'unsupported: swap')

    core(() => fake.fault({ kind: 'unhandled', message: 'unhandled message 42', cards: [] }, false))
    expect(lane()).toHaveTextContent('Algo falló en el núcleo, pero el duelo sigue.')
    expect(warn).toHaveBeenCalledWith('[auto] el núcleo avisó un error:', 'unhandled', 'unhandled message 42')

    core(() => fake.fault({ kind: 'retry', message: 'RETRY: the core rejected the answer to select_card', cards: [] }, false))
    expect(lane()).toHaveTextContent('El núcleo no aceptó esa respuesta: elegí de nuevo.')

    core(() => fake.ask(ANNOUNCE))
    expect(lane()).toHaveTextContent('El automático todavía no sabe contestar esta pregunta del núcleo.')
    expect(lane()).not.toHaveTextContent('announce_card')
    expect(warn).toHaveBeenCalledWith('[auto] una pregunta sin respuesta segura:', 'announce_card')
    warn.mockRestore()
  })
})
