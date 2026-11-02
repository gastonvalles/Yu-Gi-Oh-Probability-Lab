// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createSavedCombo, readSavedCombos, writeSavedCombos } from '../app/saved-combos'
import { panelStepsOf } from '../components/probability/panel-steps'
import { PracticeMatPanel } from '../components/probability/PracticeMatPanel'
import { Harness, INITIAL, render } from './support/practice-mat-harness'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

const combo = createSavedCombo({ name: 'Línea básica', deckName: 'Test', initial: INITIAL, actions: [{ type: 'draw', count: 1 }, { type: 'mill', count: 1 }], nameOf: () => 'Ash Blossom' }, [])

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

const panel = () => screen.getByRole('region', { name: 'Pasos y combos' })
const tab = (name: string) => fireEvent.click(within(panel()).getByRole('radio', { name }))

describe('notas por paso en la lista de pasos', () => {
  it('en un combo guardado que se repasa: agregar la nota la muestra, la guarda y el botón pasa a editar', async () => {
    render(<Harness />)
    // Una partida en vivo no es un combo guardado: no hay notas que escribir.
    expect(within(panel()).queryByRole('button', { name: /Agregar nota/ })).toBeNull()

    tab('Combos')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cargar Línea básica' }))
    tab('Pasos')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Agregar nota al paso 2' }))

    const dialog = await screen.findByRole('dialog', { name: 'Nota del paso 2' })
    const input = within(dialog).getByRole<HTMLInputElement>('textbox', { name: /Por qué este paso/ })
    // Un campo de una línea ya saca los saltos; los espacios de más y los bordes los saca el guardado.
    fireEvent.change(input, { target: { value: '  Manda la pieza  al cementerio ' } })
    expect(within(dialog).getByText(`${input.value.length}/140`)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(within(panel()).getByText('Manda la pieza al cementerio')).toBeInTheDocument())
    expect(readSavedCombos()[0]!.notes).toEqual({ 1: 'Manda la pieza al cementerio' })
    expect(within(panel()).getByRole('button', { name: 'Editar nota del paso 2' })).toBeInTheDocument()
    // La mano inicial no lleva nota.
    expect(within(panel()).queryByRole('button', { name: /paso 0/ })).toBeNull()
  })

  it('vaciarla y guardar la borra', async () => {
    writeSavedCombos([{ ...combo, notes: { 0: 'Robá' } }])
    render(<Harness />)
    tab('Combos')
    fireEvent.click(within(panel()).getByRole('button', { name: 'Cargar Línea básica' }))
    tab('Pasos')
    expect(within(panel()).getByText('Robá')).toBeInTheDocument()
    fireEvent.click(within(panel()).getByRole('button', { name: 'Editar nota del paso 1' }))

    const dialog = await screen.findByRole('dialog', { name: 'Nota del paso 1' })
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: '   ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(within(panel()).queryByText('Robá')).toBeNull())
    expect('notes' in readSavedCombos()[0]!).toBe(false)
  })

  it('sin `onNote` (un combo compartido sin guardar) la nota se lee pero no se edita, y lo de adentro es texto', () => {
    const html = '<img src=x onerror=alert(1)>'
    const { container } = render(
      <PracticeMatPanel
        steps={panelStepsOf(INITIAL, combo.actions, ['Robás 1', 'Mandás 1 al cementerio'], () => 'Ash Blossom', () => null)}
        initial={INITIAL}
        cursor={0}
        onSeek={() => {}}
        nameOf={() => ''}
        artOf={() => null}
        combos={[]}
        deckName=""
        onLoad={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
        showCombos={false}
        notes={{ 0: html }}
      />,
    )
    expect(screen.getByText(html)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
    expect(screen.queryByRole('button', { name: /nota/i })).toBeNull()
  })
})
