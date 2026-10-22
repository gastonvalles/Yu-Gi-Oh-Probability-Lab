// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_CARD_SEARCH_FILTERS } from '../app/card-search'
import { EASE_OUT } from '../app/motion'
import { EXIT_MS, Presence } from '../app/use-presence'
import { CardDetailModal } from '../components/card-detail/CardDetailModal'
import { CardDetailOverlay } from '../components/card-detail/CardDetailOverlay'
import { MobileCardSearch } from '../components/search/MobileCardSearch'
import type { CardSearchViewState } from '../components/search/search-types'
import { Modal } from '../components/ui/Modal'
import type { ApiCardSearchResult } from '../ygoprodeck'

vi.mock('../components/CardArt', () => ({ CardArt: ({ name }: { name: string }) => <img alt={name} /> }))
vi.mock('../app/use-card-prices', () => ({
  useCardPrices: () => ({
    status: 'ready',
    updated: '2026-10-11',
    prices: [{ set: 'Rarity Collection 5', code: 'RA05-EN091', rarity: 'Starlight Rare', edition: '1st Edition', market: 20.12, url: '', productId: 3, expansionId: 6, variant: '' }],
  }),
}))

const original = { animate: Element.prototype.animate, matchMedia: window.matchMedia }

// jsdom no los trae (los usan la lista del buscador y el bloqueo del scroll).
window.scrollTo = () => {}
Element.prototype.scrollTo = () => {}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  Element.prototype.animate = original.animate
  window.matchMedia = original.matchMedia
  document.head.querySelectorAll('style[data-test]').forEach((style) => style.remove())
  window.history.replaceState(null, '', '#')
})

/** Animaciones de mentira que terminan a mano (`finish()`), y lo que se le pidió a cada elemento (como en `use-presence.test.tsx`). */
function fakeAnimate() {
  const calls: { element: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions; animation: Animation }[] = []
  let finish = () => {}
  const finished = new Promise<void>((resolve) => {
    finish = resolve
  })

  Element.prototype.animate = function (this: Element, keyframes, options) {
    // Ya en marcha (50 ms adentro): volver a abrir la da vuelta desde ahí.
    const animation = { finished, currentTime: 50, reverse: vi.fn(), cancel: vi.fn() } as unknown as Animation

    calls.push({ element: this, keyframes: keyframes as Keyframe[], options: options as KeyframeAnimationOptions, animation })
    return animation
  }
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia

  return { calls, finish: async () => act(async () => finish()) }
}

/** jsdom no carga index.css: las entradas que se invierten al salir, con su nombre, como en la app. */
function entryStyles() {
  const style = Object.assign(document.createElement('style'), {
    textContent: '.animate-sheet-in { animation-name: sheet-in } .animate-side-drawer { animation-name: side-drawer } .animate-nav-scrim { animation-name: nav-scrim }',
  })

  style.dataset.test = ''
  document.head.append(style)
}

const card: ApiCardSearchResult = {
  name: 'Mulcharmy Purulia', ygoprodeckId: 84192580, cardType: 'Effect Monster', frameType: 'effect', description: 'Quick Effect.', race: 'Aqua', attribute: 'WATER', level: 4,
  linkValue: null, atk: '100', def: '600', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null, banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
}

const search: CardSearchViewState = {
  deckFormat: 'unlimited', query: 'carta', status: 'success', results: [card], rawResultCount: 1, errorMessage: '', hasMore: false, isLoadingMore: false,
  filters: DEFAULT_CARD_SEARCH_FILTERS, activeFilterCount: 0, hasSearchCriteria: true, maxedOutResultIds: new Set(),
}

/**
 * Lo que hace la app: la lupa abre el buscador de la app y su «Buscar … entre las cartas» lo cierra y abre el de cartas, que `DeckModeScreen` monta sólo abierto,
 * envuelto en un `Presence`.
 */
function SearchScreen({ onClose }: { onClose: () => void }) {
  const [finder, setFinder] = useState(false)
  const [open, setOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setFinder(true)}>
        Buscar en la app
      </button>
      <Modal isOpen={finder} onClose={() => setFinder(false)} size="sm" title="Buscar en la app">
        <button
          type="button"
          onClick={() => {
            setOpen(true)
            setFinder(false)
          }}
        >
          Buscar «carta» entre las cartas
        </button>
      </Modal>
      <Presence>
        {open ? (
          <MobileCardSearch
            search={search}
            actions={{ onQueryChange: () => {}, onFilterChange: () => {}, onClearFilters: () => {}, onLoadMore: () => {} }}
            deckCopyCounts={new Map()}
            zoneCounts={{ main: 0, extra: 0, side: 0 }}
            onAddCard={() => true}
            onOpenDetail={() => {}}
            onClose={() => {
              onClose()
              setOpen(false)
            }}
          />
        ) : null}
      </Presence>
    </>
  )
}

/** Toca la lupa y, en el buscador de la app, «Buscar … entre las cartas». */
function openCardSearch() {
  const opener = screen.getByRole('button', { name: 'Buscar en la app' })

  opener.focus()
  act(() => opener.click())
  act(() => screen.getByRole('button', { name: 'Buscar «carta» entre las cartas' }).click())

  return opener
}

