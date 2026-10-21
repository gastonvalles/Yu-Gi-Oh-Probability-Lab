// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within, type RenderResult } from '@testing-library/react'
import '@testing-library/jest-dom'
import type { ReactElement } from 'react'
import { toast } from 'react-hot-toast'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadCardEffectMap, loadCardEffects } from '../app/card-effect-data'
import CARD_EFFECTS from '../data/card-effects.json'
import { RIFFLE_MS } from '../app/shuffle-fx'
import type { DuelConnect } from '../app/use-duel'
import type { ApiCardReference } from '../types'
import { fetchCardsByIds } from '../ygoprodeck'
import { createMemoryRoom, type MemoryRoom } from './support/memory-room'
import { createDuelHarness, asDesktop, asSocket, handOf, monsters, summonFirst, tap, zoneOf } from './support/duel-screen-harness'

// La pantalla del duelo arma dos mesas completas por prueba: sola cada una tarda un par de segundos, pero con toda la suite corriendo a la vez alguna pasaba los 5 s de siempre (la de «atacar» fallaba una de cada tantas corridas).
vi.setConfig({ testTimeout: 20_000 })

// Las cartas de un deck pegado se piden por su número: acá salen todas menos la 999 (que no existe).
vi.mock('../ygoprodeck', () => ({
  fetchCardsByIds: vi.fn(async (ids: number[]) =>
    ids.filter((id) => id !== 999).map((id) => ({ ygoprodeckId: id, name: 'Carta ' + id, frameType: 'effect', cardType: 'Effect Monster', race: null, description: null, attribute: null, level: null, linkValue: null, atk: null, def: null, archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null })),
  ),
  // El detalle de una carta pide también sus artes alternativos: acá no hay ninguno.
  fetchCardArts: vi.fn(async () => []),
}))

const { railsOn } = vi.hoisted(() => ({ railsOn: { value: false } }))

vi.mock('../app/duel-rails', async (importOriginal) => ({ ...(await importOriginal<typeof import('../app/duel-rails')>()), railsFit: () => railsOn.value }))

// La calculadora de vidas se carga a pedido (`lazy`): en las pruebas llega al instante.
vi.mock('../components/deck-mode/lazy-steps', async (importOriginal) => ({ ...(await importOriginal<typeof import('../components/deck-mode/lazy-steps')>()), LazyLifeCalculatorScreen: (await import('../components/life/LifeCalculatorScreen')).LifeCalculatorScreen }))

let memory: MemoryRoom
let connect: DuelConnect

const { allowUndo, click, flush, openTable, startDuel } = createDuelHarness(() => ({ memory, connect }))

beforeEach(() => {
  memory = createMemoryRoom()
  connect = () => asSocket(memory.join())
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '#duel')
  HTMLElement.prototype.setPointerCapture = () => {}
  HTMLElement.prototype.scrollIntoView = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
})

afterEach(() => {
  railsOn.value = false
  vi.useRealTimers()
  vi.restoreAllMocks()
  cleanup()
})

