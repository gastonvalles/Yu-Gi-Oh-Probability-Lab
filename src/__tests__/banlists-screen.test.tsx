// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { banlistsOf } from '../app/banlists'
import { setMetaRegion } from '../app/use-meta-region'
import { BanlistsScreen } from '../components/banlists/BanlistsScreen'

// El arte real lee el store (el aviso de la banlist): acá sólo importa qué carta es.
vi.mock('../components/CardArt', () => ({ CardArt: ({ remoteUrl }: { remoteUrl: string | null }) => <img alt="" src={remoteUrl ?? ''} /> }))
vi.mock('../app/store-hooks', () => ({ useAppSelector: (select: (state: unknown) => unknown) => select({ settings: { deckFormat: 'unlimited' } }) }))

const { fetchCardsByIds } = vi.hoisted(() => ({ fetchCardsByIds: vi.fn() }))

vi.mock('../ygoprodeck', async (importOriginal) => ({ ...(await importOriginal<typeof import('../ygoprodeck')>()), fetchCardsByIds }))

beforeEach(() => {
  setMetaRegion('tcg')
  fetchCardsByIds.mockReset()
  fetchCardsByIds.mockResolvedValue([])
})

afterEach(cleanup)

const section = (name: string) => screen.getByRole('region', { name })
const cardsIn = (name: string) => within(section(name)).getAllByRole('listitem').map((item) => item.textContent ?? '')

describe('la pantalla de banlists', () => {
  it('abre en la lista vigente del TCG con lo que cambió, como el anuncio de Konami', () => {
    render(<BanlistsScreen />)

    expect(screen.getByRole('heading', { name: 'Lista TCG de Septiembre de 2026' })).toBeInTheDocument()
    expect(screen.getByText('21 cartas cambiaron respecto de la lista de Mayo de 2026.')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Elegir la lista' })).toHaveDisplayValue('Septiembre de 2026')
    expect(screen.getByText('Vigente')).toBeInTheDocument()

    expect(cardsIn('Prohibidas')).toHaveLength(8)
    expect(cardsIn('Prohibidas')[0]).toContain('Archlord Kristya')
    expect(cardsIn('Prohibidas')[0]).toContain('Antes: Ilimitada')
    expect(cardsIn('Prohibidas').find((text) => text.includes('Dimension Shifter'))).toContain('Antes: Limitada')
    expect(cardsIn('Limitadas')).toHaveLength(2)
    expect(cardsIn('Semi-limitadas')).toHaveLength(1)
    expect(cardsIn('Liberadas')).toHaveLength(10)
    expect(cardsIn('Liberadas').find((text) => text.includes('Mind Master'))).toContain('Antes: Prohibida')
  })

  it('se pasa de una lista a otra con las flechas y con el selector, sin pasarse de los extremos', () => {
    render(<BanlistsScreen />)

    const older = screen.getByRole('button', { name: 'Lista anterior' })
    const newer = screen.getByRole('button', { name: 'Lista siguiente' })

    expect(newer).toBeDisabled()

    fireEvent.click(older)
    expect(screen.getByRole('heading', { name: 'Lista TCG de Mayo de 2026' })).toBeInTheDocument()
    expect(newer).toBeEnabled()
    expect(screen.queryByText('Vigente')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Elegir la lista' }), { target: { value: '2011-09-01' } })
    expect(screen.getByRole('heading', { name: 'Lista TCG de 01/09/2011' })).toBeInTheDocument()
    expect(older).toBeDisabled()
    // La más vieja que hay no tiene anterior: todo lo que trae es nuevo.
    expect(screen.getByText(/Es la primera lista TCG que tenemos: trae \d+ cartas\./)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Liberadas' })).not.toBeInTheDocument()

    fireEvent.click(newer)
    expect(screen.getByRole('heading', { name: 'Lista TCG de 01/03/2012' })).toBeInTheDocument()
  })

  it('la lista completa trae las prohibidas, limitadas y semi-limitadas de esa lista, sin las liberadas', () => {
    render(<BanlistsScreen />)

    fireEvent.click(screen.getByRole('radio', { name: 'Lista completa' }))

    const [current] = banlistsOf('tcg')

    expect(screen.getByText(`${current!.forbidden.length + current!.limited.length + current!.semiLimited.length} cartas en la lista.`)).toBeInTheDocument()
    expect(cardsIn('Prohibidas')).toHaveLength(current!.forbidden.length)
    expect(cardsIn('Limitadas')).toHaveLength(current!.limited.length)
    expect(screen.queryByRole('region', { name: 'Liberadas' })).not.toBeInTheDocument()
    expect(cardsIn('Prohibidas').some((text) => text.includes('Antes:'))).toBe(false)
  })

  it('cambiar de región muestra las listas del OCG y vuelve a la más nueva', () => {
    render(<BanlistsScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Lista anterior' }))
    fireEvent.click(screen.getByRole('radio', { name: 'OCG' }))

    expect(screen.getByRole('heading', { name: 'Lista OCG de Octubre de 2026' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Elegir la lista' })).toHaveDisplayValue('Octubre de 2026')
    expect(screen.getByText('Vigente')).toBeInTheDocument()
  })

  it('el buscador filtra las cartas por nombre en las secciones, y avisa si ninguna coincide', () => {
    render(<BanlistsScreen />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar una carta en esta lista' }), { target: { value: 'kristya' } })

    expect(cardsIn('Prohibidas')).toHaveLength(1)
    expect(screen.queryByRole('region', { name: 'Limitadas' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar una carta en esta lista' }), { target: { value: 'zzzzz' } })
    expect(screen.getByText('Ninguna carta coincide con “zzzzz”.')).toBeInTheDocument()
  })

  it('tocar una carta abre su detalle, con la región, la fecha y el estado de la lista', async () => {
    fetchCardsByIds.mockResolvedValue([
      { ygoprodeckId: 59509952, name: 'Archlord Kristya', cardType: 'Effect Monster', frameType: 'effect', description: 'Si controlás…', race: 'Fairy', attribute: 'LIGHT', level: 8, linkValue: null, atk: '2700', def: '2000', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null } },
    ])
    render(<BanlistsScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Ver el detalle de Archlord Kristya' }))

    const dialog = await screen.findByRole('dialog', { name: /Archlord Kristya/ })

    expect(within(dialog).getByText('TCG · Septiembre de 2026 · Prohibida')).toBeInTheDocument()
    expect(fetchCardsByIds).toHaveBeenCalledWith([59509952], expect.anything())
    await waitFor(() => expect(within(dialog).getByText('Si controlás…')).toBeInTheDocument())
  })
})