describe('el buscador de cartas del celular sale', () => {
  it('sin la Web Animations API se va enseguida, como antes', () => {
    render(<SearchScreen onClose={() => {}} />)
    openCardSearch()
    act(() => screen.getByRole('button', { name: 'Listo' }).click())

    expect(screen.queryByRole('dialog', { name: 'Buscar cartas' })).not.toBeInTheDocument()
  })

  it('entra con `sheet-in` y sale con su inversa (150 ms, EASE_OUT): quieta e inerte, con el foco en la lupa, Escape y el scroll ya sueltos; los filtros abiertos también se van', async () => {
    const { calls, finish } = fakeAnimate()
    entryStyles()
    const onClose = vi.fn()
    render(<SearchScreen onClose={onClose} />)
    const opener = openCardSearch()
    const dialog = screen.getByRole('dialog', { name: 'Buscar cartas' })

    expect(dialog).toHaveClass('animate-sheet-in')
    fireEvent.click(screen.getByRole('button', { name: 'Filtros' }))
    const filters = screen.getByRole('dialog', { name: 'Filtros' })

    act(() => screen.getByRole('button', { name: 'Listo' }).click())

    // Sigue montada mientras sale, pero ya no es un diálogo abierto.
    expect(dialog).toBeInTheDocument()
    expect(dialog.inert).toBe(true)
    expect(dialog).toHaveAttribute('data-leaving')
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe('')
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    const exits = calls.map(({ element, keyframes, options }) => ({ element, keyframes, options }))
    expect(exits).toContainEqual({ element: dialog, keyframes: [{ opacity: 0, transform: 'translateY(10px)' }], options: { duration: EXIT_MS, easing: EASE_OUT, fill: 'forwards' } })
    // El cajón de los filtros vuelve a la derecha a la vez (antes se quedaba quieto encima y desaparecía de golpe).
    expect(exits).toContainEqual({ element: filters, keyframes: [{ transform: 'translateX(100%)' }], options: { duration: EXIT_MS, easing: EASE_OUT, fill: 'forwards' } })

    await finish()
    expect(screen.queryByRole('dialog', { name: 'Buscar cartas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Filtros' })).not.toBeInTheDocument()
  })
})

describe('el detalle de una carta se va siempre con su vuelo', () => {
  /** El vuelo de cerrar: el fondo se funde a 0 (la carta vuelve a la suya a la vez). */
  const fadedOut = (calls: ReturnType<typeof fakeAnimate>['calls'], dialog: HTMLElement) =>
    calls.some(({ element, keyframes, options }) => element === dialog && keyframes.at(-1)?.opacity === 0 && options.fill === 'forwards')

  it('«Agregar al Main Deck» cierra con el vuelo, como la X: avisa al terminar, no de golpe', async () => {
    const { calls, finish } = fakeAnimate()
    const onClose = vi.fn()
    const onAddToZone = vi.fn(() => true)
    render(<CardDetailModal card={card} deckFormat="unlimited" isOpen onAddToZone={onAddToZone} onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: `Detalle de ${card.name}` })

    fireEvent.click(screen.getByRole('button', { name: 'Agregar al Main Deck' }))
    expect(onAddToZone).toHaveBeenCalledWith('main')
    expect(fadedOut(calls, dialog)).toBe(true)
    expect(onClose).not.toHaveBeenCalled()

    await finish()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ir a una impresión desde los precios también cierra con el vuelo', async () => {
    const { calls, finish } = fakeAnimate()
    const onClose = vi.fn()
    render(<CardDetailModal card={card} deckFormat="unlimited" isOpen onAddToZone={() => false} onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: `Detalle de ${card.name}` })

    fireEvent.click(screen.getByRole('button', { name: 'Ver precios en TCGplayer' }))
    fireEvent.click(screen.getByRole('button', { name: /Starlight Rare · 1st Edition/ }))
    expect(window.location.hash).toBe('#expansions?set=6&print=3')
    expect(fadedOut(calls, dialog)).toBe(true)
    expect(onClose).not.toHaveBeenCalled()

    await finish()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('si el padre lo deja de dibujar (la pausa, la ayuda de Roles) se va con el vuelo sin avisarle, inerte y con el foco de vuelta; si lo vuelve a dibujar mientras sale, vuelve el mismo', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { calls } = fakeAnimate()
    const onClose = vi.fn()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const mat = (shown: boolean) => <Presence>{shown ? <CardDetailOverlay name="Carta del rival" card={null} origin={null} onClose={onClose} /> : null}</Presence>
    const view = render(mat(true))
    const dialog = screen.getByRole('dialog', { name: 'Detalle de Carta del rival' })

    view.rerender(mat(false))
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveAttribute('inert')
    expect(document.activeElement).toBe(opener)
    expect(document.body.style.overflow).toBe('')
    expect(fadedOut(calls, dialog)).toBe(true)
    expect(onClose).not.toHaveBeenCalled()

    // Vuelve a mostrarse mientras sale: el mismo nodo, otra vez abierto, y la salida al revés.
    const flight = calls.slice(-2).map(({ animation }) => animation.reverse as ReturnType<typeof vi.fn>)
    view.rerender(mat(true))
    expect(screen.getByRole('dialog', { name: 'Detalle de Carta del rival' })).toBe(dialog)
    expect(dialog).not.toHaveAttribute('inert')
    expect(flight.map((reverse) => reverse.mock.calls.length)).toEqual([1, 1])

    // Si la salida todavía no arrancó (cuadro 0), se descarta: `reverse()` ahí saltaría a su final y volvería (un parpadeo).
    view.rerender(mat(false))
    const unstarted = calls.slice(-2).map(({ animation }) => Object.assign(animation, { currentTime: 0 }))
    view.rerender(mat(true))
    expect(unstarted.map((animation) => [(animation.cancel as ReturnType<typeof vi.fn>).mock.calls.length, (animation.reverse as ReturnType<typeof vi.fn>).mock.calls.length])).toEqual([[1, 0], [1, 0]])

    view.rerender(mat(false))
    act(() => {
      vi.advanceTimersByTime(EXIT_MS + 100)
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    opener.remove()
  })
})
