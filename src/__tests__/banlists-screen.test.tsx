// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { banlistsOf, type Banlist } from '../app/banlists'
import { cardSmallImageUrl } from '../app/card-prices'
import { setMetaRegion } from '../app/use-meta-region'
import { BanlistsScreen } from '../components/banlists/BanlistsScreen'

// El arte real lee el store (el aviso de la banlist): acá sólo importa qué carta es, y se anota cada vez que se dibuja una.
const { fetchCardsByIds, drawnArt, injected } = vi.hoisted(() => ({ fetchCardsByIds: vi.fn(), drawnArt: [] as Array<string | null>, injected: { tcg: null as Banlist[] | null } }))

// «Hoy» es el 17 de octubre de 2026 (la lista del 19 todavía no rige); y una prueba puede reemplazar las listas del TCG por otras armadas a mano.
vi.mock('../app/banlists', async (importOriginal) => {
  const original = await importOriginal<typeof import('../app/banlists')>()

  return {
    ...original,
    banlistsOf: (region: 'tcg' | 'ocg') => (region === 'tcg' && injected.tcg) || original.banlistsOf(region),
    isUpcoming: (list: Banlist) => original.isUpcoming(list, '2026-10-17'),
  }
})

vi.mock('../components/CardArt', () => ({
  CardArt: ({ remoteUrl }: { remoteUrl: string | null }) => {
    drawnArt.push(remoteUrl)

    return <img alt="" src={remoteUrl ?? ''} />
  },
}))
vi.mock('../app/store-hooks', () => ({ useAppSelector: (select: (state: unknown) => unknown) => select({ settings: { deckFormat: 'unlimited' } }) }))

vi.mock('../ygoprodeck', async (importOriginal) => ({ ...(await importOriginal<typeof import('../ygoprodeck')>()), fetchCardsByIds }))

beforeEach(() => {
  drawnArt.length = 0
  injected.tcg = null
  setMetaRegion('tcg')
  fetchCardsByIds.mockReset()
  fetchCardsByIds.mockResolvedValue([])
})

afterEach(cleanup)

const section = (name: string) => screen.getByRole('region', { name })
const cardsIn = (name: string) => within(section(name)).getAllByRole('listitem').map((item) => item.textContent ?? '')
const picker = () => screen.getByRole('combobox', { name: 'Elegir la lista' })
// Las pruebas con datos reales se paran en la lista de septiembre de 2026 (la última que rige hoy): no cambia aunque lleguen listas nuevas.
const openSeptember = () => fireEvent.change(picker(), { target: { value: '2026-09-21' } })

describe('la pantalla de banlists', () => {
  it('abre en la lista más nueva, que si todavía no rige se dice «Próxima» y no «Vigente»', () => {
    injected.tcg = banlistsOf('tcg').filter((entry) => entry.date <= '2026-10-19')
    render(<BanlistsScreen />)

    expect(picker()).toHaveDisplayValue(/^19 de octubre de 2026/)
    expect(screen.getByText('Próxima')).toBeInTheDocument()
    expect(screen.queryByText('Vigente')).not.toBeInTheDocument()
  })

  it('la lista vigente del TCG muestra lo que cambió, como el anuncio de Konami', () => {
    render(<BanlistsScreen />)
    openSeptember()

    expect(screen.getByText('21 cartas cambiaron respecto de la lista de 18 de mayo de 2026.')).toBeInTheDocument()
    expect(picker()).toHaveDisplayValue('21 de septiembre de 2026')
    expect(screen.getByText('Vigente')).toBeInTheDocument()
    expect(screen.queryByText('Próxima')).not.toBeInTheDocument()

    expect(cardsIn('Prohibidas')).toHaveLength(8)
    expect(cardsIn('Prohibidas')[0]).toContain('Archlord Kristya')
    expect(cardsIn('Prohibidas')[0]).toContain('Antes: Ilimitada')
    // Sobre la carta va el número de copias que se podía tener («Antes 3»); el estado entero lo lee el lector de pantalla.
    expect(cardsIn('Prohibidas')[0]).toContain('Antes 3')
    expect(cardsIn('Liberadas').find((text) => text.includes('Mind Master'))).toContain('Antes 0')
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
    expect(screen.getByRole('combobox', { name: 'Elegir la lista' })).toHaveDisplayValue('21 de septiembre de 2026')
    expect(newer).toBeEnabled()
    expect(screen.getByText('Vigente')).toBeInTheDocument()

    fireEvent.click(older)
    expect(screen.getByRole('combobox', { name: 'Elegir la lista' })).toHaveDisplayValue('18 de mayo de 2026')
    expect(screen.queryByText('Vigente')).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('combobox', { name: 'Elegir la lista' }), { target: { value: '2011-09-01' } })
    expect(screen.getByRole('combobox', { name: 'Elegir la lista' })).toHaveDisplayValue('1 de septiembre de 2011')
    expect(older).toBeDisabled()
    // La más vieja que hay no tiene anterior: todo lo que trae es nuevo.
    expect(screen.getByText(/Es la primera lista TCG que tenemos: trae \d+ cartas\./)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Liberadas' })).not.toBeInTheDocument()

    fireEvent.click(newer)
    expect(screen.getByRole('combobox', { name: 'Elegir la lista' })).toHaveDisplayValue('1 de marzo de 2012')
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

    expect(screen.getByRole('combobox', { name: 'Elegir la lista' })).toHaveDisplayValue('1 de octubre de 2026')
    expect(screen.getByText('Vigente')).toBeInTheDocument()
  })

  it('el buscador filtra las cartas por nombre en las secciones, y avisa si ninguna coincide', () => {
    render(<BanlistsScreen />)
    openSeptember()

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
    openSeptember()

    fireEvent.click(screen.getByRole('button', { name: 'Ver el detalle de Archlord Kristya' }))

    const dialog = await screen.findByRole('dialog', { name: /Archlord Kristya/ })

    expect(within(dialog).getByText('TCG · 21 de septiembre de 2026 · Prohibida')).toBeInTheDocument()
    expect(fetchCardsByIds).toHaveBeenCalledWith([59509952], expect.anything())
    await waitFor(() => expect(within(dialog).getByText('Si controlás…')).toBeInTheDocument())
  })
})

