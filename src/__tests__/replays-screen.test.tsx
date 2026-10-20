// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ReplaysScreen } from '../components/replays/ReplaysScreen'

// Al cambiar de chip la lista muestra lugares vacíos un segundo (`useBriefLoading`, probado aparte): acá se controla con una bandera.
const { refreshing } = vi.hoisted(() => ({ refreshing: { value: false } }))

vi.mock('../app/use-brief-loading', () => ({ BRIEF_LOADING_MS: 1000, useBriefLoading: () => refreshing.value }))

// Datos propios: los de verdad cambian todos los días con el workflow.
vi.mock('../data/replays.json', () => ({
  default: {
    fetchedAt: '2026-10-12T07:00:00.000Z',
    windowDays: 75,
    channels: {
      eu: { name: 'Yu-Gi-Oh! TCG Europe', url: 'https://www.youtube.com/@YuGiOhCardEU' },
      tcg: { name: 'Yu-Gi-Oh! TCG', url: 'https://www.youtube.com/@OfficialYuGiOhTCG' },
    },
    videos: [
      { id: 'aaaaaaaaaa1', channel: 'eu', title: 'YCS Paris 2026 - Day 2 - FINAL - Timoti B. vs. Vladis B.', duration: '31:38', date: '2026-09-21' },
      { id: 'aaaaaaaaaa2', channel: 'eu', title: 'YCS Paris 2026 - Day 2 - Round 13 - Usama B. vs. Pascal K.', duration: '40:31', date: '2026-09-21' },
      { id: 'aaaaaaaaaa3', channel: 'eu', title: 'YCS Paris 2026 - Day 1 - Round 5 - Muhammed K. vs. Nathan F.', duration: '50:45', date: '2026-09-21' },
    ],
  },
}))

vi.mock('../data/meta-decks.json', () => {
  const deck = (id: number, name: string, player: string, placement: string) => ({ id, region: 'tcg', name, date: '2026-09-19', tournament: 'YCS Paris', placement, players: 500, player, cover: null, url: null, main: [], side: [] })

  return {
    default: {
      fetchedAt: '2026-10-12T00:00:00.000Z',
      windowDays: 56,
      source: 'test',
      cards: {},
      decks: [deck(101, 'Elfnote', 'Timoti Baggio', 'Runner-Up'), deck(102, 'Azamina Mitsurugi', 'Vladis Baranovskis', 'Winner'), deck(103, 'Sky Striker', 'Pascal Kihm', 'Top 32')],
    },
  }
})

/** El detalle de un deck (que se abre desde los replays) lee el formato y el deck del builder: hace falta el store. */
function renderScreen() {
  const store = configureStore({
    reducer: {
      settings: (state = { handSize: 5, deckFormat: 'tcg' }) => state,
      deckBuilder: (state = { deckName: '', main: [], extra: [], side: [], isEditingDeck: false }) => state,
    },
  })

  return render(
    <Provider store={store}>
      <ReplaysScreen />
    </Provider>,
  )
}

/** Las tarjetas de los replays: la pantalla entera también es un <article>, que las contiene. */
const cards = () => screen.getAllByRole('article').filter((article) => !article.querySelector('article'))
/** Los decks de un replay están en sus tres puntos (⋯): se abre el menú y se elige. */
const openMenu = (card: HTMLElement) => fireEvent.click(within(card).getByRole('button', { name: /^Más opciones de / }))
const pick = (card: HTMLElement, name: string) => {
  openMenu(card)
  fireEvent.click(within(card).getByRole('menuitem', { name }))
}

