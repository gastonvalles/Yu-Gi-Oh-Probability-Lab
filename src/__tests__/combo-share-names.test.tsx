// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useEffect } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { decodeComboPayload, encodeComboPayload, type SharedCombo } from '../app/combo-share'
import { createSavedCombo, readSavedCombos } from '../app/saved-combos'
import { useMatSession } from '../app/use-mat-session'
import { PracticeMat } from '../components/probability/PracticeMat'
import { fetchCardsByIds } from '../ygoprodeck'
import { card, INITIAL, render } from './support/practice-mat-harness'

// La API conoce todas las cartas menos la 6: así se ve que se guarda sólo lo que llegó.
vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn() }))
const fetchMock = vi.mocked(fetchCardsByIds)
const fromApi = async (ids: number[]) => ids.filter((id) => id !== 6).map((id) => ({ ...card(id, 'effect'), name: `Carta ${id} de la API` })) as unknown as Awaited<ReturnType<typeof fetchCardsByIds>>

beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.cancelAnimationFrame = () => {}
})

const NO_CARDS = new Map()

/** La mesa como la abre un enlace en un perfil limpio: sin deck (ninguna carta conocida) y con el aviso del combo compartido. */
function Opened({ combo }: { combo: SharedCombo }) {
  const mat = useMatSession()
  const { start } = mat
  useEffect(() => start(combo.initial, combo.actions, combo.names), [start, combo])
  if (!mat.session || !mat.state) return null
  return (
    <PracticeMat
      session={mat.session}
      state={mat.state}
      cardsById={NO_CARDS}
      deckName=""
      onDispatch={mat.dispatch}
      onUndo={mat.undo}
      onSeek={mat.seek}
      onLoadCombo={() => {}}
      onNewHand={() => {}}
      shared={{ combo, onSaved: () => {}, onClose: () => {} }}
    />
  )
}

const linked = async () => {
  const combo = createSavedCombo({ name: 'Del enlace', deckName: 'Test', initial: INITIAL, actions: [{ type: 'draw', count: 1 }], nameOf: () => 'Ash Blossom' }, [])
  const result = await decodeComboPayload(await encodeComboPayload(combo))
  if (!result.ok) throw new Error(result.error)
  return result.combo
}

const save = () => fireEvent.click(within(screen.getByRole('region', { name: 'Combo compartido' })).getByRole('button', { name: 'Guardar en mis combos' }))

describe('los nombres de un combo que llegó por enlace', () => {
  it('no viajan: se piden por passcode al abrirlo y, al guardarlo, quedan los que llegaron', async () => {
    fetchMock.mockImplementation(fromApi)
    const combo = await linked()
    expect(combo.names).toEqual({})

    render(<Opened combo={combo} />)
    await waitFor(() => expect(screen.getAllByRole('listitem', { name: 'Carta 1 de la API' }).length).toBeGreaterThan(0))
    expect(fetchMock.mock.calls[0]![0]).toEqual(expect.arrayContaining([1, 2, 3, 4, 5, 6, 7]))
    save()

    const [saved] = readSavedCombos()
    expect(saved!.names).toEqual({ 'card-1-1': 'Carta 1 de la API', 'card-2-1': 'Carta 2 de la API', 'card-3-1': 'Carta 3 de la API', 'card-4-1': 'Carta 4 de la API', 'card-5-1': 'Carta 5 de la API', 'card-7-1': 'Carta 7 de la API' })
    expect(saved!.actions).toEqual(combo.actions)
  })

  it('sin red se abre y se guarda igual, con «Carta»', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'))
    const combo = await linked()

    render(<Opened combo={combo} />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    // La mano se ve igual, cada carta con «Carta».
    expect(screen.getAllByRole('listitem', { name: 'Carta' }).length).toBeGreaterThanOrEqual(5)
    save()
    expect(readSavedCombos()[0]!.names).toEqual({})
  })
})