describe('las listas que se anuncian en partes', () => {
  const september = banlistsOf('tcg').find((entry) => entry.date === '2026-09-21')!
  const history = banlistsOf('tcg').filter((entry) => entry.date <= '2026-09-21')
  // La de septiembre sin su primera prohibida: respecto de ella, esa carta figura como liberada.
  const withDate = (date: string, partial: boolean): Banlist => ({ ...september, date, forbidden: september.forbidden.slice(1), ...(partial ? { partial: true } : {}) })

  it('una lista en partes que todavía no rige avisa que es lo anunciado hasta ahora, desde cuándo rige, y lleva «En partes» junto a la fecha', () => {
    injected.tcg = [withDate('2026-10-19', true), ...history]
    render(<BanlistsScreen />)

    expect(picker()).toHaveDisplayValue('19 de octubre de 2026 · En partes')
    expect(screen.getByText('Próxima')).toBeInTheDocument()
    expect(screen.getByText('Lista en partes')).toBeInTheDocument()
    expect(screen.getByText('Se anunció una parte de la lista del TCG que rige desde el 19 de octubre de 2026; el resto se publica en los próximos días y se suma solo.')).toBeInTheDocument()
    // Sigue mostrando los cambios contra la anterior.
    expect(cardsIn('Liberadas')).toHaveLength(1)
    // Además de la opción del selector, la etiqueta junto a la fecha.
    expect(screen.getByText('En partes', { selector: 'span' })).toBeInTheDocument()
  })

  it('el aviso es sólo de la lista en partes: al pasar a la anterior desaparece, y vuelve al volver', () => {
    injected.tcg = [withDate('2026-10-19', true), ...history]
    render(<BanlistsScreen />)

    fireEvent.click(screen.getByRole('button', { name: 'Lista anterior' }))
    expect(screen.queryByText('Lista en partes')).not.toBeInTheDocument()
    expect(screen.queryByText('En partes', { selector: 'span' })).not.toBeInTheDocument()
    expect(screen.getByText('Vigente')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Lista siguiente' }))
    expect(screen.getByText('Lista en partes')).toBeInTheDocument()
  })

  it('una lista en partes que ya rige es «Vigente» y «En partes»; una completa que todavía no rige es sólo «Próxima»', () => {
    injected.tcg = [withDate('2026-10-10', true), ...history]

    const { unmount } = render(<BanlistsScreen />)

    expect(screen.getByText('Vigente')).toBeInTheDocument()
    expect(screen.getByText('Lista en partes')).toBeInTheDocument()
    unmount()

    injected.tcg = [withDate('2026-10-19', false), ...history]
    render(<BanlistsScreen />)

    expect(screen.getByText('Próxima')).toBeInTheDocument()
    expect(screen.queryByText('Lista en partes')).not.toBeInTheDocument()
    expect(screen.queryByText('En partes', { selector: 'span' })).not.toBeInTheDocument()
  })
})

describe('las cartas de la lista completa no se vuelven a dibujar de más', () => {
  it('escribir en el buscador no dibuja de nuevo las que siguen a la vista', () => {
    render(<BanlistsScreen />)
    fireEvent.click(screen.getByRole('radio', { name: 'Lista completa' }))

    const all = screen.getAllByRole('listitem').length

    drawnArt.length = 0
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar una carta en esta lista' }), { target: { value: 'dragon' } })

    expect(screen.getAllByRole('listitem').length).toBeLessThan(all)
    expect(drawnArt).toEqual([])
  })

  it('abrir una carta sólo dibuja la del detalle (con su imagen chica mientras llega la completa)', () => {
    render(<BanlistsScreen />)
    fireEvent.click(screen.getByRole('radio', { name: 'Lista completa' }))
    drawnArt.length = 0
    fireEvent.click(screen.getByRole('button', { name: 'Ver el detalle de Archlord Kristya' }))

    expect(screen.getByRole('dialog', { name: /Archlord Kristya/ })).toBeInTheDocument()
    expect(drawnArt.filter((url) => url !== cardSmallImageUrl(59509952))).toEqual([])
  })
})

describe('las cartas de las banlists', () => {
  it('se inclinan en 3D hacia el mouse, igual que en el detalle de la carta', () => {
    HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 300, width: 200, height: 300, x: 0, y: 0, toJSON: () => ({}) })
    render(<BanlistsScreen />)

    const art = document.querySelector('li [class~="group/art"]') as HTMLElement

    expect(art.parentElement!.className).toContain('perspective')

    fireEvent.pointerMove(art, { pointerType: 'mouse', clientX: 190, clientY: 20 })
    expect(art.style.rotate).toMatch(/12deg$/)
    expect(art.dataset.tilting).toBe('true')

    fireEvent.pointerLeave(art)
    expect(art.style.rotate).toBe('')
  })
})

