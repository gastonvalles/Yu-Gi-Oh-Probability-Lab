// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { REPORT_DRAFT_KEY } from '../app/reportar'
import { ReportarScreen } from '../components/reportar/ReportarScreen'

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers })

/** `fetch` simulado: `/build.json` da un commit y `/api/bug` contesta lo que pida la prueba. */
function mockFetch(bug: () => Response) {
  const request = vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => (String(url) === '/build.json' ? json(200, { sha: 'e920a300aabbccdd' }) : bug()))

  vi.stubGlobal('fetch', request)

  return () => request.mock.calls.filter(([url]) => String(url) === '/api/bug')
}

const field = (name: string) => screen.getByRole('textbox', { name: new RegExp(`^${name}`) })
const fillValid = () => {
  fireEvent.change(field('¿Qué pasó?'), { target: { value: 'El anillo del Lab no se mueve al cambiar de regla' } })
  fireEvent.change(screen.getByRole('combobox', { name: '¿En qué parte de la página?' }), { target: { value: 'Lab' } })
}
const send = () => fireEvent.click(screen.getByRole('button', { name: 'Enviar el reporte' }))

describe('Reportar un problema', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => vi.unstubAllGlobals())

  it('muestra los campos sin errores al entrar, el aviso de que es público y el honeypot oculto', async () => {
    mockFetch(() => json(500, {}))
    render(<ReportarScreen />)

    expect(screen.getByRole('heading', { level: 1, name: 'Reportar un problema' })).toBeInTheDocument()
    expect(screen.getByText(/se publica como un issue de GitHub/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cómo avisar en privado' })).toHaveAttribute('href', 'https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab/blob/main/SECURITY.md')
    for (const name of ['¿Qué pasó?', '¿Qué esperabas?', 'Pasos para repetirlo']) expect(field(name)).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('textbox', { name: /email|mail|nombre/i })).not.toBeInTheDocument()
    // Lo que se manda del navegador se ve antes de mandarlo, con la versión de /build.json.
    expect(await screen.findByText('Versión de la página: e920a30')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Incluir datos de mi navegador' }))
    expect(screen.getByText('No se manda nada de tu navegador.')).toBeInTheDocument()

    const hp = document.querySelector<HTMLInputElement>('input[name="hp"]')!
    expect(hp).toHaveAttribute('tabindex', '-1')
    expect(hp).toHaveAttribute('autocomplete', 'off')
    expect(hp.closest('[aria-hidden="true"]')).toHaveClass('sr-only')
  })

  it('un envío vacío marca los errores recién ahí, lleva el foco al primero y no manda nada', () => {
    const calls = mockFetch(() => json(201, {}))
    render(<ReportarScreen />)

    send()
    const que = field('¿Qué pasó?')
    expect(que).toHaveAttribute('aria-invalid', 'true')
    expect(que).toHaveFocus()
    expect(que).toHaveAccessibleDescription(/Contá qué pasó\./)
    expect(screen.getByRole('combobox', { name: '¿En qué parte de la página?' })).toHaveAccessibleDescription('Elegí en qué parte pasó.')
    expect(calls()).toHaveLength(0)
  })

  it('al enviar bien, agradece con el enlace al issue, borra el borrador y deja enviar otro', async () => {
    const calls = mockFetch(() => json(201, { ok: true, number: 42, url: 'https://github.com/o/r/issues/42' }))
    render(<ReportarScreen />)

    fillValid()
    expect(localStorage.getItem(REPORT_DRAFT_KEY)).toContain('anillo')
    await screen.findByText('Versión de la página: e920a30')
    send()

    expect(await screen.findByText('Gracias, tu reporte llegó')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver el reporte #42' })).toHaveAttribute('href', 'https://github.com/o/r/issues/42')
    expect(localStorage.getItem(REPORT_DRAFT_KEY)).toBeNull()
    const body = JSON.parse(String(calls()[0]![1]!.body))
    expect(body).toMatchObject({ area: 'Lab', hp: '', entorno: { build: 'e920a30' } })

    fireEvent.click(screen.getByRole('button', { name: 'Enviar otro reporte' }))
    expect(field('¿Qué pasó?')).toHaveValue('')
  })

  it.each([
    [() => json(503, { error: 'not_configured' }), /Los reportes todavía no se pueden enviar desde acá/],
    [() => json(429, { error: 'rate_limited' }, { 'Retry-After': '300' }), /Probá de nuevo en 5 minutos\./],
    [() => json(502, { error: 'upstream' }), /GitHub no respondió/],
    [() => json(413, { error: 'too_large' }), /demasiado largo/],
  ])('un error del servicio (%#) dice qué pasó y no pierde lo escrito', async (bug, text) => {
    mockFetch(bug)
    render(<ReportarScreen />)

    fillValid()
    send()

    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(field('¿Qué pasó?')).toHaveValue('El anillo del Lab no se mueve al cambiar de regla')
    expect(localStorage.getItem(REPORT_DRAFT_KEY)).toContain('anillo')
  })

  it('sin servicio ofrece abrir el issue en GitHub; sin red lo dice', async () => {
    mockFetch(() => json(404, {}))
    const { unmount } = render(<ReportarScreen />)
    fillValid()
    send()
    expect(await screen.findByRole('link', { name: 'Abrir un issue en GitHub' })).toHaveAttribute('href', 'https://github.com/gastonvalles/Yu-Gi-Oh-Probability-Lab/issues/new/choose')
    unmount()

    mockFetch(() => {
      throw new TypeError('Failed to fetch')
    })
    render(<ReportarScreen />)
    send()
    expect(await screen.findByRole('alert')).toHaveTextContent(/No hubo conexión/)
  })

  it('el borrador vuelve al recargar', async () => {
    mockFetch(() => json(500, {}))
    localStorage.setItem(REPORT_DRAFT_KEY, JSON.stringify({ area: 'Duelo', que: 'Se cortó la sala', esperaba: '', pasos: '1. Crear sala', includeEnv: false }))
    render(<ReportarScreen />)

    expect(field('¿Qué pasó?')).toHaveValue('Se cortó la sala')
    expect(field('Pasos para repetirlo')).toHaveValue('1. Crear sala')
    expect(screen.getByRole('combobox', { name: '¿En qué parte de la página?' })).toHaveValue('Duelo')
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Incluir datos de mi navegador' })).toHaveAttribute('aria-checked', 'false'))
  })
})
