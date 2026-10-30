// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { comboPayloadOf, decodeComboPayload, encodeComboPayload } from '../app/combo-share'
import { createSavedCombo, readSavedCombos, writeSavedCombos } from '../app/saved-combos'
import { SharedComboBar } from '../components/probability/PracticeMatPanel'
import { Harness, INITIAL, render } from './support/practice-mat-harness'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

const combo = createSavedCombo({ name: 'Línea básica', deckName: 'Test', initial: INITIAL, actions: [{ type: 'draw', count: 1 }], nameOf: () => 'Ash Blossom' }, [])

beforeEach(() => {
  localStorage.clear()
  writeSavedCombos([combo])
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.cancelAnimationFrame = () => {}
})

const openCombos = () => {
  const aside = screen.getByRole('region', { name: 'Pasos y combos' })
  fireEvent.click(within(aside).getByRole('radio', { name: 'Combos' }))
  return aside
}

describe('compartir combos desde la lista', () => {
  it('el ⋯ de cada ficha copia el enlace (que trae el mismo combo) y deja Cargar, Renombrar y Borrar como estaban', async () => {
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<Harness />)
    const aside = openCombos()

    expect(within(aside).getByRole('button', { name: 'Cargar Línea básica' })).toBeInTheDocument()
    expect(within(aside).getByRole('button', { name: 'Renombrar Línea básica' })).toBeInTheDocument()
    fireEvent.click(within(aside).getByRole('button', { name: 'Más opciones de Línea básica' }))
    expect(screen.getByRole('menuitem', { name: 'Descargar video' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Descargar archivo' })).toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Compartir enlace' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const link = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(link).toMatch(/#combo=/)
    const { id: _id, ...shared } = combo
    // Los nombres no viajan en el enlace: se piden al abrirlo.
    expect(await decodeComboPayload(comboPayloadOf(link)!)).toEqual({ ok: true, combo: { ...shared, names: {} } })
  })

  it('ya no hay «Importar combo» ni archivo que elegir: pegar el enlace lo suma con un nombre que no se repite', async () => {
    const { id: _id, ...shared } = combo
    const link = `https://x.app/#combo=${await encodeComboPayload(shared)}`
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: vi.fn(async () => link) } })
    render(<Harness />)
    const aside = openCombos()

    expect(aside.querySelector('input[type="file"]')).toBeNull()
    expect(within(aside).queryByRole('button', { name: 'Importar combo' })).toBeNull()
    fireEvent.click(within(aside).getByRole('button', { name: 'Pegar enlace' }))
    await waitFor(() => expect(within(aside).getByText('Línea básica (2)')).toBeInTheDocument())
    expect(readSavedCombos().map((entry) => entry.name)).toEqual(['Línea básica', 'Línea básica (2)'])
  })

  it('el aviso de un combo compartido dice cuál es y ofrece guardarlo (la principal) o cerrarlo', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    const { id: _id, ...shared } = combo
    render(<SharedComboBar combo={{ ...shared, name: '<img src=x onerror=alert(1)>' }} onSave={onSave} onClose={onClose} />)

    const bar = screen.getByRole('region', { name: 'Combo compartido' })
    // El nombre que vino en el enlace es texto, no HTML.
    expect(within(bar).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(bar.querySelector('img')).toBeNull()
    fireEvent.click(within(bar).getByRole('button', { name: 'Guardar en mis combos' }))
    fireEvent.click(within(bar).getByRole('button', { name: 'Cerrar' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