beforeEach(() => {
  refreshing.value = false
  window.history.replaceState(null, '', '#replays')
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

describe('la pestaña Replays', () => {
  it('al cambiar de pestaña se ven los lugares vacíos en vez de los videos mientras se actualiza', () => {
    refreshing.value = true
    renderScreen()

    expect(screen.getByRole('status', { name: 'Actualizando los replays' })).toHaveAttribute('aria-busy', 'true')
    expect(document.querySelector('#replays-list ul')).toBeNull()
  })

  it('cada video tiene dos líneas de texto y se destaca con un fondo al pasar el mouse (o al enfocarlo), que no mueve nada', () => {
    renderScreen()

    const card = cards()[0]!
    const text = within(card).getByRole('button', { name: /Final · Timoti B. vs. Vladis B./ })

    // Dos líneas: el título y «torneo · fecha · decks».
    expect(text.children).toHaveLength(2)
    // El fondo es un pseudo-elemento detrás del video (no cambia el alto ni el lugar de nada), más ancho que él.
    expect(card).toHaveClass('relative', 'isolate', 'before:absolute', 'before:-inset-3', 'hover:before:opacity-100', 'focus-within:before:opacity-100')
  })

  it('muestra los replays con un deck del Meta, con «fecha · N decks» y los decks en los tres puntos, y "Todos" suma el resto; los chips traen la cuenta y los torneos', () => {
    renderScreen()

    expect(screen.getByRole('radio', { name: 'Con deck' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Con deck' })).toHaveTextContent('2')
    expect(screen.getByRole('radio', { name: 'Todos' })).toHaveTextContent('3')
    expect(cards()).toHaveLength(2)

    const final = within(cards()[0]!)
    // Dos líneas de texto, como YouTube: la instancia y los jugadores arriba; el torneo, la fecha y los decks abajo.
    expect(final.getByText('Final · Timoti B. vs. Vladis B.')).toBeInTheDocument()
    expect(final.getByText(/^YCS Paris 2026 · .* · 2 decks$/)).toBeInTheDocument()
    // Con dos decks, una sola opción en los tres puntos (abre el replay, que lista el deck de cada jugador); los decks no se repiten en la tarjeta.
    expect(final.getByText(/· 2 decks$/)).toBeInTheDocument()
    expect(final.queryByRole('menu')).not.toBeInTheDocument()
    openMenu(cards()[0]!)
    expect(final.getAllByRole('menuitem')).toHaveLength(1)
    expect(final.getByRole('menuitem', { name: 'Ver los decks de Timoti B. vs. Vladis B.' })).toBeInTheDocument()
    expect(final.queryByText('Elfnote')).not.toBeInTheDocument()
    // Escape cierra el menú.
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(final.queryByRole('menu')).not.toBeInTheDocument()
    // El otro replay: Usama B. no tiene deck en el Meta, Pascal K. sí: un deck, un botón que abre ese deck.
    expect(within(cards()[1]!).getByText(/· 1 deck$/)).toBeInTheDocument()
    openMenu(cards()[1]!)
    expect(within(cards()[1]!).getAllByRole('menuitem')).toHaveLength(1)
    expect(within(cards()[1]!).getByRole('menuitem', { name: 'Ver deck Sky Striker' })).toBeInTheDocument()
    // Tocar afuera lo cierra.
    fireEvent.pointerDown(document.body)
    expect(within(cards()[1]!).queryByRole('menu')).not.toBeInTheDocument()

    // «Todos» suma el replay sin deck del Meta, que no tiene tres puntos.
    fireEvent.click(screen.getByRole('radio', { name: 'Todos' }))
    expect(cards()).toHaveLength(3)
    expect(within(cards()[2]!).queryByRole('button', { name: /^Más opciones de / })).not.toBeInTheDocument()

    // Un torneo es un chip más: deja sólo sus replays.
    fireEvent.click(screen.getByRole('radio', { name: /YCS Paris 2026/ }))
    expect(cards()).toHaveLength(3)
  })

  it('busca por jugador, deck o torneo', () => {
    renderScreen()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar replays' }), { target: { value: 'sky striker' } })
    expect(cards()).toHaveLength(1)
    expect(within(cards()[0]!).getByText('Ronda 13 · Usama B. vs. Pascal K.')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar replays' }), { target: { value: 'no existe' } })
    expect(screen.getByText('Ningún replay con eso')).toBeInTheDocument()
  })

  it('tocar un replay lo abre en una ventana con el reproductor sin cookies recién al reproducir, y el link lo guarda', () => {
    renderScreen()

    fireEvent.click(within(cards()[0]!).getByRole('button', { name: /Ver el replay Timoti B. vs. Vladis B./ }))

    const dialog = screen.getByRole('dialog')
    expect(window.location.hash).toBe('#replays?video=aaaaaaaaaa1')
    expect(within(dialog).getByText('Winner')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Ver en YouTube/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=aaaaaaaaaa1')
    // Hasta tocar "Reproducir" no se le pide nada a YouTube que no sea la miniatura.
    expect(dialog.querySelector('iframe')).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Reproducir Timoti B. vs. Vladis B.' }))

    const frame = dialog.querySelector('iframe')
    expect(frame?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/aaaaaaaaaa1?autoplay=1&rel=0&playsinline=1')
    expect(frame?.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin')

    fireEvent.click(within(dialog).getByRole('button', { name: /Cerrar/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(window.location.hash).toBe('#replays')
  })

  it('un link con el replay lo abre al entrar, y uno con un deck deja sólo sus replays', () => {
    window.history.replaceState(null, '', '#replays?video=aaaaaaaaaa2')
    const first = renderScreen()

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    first.unmount()

    window.history.replaceState(null, '', '#replays?deck=101')
    renderScreen()

    expect(cards()).toHaveLength(1)
    expect(within(cards()[0]!).getByText('Final · Timoti B. vs. Vladis B.')).toBeInTheDocument()
    // Con un deck elegido no hay selector de "Con deck / Todos": el filtro se quita con su chip.
    expect(screen.queryByRole('radio', { name: 'Todos' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar el filtro Elfnote' }))
    expect(cards()).toHaveLength(2)
    expect(window.location.hash).toBe('#replays')
  })

  it('con un solo deck, "Ver deck" lo abre directo, sin pasar por el replay', async () => {
    renderScreen()

    pick(cards()[1]!, 'Ver deck Sky Striker')

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Sky Striker' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#replays')
    expect(await screen.findByText('No tengo la lista completa de este deck.')).toBeInTheDocument()
  })

  it('"Ver decks" abre el replay y de ahí el detalle del deck de cada jugador, sin salir de los replays, con sus videos ahí mismo', async () => {
    renderScreen()

    pick(cards()[0]!, 'Ver los decks de Timoti B. vs. Vladis B.')
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Timoti B. vs. Vladis B.' })).getByRole('button', { name: 'Ver deck Elfnote' }))

    const deck = screen.getByRole('dialog', { name: 'Elfnote' })
    expect(window.location.hash).toBe('#replays')
    expect(within(deck).getByText('Timoti Baggio')).toBeInTheDocument()
    // El video de este deck (la final) está en el encabezado, y abre el replay encima del deck.
    fireEvent.click(within(deck).getByRole('button', { name: /Replay: Final · Timoti B\. vs\. Vladis B\./ }))
    expect(screen.getByRole('dialog', { name: 'Timoti B. vs. Vladis B.' })).toBeInTheDocument()
    expect(screen.getAllByRole('dialog')).toHaveLength(2)

    // Ver el deck del otro jugador cierra el video y cambia el deck que se ve.
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Timoti B. vs. Vladis B.' })).getByRole('button', { name: 'Ver deck Azamina Mitsurugi' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Azamina Mitsurugi' })).toBeInTheDocument()

    // Los datos del test no traen la lista completa: se dice, en lugar de dejar la ventana vacía.
    expect(await screen.findByText('No tengo la lista completa de este deck.')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Azamina Mitsurugi' })).getByRole('button', { name: /Cerrar/ }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('con el replay abierto, "Ver deck" corta el video (que no siga sonando debajo) y abre el deck', async () => {
    renderScreen()

    fireEvent.click(within(cards()[0]!).getByRole('button', { name: /Ver el replay Timoti B. vs. Vladis B./ }))
    expect(window.location.hash).toBe('#replays?video=aaaaaaaaaa1')

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Ver deck Elfnote' }))

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Elfnote' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#replays')
    expect(await screen.findByText('No tengo la lista completa de este deck.')).toBeInTheDocument()
  })
})

// Lo que devuelve /api/live: las transmisiones al aire de los canales oficiales.
const LIVE = {
  ok: true,
  checkedAt: '2026-10-17T18:00:00.000Z',
  streams: [
    { id: 'NlQJc1ExxSA', channel: 'tcg', title: 'Yu-Gi-Oh! Championship Series - Houston, TX - Genesys Main Event - Day One', viewers: 6700 },
    { id: 'c_qNh337rxA', channel: 'tcg', title: 'Yu-Gi-Oh! Championship Series - Houston, TX - Advanced ATTACK OF THE GIANT CARD!! - Day One', viewers: 1400 },
  ],
}
// Lo que ya terminó de transmitirse: torneos enteros, de cada canal.
const PAST = [
  { id: 'unumK2yU-ks', channel: 'tcg', title: 'Livestream | WORLD CHAMPIONSHIP 2026 | Day 3', duration: '5:42:32', published: 'Streamed 1d ago' },
  { id: 'AAAAAAAAAA1', channel: 'eu', title: 'YCS Paris - Day 2', duration: '8:12:33', published: 'Streamed 3w ago' },
]
const stubLive = (body: unknown) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))

describe('las transmisiones en vivo', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('muestra arriba de los replays lo que está al aire, lo más visto primero, con la gente que mira y un botón para mirarlo', async () => {
    stubLive(LIVE)
    renderScreen()

    const live = within(await screen.findByRole('region', { name: 'En vivo ahora' }))

    expect(live.getByText('2 transmisiones de los canales oficiales de YouTube.')).toBeInTheDocument()
    // Lo más visto primero (la lista ya viene ordenada y se respeta).
    expect(live.getAllByRole('button', { name: /^Mirar en vivo: / }).map((button) => button.getAttribute('aria-label'))).toEqual(LIVE.streams.map((stream) => `Mirar en vivo: ${stream.title}`))
    expect(live.getByText(/6,7\s*mil viendo/)).toBeInTheDocument()
    expect(live.getAllByRole('button', { name: 'Mirar en vivo' })).toHaveLength(2)
    // Los replays siguen ahí, debajo.
    expect(screen.getByRole('radio', { name: 'Con deck' })).toBeInTheDocument()
  })

  it('se mira acá mismo: la ventana trae el reproductor sin cookies recién al reproducir y el link a YouTube', async () => {
    stubLive(LIVE)
    renderScreen()

    fireEvent.click((await screen.findAllByRole('button', { name: /^Mirar en vivo: .*Genesys Main Event/ }))[0]!)

    const dialog = screen.getByRole('dialog')

    expect(within(dialog).getByText('En vivo · Yu-Gi-Oh! TCG')).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Ver en YouTube/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=NlQJc1ExxSA')
    expect(dialog.querySelector('iframe')).toBeNull()

    fireEvent.click(within(dialog).getByRole('button', { name: /^Reproducir en vivo: / }))

    expect(dialog.querySelector('iframe')?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/NlQJc1ExxSA?autoplay=1&rel=0&playsinline=1')
  })

  it('debajo van las últimas que ya terminaron, con cuánto duran y cuándo fueron (en el idioma de quien mira), también si no hay nada al aire; se ven acá mismo', async () => {
    stubLive({ ...LIVE, streams: [], past: PAST })
    renderScreen()

    const recent = within(await screen.findByRole('region', { name: 'Transmisiones recientes' }))

    expect(screen.queryByText('En vivo ahora')).not.toBeInTheDocument()
    expect(recent.getAllByRole('button', { name: /^Ver la transmisión: / }).map((button) => button.getAttribute('aria-label'))).toEqual(PAST.map((stream) => `Ver la transmisión: ${stream.title}`))
    expect(recent.getByText('5:42:32')).toBeInTheDocument()
    expect(recent.getByText('hace 1 día')).toBeInTheDocument()
    expect(recent.getByText('hace 3 semanas')).toBeInTheDocument()
    expect(recent.getAllByRole('button', { name: 'Ver' })).toHaveLength(2)

    // Se mira acá mismo, sin la insignia de «en vivo», con el reproductor recién al reproducir y el link a YouTube.
    fireEvent.click(recent.getAllByRole('button', { name: /^Ver la transmisión: / })[0]!)

    const dialog = screen.getByRole('dialog')

    expect(within(dialog).getByText('Transmisión · Yu-Gi-Oh! TCG')).toBeInTheDocument()
    expect(within(dialog).queryByText('En vivo')).not.toBeInTheDocument()
    expect(within(dialog).getByText(/5:42:32 · hace 1 día/)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Ver en YouTube/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=unumK2yU-ks')
    expect(dialog.querySelector('iframe')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: /^Reproducir: / }))
    expect(dialog.querySelector('iframe')?.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/unumK2yU-ks?autoplay=1&rel=0&playsinline=1')
  })

  it('lo que está al aire va primero y lo que ya terminó, debajo; sin nada de lo ya terminado no hay sección', async () => {
    stubLive({ ...LIVE, past: PAST })
    renderScreen()

    const live = await screen.findByRole('region', { name: 'En vivo ahora' })
    const recent = screen.getByRole('region', { name: 'Transmisiones recientes' })

    expect(live.compareDocumentPosition(recent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    cleanup()
    stubLive(LIVE)
    renderScreen()
    await screen.findByRole('region', { name: 'En vivo ahora' })
    expect(screen.queryByRole('region', { name: 'Transmisiones recientes' })).not.toBeInTheDocument()
  })

  it('sin nada al aire no se dibuja nada (ni un aviso): no es un error', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, checkedAt: 'ahora', streams: [] }), { status: 200 }))

    vi.stubGlobal('fetch', fetchMock)
    renderScreen()
    await act(async () => {})

    expect(fetchMock).toHaveBeenCalledWith('/api/live', expect.anything())
    expect(screen.queryByText('En vivo ahora')).not.toBeInTheDocument()
    expect(screen.queryByText(/No pude revisar las transmisiones/)).not.toBeInTheDocument()
  })

  it('si no se pudo mirar qué hay en vivo, lo dice y deja los links a los canales (una lista vacía no se hace pasar por «no hay nada»)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('sin red'))))
    renderScreen()

    const note = await screen.findByText(/No pude revisar las transmisiones en vivo ahora/)

    expect(within(note.closest('p')!).getByRole('link', { name: 'Yu-Gi-Oh! TCG' })).toHaveAttribute('href', 'https://www.youtube.com/@OfficialYuGiOhTCG')
    expect(within(note.closest('p')!).getByRole('link', { name: 'Yu-Gi-Oh! TCG Europe' })).toHaveAttribute('href', 'https://www.youtube.com/@YuGiOhCardEU')
  })

  it('vuelve a mirar cada minuto, así una transmisión que empieza aparece sin recargar', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, checkedAt: 'ahora', streams: [] }), { status: 200 }))

    vi.stubGlobal('fetch', fetchMock)
    renderScreen()
    await act(async () => {})
    expect(fetchMock).toHaveBeenCalledTimes(1)

    fetchMock.mockImplementation(async () => new Response(JSON.stringify(LIVE), { status: 200 }))
    await act(async () => {
      vi.advanceTimersByTime(60_000)
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(await screen.findByText('En vivo ahora')).toBeInTheDocument()
  })
})