describe('el detalle recorre la lista tal como se ve', () => {
  const tiles = (name: string) => within(section(name)).getAllByRole('button').map((button) => button.getAttribute('aria-label')!.replace('Ver el detalle de ', ''))

  it('pasa a la carta anterior y a la siguiente sin cerrarse, y de una sección a la que sigue', async () => {
    render(<BanlistsScreen />)
    openSeptember()

    const prohibidas = tiles('Prohibidas')
    const limitadas = tiles('Limitadas')

    fireEvent.click(screen.getByRole('button', { name: `Ver el detalle de ${prohibidas[0]}` }))
    expect(await screen.findByRole('dialog', { name: new RegExp(prohibidas[0]!) })).toBeInTheDocument()
    // Es la primera de la lista: no hay anterior, y la flecha no se muestra.
    expect(screen.queryByRole('button', { name: 'Carta anterior' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Carta siguiente' }))
    const second = await screen.findByRole('dialog', { name: new RegExp(prohibidas[1]!) })

    expect(within(second).getByText('TCG · 21 de septiembre de 2026 · Prohibida')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Carta anterior' })).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(1)

    // La última de las prohibidas sigue con la primera de las limitadas, y el estado que dice el detalle es el de esa carta.
    fireEvent.click(screen.getByRole('button', { name: 'Carta anterior' }))
    for (let step = 0; step < prohibidas.length - 1; step++) fireEvent.click(screen.getByRole('button', { name: 'Carta siguiente' }))
    expect(await screen.findByRole('dialog', { name: new RegExp(prohibidas.at(-1)!) })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Carta siguiente' }))
    const first = await screen.findByRole('dialog', { name: new RegExp(limitadas[0]!) })

    expect(within(first).getByText('TCG · 21 de septiembre de 2026 · Limitada')).toBeInTheDocument()
  })

  it('con un filtro que deja una sola carta no hay a dónde pasar, así que no hay flechas', async () => {
    render(<BanlistsScreen />)
    openSeptember()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar una carta en esta lista' }), { target: { value: 'Archlord' } })

    fireEvent.click(screen.getByRole('button', { name: 'Ver el detalle de Archlord Kristya' }))
    await screen.findByRole('dialog', { name: /Archlord Kristya/ })

    expect(screen.queryByRole('button', { name: 'Carta anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Carta siguiente' })).not.toBeInTheDocument()
  })
})
