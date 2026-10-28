// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetPriceRequestsForTests } from '../app/card-prices'
import { currencyLocale } from '../i18n'
import { ExpansionsScreen } from '../components/expansions/ExpansionsScreen'

// El arte real lee el store (el aviso de la banlist): acá sólo importa qué carta es.
vi.mock('../components/CardArt', () => ({ CardArt: ({ remoteUrl }: { remoteUrl: string | null }) => <img alt="" src={remoteUrl ?? ''} /> }))

const { fetchCardsByIds, searchCards } = vi.hoisted(() => ({ fetchCardsByIds: vi.fn(), searchCards: vi.fn() }))

vi.mock('../ygoprodeck', async (importOriginal) => ({ ...(await importOriginal<typeof import('../ygoprodeck')>()), fetchCardsByIds, searchCards }))

const INDEX = {
  updated: '2026-10-11',
  shards: 4,
  groups: [
    [1, 'Legend of Blue-Eyes White Dragon', '2002-03-08', 3, 'LOB'],
    [2, 'Maze of Millennia', '2024-01-19', 4, 'MAZE'],
    [3, 'Sin cartas', '2020-01-01', 0, 'NONE'],
    [4, 'Promo sin fecha', '', 1, ''],
  ],
}

// [código, rareza, edición, mercado, producto, id de la carta, nombre]
const SETS: Record<number, unknown[]> = {
  1: [
    ['LOB-EN001', 'Ultra Rare', '1st Edition', 900, 11, 89631139, 'Blue-Eyes White Dragon'],
    ['LOB-EN002', 'Super Rare', 'Unlimited', 12.5, 12, 46986414, 'Dark Magician'],
    ['LOB-EN003', 'Common', 'Unlimited', null, 13, 5405694, 'Gaia the Fierce Knight'],
  ],
  2: [
    ['MAZE-EN001', 'Rare', 'Unlimited', 0.5, 21, 100, 'Mulcharmy Purulia'],
    ['MAZE-EN001', 'Ultra Rare', 'Unlimited', 4, 22, 100, 'Mulcharmy Purulia', 'Extended Art'],
    ['MAZE-EN002', 'Common', 'Unlimited', 0.1, 23, 101, 'Ash Blossom & Joyous Spring'],
    ['MAZE-EN003', 'Rare', 'Unlimited', 7, 24, 102, 'Maxx "C"'],
  ],
  4: [['PROMO-EN001', 'Promo', 'Limited', 1, 41, 200, 'Carta de promo']],
}

// Las impresiones de una carta (los archivos por carta, con 4 archivos): [código, rareza, edición, mercado, producto, id de la expansión]
const DARK_MAGICIAN = 46986414
const CARD_SHARDS: Record<number, unknown> = {
  [DARK_MAGICIAN % 4]: {
    [DARK_MAGICIAN]: [
      ['LOB-EN002', 'Super Rare', 'Unlimited', 12.5, 12, 1],
      ['MAZE-EN010', 'Ultra Rare', '1st Edition', 3, 25, 2],
    ],
  },
}

let requested: string[]

