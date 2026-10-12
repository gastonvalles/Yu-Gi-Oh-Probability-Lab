// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ReplaysScreen } from '../components/replays/ReplaysScreen'

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

/** Las tarjetas de los replays: la pantalla entera también es un <article>, que las contiene. */
const cards = () => screen.getAllByRole('article').filter((article) => !article.querySelector('article'))

beforeEach(() => {
  window.history.replaceState(null, '', '#replays')
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

describe('la pestaña Replays', () => {
  it('muestra los replays con un deck del Meta, con el deck de cada jugador, y "Todos" suma el resto', () => {
    render(<ReplaysScreen />)

    expect(screen.getByRole('radio', { name: 'Con deck del Meta' })).toHaveAttribute('aria-checked', 'true')
    expect(cards()).toHaveLength(2)

    const final = within(cards()[0]!)
    expect(final.getByText('YCS Paris 2026 · Final')).toBeInTheDocument()
    expect(final.getByText('Timoti B. vs. Vladis B.')).toBeInTheDocument()
    expect(final.getByRole('link', { name: /Elfnote/ })).toHaveAttribute('href', '#meta?deck=101')
    expect(final.getByRole('link', { name: /Azamina Mitsurugi/ })).toHaveAttribute('href', '#meta?deck=102')
    // El otro replay: Usama B. no tiene deck en el Meta, Pascal K. sí.
    expect(within(cards()[1]!).getByText('deck sin identificar')).toBeInTheDocument()
    expect(within(cards()[1]!).getByRole('link', { name: /Sky Striker/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Todos' }))
    expect(cards()).toHaveLength(3)
  })

  it('busca por jugador, deck o torneo', () => {
    render(<ReplaysScreen />)

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar replays' }), { target: { value: 'sky striker' } })
    expect(cards()).toHaveLength(1)
    expect(within(cards()[0]!).getByText('Usama B. vs. Pascal K.')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar replays' }), { target: { value: 'no existe' } })
    expect(screen.getByText('Ningún replay con eso')).toBeInTheDocument()
  })

  it('tocar un replay lo abre en una ventana con el reproductor sin cookies recién al reproducir, y el link lo guarda', () => {
    render(<ReplaysScreen />)

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
    const first = render(<ReplaysScreen />)

    expect(screen.getByRole('dialog')).toBeInTheDocument()
    first.unmount()

    window.history.replaceState(null, '', '#replays?deck=101')
    render(<ReplaysScreen />)

    expect(cards()).toHaveLength(1)
    expect(within(cards()[0]!).getByText('Timoti B. vs. Vladis B.')).toBeInTheDocument()
    // Con un deck elegido no hay selector de "Con deck del Meta / Todos": el filtro se quita con su chip.
    expect(screen.queryByRole('radio', { name: 'Todos' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Quitar el filtro Elfnote' }))
    expect(cards()).toHaveLength(2)
    expect(window.location.hash).toBe('#replays')
  })
})