describe('la pantalla del duelo', () => {
  it('lo que el rival activa y es público se queda tres segundos con el nombre de la carta, en el cartel y en el registro (una línea, corregida); lo que no es público no se nombra', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()
    const stage = () => guest.container.querySelector('[data-activation]')

    // Invocada, la carta todavía es un dorso para Beto: sin nombre, y dura lo de siempre.
    expect(stage()!.querySelector('figcaption')).toBeNull()
    expect(stage()!.querySelector('[class*="animate-card-activate-linger"]')).toBeNull()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(stage()).toBeNull()

    // Al activarla pasa a ser pública: se queda 3 s y, cuando se busca su nombre, el cartel y la carta lo llevan.
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
    flush()
    expect(stage()!.querySelector('[class*="animate-card-activate-linger"]')).not.toBeNull()
    await act(async () => {})
    expect(stage()).toHaveTextContent(/Ana activa Carta \d+/)
    expect(stage()!.querySelector('figcaption')).toHaveTextContent(/^Carta \d+$/)
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(stage()).not.toBeNull()

    // El registro tiene una sola línea de esa activación, ya con el nombre (no la genérica y otra más).
    click(guest, /^Chat/)
    const log = within(screen.getByRole('dialog')).getByRole('log')
    expect(within(log).getAllByText(/Ana activa/)).toHaveLength(1)
    expect(within(log).getByText(/Ana activa Carta \d+/)).toBeInTheDocument()
    expect(within(log).queryByText('Ana activa una carta')).not.toBeInTheDocument()
  })

  it('cuando el rival elige un efecto entre varios, Beto ve cuál: el número en el cartel, en el registro y en el aviso de cadena, y la frase del efecto, tal cual, debajo de la carta', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const twoEffects =
      'If this card is in your hand: You can banish 1 "HERO" monster from your GY; Special Summon this card. If this card is Normal or Special Summoned: You can add 1 "Masked HERO" monster from your Deck or GY to your hand.'
    const cards = new Map([...monsters].map(([id, entry]) => [id, { ...entry, apiCard: { ...entry.apiCard, description: twoEffects } as ApiCardReference }]))
    // La carta del rival se busca por su número: con su texto, así Beto puede leer los efectos.
    const original = vi.mocked(fetchCardsByIds).getMockImplementation()!

    vi.mocked(fetchCardsByIds).mockImplementation(async (ids: number[]) => (await original(ids)).map((api) => ({ ...api, description: twoEffects })))

    try {
      const { host, guest } = startDuel({ cardsById: cards })
      openTable(host, guest)
      await act(async () => {
        await loadCardEffectMap()
      })
      summonFirst(host)
      flush()
      const stage = () => guest.container.querySelector('[data-activation]')

      // Ana activa el efecto 2 (el menú le pregunta cuál: la carta tiene dos).
      tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
      fireEvent.click(screen.getByRole('menuitem', { name: /^Efecto 2 · / }))
      flush()
      await act(async () => {})

      // El cartel dice cuál y, debajo de la carta, su frase textual (con su número y cuándo se activa); se queda más (7 s) para leerla.
      expect(stage()).toHaveTextContent(/Ana activa el efecto 2 de Carta \d+/)
      expect(stage()).toHaveTextContent('Efecto 2 · If this card is Normal or Special Summoned')
      expect(stage()).toHaveTextContent('You can add 1 "Masked HERO" monster from your Deck or GY to your hand.')
      expect(stage()!.querySelector('[class*="animate-card-activate-read"]')).not.toBeNull()
      act(() => {
        vi.advanceTimersByTime(5000)
      })
      expect(stage()).not.toBeNull()
      act(() => {
        vi.advanceTimersByTime(2500)
      })
      expect(stage()).toBeNull()

      // El registro tiene una sola línea, con el número del efecto.
      click(guest, /^Chat/)
      const log = within(screen.getByRole('dialog')).getByRole('log')
      expect(within(log).getAllByText(/Ana activa/)).toHaveLength(1)
      expect(within(log).getByText(/Ana activa el efecto 2 de Carta \d+/)).toBeInTheDocument()
    } finally {
      vi.mocked(fetchCardsByIds).mockImplementation(original)
    }
  })

  it('lo que el rival activa, revela o marca como objetivo se ve igual que lo tuyo: su carta grande en el centro y el aro en su campo, y el objetivo queda marcado', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()

    const rivalCard = () => guest.container.querySelector<HTMLElement>('[data-rival-card-id]')!
    const stage = () => guest.container.querySelector('[data-activation]')
    const ring = () => rivalCard().getAttribute('data-flash')
    const myMonster = () => tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    // Invocar también se anima, con su carta (de dorso: Beto todavía no la vio) y su cartel, como en un combo guardado.
    expect(stage()).toHaveAttribute('data-kind', 'normal')
    expect(guest.container.querySelector('[data-activation]')).toHaveTextContent('Ana hace una Invocación Normal')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(stage()).toBeNull()
    expect(ring()).toBe('false')

    // Ana activa el efecto: Beto ve la carta de Ana grande en el centro, con un cartel, y el aro dorado en su campo; se van solos.
    myMonster()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
    flush()
    expect(stage()).toHaveAttribute('data-kind', 'activate')
    expect(guest.container.querySelector('[data-activation]')).toHaveTextContent('Ana activa una carta')
    expect(ring()).toBe('true')
    expect(rivalCard()).toHaveAttribute('data-flash-kind', 'activate')
    // Quien activa la ve a su manera (la suya ya se veía): sólo Beto ve la del rival.
    expect(within(host.container).queryByText('Ana activa una carta')).not.toBeInTheDocument()
    // Lo que se activa y es público se queda 3 s (el resto de lo que se anima, 1): pasado 1 s sigue y se va a los 3.
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(stage()).not.toBeNull()
    expect(ring()).toBe('true')
    act(() => {
      vi.advanceTimersByTime(2100)
    })
    expect(stage()).toBeNull()
    expect(ring()).toBe('false')

    // Revelar una carta de la mano: otro color y otro cartel (la mano del rival no se ve, así que no hay aro, sólo la carta en el centro).
    tap(handOf(host).getAllByRole('listitem')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Revelar' }))
    flush()
    expect(stage()).toHaveAttribute('data-kind', 'reveal')
    expect(guest.container.querySelector('[data-activation]')).toHaveTextContent('Ana revela una carta')
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    // Marcar un objetivo: la carta sale en el centro con su cartel, le queda el aro, y la mira se queda mientras esté marcada.
    myMonster()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))
    flush()
    expect(stage()).toHaveAttribute('data-kind', 'target')
    expect(guest.container.querySelector('[data-activation]')).toHaveTextContent('Ana marca una carta como objetivo')
    expect(rivalCard()).toHaveAttribute('data-flash-kind', 'target')
    expect(rivalCard()).toHaveAttribute('data-targeted', 'true')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(ring()).toBe('false')
    expect(rivalCard()).toHaveAttribute('data-targeted', 'true')
    expect(within(rivalCard()).getByRole('img', { name: 'Target' })).toBeInTheDocument()

    // Mandar la carta al cementerio es la única jugada que no se muestra grande: su carta viaja (lo anima la mesa), no sale cartel ni carta en el centro, y la línea queda en el registro.
    myMonster()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Al cementerio' }))
    flush()
    expect(stage()).toBeNull()
    expect(guest.container.querySelector('[data-activation]')).toBeNull()
    click(guest, /^Chat/)
    expect(within(within(screen.getByRole('dialog')).getByRole('log')).getByText('Ana manda una carta al cementerio')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    // Deshacer lo de Ana no repite nada en la mesa de Beto.
    click(host, 'Deshacer')
    flush()
    allowUndo()
    expect(stage()).toBeNull()
    expect(guest.container.querySelector('[data-rival-drop="gy"]')?.getAttribute('aria-label')).toBe('GY: 0')
  })

  it('en escritorio lo que se centra en la mesa (la carta grande de un efecto del rival, y las tarjetas de pausa y de resultado) deja afuera la columna del chat; en el celular, no', () => {
    const edge = 'min-[1101px]:right-[20rem]'

    asDesktop()
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
    flush()
    expect(guest.container.querySelector('[data-activation]')).toHaveClass(edge)

    // Rendirse: la tarjeta del resultado tapa la mesa pero no el chat.
    click(host, 'Rendirme')
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Rendirme' }))
    flush()
    expect(within(guest.container).getByRole('dialog', { name: '¡Ganaste!' }).parentElement).toHaveClass(edge)
  })

  it('el rival se puede marcar como objetivo: su carta del campo, su mano, su Main, su cementerio y su destierro; el dueño lo ve en lo suyo, y se quita igual', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()

    const markRival = (view: RenderResult, name: string, item: string) => {
      fireEvent.click(within(view.container).getByRole('button', { name }))
      fireEvent.click(screen.getByRole('menuitem', { name: item }))
      flush()
    }
    const gyOf = (view: RenderResult) => view.container.querySelector('[data-drop="gy"]')!

    // Su carta del campo: Beto la marca (menú pegado, una sola jugada) y Ana la ve en la suya; los dos con la mira.
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))
    flush()
    expect(zoneOf(host, 'Zona de monstruo 1').getByRole('img', { name: 'Target' })).toBeInTheDocument()
    expect(guest.container.querySelector('[data-rival-card-id]')).toHaveAttribute('data-targeted', 'true')

    // Sus pilas y su mano: la mira queda sobre cada una, de los dos lados.
    markRival(guest, 'GY: marcar', 'Target')
    markRival(guest, 'Banish: marcar', 'Target')
    markRival(guest, 'Main: marcar', 'Target')
    markRival(guest, 'Mano: marcar', 'Target')
    expect(gyOf(host)).toHaveAttribute('data-targeted', 'true')
    expect(host.container.querySelector('[data-drop="banished"]')).toHaveAttribute('data-targeted', 'true')
    expect(host.container.querySelector('[data-drop="deck"]')).toHaveAttribute('data-targeted', 'true')
    expect(host.container.querySelector('[data-marked="hand"]')).not.toBeNull()
    expect(guest.container.querySelector('[data-rival-drop="gy"]')).toHaveAttribute('data-targeted', 'true')
    expect(guest.container.querySelector('[data-rival-drop="hand"]')).toHaveAttribute('data-targeted', 'true')

    // Marcar de nuevo ofrece quitarla.
    markRival(guest, 'GY: marcar', 'Quitar target')
    markRival(guest, 'Mano: marcar', 'Quitar target')
    expect(gyOf(host)).toHaveAttribute('data-targeted', 'false')
    expect(host.container.querySelector('[data-marked="hand"]')).toBeNull()
    expect(host.container.querySelector('[data-drop="banished"]')).toHaveAttribute('data-targeted', 'true')

    // Y Ana también puede marcar lo de Beto (es de los dos lados).
    markRival(host, 'Extra: marcar', 'Target')
    expect(guest.container.querySelector('[data-drop="extra"]')).toHaveAttribute('data-targeted', 'true')
  })

  it('el cementerio del rival elige varias: «Target» marca las elegidas de una vez y cierra el visor; si ya estaban todas, dice «Quitar target» y las quita', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    // Tres cartas de Ana al cementerio, descartadas de la mano.
    for (let index = 0; index < 3; index += 1) {
      tap(handOf(host).getAllByRole('listitem')[0]!)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Descartar' }))
      flush()
    }

    // Beto abre el cementerio de Ana: sus cartas se llaman «Carta del rival», y las marcadas llevan «(target)».
    const openGy = () => {
      fireEvent.click(within(guest.container).getByRole('button', { name: 'GY: marcar' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Ver las cartas' }))

      return within(screen.getByRole('dialog', { name: 'GY · 3' }))
    }
    const cardsIn = (viewer: ReturnType<typeof openGy>) => viewer.getAllByRole('button', { name: /^Carta del rival/ })
    const namesIn = (viewer: ReturnType<typeof openGy>) => cardsIn(viewer).map((card) => card.getAttribute('aria-label'))
    const dialogGone = () => expect(screen.queryByRole('dialog', { name: /^GY/ })).not.toBeInTheDocument()

    // Elegir varias: dos cartas, y «Target» las marca a las dos de una vez; el visor se cierra.
    let viewer = openGy()
    fireEvent.click(viewer.getByRole('button', { name: 'Elegir varias' }))
    fireEvent.click(cardsIn(viewer)[0]!)
    fireEvent.click(cardsIn(viewer)[1]!)
    fireEvent.click(viewer.getByRole('button', { name: 'Target' }))
    flush()
    dialogGone()
    expect(host.container.querySelector('[data-drop="gy"]')).toHaveAttribute('data-targeted', 'true')

    viewer = openGy()
    expect(namesIn(viewer)).toEqual(['Carta del rival (target)', 'Carta del rival (target)', 'Carta del rival'])

    // Con dos ya marcadas, «Target» marca la que falta.
    fireEvent.click(viewer.getByRole('button', { name: 'Elegir varias' }))
    cardsIn(viewer).forEach((card) => fireEvent.click(card))
    fireEvent.click(viewer.getByRole('button', { name: 'Target' }))
    flush()
    dialogGone()

    viewer = openGy()
    expect(namesIn(viewer)).toEqual(['Carta del rival (target)', 'Carta del rival (target)', 'Carta del rival (target)'])

    // Con las dos elegidas ya marcadas, la principal dice «Quitar target» y las quita; la que no se eligió sigue marcada.
    fireEvent.click(viewer.getByRole('button', { name: 'Elegir varias' }))
    fireEvent.click(cardsIn(viewer)[0]!)
    fireEvent.click(cardsIn(viewer)[1]!)
    fireEvent.click(viewer.getByRole('button', { name: 'Quitar target' }))
    flush()
    dialogGone()

    viewer = openGy()
    expect(namesIn(viewer)).toEqual(['Carta del rival', 'Carta del rival', 'Carta del rival (target)'])
  })

  it('cuando el rival toca su deck o suma una carta a su mano, su deck y su mano se barajan y se ven', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)

    const animated: Element[] = []
    const { animate, getAnimations, matchMedia } = { animate: Element.prototype.animate, getAnimations: Element.prototype.getAnimations, matchMedia: window.matchMedia }

    vi.stubGlobal('KeyframeEffect', class { get composite() { return 'replace' } })
    Element.prototype.getAnimations = () => []
    // Sólo se cuentan las animaciones del barajado (las demás, como los vuelos, duran otra cosa).
    Element.prototype.animate = function (this: Element, _frames: unknown, options?: KeyframeAnimationOptions | number) {
      if (typeof options === 'object' && options.duration === RIFFLE_MS) animated.push(this)

      return { cancel() {}, finish() {}, onfinish: null, oncancel: null } as unknown as Animation
    }
    window.matchMedia = (() => ({ matches: false, media: '', addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia

    try {
      // Ana toca su deck y roba: Beto ve barajarse el deck de Ana (sus capas) y su mano (sus dorsos).
      tap(within(host.container).getByRole('button', { name: /^Main: [0-9]+$/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Robar' }))
      flush()

      const inRivalHand = animated.filter((element) => guest.container.contains(element) && element.closest('[data-rival-drop="hand"]') !== null)
      const inRivalDeck = animated.filter((element) => guest.container.contains(element) && element.hasAttribute('data-layer') && element.closest('[data-rival-drop="deck"]') !== null)

      expect(inRivalHand.length).toBeGreaterThan(0)
      expect(inRivalDeck.length).toBe(2)

      // Una jugada que no toca ni el deck ni la mano (poner una carta en el campo) no los baraja.
      animated.length = 0
      summonFirst(host)
      flush()
      expect(animated.filter((element) => guest.container.contains(element) && (element.closest('[data-rival-drop="hand"]') !== null || element.hasAttribute('data-layer')))).toHaveLength(0)
    } finally {
      vi.unstubAllGlobals()
      Element.prototype.animate = animate
      Element.prototype.getAnimations = getAnimations
      window.matchMedia = matchMedia
    }
  })

  it('varias cartas elegidas en el visor viajan en un solo mensaje: el rival ve una sola línea con cuántas son y, si van a la mano, las ve entrar y el Main de Ana se baraja a la vista', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)

    const acts = () => memory.sent.filter((text) => (JSON.parse(text) as { t: string }).t === 'act').length
    /** En el visor de Ana: «Elegir varias», las dos primeras cartas y «Elegir jugada», que abre el menú del lote (la hoja de abajo, en el celular). */
    const chooseTwo = (viewer: HTMLElement) => {
      fireEvent.click(within(viewer).getByRole('button', { name: 'Elegir varias' }))
      within(viewer).getAllByRole('button', { pressed: false }).slice(0, 2).forEach((card) => fireEvent.click(card))
      fireEvent.click(within(viewer).getByRole('button', { name: 'Elegir jugada' }))
    }
    const rivalPile = (pile: string) => guest.container.querySelector(`[data-rival-drop="${pile}"]`)?.getAttribute('aria-label')

    // Ana descarta dos cartas (dos jugadas) y después las destierra juntas desde su cementerio: una sola jugada más.
    for (const _ of [1, 2]) {
      tap(handOf(host).getAllByRole('listitem')[0]!)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Descartar' }))
      flush()
    }
    expect(rivalPile('gy')).toBe('GY: 2')

    const before = acts()
    fireEvent.click(within(host.container).getByRole('button', { name: 'GY: 2' }))
    chooseTwo(screen.getByRole('dialog', { name: 'GY · 2' }))
    fireEvent.click(within(screen.getByRole('region', { name: '2 cartas' })).getByRole('menuitem', { name: 'Desterrar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Boca arriba' }))
    flush()

    expect(acts()).toBe(before + 1)
    expect(rivalPile('gy')).toBe('GY: 0')
    expect(rivalPile('banished')).toBe('Banish: 2')
    // Desterrar no se muestra grande (como una sola carta): va al registro, en una línea.
    expect(guest.container.querySelector('[data-activation]')).toBeNull()
    click(guest, /^Chat/)
    expect(within(within(screen.getByRole('dialog')).getByRole('log')).getByText('Ana destierra 2 cartas')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    // Dos cartas del Main a la mano: Beto las ve entrar en el centro (Ana las muestra al sumarlas) y el Main de Ana se baraja, todo con un solo mensaje.
    const animated: Element[] = []
    const { animate, getAnimations, matchMedia } = { animate: Element.prototype.animate, getAnimations: Element.prototype.getAnimations, matchMedia: window.matchMedia }

    vi.stubGlobal('KeyframeEffect', class { get composite() { return 'replace' } })
    Element.prototype.getAnimations = () => []
    Element.prototype.animate = function (this: Element, _frames: unknown, options?: KeyframeAnimationOptions | number) {
      if (typeof options === 'object' && options.duration === RIFFLE_MS) animated.push(this)

      return { cancel() {}, finish() {}, onfinish: null, oncancel: null } as unknown as Animation
    }
    // El barajado no se anima si se pidió reducir el movimiento.
    window.matchMedia = (() => ({ matches: false, media: '', addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia

    try {
      act(() => {
        vi.advanceTimersByTime(1000)
      })
      tap(within(host.container).getByRole('button', { name: /^Main: [0-9]+$/ }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Ver el deck' }))
      chooseTwo(screen.getByRole('dialog', { name: /^Main · / }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'A la mano' }))
      flush()

      expect(acts()).toBe(before + 2)
      expect(screen.queryByRole('dialog', { name: /^Main · / })).not.toBeInTheDocument()
      expect(guest.container.querySelector('[data-activation]')).toHaveAttribute('data-kind', 'hand')
      expect(guest.container.querySelector('[data-activation]')).toHaveTextContent('Ana lleva 2 cartas a su mano')
      expect(animated.filter((element) => guest.container.contains(element) && element.hasAttribute('data-layer') && element.closest('[data-rival-drop="deck"]') !== null)).toHaveLength(2)
    } finally {
      vi.unstubAllGlobals()
      Element.prototype.animate = animate
      Element.prototype.getAnimations = getAnimations
      window.matchMedia = matchMedia
    }
  })

  it('el rival puede desplegar mi cementerio y mi destierro (no el deck, el Extra ni la mano) y marcar una carta de adentro', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Al cementerio' }))
    flush()

    const itemsOf = (name: string) => {
      fireEvent.click(within(guest.container).getByRole('button', { name }))

      return screen.getAllByRole('menuitem').map((item) => item.textContent)
    }

    // Lo público se despliega; lo secreto, sólo se marca.
    expect(itemsOf('Main: marcar')).toEqual(['Señalar', 'Target'])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(itemsOf('Mano: marcar')).toEqual(['Señalar', 'Target'])
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(itemsOf('GY: marcar')).toEqual(['Ver las cartas', 'Señalar', 'Target'])

    // El cementerio de Ana, con su carta (por su arte: no se sabe cómo se llama), y se la puede marcar.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver las cartas' }))
    const viewer = () => within(screen.getByRole('dialog', { name: 'GY · 1' }))
    fireEvent.click(viewer().getByRole('button', { name: 'Carta del rival' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Target' }))
    flush()

    // Ana ve la mira sobre su cementerio, y en el visor de Beto la carta la lleva.
    expect(host.container.querySelector('[data-drop="gy"]')).toHaveAttribute('data-targeted', 'true')
    expect(viewer().getByRole('button', { name: 'Carta del rival (target)' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    // El destierro también se despliega (vacío).
    expect(itemsOf('Banish: marcar')).toEqual(['Ver las cartas', 'Señalar', 'Target'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver las cartas' }))
    expect(within(screen.getByRole('dialog', { name: 'Banish · 0' })).getByText('No hay cartas acá.')).toBeInTheDocument()
  })

  it('Beto toma el control de una carta del cementerio o del destierro de Ana desde el visor: pasa a su campo y sale de la pila de ella', async () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Al cementerio' }))
    flush()

    // Cementerio: se abre el visor, se toca la carta (se pide cuál es por su número) y se la toma.
    fireEvent.click(within(guest.container).getByRole('button', { name: 'GY: marcar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver las cartas' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'GY · 1' })).getByRole('button', { name: 'Carta del rival' }))
    expect(screen.queryByRole('menuitem', { name: 'Tomar el control' })).not.toBeInTheDocument()
    await act(async () => {})
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tomar el control' }))
    flush()

    expect(zoneOf(guest, 'Zona de monstruo 1').queryAllByRole('button').length).toBeGreaterThan(0)
    expect(host.container.querySelector('[data-drop="gy"]')?.textContent).not.toMatch(/[1-9]/)
    // El visor se cierra solo: la carta ya está en el campo de Beto.
    expect(screen.queryByRole('dialog', { name: /^GY/ })).not.toBeInTheDocument()

    // Destierro: una carta de Ana que está a la vista se toma igual, a la siguiente zona libre.
    tap(handOf(host).getAllByRole('listitem')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(within(host.container).getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
    flush()
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Desterrar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Boca arriba' }))
    flush()
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Banish: marcar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver las cartas' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Banish · 1' })).getByRole('button', { name: 'Carta del rival' }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tomar el control' }))
    flush()

    expect(zoneOf(guest, 'Zona de monstruo 2').queryAllByRole('button').length).toBeGreaterThan(0)
  })

  it('el asistente: si Ana activa dos veces en el mismo turno una carta de una vez por turno por nombre, no hay cartel (activar otra vez es la forma de preguntarle al rival si quiere responder); la jugada se hace', async () => {
    // Cada carta del deck lleva el número de una carta real con «una vez por turno, por nombre» confirmado (distintos: un deck de 40 copias de la misma no es legal).
    const limited = Object.entries(CARD_EFFECTS.cards).filter(([facts]) => (Number(facts) & 6) === 6).flatMap(([, ids]) => ids)
    const ash = new Map([...monsters].map(([id, entry], index) => [id, { ...entry, name: 'Limitada ' + index, apiCard: { ...entry.apiCard, ygoprodeckId: limited[index]! } as unknown as ApiCardReference }]))
    const { host, guest } = startDuel({ cardsById: ash })
    openTable(host, guest)
    const custom = vi.spyOn(toast, 'custom').mockReturnValue('t')
    const messages = () => custom.mock.calls.map(([render]) => ((render as (instance: { id: string; visible: boolean }) => ReactElement)({ id: 't', visible: true }).props as { message: string }).message)
    await act(async () => {
      await loadCardEffects()
    })

    const activateFirstInHand = () => {
      tap(handOf(host).getAllByRole('listitem')[0]!)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Activar efecto' }))
      flush()
    }

    // La misma carta de la mano dos veces (queda en la mano: sólo se anota la activación).
    activateFirstInHand()
    expect(messages().filter((message) => /Ya activaste/.test(message))).toEqual([])

    activateFirstInHand()
    expect(messages().filter((message) => /Ya activaste/.test(message))).toEqual([])
  })

  it('cuando Ana agrega a su mano una carta de su deck (la busca), Beto la ve de frente en la animación y no de dorso', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)

    tap(within(host.container).getByRole('button', { name: /^Main: [0-9]+$/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver el deck' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: /Main/ })).getAllByRole('button', { name: /^Monstruo/ })[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'A la mano' }))
    flush()

    const stage = guest.container.querySelector('[data-activation]')!
    expect(stage).toHaveAttribute('data-kind', 'hand')
    expect(guest.container.querySelector('[data-activation]')).toHaveTextContent('Ana lleva una carta a su mano')
    // La carta del frente tiene su imagen (la del dorso no la tendría).
    expect(stage.querySelector('img')).not.toBeNull()
  })

  it('lo que Ana suma a su mano sin robar, Beto lo ve con su nombre y queda fijo en su detalle hasta que toque otra carta; robar no se ve', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    asDesktop()
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    const dock = (view: RenderResult) => within(view.container).getByRole('region', { name: 'Detalle de la carta' })
    const shown = (view: RenderResult) => within(dock(view)).queryByRole('heading')?.textContent ?? null
    const stage = () => guest.container.querySelector('[data-activation]')
    const mouse = { pointerType: 'mouse' }

    // Ana busca una carta en su deck y la agrega a su mano (no es un robo).
    tap(within(host.container).getByRole('button', { name: /^Main: [0-9]+$/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ver el deck' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: /Main/ })).getAllByRole('button', { name: /^Monstruo/ })[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'A la mano' }))
    flush()
    await act(async () => {})

    // Beto ve cuál es: su nombre en el cartel (que se queda para leerlo) y la carta a la izquierda.
    expect(stage()).toHaveTextContent(/^Ana lleva Carta \d+ a su mano/)
    expect(shown(guest)).toMatch(/^Carta \d+$/)
    const added = shown(guest)
    act(() => {
      vi.advanceTimersByTime(2500)
    })
    expect(stage()).not.toBeNull()
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(stage()).toBeNull()

    // El cartel se fue y el detalle sigue: pasar el mouse por otra carta no la cambia (queda fija)…
    const own = handOf(guest).getAllByRole('listitem')[0]!
    fireEvent.pointerOver(own, mouse)
    expect(shown(guest)).toBe(added)

    // …hasta que Beto toca otra carta.
    tap(own)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(shown(guest)).toMatch(/^Monstruo \d+$/)
    expect(shown(guest)).not.toBe(added)
  })

  it('Beto puede ver el detalle de una carta de Ana que ya está a la vista (y de una boca abajo, no)', async () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()

    // Tocar la carta de Ana abre su menú: marcarla y ver su detalle (que se pide por su número).
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Tomar el control', 'Señalar', 'Target'])
    fireEvent.click(screen.getByRole('button', { name: 'Ver carta' }))
    await act(async () => {})
    expect(screen.getByRole('dialog', { name: /^Detalle de Carta \d+$/ })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    // Una carta boca abajo no se sabe cuál es: sólo se puede marcar.
    tap(handOf(host).getAllByRole('listitem')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Colocar' }))
    fireEvent.click(within(host.container).getByRole('button', { name: 'Zona de monstruo 2: elegir' }))
    flush()
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Rival, Zona de monstruo 2: marcar' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Señalar', 'Target'])
  })

  it('en escritorio, tocar una carta (tuya o del rival) la muestra en el detalle fijo de la izquierda, que está siempre desde el principio; en el celular no hay detalle fijo', async () => {
    asDesktop()
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    const dock = (view: RenderResult) => within(view.container).getByRole('region', { name: 'Detalle de la carta' })

    // Está desde el principio, vacío: la mesa no se corre al tocar la primera carta.
    expect(dock(host)).toHaveTextContent('Tocá una carta para ver su detalle acá.')

    // Tocar una carta propia del campo la muestra a la izquierda (además de abrir su menú de siempre).
    summonFirst(host)
    flush()
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    expect(within(dock(host)).getByRole('heading', { name: /^Monstruo \d+$/ })).toBeInTheDocument()
    expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(0)
    fireEvent.keyDown(document, { key: 'Escape' })

    // Una carta del rival que ya mostró: su detalle se pide por su número y queda a la izquierda de quien la tocó.
    expect(dock(guest)).toHaveTextContent('Tocá una carta para ver su detalle acá.')
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' }))
    await act(async () => {})
    expect(within(dock(guest)).getByRole('heading', { name: /^Carta \d+$/ })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    // Una boca abajo no se sabe cuál es: se dice así, sin inventar nada.
    tap(handOf(host).getAllByRole('listitem')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Colocar' }))
    fireEvent.click(within(host.container).getByRole('button', { name: 'Zona de monstruo 2: elegir' }))
    flush()
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Rival, Zona de monstruo 2: marcar' }))
    expect(within(dock(guest)).getByRole('heading', { name: 'Carta boca abajo' })).toBeInTheDocument()
  })

  it('en escritorio el detalle fijo sigue al mouse (carta tuya, del rival a la vista o boca abajo); un click la fija hasta un click afuera o en otra carta', async () => {
    asDesktop()
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    const dock = (view: RenderResult) => within(view.container).getByRole('region', { name: 'Detalle de la carta' })
    const shown = (view: RenderResult) => within(dock(view)).queryByRole('heading')?.textContent ?? null
    const rivalCardIn = (zone: number) => within(guest.container).getByRole('group', { name: `Rival, Zona de monstruo ${zone}` }).querySelector<HTMLElement>('[data-rival-card-id]')!
    const ownCardIn = (zone: number) => zoneOf(host, `Zona de monstruo ${zone}`).getAllByRole('button')[0]!
    const mouse = { pointerType: 'mouse' }

    // Ana invoca una carta boca arriba (zona 1) y pone otra boca abajo (zona 2).
    summonFirst(host)
    flush()
    tap(handOf(host).getAllByRole('listitem')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Colocar' }))
    fireEvent.click(within(host.container).getByRole('button', { name: 'Zona de monstruo 2: elegir' }))
    flush()
    // Tocar la carta de la mano para ponerla la dejó fija en el detalle; un toque en un lugar vacío de la mesa (como el que sigue a elegir la zona) la suelta.
    fireEvent.pointerDown(within(host.container).getByRole('group', { name: 'Zona de monstruo 5' }))

    // El mouse sobre una carta propia del campo la muestra, sin abrir ningún menú, y al pasar a otra, la otra (también una boca abajo: la tuya sabés cuál es).
    fireEvent.pointerOver(ownCardIn(1), mouse)
    const faceUp = shown(host)

    expect(faceUp).toMatch(/^Monstruo \d+$/)
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument()
    fireEvent.pointerOver(ownCardIn(2), mouse)

    const faceDown = shown(host)

    expect(faceDown).toMatch(/^Monstruo \d+$/)
    expect(faceDown).not.toBe(faceUp)

    // Beto pasa el mouse por las cartas de Ana: la boca arriba es pública (se pide por su número); la boca abajo no se sabe cuál es, y se dice así sin inventar nada.
    fireEvent.pointerOver(rivalCardIn(1), mouse)
    await act(async () => {})
    expect(shown(guest)).toMatch(/^Carta \d+$/)
    fireEvent.pointerOver(rivalCardIn(2), mouse)
    expect(shown(guest)).toBe('Carta boca abajo')

    // Un click en una carta de Ana la fija a la izquierda de Ana: el mouse por la otra no la cambia (ni abrir su menú).
    tap(ownCardIn(1))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(shown(host)).toBe(faceUp)
    fireEvent.pointerOver(ownCardIn(2), mouse)
    expect(shown(host)).toBe(faceUp)

    // Un click en la otra la fija a ésa.
    tap(ownCardIn(2))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(shown(host)).toBe(faceDown)
    fireEvent.pointerOver(ownCardIn(1), mouse)
    expect(shown(host)).toBe(faceDown)

    // Un click afuera de las cartas y del panel (un lugar vacío de la mesa) la suelta: vuelve a seguir al mouse, empezando por la última a la que se le pasó.
    fireEvent.pointerDown(within(host.container).getByRole('group', { name: 'Zona de monstruo 5' }))
    expect(shown(host)).toBe(faceUp)
    fireEvent.pointerOver(ownCardIn(2), mouse)
    expect(shown(host)).toBe(faceDown)
  })

  it('en el celular no hay detalle fijo a la izquierda (la hoja de la carta ya la muestra)', () => {
    const { host, guest } = startDuel()
    openTable(host, guest)

    expect(within(host.container).queryByRole('region', { name: 'Detalle de la carta' })).not.toBeInTheDocument()
  })

  it('Señalar es temporal y distinto de Target: un aro que late un rato en las dos pantallas, sin dejar marca ni jugada, y se va solo; también se señala una carta propia del campo', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    const ring = (view: RenderResult) => view.container.querySelector('[data-pointed="true"]')

    expect(ring(host)).toBeNull()
    expect(ring(guest)).toBeNull()

    // Beto señala la carta de Ana: la ve en su zona (y Beto, en la de ella); no queda marcada como objetivo.
    fireEvent.click(within(guest.container).getByRole('button', { name: 'Rival, Zona de monstruo 1: marcar' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Señalar' }))
    flush()
    expect(ring(host)).toHaveAttribute('data-drop', 'mz:0')
    expect(ring(guest)).toHaveAttribute('aria-label', 'Rival, Zona de monstruo 1')
    expect(host.container.querySelector('[data-targeted="true"]')).toBeNull()

    // Late un rato y se va solo (también con el chat y las jugadas siguiendo).
    act(() => {
      vi.advanceTimersByTime(2600)
    })
    expect(ring(host)).toBeNull()
    expect(ring(guest)).toBeNull()

    // Ana señala su propia carta del campo: está entre las jugadas de la carta, y Beto la ve en el campo de su rival.
    tap(zoneOf(host, 'Zona de monstruo 1').getAllByRole('button')[0]!)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Señalar' }))
    flush()
    expect(ring(host)).toHaveAttribute('data-drop', 'mz:0')
    expect(ring(guest)).toHaveAttribute('aria-label', 'Rival, Zona de monstruo 1')
  })

  it('Deshacer le pide permiso al rival: él ve un aviso sobre la línea del registro (no un diálogo que tapa la mesa) para permitirlo o no, y quien pidió espera con Deshacer apagado y la jugada sigue hasta que se lo permitan', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()
    const monsterCards = () => zoneOf(host, 'Zona de monstruo 1').queryAllByRole('button')

    click(host, 'Deshacer')
    flush()

    // Ana espera (sin poder pedirlo de nuevo) y su jugada sigue; Beto ve el cartel.
    expect(within(host.container).getByRole('button', { name: 'Deshacer' })).toBeDisabled()
    expect(monsterCards()).toHaveLength(1)
    const lane = (view: RenderResult, kind: string) => view.container.querySelector<HTMLElement>(`[data-lane="${kind}"]`)
    // Sin diálogo: nada tapa la mesa. El aviso se apoya sobre la línea del registro (la misma fila: no suma alto).
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(lane(guest, 'undoAsked')).toHaveTextContent('Ana quiere volver atrás la última jugada')
    expect(lane(guest, 'undoAsked')!.parentElement).toHaveClass('relative', 'basis-full')
    // Quien pidió ve que espera, en el mismo lugar.
    expect(lane(host, 'undoAsking')).toHaveTextContent('Le pedís a Beto volver atrás la última jugada…')
    const ask = within(lane(guest, 'undoAsked')!)

    // No lo permite: el aviso se va, Ana ve que no se lo permitió, puede volver a pedir y su jugada sigue en la mesa.
    fireEvent.click(ask.getByRole('button', { name: 'No permitir' }))
    flush()
    expect(lane(guest, 'undoAsked')).toBeNull()
    expect(lane(host, 'undoResult')).toHaveTextContent('Beto no permitió volver atrás la jugada.')
    act(() => {
      vi.advanceTimersByTime(4500)
    })
    expect(lane(host, 'undoResult')).toBeNull()
    expect(within(host.container).getByRole('button', { name: 'Deshacer' })).toBeEnabled()
    expect(monsterCards()).toHaveLength(1)

    // Lo permite: ahora sí se deshace, en las dos mesas.
    click(host, 'Deshacer')
    flush()
    allowUndo()
    expect(monsterCards()).toHaveLength(0)
    expect(guest.container.querySelector('[data-rival-card-id]')).toBeNull()
  })

  it('Deshacer es de la mesa y no de cada uno: Beto, que no jugó nada, puede deshacer la última jugada de Ana (con su permiso), y Ana ve el pedido sobre la línea del registro', () => {
    const { host, guest } = startDuel({ cardsById: monsters })
    openTable(host, guest)
    summonFirst(host)
    flush()
    const lane = (view: RenderResult, kind: string) => view.container.querySelector<HTMLElement>(`[data-lane="${kind}"]`)

    // Beto no tiene jugadas propias y aun así puede pedirlo: la última de la mesa es de Ana.
    expect(within(guest.container).getByRole('button', { name: 'Deshacer' })).toBeEnabled()
    click(guest, 'Deshacer')
    flush()

    expect(within(guest.container).getByRole('button', { name: 'Deshacer' })).toBeDisabled()
    expect(lane(guest, 'undoAsking')).toHaveTextContent('Le pedís a Ana volver atrás la última jugada…')
    expect(lane(host, 'undoAsked')).toHaveTextContent('Beto quiere volver atrás la última jugada')
    expect(zoneOf(host, 'Zona de monstruo 1').queryAllByRole('button')).toHaveLength(1)

    // Ana lo permite: la deshace ella en su mesa y Beto lo ve en la del rival.
    allowUndo()
    expect(zoneOf(host, 'Zona de monstruo 1').queryAllByRole('button')).toHaveLength(0)
    expect(guest.container.querySelector('[data-rival-card-id]')).toBeNull()
    expect(within(host.container).getByRole('button', { name: 'Deshacer' })).toBeDisabled()
    expect(within(guest.container).getByRole('button', { name: 'Deshacer' })).toBeDisabled()
  })

})