function mediaQuery(desktop: boolean) {
  window.matchMedia = ((query: string) => ({ matches: desktop && query.includes('1101'), media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia
}

beforeEach(() => {
  resetPriceRequestsForTests()
  requested = []
  mediaQuery(true)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requested.push(url)

      const set = /\/sets\/(\d+)\.json$/.exec(url)
      const card = /\/cards\/(\d+)\.json$/.exec(url)

      if (url.endsWith('/prices/index.json')) return { ok: true, status: 200, json: async () => INDEX }
      if (set && SETS[Number(set[1])]) return { ok: true, status: 200, json: async () => SETS[Number(set[1])] }
      if (card) return { ok: true, status: 200, json: async () => CARD_SHARDS[Number(card[1])] ?? {} }

      return { ok: false, status: 404, json: async () => ({}) }
    }),
  )
  fetchCardsByIds.mockReset()
  fetchCardsByIds.mockResolvedValue([])
  searchCards.mockReset()
  searchCards.mockResolvedValue({ results: [], hasMore: false })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const usd = (value: number) => new Intl.NumberFormat(currencyLocale(), { style: 'currency', currency: 'USD' }).format(value)
/** Las impresiones de la expansión abierta (las filas de la lista de expansiones también son `li`, pero de la navegación). */
const rowsText = () => screen.getAllByRole('listitem').filter((item) => !item.closest('nav')).map((item) => item.textContent ?? '')

describe('la pantalla de expansiones', () => {
  it('lista las expansiones por año, las más nuevas primero y las sin fecha al final, sin las que no tienen cartas', async () => {
    mediaQuery(false)
    render(<ExpansionsScreen />)

    const nav = await screen.findByRole('navigation', { name: 'Expansiones' })
    const names = within(nav).getAllByRole('button').map((button) => button.querySelector('.truncate')?.textContent)

    expect(names).toEqual(['Maze of Millennia', 'Legend of Blue-Eyes White Dragon', 'Promo sin fecha'])
    expect(within(nav).getAllByRole('heading').map((heading) => heading.textContent)).toEqual(['2024', '2002', 'Sin fecha'])
    expect(within(nav).queryByText('Sin cartas')).not.toBeInTheDocument()
  })

  it('el buscador filtra las expansiones por nombre, sin importar mayúsculas ni signos', async () => {
    mediaQuery(false)
    render(<ExpansionsScreen />)

    fireEvent.change(await screen.findByRole('searchbox', { name: 'Buscar expansión o carta' }), { target: { value: 'blue eyes' } })

    const nav = screen.getByRole('navigation', { name: 'Expansiones' })

    expect(within(nav).getAllByRole('button')).toHaveLength(1)
    expect(within(nav).getByText('Legend of Blue-Eyes White Dragon')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar expansión o carta' }), { target: { value: 'zzz' } })
    // Con tres letras o más también se busca una carta: el aviso espera a que lleguen las cartas (si no hubiera ninguna).
    expect(await screen.findByText('Ninguna expansión ni carta coincide con “zzz”.')).toBeInTheDocument()
  })

  it('cada fila dice el código y el mes y año de salida, y el buscador también encuentra una expansión por su código', async () => {
    mediaQuery(false)
    render(<ExpansionsScreen />)

    const nav = await screen.findByRole('navigation', { name: 'Expansiones' })

    expect(within(nav).getByText('MAZE · enero 2024')).toBeInTheDocument()
    expect(within(nav).getByText('LOB · marzo 2002')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar expansión o carta' }), { target: { value: 'lob' } })

    expect(within(nav).getAllByRole('button')).toHaveLength(1)
    expect(within(nav).getByText('Legend of Blue-Eyes White Dragon')).toBeInTheDocument()
  })

  it('cada año es un bloque con las primeras 5 y «Ver las N», buscando se ven todas, y en el celular scrollea la página (no una caja dentro de otra)', async () => {
    mediaQuery(false)
    const many = { ...INDEX, groups: Array.from({ length: 7 }, (_, n) => [10 + n, `Set ${n + 1}`, `2025-0${n + 1}-01`, 1, `S${n}`]) }

    vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('/prices/index.json') ? { ok: true, status: 200, json: async () => many } : { ok: false, status: 404, json: async () => ({}) })))
    render(<ExpansionsScreen />)

    const nav = await screen.findByRole('navigation', { name: 'Expansiones' })
    const rows = () => within(nav).getAllByRole('button').filter((button) => button.querySelector('.truncate'))

    expect(nav).not.toHaveClass('overflow-y-auto')
    expect(rows()).toHaveLength(5)
    fireEvent.click(within(nav).getByRole('button', { name: 'Ver las 7' }))
    expect(rows()).toHaveLength(7)
    fireEvent.click(within(nav).getByRole('button', { name: 'Ver menos' }))
    expect(rows()).toHaveLength(5)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar expansión o carta' }), { target: { value: 'set' } })
    expect(rows()).toHaveLength(7)
    expect(within(nav).queryByRole('button', { name: /^Ver (las|menos)/ })).not.toBeInTheDocument()
  })

  it('en escritorio se abre sola la más nueva, con sus cartas por código, rareza, edición y precio', async () => {
    render(<ExpansionsScreen />)

    expect(await screen.findByRole('heading', { name: 'Maze of Millennia', level: 2 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver el detalle de Ash Blossom & Joyous Spring' })).toBeInTheDocument())

    expect(requested.filter((url) => url.includes('/sets/'))).toEqual(['/prices/sets/2.json'])
    expect(rowsText()[0]).toContain('Mulcharmy Purulia')
    expect(rowsText()[0]).toContain('MAZE-EN001')
    expect(rowsText()[0]).toContain('Rare · Unlimited')
    expect(rowsText()[0]).toContain(usd(0.5))
    expect(rowsText().map((text) => /MAZE-EN\d+/.exec(text)?.[0])).toEqual(['MAZE-EN001', 'MAZE-EN001', 'MAZE-EN002', 'MAZE-EN003'])
    expect(screen.getByText(/3 cartas distintas/)).toBeInTheDocument()
    // Las cartas van enteras una al lado de la otra, en una grilla (no en una lista de una columna).
    expect(screen.getAllByRole('list').find((list) => list.className.includes('auto-fill'))).toBeDefined()
    expect([...document.querySelectorAll('li img')].filter((image) => !image.closest('nav'))).toHaveLength(4)
  })

  it('las cartas se filtran por nombre o código y por rareza, y se ordenan por precio con las que no tienen al final', async () => {
    render(<ExpansionsScreen />)
    await screen.findByRole('button', { name: 'Ver el detalle de Maxx "C"' })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por nombre o código' }), { target: { value: 'en002' } })
    expect(rowsText()).toHaveLength(1)
    expect(rowsText()[0]).toContain('Ash Blossom')

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por nombre o código' }), { target: { value: '' } })
    fireEvent.click(within(screen.getByRole('group', { name: 'Rareza y arte' })).getByRole('button', { name: 'Rare 2' }))
    expect(rowsText().map((text) => /MAZE-EN\d+/.exec(text)?.[0])).toEqual(['MAZE-EN001', 'MAZE-EN003'])

    fireEvent.click(within(screen.getByRole('group', { name: 'Rareza y arte' })).getByRole('button', { name: 'Todas' }))
    fireEvent.click(screen.getByRole('radio', { name: 'Por precio' }))
    expect(rowsText().map((text) => /MAZE-EN\d+/.exec(text)?.[0])).toEqual(['MAZE-EN003', 'MAZE-EN001', 'MAZE-EN001', 'MAZE-EN002'])

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por nombre o código' }), { target: { value: 'nada de nada' } })
    expect(screen.getByText('Ninguna carta coincide con esos filtros.')).toBeInTheDocument()
  })

  it('elegir otra expansión pide sólo su archivo y muestra sus cartas, sin precio donde no lo hay', async () => {
    render(<ExpansionsScreen />)
    await screen.findByRole('button', { name: 'Ver el detalle de Maxx "C"' })

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Expansiones' })).getByText('Legend of Blue-Eyes White Dragon'))

    expect(await screen.findByRole('button', { name: 'Ver el detalle de Gaia the Fierce Knight' })).toBeInTheDocument()
    expect(requested.filter((url) => url.includes('/sets/'))).toEqual(['/prices/sets/2.json', '/prices/sets/1.json'])
    expect(rowsText().find((text) => text.includes('Gaia'))).toContain('Sin precio')
    expect(rowsText()[0]).toContain(usd(900))
  })

  it('en el celular se elige primero de la lista y se vuelve a ella con el botón', async () => {
    mediaQuery(false)
    render(<ExpansionsScreen />)

    fireEvent.click(await screen.findByText('Maze of Millennia'))

    expect(await screen.findByRole('heading', { name: 'Maze of Millennia', level: 2 })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Expansiones' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Volver a las expansiones' }))

    expect(screen.getByRole('navigation', { name: 'Expansiones' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Maze of Millennia', level: 2 })).not.toBeInTheDocument()
  })

  it('en el celular el detalle no atrapa el scroll: con overflow-hidden, un overscroll-contain suelto frena la rueda y el dedo y la página no se mueve', async () => {
    mediaQuery(false)
    render(<ExpansionsScreen />)

    fireEvent.click(await screen.findByText('Maze of Millennia'))

    const detail = (await screen.findByRole('heading', { name: 'Maze of Millennia', level: 2 })).closest('section')

    expect(detail).toHaveClass('overflow-hidden', 'min-[1101px]:overflow-y-auto', 'min-[1101px]:overscroll-contain')
    expect(detail).not.toHaveClass('overscroll-contain')
  })

  it('tocar una carta abre su detalle (se pide la carta completa) con su código, rareza y edición', async () => {
    fetchCardsByIds.mockResolvedValue([
      { ygoprodeckId: 100, name: 'Mulcharmy Purulia', cardType: 'Effect Monster', frameType: 'effect', description: 'Si no controlás cartas…', race: 'Aqua', attribute: 'WATER', level: 4, linkValue: null, atk: '100', def: '600', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null } },
    ])
    render(<ExpansionsScreen />)

    fireEvent.click((await screen.findAllByRole('button', { name: 'Ver el detalle de Mulcharmy Purulia' }))[0]!)

    const dialog = await screen.findByRole('dialog', { name: /Mulcharmy Purulia/ })

    expect(within(dialog).getByText('MAZE-EN001 · Rare · Unlimited')).toBeInTheDocument()
    expect(fetchCardsByIds).toHaveBeenCalledWith([100], expect.anything())
    await waitFor(() => expect(within(dialog).getByText('Si no controlás cartas…')).toBeInTheDocument())
  })

  it('si no se puede traer la lista, lo dice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    render(<ExpansionsScreen />)

    expect(await screen.findByText('No pude traer las expansiones ahora. Probá de nuevo más tarde.')).toBeInTheDocument()
  })
})

describe('el sobre de cada expansión', () => {
  const packs = (container: ParentNode) => [...container.querySelectorAll('img')].map((image) => image.getAttribute('src'))

  it('sale en la lista, al lado de cada expansión, y en ningún otro lado', async () => {
    render(<ExpansionsScreen />)

    const nav = await screen.findByRole('navigation', { name: 'Expansiones' })

    // Maze y Legend tienen código y por eso imagen; la promo sin código queda con la caja de ícono.
    expect(packs(nav)).toEqual(['/api/card-image/sets/MAZE.jpg?w=128', '/api/card-image/sets/LOB.jpg?w=128'])

    const heading = await screen.findByRole('heading', { name: 'Maze of Millennia', level: 2 })

    expect(packs(heading.closest('header')!)).toEqual([])
  })

  it('si la imagen del sobre no existe, queda la caja de ícono en el mismo lugar', async () => {
    render(<ExpansionsScreen />)

    const nav = await screen.findByRole('navigation', { name: 'Expansiones' })

    fireEvent.error(nav.querySelector('img')!)

    expect(packs(nav)).toEqual(['/api/card-image/sets/LOB.jpg?w=128'])
    expect(nav.querySelectorAll('span[aria-hidden="true"] svg')).toHaveLength(2)
  })
})

describe('las impresiones de arte distinto (overframe, extended art...)', () => {
  const tiles = () => [...document.querySelectorAll('li img')].filter((image) => !image.closest('nav'))
  const tileImages = () => tiles().map((image) => image.getAttribute('src'))

  beforeEach(() => {
    HTMLElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 300, width: 200, height: 300, x: 0, y: 0, toJSON: () => ({}) })
  })

  it('cada carta se ve con el escaneo de su impresión y dice de qué arte es', async () => {
    render(<ExpansionsScreen />)
    await screen.findByRole('button', { name: 'Ver el detalle de Maxx "C"' })

    // El producto 22 es la Mulcharmy de arte extendido: su imagen es la de su producto en TCGplayer.
    expect(tileImages()).toContain('https://tcgplayer-cdn.tcgplayer.com/product/22_200w.jpg')
    expect(tileImages()).toContain('https://tcgplayer-cdn.tcgplayer.com/product/21_200w.jpg')
    // La etiqueta sale en la carta (y también hay un chip para filtrar por ese arte, que no es una carta).
    expect(rowsText().filter((text) => text.includes('Extended Art'))).toHaveLength(1)
    expect(rowsText().find((text) => text.includes('Extended Art'))).toContain('Mulcharmy Purulia')
  })

  it('una sola fila: un solo "Todas", las rarezas de la más común a la más rara con su cuenta y, al lado, los artes distintos', async () => {
    render(<ExpansionsScreen />)
    await screen.findByRole('button', { name: 'Ver el detalle de Maxx "C"' })

    const filters = () => within(screen.getByRole('group', { name: 'Rareza y arte' }))

    expect(screen.getAllByRole('group', { name: 'Rareza y arte' })).toHaveLength(1)
    expect(filters().getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Todas', 'Common1', 'Rare2', 'Ultra Rare1', 'Extended Art1'])
    expect(filters().getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(filters().getByRole('button', { name: 'Extended Art 1' }))
    expect(filters().getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'false')
    expect(rowsText()).toHaveLength(1)
    expect(rowsText()[0]).toContain('Mulcharmy Purulia')

    // Se combina con la rareza: ninguna Common es de arte extendido.
    fireEvent.click(filters().getByRole('button', { name: 'Common 1' }))
    expect(screen.getByText('Ninguna carta coincide con esos filtros.')).toBeInTheDocument()

    // Tocar el chip encendido lo apaga; "Todas" apaga los dos.
    fireEvent.click(filters().getByRole('button', { name: 'Common 1' }))
    expect(rowsText()).toHaveLength(1)
    fireEvent.click(filters().getByRole('button', { name: 'Common 1' }))
    fireEvent.click(filters().getByRole('button', { name: 'Todas' }))
    expect(rowsText()).toHaveLength(4)
    expect(filters().getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
    expect(filters().getByRole('button', { name: 'Extended Art 1' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('una expansión sin artes distintos sólo tiene las rarezas', async () => {
    render(<ExpansionsScreen />)
    fireEvent.click(await screen.findByRole('button', { name: /Legend of Blue-Eyes White Dragon/ }))
    await screen.findByRole('button', { name: 'Ver el detalle de Dark Magician' })

    expect(within(screen.getByRole('group', { name: 'Rareza y arte' })).getAllByRole('button').map((chip) => chip.textContent)).toEqual(['Todas', 'Common1', 'Super Rare1', 'Ultra Rare1'])
  })

  it('si la imagen de la impresión no existe, se prueba con el arte de siempre', async () => {
    render(<ExpansionsScreen />)
    await screen.findByRole('button', { name: 'Ver el detalle de Maxx "C"' })

    fireEvent.error(tiles()[0]!)

    expect(tileImages()[0]).toBe('/api/card-image/cards_small/100.jpg')
  })

  it('se busca también por el arte', async () => {
    render(<ExpansionsScreen />)
    await screen.findByRole('button', { name: 'Ver el detalle de Maxx "C"' })

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por nombre o código' }), { target: { value: 'extended' } })

    expect(rowsText()).toHaveLength(1)
    expect(rowsText()[0]).toContain('Mulcharmy Purulia')
  })

  it('tocar una impresión abre el detalle con el escaneo de esa impresión, ya elegido', async () => {
    render(<ExpansionsScreen />)

    const buttons = await screen.findAllByRole('button', { name: 'Ver el detalle de Mulcharmy Purulia' })

    fireEvent.click(buttons[1]!)

    const dialog = await screen.findByRole('dialog', { name: /Mulcharmy Purulia/ })

    expect(within(dialog).getByText('MAZE-EN001 · Ultra Rare · Extended Art · Unlimited')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Ver la carta en grande' }).querySelector('img')!.getAttribute('src')).toBe('https://tcgplayer-cdn.tcgplayer.com/product/22_400w.jpg')
  })

  it('las cartas se inclinan en 3D hacia el mouse, igual que en el detalle', async () => {
    render(<ExpansionsScreen />)
    await screen.findByRole('button', { name: 'Ver el detalle de Maxx "C"' })

    const art = document.querySelector('li [class~="group/art"]') as HTMLElement

    expect(art.parentElement!.className).toContain('perspective')

    fireEvent.pointerMove(art, { pointerType: 'mouse', clientX: 190, clientY: 20 })
    // La inclinación espera su cuadro (`requestAnimationFrame`).
    await waitFor(() => expect(art.style.rotate).toMatch(/12deg$/))
    expect(art.dataset.tilting).toBe('true')

    fireEvent.pointerLeave(art)
    expect(art.style.rotate).toBe('')
  })
})

describe('llegar desde los precios de una carta: #expansions?set=…&print=…', () => {
  const scrollIntoView = vi.fn()

  beforeEach(() => {
    scrollIntoView.mockReset()
    Element.prototype.scrollIntoView = scrollIntoView
  })

  afterEach(() => {
    window.history.replaceState(null, '', '#')
  })

  const goTo = (hash: string) => window.history.replaceState(null, '', hash)
  const highlighted = () => [...document.querySelectorAll('[data-highlight="true"]')].map((button) => button.getAttribute('aria-label'))

  it('abre esa expansión (no la más nueva) con esa carta iluminada y a la vista', async () => {
    goTo('#expansions?set=1&print=12')
    render(<ExpansionsScreen />)

    expect(await screen.findByRole('heading', { name: 'Legend of Blue-Eyes White Dragon', level: 2 })).toBeInTheDocument()
    await screen.findByRole('button', { name: 'Ver el detalle de Dark Magician' })

    expect(highlighted()).toEqual(['Ver el detalle de Dark Magician'])
    // El efecto que lleva la carta al medio corre después de pintar: con la máquina cargada el botón ya está y el efecto todavía no, así que se espera en vez de leer de una.
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' }))
    expect(scrollIntoView.mock.contexts.some((element) => (element as HTMLElement).contains(screen.getByRole('button', { name: 'Ver el detalle de Dark Magician' })))).toBe(true)
    // La lista marca la expansión y de la carta se va a TCGplayer desde acá.
    expect(within(screen.getByRole('navigation', { name: 'Expansiones' })).getByRole('button', { name: /Legend of Blue-Eyes/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('link', { name: 'Ver Dark Magician en TCGplayer' })).toHaveAttribute('href', 'https://www.tcgplayer.com/product/12')
  })

  it('ilumina sólo esa impresión aunque la misma carta tenga otras en la expansión', async () => {
    goTo('#expansions?set=2&print=22')
    render(<ExpansionsScreen />)

    await screen.findAllByRole('button', { name: 'Ver el detalle de Mulcharmy Purulia' })

    expect(highlighted()).toEqual(['Ver el detalle de Mulcharmy Purulia'])
    expect(document.querySelector('[data-highlight="true"]')!.closest('li')).toHaveTextContent('Extended Art')
  })

  it('en el celular abre directo esa expansión, y "Volver" suelta la carta y limpia el hash', async () => {
    mediaQuery(false)
    goTo('#expansions?set=1&print=12')
    render(<ExpansionsScreen />)

    await screen.findByRole('button', { name: 'Ver el detalle de Dark Magician' })
    expect(highlighted()).toEqual(['Ver el detalle de Dark Magician'])

    fireEvent.click(screen.getByRole('button', { name: 'Volver a las expansiones' }))

    expect(screen.getByRole('navigation', { name: 'Expansiones' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#expansions')
  })

  it('elegir otra expansión apaga la carta iluminada y limpia el hash', async () => {
    goTo('#expansions?set=1&print=12')
    render(<ExpansionsScreen />)
    await screen.findByRole('button', { name: 'Ver el detalle de Dark Magician' })

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Expansiones' })).getByRole('button', { name: /Maze of Millennia/ }))
    await screen.findAllByRole('button', { name: 'Ver el detalle de Mulcharmy Purulia' })

    expect(highlighted()).toEqual([])
    expect(window.location.hash).toBe('#expansions')
  })

  it('con la pantalla ya abierta, un hash nuevo la lleva a esa carta', async () => {
    render(<ExpansionsScreen />)
    await screen.findAllByRole('button', { name: 'Ver el detalle de Mulcharmy Purulia' })
    expect(highlighted()).toEqual([])

    goTo('#expansions?set=1&print=13')
    fireEvent(window, new HashChangeEvent('hashchange'))

    await screen.findByRole('button', { name: 'Ver el detalle de Gaia the Fierce Knight' })
    expect(highlighted()).toEqual(['Ver el detalle de Gaia the Fierce Knight'])
  })

  it('un hash sin carta, o con números que no son, abre la expansión (o la de siempre) sin iluminar nada', async () => {
    goTo('#expansions?set=1')
    const { unmount } = render(<ExpansionsScreen />)

    await screen.findByRole('button', { name: 'Ver el detalle de Dark Magician' })
    expect(highlighted()).toEqual([])
    unmount()

    goTo('#expansions?set=abc&print=-4')
    render(<ExpansionsScreen />)

    expect(await screen.findByRole('heading', { name: 'Maze of Millennia', level: 2 })).toBeInTheDocument()
    expect(highlighted()).toEqual([])
  })
})

describe('las etiquetas largas no pisan a la carta de al lado', () => {
  it('el arte distinto se parte en varias líneas dentro de su columna, y la columna no crece con él', async () => {
    render(<ExpansionsScreen />)
    await screen.findAllByRole('button', { name: 'Ver el detalle de Mulcharmy Purulia' })

    const tile = document.querySelector('[data-highlight], li:has([aria-label^="Ver el detalle de Mulcharmy"]) ') as HTMLElement
    const stamp = [...document.querySelectorAll('li span')].find((span) => span.textContent === 'Extended Art') as HTMLElement

    // El texto de abajo va en una columna `minmax(0,1fr)` (con una `auto`, la etiqueta ancha agranda la columna y el nombre se sale).
    expect(stamp.closest('li')!.className).toContain('grid-cols-[minmax(0,1fr)]')
    expect(stamp.parentElement!.className).toContain('grid-cols-[minmax(0,1fr)]')
    expect(stamp.className).toContain('whitespace-normal')
    expect(stamp.className).toContain('max-w-full')
    expect(stamp.className).not.toContain('whitespace-nowrap')
    expect(tile).toBeTruthy()
  })
})

describe('el detalle recorre las impresiones tal como se ven', () => {
  const detail = () => screen.findByRole('dialog', { name: /^Detalle de/ })
  const bigArt = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: 'Ver la carta en grande' }).querySelector('img')!.getAttribute('src')

  it('pasa a la impresión anterior y a la siguiente: cambia el código, la rareza y el arte, aunque sea la misma carta', async () => {
    render(<ExpansionsScreen />)

    const buttons = await screen.findAllByRole('button', { name: 'Ver el detalle de Mulcharmy Purulia' })

    fireEvent.click(buttons[0]!)

    let dialog = await detail()

    expect(within(dialog).getByText('MAZE-EN001 · Rare · Unlimited')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Carta anterior' })).not.toBeInTheDocument()
    expect(bigArt(dialog)).toBe('https://tcgplayer-cdn.tcgplayer.com/product/21_400w.jpg')

    // La siguiente es otra impresión de la misma carta: el arte elegido es el de ella, no el de la anterior.
    fireEvent.click(screen.getByRole('button', { name: 'Carta siguiente' }))
    dialog = await detail()
    expect(within(dialog).getByText('MAZE-EN001 · Ultra Rare · Extended Art · Unlimited')).toBeInTheDocument()
    expect(bigArt(dialog)).toBe('https://tcgplayer-cdn.tcgplayer.com/product/22_400w.jpg')

    fireEvent.click(screen.getByRole('button', { name: 'Carta siguiente' }))
    dialog = await screen.findByRole('dialog', { name: /Ash Blossom/ })
    expect(within(dialog).getByText('MAZE-EN002 · Common · Unlimited')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Carta anterior' }))
    dialog = await detail()
    expect(bigArt(dialog)).toBe('https://tcgplayer-cdn.tcgplayer.com/product/22_400w.jpg')
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })

  it('la última impresión de la lista no tiene siguiente', async () => {
    render(<ExpansionsScreen />)

    fireEvent.click(await screen.findByRole('button', { name: 'Ver el detalle de Maxx "C"' }))
    await detail()

    expect(screen.queryByRole('button', { name: 'Carta siguiente' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Carta anterior' })).toBeInTheDocument()
  })
})

describe('buscar una carta en el buscador de expansiones', () => {
  const searchbox = () => screen.getByRole('searchbox', { name: 'Buscar expansión o carta' })

  afterEach(() => {
    window.history.replaceState(null, '', '#')
  })

  it('el nombre de una carta la ofrece arriba de la lista, y tocarla abre sus impresiones por expansión con el precio de cada una', async () => {
    searchCards.mockResolvedValue({ results: [{ ygoprodeckId: DARK_MAGICIAN, name: 'Dark Magician' }], hasMore: false })
    render(<ExpansionsScreen />)
    await screen.findByRole('navigation', { name: 'Expansiones' })

    fireEvent.change(searchbox(), { target: { value: 'dark mag' } })

    const nav = screen.getByRole('navigation', { name: 'Expansiones' })
    const hit = await within(nav).findByRole('button', { name: /Dark Magician/ })

    expect(searchCards).toHaveBeenCalledWith({ query: 'dark mag' }, 8)
    expect(within(nav).getByRole('heading', { name: 'Cartas' })).toBeInTheDocument()
    expect(within(hit).getByText('Ver impresiones y precios')).toBeInTheDocument()

    fireEvent.click(hit)

    const dialog = await screen.findByRole('dialog')

    expect(await within(dialog).findByText('Legend of Blue-Eyes White Dragon')).toBeInTheDocument()
    expect(within(dialog).getByText('Maze of Millennia')).toBeInTheDocument()
    expect(within(dialog).getByText(/12[.,]50/)).toBeInTheDocument()
  })

  it('tocar una impresión de la hoja lleva a esa expansión con la carta iluminada, y la búsqueda se limpia para no esconderla', async () => {
    searchCards.mockResolvedValue({ results: [{ ygoprodeckId: DARK_MAGICIAN, name: 'Dark Magician' }], hasMore: false })
    render(<ExpansionsScreen />)
    await screen.findByRole('navigation', { name: 'Expansiones' })

    fireEvent.change(searchbox(), { target: { value: 'dark mag' } })
    fireEvent.click(await within(screen.getByRole('navigation', { name: 'Expansiones' })).findByRole('button', { name: /Dark Magician/ }))
    fireEvent.click(await within(await screen.findByRole('dialog')).findByRole('button', { name: /LOB-EN002/ }))

    expect(await screen.findByRole('heading', { name: 'Legend of Blue-Eyes White Dragon', level: 2 })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(searchbox()).toHaveValue('')
    expect(window.location.hash).toBe('#expansions?set=1&print=12')
  })

  it('el código de una impresión también la encuentra, con ese código a la vista y sin buscarla por nombre', async () => {
    render(<ExpansionsScreen />)
    await screen.findByRole('navigation', { name: 'Expansiones' })

    fireEvent.change(searchbox(), { target: { value: 'lob-en002' } })

    const hit = await within(screen.getByRole('navigation', { name: 'Expansiones' })).findByRole('button', { name: /Dark Magician/ })

    expect(within(hit).getByText('LOB-EN002')).toBeInTheDocument()
    expect(searchCards).not.toHaveBeenCalled()
  })

  it('con menos de tres letras no se busca ninguna carta, y si no coincide ni una expansión ni una carta, lo dice', async () => {
    render(<ExpansionsScreen />)
    await screen.findByRole('navigation', { name: 'Expansiones' })

    fireEvent.change(searchbox(), { target: { value: 'bl' } })
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(searchCards).not.toHaveBeenCalled()

    fireEvent.change(searchbox(), { target: { value: 'zzz' } })

    expect(await screen.findByText('Ninguna expansión ni carta coincide con “zzz”.')).toBeInTheDocument()
    expect(searchCards).toHaveBeenCalledWith({ query: 'zzz' }, 8)
  })

  it('si la búsqueda de cartas falla, el buscador de expansiones sigue funcionando', async () => {
    searchCards.mockRejectedValue(new Error('sin red'))
    render(<ExpansionsScreen />)
    await screen.findByRole('navigation', { name: 'Expansiones' })

    fireEvent.change(searchbox(), { target: { value: 'maze' } })

    expect(await screen.findByRole('button', { name: /Maze of Millennia/ })).toBeInTheDocument()
    await waitFor(() => expect(searchCards).toHaveBeenCalled())
    expect(screen.queryByRole('heading', { name: 'Cartas' })).not.toBeInTheDocument()
  })
})
