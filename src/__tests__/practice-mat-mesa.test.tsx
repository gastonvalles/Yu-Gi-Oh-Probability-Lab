// @vitest-environment jsdom
import { act, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMatState, replayMat } from '../app/practice-mat'
import { RIFFLE_MS } from '../app/shuffle-fx'
import { HOLD_MS } from '../app/use-mat-drag'
import { setSoundsOn, soundsOn } from '../app/sound-prefs'
import type { MatCard } from '../components/probability/PracticeMat'
import { CARDS, Harness, INITIAL, card, commits, endTurn, goToPhase, hand, phaseButton, pointer, render, status, tap, zone } from './support/practice-mat-harness'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

const { playSfx } = vi.hoisted(() => ({ playSfx: vi.fn() }))

vi.mock('../app/sfx', async () => ({ ...(await vi.importActual<typeof import('../app/sfx')>('../app/sfx')), playSfx }))

beforeEach(() => {
  localStorage.clear()
  HTMLElement.prototype.setPointerCapture = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  window.requestAnimationFrame = (callback) => {
    callback(0)
    return 1
  }
  window.cancelAnimationFrame = () => {}
})

describe('la mesa de práctica', () => {
  it('la mesa es una escena: el fondo de la arena y, detrás de las casillas del campo, su placa (decoración escondida a los lectores de pantalla)', () => {
    render(<Harness />)

    expect(document.querySelector('.mat-scene')).toHaveAttribute('aria-hidden', 'true')

    const plate = document.querySelector('.mat-plate') as HTMLElement

    expect(plate).toHaveAttribute('aria-hidden', 'true')
    // La placa está adentro del campo (toma su perspectiva), junto a las casillas.
    expect(plate.parentElement).toContainElement(zone('Zona de monstruo 1'))
  })

  it('tu magia de campo boca arriba lleva su arte de fondo en tu mitad: adentro del campo, junto a la placa (detrás de las casillas y con su inclinación); boca abajo, no', () => {
    const island: MatCard = { name: 'Fire King Island', apiCard: { ...card(57554544, 'spell'), imageUrlSmall: 'https://images.ygoprodeck.com/images/cards_small/57554544.jpg' } }
    const cards = new Map<string, MatCard>([...CARDS, ['card-3-1', island]])
    const onField = (pos: 'atk' | 'set') => replayMat(INITIAL, [{ type: 'place', id: 'card-3-1', zone: 'field', index: 0, pos }])
    const { unmount } = render(<Harness initial={onField('atk')} cards={cards} />)
    const art = document.querySelector('.mat-field-art') as HTMLElement

    expect(art).toHaveAttribute('data-side', 'mine')
    expect(art.querySelector('img')).toHaveAttribute('src', '/api/card-image/cards_cropped/57554544.jpg?w=512')
    expect(art.parentElement).toBe(document.querySelector('.mat-plate')!.parentElement)
    unmount()

    render(<Harness initial={onField('set')} cards={cards} />)
    expect(document.querySelector('.mat-field-art')).toBeNull()
  })

  it('en un celular en vertical (menos de 640 px) el campo son cinco columnas y una fila de pilas abajo —el Extra Deck y el Deck en los extremos, la Zona de campo en el medio—: las casillas pasan de 55 a 72 px', () => {
    render(<Harness />)

    const field = (document.querySelector('.mat-plate') as HTMLElement).parentElement as HTMLElement

    expect(field).toHaveClass('max-sm:grid-cols-[repeat(5,minmax(0,1fr))]')
    expect(field.className).toContain("max-sm:[grid-template-areas:'p1_emz1_p2_emz2_p3'_'m1_m2_m3_m4_m5'_'s1_s2_s3_s4_s5'_'extra_ban_fld_gy_deck']")
    // En escritorio y en una tableta, las siete columnas de siempre (las pilas a los costados).
    expect(field.className).toContain("[grid-template-areas:'._p1_emz1_p2_emz2_p3_ban'_'fld_m1_m2_m3_m4_m5_gy'_'extra_s1_s2_s3_s4_s5_deck']")
  })

  it('pasar el mouse por una carta de la mano o del campo la eleva un poco y enciende su borde en blanco, tenue; arrastrada o sin movimiento no se mueve', () => {
    render(<Harness />)

    // La de la mano sube 14 px, derecho, por delante de las vecinas (el abanico las encima). No crece: la propiedad `scale` se aplica después del `transform: translate3d(x, …) rotate(…)` del abanico
    // y multiplicaba su desplazamiento `x` (Gastón: «se levanta mal, debe ser hacia arriba, no hacia el costado»); `translate`, que va por fuera, sube derecho.
    const handCard = within(hand()).getByRole('listitem', { name: 'Ash Blossom' })
    expect(handCard).toHaveClass('hover:-translate-y-3.5', 'hover:z-40!', '[box-shadow:var(--card-shadow)]')
    expect(handCard.className).not.toMatch(/(^|\s)hover:scale-/)
    expect(handCard.className).toContain('hover:[--card-shadow:0_10px_20px_rgba(0,0,0,0.5),0_0_0_1px_rgb(255_255_255/0.6),0_0_12px_rgb(255_255_255/0.2)]')
    expect(handCard).toHaveClass('motion-reduce:hover:translate-y-0', 'data-[state=dragging]:hover:translate-y-0')

    // La del campo, lo justo para no salirse de su casilla.
    tap(handCard)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))

    const placed = within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' })
    expect(placed).toHaveClass('hover:-translate-y-0.5', 'hover:scale-105', 'hover:z-10', '[box-shadow:var(--card-shadow)]')
    expect(placed).toHaveClass('motion-reduce:hover:translate-y-0', 'motion-reduce:hover:scale-100', 'data-[dragging=true]:hover:translate-y-0', 'data-[dragging=true]:hover:scale-100')
  })

  it('tocar una carta de la mano abre el menú, e invocarla la pone en la primera zona de monstruo', () => {
    render(<Harness />)

    expect(within(hand()).getAllByRole('listitem')).toHaveLength(5)
    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))

    expect(screen.getByRole('menu', { name: 'Ash Blossom' })).toBeInTheDocument()
    // En el celular la carta de la mano se abre en una hoja con TODAS las jugadas a un toque, sin menús que abrir: primero las del juego (la primera, llena; la posición sólo se pregunta, después, en la Especial) y después las de apoyo.
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Invocación Normal', 'Colocar', 'Invocación Especial', 'Activar efecto', 'Revelar', 'Target', 'Descartar', 'Desterrar', 'Al deck'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    expect(screen.queryByRole('menu', { name: 'Ash Blossom' })).not.toBeInTheDocument()
    expect(within(status()).getByText('Tocá la zona para Invocación Normal')).toBeInTheDocument()
    // Se eligen sólo las cinco zonas principales: la Extra Monster Zone es para lo que viene del Extra Deck.
    expect(screen.getAllByRole('button', { name: /: elegir$/ }).map((cell) => cell.getAttribute('aria-label'))).toEqual(
      ['Zona de monstruo 1: elegir', 'Zona de monstruo 2: elegir', 'Zona de monstruo 3: elegir', 'Zona de monstruo 4: elegir', 'Zona de monstruo 5: elegir'],
    )
    // Cada zona libre que se puede elegir lleva las marcas de un visor (esquinas y un rombo en el medio); las demás, ninguna.
    expect(document.querySelectorAll('.mat-pick-marks')).toHaveLength(5)
    expect(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }).querySelector('.mat-pick-diamond')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
    expect(document.querySelector('.mat-pick-marks')).toBeNull()

    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(within(hand()).queryByRole('listitem', { name: 'Ash Blossom' })).not.toBeInTheDocument()
    expect(within(status()).getByText('Invocación Normal de Ash Blossom')).toBeInTheDocument()
    expect(within(status()).getByText('1/1')).toBeInTheDocument()
    // Jugando en vivo no hay controles de replay (sólo al ver un combo guardado).
    expect(screen.queryByRole('button', { name: 'Avance rápido' })).not.toBeInTheDocument()

    // Deshacer la devuelve a la mano y borra la jugada.
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(within(hand()).getByRole('listitem', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(within(status()).queryByText('1/1')).not.toBeInTheDocument()
  })

  it('la carta de la que se ve el menú lleva un marco celeste mientras el menú está abierto, en la mano y en el campo', () => {
    // Escritorio: en el celular la carta de la mano se abre en la hoja y no se levanta (la hoja la tapa).
    const matchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: query.includes('1101') || query.includes('reduce') })) as typeof window.matchMedia
    render(<Harness />)

    const ash = within(hand()).getByRole('listitem', { name: 'Ash Blossom' })
    expect(ash).toHaveAttribute('data-selected', 'false')
    tap(ash)
    expect(ash).toHaveAttribute('data-selected', 'true')
    expect(ash.querySelector('[data-fx="frame"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))
    // Elegir cómo sale (la pregunta de la posición) no la suelta: sigue siendo la carta del menú.
    expect(ash).toHaveAttribute('data-selected', 'true')
    fireEvent.click(screen.getByRole('menuitem', { name: 'En ataque' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))

    const onField = within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' })
    expect(onField).toHaveAttribute('data-selected', 'false')
    tap(onField)
    expect(onField).toHaveAttribute('data-selected', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onField).toHaveAttribute('data-selected', 'false')
    window.matchMedia = matchMedia
  })

  it('el click fantasma del celular (justo después de abrir el menú) no lo cierra; un toque en el fondo más tarde, sí', () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout', 'Date'] })
    // Escritorio: una carta de la mano abre el menú pegado a ella (en el celular abre la hoja, que no tiene fondo que tocar).
    const matchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: query.includes('1101') || query.includes('reduce') })) as typeof window.matchMedia

    try {
      render(<Harness />)
      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      const menu = screen.getByRole('menu', { name: 'Ash Blossom' })

      fireEvent.click(menu.parentElement!)
      expect(screen.getByRole('menu', { name: 'Ash Blossom' })).toBeInTheDocument()

      vi.advanceTimersByTime(400)
      fireEvent.click(menu.parentElement!)
      expect(screen.queryByRole('menu', { name: 'Ash Blossom' })).not.toBeInTheDocument()
    } finally {
      window.matchMedia = matchMedia
      vi.useRealTimers()
    }
  })

  it('en el celular una carta de la mano se abre en una hoja con su texto y todas las jugadas a la vista (las del juego y, aparte, las de apoyo), sin «Más»; la X la cierra', () => {
    render(<Harness />)
    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))

    const sheet = screen.getByRole('region', { name: 'Ash Blossom' })
    expect(within(sheet).getByRole('heading', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Ver carta' })).toBeInTheDocument()
    // Sale de abajo, sobre todo lo demás (también sobre el visor de una pila).
    expect(sheet).toHaveClass('fixed', 'bottom-0')
    expect(within(sheet).queryByRole('menuitem', { name: 'Más' })).not.toBeInTheDocument()
    // Las jugadas del juego primero y las de apoyo después, todas en la misma grilla: todas se ven y se tocan sin abrir nada.
    const plays = ['Invocación Normal', 'Colocar', 'Invocación Especial', 'Activar efecto'].map((name) => within(sheet).getByRole('menuitem', { name }))
    const support = ['Revelar', 'Target', 'Descartar', 'Desterrar', 'Al deck'].map((name) => within(sheet).getByRole('menuitem', { name }))

    // Todos los botones son iguales (mismo estilo y mismo alto), de a dos por fila y en una sola grilla (el mismo aire entre todos); el que sobra ocupa la fila entera.
    const all = [...plays, ...support]
    const style = (item: HTMLElement) => item.className.replace('col-span-2', '').split(' ').filter(Boolean).join(' ')
    expect(all.every((item) => style(item) === style(all[0]!))).toBe(true)
    expect(all.some((item) => item.classList.contains('bg-primary'))).toBe(false)
    expect(new Set(all.map((item) => item.parentElement)).size).toBe(1)
    expect(plays[0]!.parentElement).toHaveClass('grid-cols-2', 'gap-2')
    expect(sheet.querySelector('.border-t')).toBeNull()
    // Cinco de apoyo: el último ocupa la fila entera en vez de dejar un hueco.
    expect(support[4]).toHaveClass('col-span-2')
    expect(plays[3]).not.toHaveClass('col-span-2')
    expect(support.every((item) => item.checkVisibility?.() !== false)).toBe(true)

    fireEvent.click(within(sheet).getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('region', { name: 'Ash Blossom' })).not.toBeInTheDocument()
  })

  it('en el celular tocar afuera de la hoja la cierra (no el click fantasma de justo después de abrirla), y vale para una carta del campo, el deck y la mano', () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout', 'Date'] })

    try {
      render(<Harness />)
      const backdrop = () => screen.getByRole('region', { name: 'Ash Blossom' }).previousElementSibling!

      // Mano: el click que el celular manda al soltar el dedo no la cierra; un toque afuera, más tarde, sí.
      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      fireEvent.click(backdrop())
      expect(screen.getByRole('region', { name: 'Ash Blossom' })).toBeInTheDocument()
      vi.advanceTimersByTime(400)
      fireEvent.click(backdrop())
      expect(screen.queryByRole('region', { name: 'Ash Blossom' })).not.toBeInTheDocument()

      // Campo: la carta de la zona abre la hoja (no el menú pegado) y afuera la cierra.
      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
      vi.advanceTimersByTime(400)
      tap(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' }))
      expect(screen.getByRole('region', { name: 'Ash Blossom' })).toBeInTheDocument()
      expect(screen.queryAllByRole('menu')).toHaveLength(1)
      vi.advanceTimersByTime(400)
      fireEvent.click(backdrop())
      expect(screen.queryByRole('region', { name: 'Ash Blossom' })).not.toBeInTheDocument()

      // Deck (su menú sale manteniéndolo apretado: tocarlo es buscar): la hoja trae el dorso y robar es la jugada; los demás, de apoyo.
      const pile = screen.getByRole('button', { name: /^Main: [0-9]+/ })
      fireEvent.pointerDown(pile, { ...pointer, clientX: 10, clientY: 10 })
      act(() => {
        vi.advanceTimersByTime(HOLD_MS)
      })
      fireEvent.pointerUp(pile, { ...pointer, clientX: 10, clientY: 10 })
      const deck = screen.getByRole('region', { name: /carta/ })
      expect(within(deck).getByRole('menuitem', { name: 'Robar' })).not.toHaveClass('bg-primary')
      vi.advanceTimersByTime(400)
      fireEvent.click(deck.previousElementSibling!)
      expect(screen.queryByRole('region', { name: /carta/ })).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('la hoja no atiende toques el primer instante: el click que el celular manda al levantar el dedo de la carta no hace una jugada sin querer', () => {
    vi.useFakeTimers({ toFake: ['performance', 'setTimeout', 'clearTimeout', 'Date'] })

    try {
      render(<Harness />)
      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))

      const sheet = () => screen.getByRole('region', { name: 'Ash Blossom' })
      expect(sheet()).toHaveClass('pointer-events-none')

      act(() => {
        vi.advanceTimersByTime(400)
      })
      expect(sheet()).not.toHaveClass('pointer-events-none')
    } finally {
      vi.useRealTimers()
    }
  })

  it('el segundo paso de una jugada («¿En ataque o en defensa?») sale en la hoja, en lugar de las jugadas', () => {
    render(<Harness />)
    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))

    const sheet = screen.getByRole('region', { name: 'Ash Blossom' })
    expect(within(sheet).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['En ataque', 'En defensa'])
    expect(within(sheet).queryByRole('menuitem', { name: 'Más' })).not.toBeInTheDocument()
  })

  it('una jugada de apoyo es un solo toque: Descartar manda la carta al cementerio y cierra la hoja', () => {
    render(<Harness />)
    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))

    fireEvent.click(within(screen.getByRole('region', { name: 'Ash Blossom' })).getByRole('menuitem', { name: 'Descartar' }))

    expect(screen.queryByRole('region', { name: 'Ash Blossom' })).not.toBeInTheDocument()
    expect(within(hand()).getAllByRole('listitem')).toHaveLength(4)
  })

  it('la fase de ahora es un solo botón en el medio del campo (como en un duelo): tocarlo muestra las seis, elegir una la anota y de la End Phase a la Draw Phase cambia el turno', () => {
    render(<Harness />)

    expect(phaseButton()).toHaveAccessibleName('Fases: Draw Phase')
    expect(screen.getByLabelText('Turno 1')).toBeInTheDocument()
    expect(within(hand()).getAllByRole('listitem')).toHaveLength(5)

    goToPhase('Battle Phase')
    expect(phaseButton()).toHaveAccessibleName('Fases: Battle Phase')
    expect(within(status()).getByText('Pasás a la Battle Phase')).toBeInTheDocument()

    // Turno nuevo: Draw Phase y se roba sola la carta del tope.
    endTurn()
    expect(screen.getByLabelText('Turno 2')).toBeInTheDocument()
    expect(within(status()).getByText('Turno 2: Draw Phase, robás Imperm')).toBeInTheDocument()
    expect(within(hand()).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByRole('button', { name: 'Main: 0' })).toBeInTheDocument()
  })

  it('el botón de las fases está en el medio del campo, en el mismo lugar que en un duelo, y las seis fases sueltas ya no están abajo; el estado queda sólo para el lector de pantalla', () => {
    render(<Harness />)

    expect(screen.queryByRole('group', { name: 'Fases' })).not.toBeInTheDocument()
    expect(phaseButton().parentElement).toHaveStyle({ gridArea: 'p3' })
    // Es parte del campo (la fila del medio), como en un duelo.
    expect(within(screen.getByLabelText('Campo')).getByRole('button', { name: /^Fases:/ })).toBe(phaseButton())
    expect(phaseButton()).toHaveTextContent('DP')
    expect(status()).toHaveClass('sr-only')

    fireEvent.click(phaseButton())
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Draw Phase', 'Standby Phase', 'Main Phase 1', 'Battle Phase', 'Main Phase 2', 'End Phase'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Battle Phase' }))
    expect(within(status()).getByText('Pasás a la Battle Phase')).toBeInTheDocument()
    // En vivo no hay Anterior ni Siguiente: se vuelve con Deshacer, arriba.
    expect(screen.queryByRole('button', { name: 'Anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(within(status()).queryByText('1/1')).not.toBeInTheDocument()
  })

  it('en escritorio, Pasar turno aparece pegado al botón de las fases recién en la End Phase y de un toque abre el turno siguiente', () => {
    const matchMedia = window.matchMedia
    window.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: query.includes('1101') })) as typeof window.matchMedia

    try {
      render(<Harness />)

      expect(screen.queryByRole('button', { name: 'Pasar turno' })).not.toBeInTheDocument()
      goToPhase('Battle Phase')
      expect(screen.queryByRole('button', { name: 'Pasar turno' })).not.toBeInTheDocument()
      goToPhase('End Phase')
      expect(phaseButton().nextElementSibling).toBe(screen.getByRole('button', { name: 'Pasar turno' }))
      fireEvent.click(screen.getByRole('button', { name: 'Pasar turno' }))
      expect(screen.getByLabelText('Turno 2')).toBeInTheDocument()
      expect(phaseButton()).toHaveAccessibleName('Fases: Draw Phase')
      expect(screen.queryByRole('button', { name: 'Pasar turno' })).not.toBeInTheDocument()
    } finally {
      window.matchMedia = matchMedia
    }
  })

  it('en el celular no hay Pasar turno: llegar a la End Phase pregunta si se termina el turno y, confirmado, se abre el siguiente', () => {
    render(<Harness />)

    expect(screen.queryByRole('button', { name: 'Pasar turno' })).not.toBeInTheDocument()
    goToPhase('End Phase')
    expect(screen.getByRole('alertdialog', { name: '¿Terminar tu turno?' })).toBeInTheDocument()
    expect(screen.getByText('Pasás al turno siguiente.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Terminar turno' }))
    expect(screen.getByLabelText('Turno 2')).toBeInTheDocument()
    expect(phaseButton()).toHaveAccessibleName('Fases: Draw Phase')
  })
  it('la lista de pasos no repite nada: los cambios de fase hacen de separador y abajo no sobran ni Anterior / Siguiente ni el contador ni la frase de la última jugada', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
    goToPhase('Battle Phase')

    const list = within(screen.getByRole('region', { name: 'Pasos y combos' })).getByRole('list', { name: 'Jugadas' })
    const rows = within(list).getAllByRole('button')

    // De la última a la primera, con la frase de siempre (sin insignias ni encabezados que la repitan); el cambio de fase es el separador.
    expect(rows.map((row) => row.textContent)).toEqual(['2Pasás a la Battle Phase', '1Invocación Normal de Ash Blossom', '0Mano inicial'])
    expect(rows.map((row) => row.getAttribute('data-divider'))).toEqual(['true', 'false', 'false'])

    // Abajo: sin Anterior / Siguiente; el contador y la frase de la última jugada siguen en el estado, pero sólo para el lector de pantalla.
    expect(screen.queryByRole('button', { name: 'Anterior' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Siguiente' })).not.toBeInTheDocument()
    expect(status()).toHaveClass('sr-only')
    expect(within(status()).getByText('2/2')).toBeInTheDocument()
    expect(within(status()).getByText('Pasás a la Battle Phase')).toBeInTheDocument()
  })

  it('el tablero chico de cada paso lleva una flecha por cada carta que se movió, de dónde a dónde; la mano inicial, ninguna', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))

    const list = within(screen.getByRole('region', { name: 'Pasos y combos' })).getByRole('list', { name: 'Jugadas' })
    const [summon, opening] = within(list)
      .getAllByRole('button')
      .map((row) => row.closest('li') as HTMLElement)

    // De la mano a la zona de monstruo 1, en el dibujo del tablero (escondido a los lectores de pantalla: la frase ya lo dice).
    expect([...summon!.querySelectorAll('[data-arrow]')].map((line) => line.getAttribute('data-arrow'))).toEqual(['hand>mz:0'])
    expect(summon!.querySelector('[data-arrows]')).toHaveAttribute('aria-hidden', 'true')
    expect(opening!.querySelector('[data-snapshot]')).toBeInTheDocument()
    expect(opening!.querySelector('[data-arrows]')).toBeNull()
  })

  it('el turno va arriba a la izquierda y los botones de la mesa, a la derecha', () => {
    render(<Harness />)

    const toolbar = screen.getByRole('toolbar', { name: 'Mesa' })

    expect(toolbar.firstElementChild).toBe(screen.getByLabelText('Turno 1'))
    // Los botones de la barra van a la derecha: el primero es el de la vista (superior o 3D).
    expect(screen.getByRole('button', { name: 'Cambiar a la vista superior' })).toHaveClass('ml-auto')
  })

  it('las jugadas de la práctica suenan como las del duelo (Gastón: «en la práctica no suenan los efectos»): una fase nueva, y deshacer', () => {
    render(<Harness />)
    playSfx.mockClear()

    goToPhase('Battle Phase')
    expect(playSfx).toHaveBeenLastCalledWith('phase')

    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(playSfx).toHaveBeenLastCalledWith('undo')
    expect(playSfx).toHaveBeenCalledTimes(2)
  })

  it('el botón «Sonidos» de la barra los apaga y los vuelve a prender (el mismo ajuste que «Más opciones» de un duelo), y se recuerda', () => {
    render(<Harness />)

    const button = screen.getByRole('button', { name: 'Sonidos' })

    try {
      expect(soundsOn()).toBe(true)
      expect(button).toHaveAttribute('aria-pressed', 'true')
      expect(button).toHaveAttribute('title', 'Silenciar los sonidos')

      fireEvent.click(button)
      expect(button).toHaveAttribute('aria-pressed', 'false')
      expect(button).toHaveAttribute('title', 'Activar los sonidos')
      expect(soundsOn()).toBe(false)
      expect(localStorage.getItem('ygo-lab:duel-sounds')).toBe('off')
    } finally {
      setSoundsOn(true)
    }
  })

  it('la vista de la mesa: en 3D el campo va inclinado; con «Cambiar a la vista superior» queda plano y el botón dice a cuál vuelve; se recuerda', () => {
    localStorage.removeItem('ygo-lab:mat-view')
    render(<Harness />)

    const field = screen.getByLabelText('Campo')

    expect(field).toHaveAttribute('data-tilted', 'true')
    expect(field.className).toContain('rotateX')

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a la vista superior' }))
    expect(field).not.toHaveAttribute('data-tilted')
    expect(field.className).not.toContain('rotateX')
    expect(localStorage.getItem('ygo-lab:mat-view')).toBe('top')

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar a la vista 3D' }))
    expect(field).toHaveAttribute('data-tilted', 'true')
    expect(localStorage.getItem('ygo-lab:mat-view')).toBe('3d')
  })

  it('en un celular angosto la mesa no se ensancha por su barra: la columna mide la pantalla y los botones se achican (jsdom no mide: se comprueban las clases que lo garantizan)', () => {
    render(<Harness />)

    // Sin esto la columna crece hasta lo más ancho que tenga adentro (la barra: ~402 px) y en un celular de 360 a 400 px se corta todo el lado derecho.
    expect(screen.getByRole('region', { name: 'Mesa de práctica' }).className).toContain('grid-cols-[minmax(0,1fr)]')
    expect(screen.getByRole('toolbar', { name: 'Mesa' }).className).toContain('max-[419px]:[&>button]:size-10!')
    expect(screen.getByRole('toolbar', { name: 'Mesa' }).className).toContain('max-[379px]:[&>button]:size-9!')
  })

  it('la barra de abajo va arriba de la mano: una carta seleccionada o recién robada (z 50) no la tapa', () => {
    render(<Harness />)

    const dock = status().closest('[class*="sticky"]')

    expect(dock).toHaveClass('z-55')
  })

  it('arrastrar una carta al cementerio la manda ahí; el menú del deck (con el teclado, o manteniéndolo apretado) ofrece robar', () => {
    render(<Harness />)

    const gy = screen.getByRole('button', { name: 'GY: 0' })
    document.elementFromPoint = () => gy
    document.elementsFromPoint = () => [gy]

    const maxx = within(hand()).getByRole('listitem', { name: 'Maxx C' })
    fireEvent.pointerDown(maxx, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(maxx, { ...pointer, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(maxx, { ...pointer, clientX: 80, clientY: 120 })
    fireEvent.pointerUp(maxx, { ...pointer, clientX: 80, clientY: 120 })

    expect(screen.getByRole('button', { name: 'GY: 1' })).toBeInTheDocument()
    expect(within(status()).getByText('Maxx C va al cementerio')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('button', { name: 'Main: 1' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Robar' }))
    expect(screen.getByRole('button', { name: 'Main: 0' })).toBeInTheDocument()
    expect(within(hand()).getByRole('listitem', { name: 'Imperm' })).toBeInTheDocument()
    expect(within(status()).getByText('Robás Imperm')).toBeInTheDocument()
  })

  it('barajar, robar o sumar una carta a la mano baraja el deck y la mano a la vista; mandar el tope al cementerio no (la carta se ve volar)', () => {
    const animated: Element[] = []
    const { animate, getAnimations, matchMedia } = { animate: Element.prototype.animate, getAnimations: Element.prototype.getAnimations, matchMedia: window.matchMedia }

    // Dos cartas en el deck: una para mandar al cementerio y otra para robar.
    render(<Harness initial={createMatState(['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1'], ['card-7-1'], 4)} />)
    // Con la mano ya repartida (sin movimiento), se pide movimiento: sólo el barajado se mide.
    vi.stubGlobal('KeyframeEffect', class { get composite() { return 'replace' } })
    Element.prototype.getAnimations = () => []
    // Sólo se cuentan las animaciones del barajado (las demás, como los vuelos, duran otra cosa).
    Element.prototype.animate = function (this: Element, _frames: unknown, options?: KeyframeAnimationOptions | number) {
      if (typeof options === 'object' && options.duration === RIFFLE_MS) animated.push(this)

      return { cancel() {}, finish() {}, onfinish: null, oncancel: null } as unknown as Animation
    }
    window.matchMedia = (() => ({ matches: false, media: '', addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia

    try {
      // Las capas del deck se arman de nuevo (otro elemento) cada vez que se baraja.
      const deck = () => screen.getByRole('button', { name: /^Main: [0-9]+$/ })
      const layers = () => deck().querySelector(':scope > span.absolute:not([data-pile-edge])')
      const before = layers()

      // Barajar: el deck se vuelve a armar con su animación y la mano se baraja carta por carta. Su menú, con el teclado (tocarlo es buscar).
      const deckMenu = () => fireEvent.keyDown(deck(), { key: 'Enter' })
      deckMenu()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Barajar' }))
      expect(layers()).not.toBe(before)
      expect(layers()?.querySelector('.animate-riffle-left')).not.toBeNull()
      const inHand = () => animated.filter((element) => element.closest('[data-drop="hand"]') !== null && element.getAttribute('role') === 'listitem')
      expect(inHand().length).toBeGreaterThan(0)

      // Mandar el tope al cementerio no baraja nada: ni el deck (sus capas siguen siendo las mismas) ni la mano.
      animated.length = 0
      const shuffled = layers()
      deckMenu()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Mandar al cementerio' }))
      expect(screen.getByRole('button', { name: 'Main: 1' })).toBeInTheDocument()
      expect(layers()).toBe(shuffled)
      expect(inHand()).toHaveLength(0)

      // Robar sí: la mano se baraja de nuevo.
      animated.length = 0
      deckMenu()
      fireEvent.click(screen.getByRole('menuitem', { name: 'Robar' }))
      expect(inHand().length).toBeGreaterThan(0)

      // Una jugada que no toca ni el deck ni suma a la mano (mandar una carta de la mano al cementerio) no baraja nada.
      animated.length = 0
      tap(within(hand()).getAllByRole('listitem')[0]!)
      fireEvent.click(screen.getByRole('menuitem', { name: 'Descartar' }))
      expect(inHand()).toHaveLength(0)
    } finally {
      vi.unstubAllGlobals()
      Element.prototype.animate = animate
      Element.prototype.getAnimations = getAnimations
      window.matchMedia = matchMedia
    }
  })

  it('del Deck se puede revelar el tope, y desde el visor cualquier carta (sin moverla): revelarla y barajar al cerrar el visor es una sola jugada', () => {
    render(<Harness />)

    // El tope (del menú del deck, con el teclado): queda anotado y el Deck sigue igual.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Main: 1' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Revelar el tope' }))
    expect(screen.getByRole('button', { name: 'Main: 1' })).toBeInTheDocument()
    expect(within(status()).getByText('Revelás Imperm')).toBeInTheDocument()

    // Desde el visor del Deck (tocarlo lo abre), una carta cualquiera ofrece "Revelar". El barajado de después de mirar va adentro de la misma jugada (eran dos jugadas de un toque: la segunda le cortaba el destello y el sonido).
    tap(screen.getByRole('button', { name: 'Main: 1' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: /Main/ })).getByRole('button', { name: /Imperm/ }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Revelar' }))
    expect(screen.queryByRole('dialog', { name: /Main/ })).not.toBeInTheDocument()
    expect(within(status()).getByText('2/2')).toBeInTheDocument()
    expect(within(status()).getByText('Revelás Imperm y barajás')).toBeInTheDocument()
  })

  /** Arrastra una carta de la mano hasta una zona (la que devuelve `elementFromPoint`) y la suelta. */
  const dragToZone = (name: string, target: HTMLElement) => {
    document.elementFromPoint = () => target
    document.elementsFromPoint = () => [target]

    const dragged = within(hand()).getByRole('listitem', { name })
    fireEvent.pointerDown(dragged, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(dragged, { ...pointer, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(dragged, { ...pointer, clientX: 80, clientY: 120 })
    fireEvent.pointerUp(dragged, { ...pointer, clientX: 80, clientY: 120 })
  }
  const waitingIn = (target: HTMLElement) => target.querySelector('[data-pending="true"]')

  it('soltar una carta de la mano en una zona la deja ahí y pregunta cómo sale: Invocación Normal, Colocar o Especial, y la posición después', () => {
    render(<Harness />)

    const mz1 = zone('Zona de monstruo 1')
    dragToZone('Ash Blossom', mz1)

    // La carta se queda en la zona (no vuelve a la mano) mientras se elige; el menú es el de tocarla, sólo con lo que la saca ahí.
    expect(waitingIn(mz1)).toHaveAttribute('data-card-id', 'card-1-1')
    expect(waitingIn(mz1)).toHaveAttribute('aria-hidden', 'true')
    expect(waitingIn(mz1)?.querySelector('[data-fx="frame"]')).not.toBeNull()
    expect(within(hand()).queryByRole('listitem', { name: 'Ash Blossom' })).not.toBeInTheDocument()
    expect(within(hand()).getAllByRole('listitem')).toHaveLength(4)
    const sheet = screen.getByRole('region', { name: 'Ash Blossom' })
    const menu = within(sheet).getByRole('menu', { name: 'Ash Blossom' })
    expect(within(sheet).getByText('Zona de monstruo 1')).toBeInTheDocument()
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Invocación Normal', 'Colocar', 'Invocación Especial'])

    // La posición se pregunta después, en la misma hoja, y la carta sigue en la zona.
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Invocación Especial' }))
    const question = screen.getByRole('menu', { name: 'Ash Blossom' })
    expect(within(screen.getByRole('region', { name: 'Ash Blossom' })).getByText('Invocación Especial')).toBeInTheDocument()
    expect(within(question).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['En ataque', 'En defensa'])
    expect(waitingIn(mz1)).not.toBeNull()
    fireEvent.click(within(question).getByRole('menuitem', { name: 'En defensa' }))

    expect(waitingIn(mz1)).toBeNull()
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom, en defensa' })).toBeInTheDocument()
    expect(within(status()).getByText('Invocación Especial de Ash Blossom en defensa')).toBeInTheDocument()
    // Ya estaba en la zona: el destello no espera ningún vuelo desde la mano.
    expect(mz1.querySelector('[data-fx="landing"] span')).toHaveStyle({ animationDelay: '0ms' })

    // Soltada en una zona extra de monstruo, una carta de la mano no cae: esa zona es para lo que viene del Extra Deck.
    const emz1 = zone('Zona extra de monstruo 1')
    dragToZone('Maxx C', emz1)
    expect(within(hand()).getByRole('listitem', { name: 'Maxx C' })).toBeInTheDocument()
    expect(waitingIn(emz1)).toBeNull()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(within(status()).getByText('1/1')).toBeInTheDocument()

    // Una Mágica soltada en la zona de Mágicas y Trampas: Activar o Colocar (las posiciones ya las fija la jugada: no hay pregunta).
    const st1 = zone('Zona de magia y trampa 1')
    dragToZone('Called by the Grave', st1)
    expect(waitingIn(st1)).not.toBeNull()
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Activar', 'Colocar'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Colocar' }))
    expect(waitingIn(st1)).toBeNull()
    expect(within(zone('Zona de magia y trampa 1')).getByRole('button', { name: 'Called by the Grave, boca abajo' })).toBeInTheDocument()
  })

  it('una Invocación Normal soltada en la zona sale por la opción sin preguntar nada más', () => {
    render(<Harness />)

    const mz2 = zone('Zona de monstruo 2')
    dragToZone('Maxx C', mz2)
    fireEvent.click(within(screen.getByRole('menu', { name: 'Maxx C' })).getByRole('menuitem', { name: 'Invocación Normal' }))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(waitingIn(mz2)).toBeNull()
    expect(within(zone('Zona de monstruo 2')).getByRole('button', { name: 'Maxx C' })).toBeInTheDocument()
    expect(within(status()).getByText('Invocación Normal de Maxx C')).toBeInTheDocument()
  })

  it('si se cierra el menú sin elegir, la carta soltada vuelve a la mano', () => {
    render(<Harness />)

    const mz3 = zone('Zona de monstruo 3')
    dragToZone('Maxx C', mz3)
    expect(waitingIn(mz3)).not.toBeNull()
    expect(within(hand()).queryByRole('listitem', { name: 'Maxx C' })).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(waitingIn(mz3)).toBeNull()
    expect(within(hand()).getByRole('listitem', { name: 'Maxx C' })).toBeInTheDocument()
    // No hubo jugada: nada quedó anotado.
    expect(within(status()).queryByText('1/1')).not.toBeInTheDocument()
  })

  it('un monstruo de Nivel 7 se invoca con la misma Invocación Normal: la carta soltada espera en la zona mientras se eligen los Sacrificios y cancelar la devuelve a la mano', () => {
    const cards = new Map([...CARDS, ['card-8-1', { name: 'Blue-Eyes', apiCard: { ...card(8, 'normal'), level: 8 } }]])
    const initial = replayMat(createMatState(['card-8-1', 'card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1'], ['card-7-1'], 5), [
      { type: 'place', id: 'card-1-1', zone: 'mz', index: 0, pos: 'atk' },
      { type: 'place', id: 'card-2-1', zone: 'mz', index: 1, pos: 'atk' },
    ])
    render(<Harness initial={initial} cards={cards} />)

    const mz3 = zone('Zona de monstruo 3')
    dragToZone('Blue-Eyes', mz3)
    const menu = screen.getByRole('menu', { name: 'Blue-Eyes' })
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Invocación Normal', 'Colocar', 'Invocación Especial'])
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Invocación Normal' }))

    // El menú se fue pero la carta sigue en la zona, esperando los Sacrificios.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(within(status()).getByText('Tocá 2 monstruos para sacrificar (0/2)')).toBeInTheDocument()
    // Eligiendo, lo que falta sí se ve y se apoya sobre el borde de abajo, arriba de la mano (la práctica ya no reserva una fila: ese alto es del campo).
    expect(status()).not.toHaveClass('sr-only')
    expect(status()).toHaveClass('absolute', 'inset-x-0', 'bottom-0')
    expect(waitingIn(mz3)).toHaveAttribute('data-card-id', 'card-8-1')
    expect(within(hand()).queryByRole('listitem', { name: 'Blue-Eyes' })).not.toBeInTheDocument()

    // Cancelar la devuelve a la mano.
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(waitingIn(mz3)).toBeNull()
    expect(within(hand()).getByRole('listitem', { name: 'Blue-Eyes' })).toBeInTheDocument()

    // De nuevo, y esta vez se sacrifican los dos monstruos: sale en la zona donde se soltó.
    dragToZone('Blue-Eyes', mz3)
    fireEvent.click(within(screen.getByRole('menu', { name: 'Blue-Eyes' })).getByRole('menuitem', { name: 'Invocación Normal' }))
    tap(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' }))
    expect(waitingIn(mz3)).not.toBeNull()
    tap(within(zone('Zona de monstruo 2')).getByRole('button', { name: 'Maxx C' }))

    expect(waitingIn(mz3)).toBeNull()
    expect(within(zone('Zona de monstruo 3')).getByRole('button', { name: 'Blue-Eyes' })).toBeInTheDocument()
    expect(within(status()).getByText('Invocación Normal de Blue-Eyes (sacrificás Ash Blossom y Maxx C)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GY: 2' })).toBeInTheDocument()
  })

  describe('si la mesa cambia mientras la carta soltada espera que se elija cómo sale', () => {
    const cards = new Map([...CARDS, ['card-8-1', { name: 'Blue-Eyes', apiCard: { ...card(8, 'normal'), level: 8 } }]])
    /** Blue-Eyes y la Mágica quedan en la mano; Ash y Maxx (y, si se pide, Droll) están en las zonas de monstruo 1, 2 y 3. */
    const withField = (...ids: string[]) =>
      replayMat(
        createMatState(['card-8-1', 'card-1-1', 'card-2-1', 'card-5-1', 'card-3-1', 'card-4-1'], ['card-7-1'], 5),
        ids.map((id, index) => ({ type: 'place' as const, id, zone: 'mz' as const, index, pos: 'atk' as const })),
      )
    const dropBlueEyesForTributes = (target: HTMLElement) => {
      dragToZone('Blue-Eyes', target)
      fireEvent.click(within(screen.getByRole('menu', { name: 'Blue-Eyes' })).getByRole('menuitem', { name: 'Invocación Normal' }))
      expect(waitingIn(target)).not.toBeNull()
    }

    it('deshacer cancela la selección de Sacrificios y la carta soltada vuelve a la mano, no desaparece', () => {
      render(<Harness initial={withField('card-1-1', 'card-2-1', 'card-5-1')} cards={cards} />)
      const mz3 = zone('Zona de monstruo 3')

      // Droll al cementerio libera la zona 3 (y deja una jugada para deshacer); ahí se suelta Blue-Eyes por Sacrificio.
      tap(within(mz3).getByRole('button', { name: 'Droll' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Al cementerio' }))
      dropBlueEyesForTributes(mz3)

      // Deshacer devuelve a Droll a la zona 3: ya no hay nada esperando ahí, la selección se cerró y Blue-Eyes está en la mano.
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
      expect(within(zone('Zona de monstruo 3')).getByRole('button', { name: 'Droll' })).toBeInTheDocument()
      expect(waitingIn(zone('Zona de monstruo 3'))).toBeNull()
      expect(within(status()).queryByText(/Tocá 2 monstruos/)).not.toBeInTheDocument()
      expect(within(hand()).getByRole('listitem', { name: 'Blue-Eyes' })).toBeInTheDocument()
    })

    it('arrastrar un monstruo del campo a la zona donde espera la carta cancela la selección y la carta vuelve a la mano', () => {
      render(<Harness initial={withField('card-1-1', 'card-2-1')} cards={cards} />)
      const mz3 = zone('Zona de monstruo 3')

      dropBlueEyesForTributes(mz3)

      // Ash (zona 1) arrastrado a la zona 3, que se ve ocupada por la carta que espera pero para la mesa está libre.
      const ash = within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' })
      document.elementFromPoint = () => mz3
      document.elementsFromPoint = () => [mz3]
      fireEvent.pointerDown(ash, { ...pointer, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(ash, { ...pointer, clientX: 40, clientY: 60 })
      fireEvent.pointerMove(ash, { ...pointer, clientX: 80, clientY: 120 })
      fireEvent.pointerUp(ash, { ...pointer, clientX: 80, clientY: 120 })

      expect(within(zone('Zona de monstruo 3')).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
      expect(waitingIn(zone('Zona de monstruo 3'))).toBeNull()
      expect(within(status()).queryByText(/Tocá 2 monstruos/)).not.toBeInTheDocument()
      expect(within(hand()).getByRole('listitem', { name: 'Blue-Eyes' })).toBeInTheDocument()
    })

    it('deshacer a mitad de la selección no deja anotar después una invocación que no pasó: lo que se toca vuelve a ser una carta común', () => {
      render(<Harness initial={withField('card-1-1')} cards={cards} />)

      // Maxx C entra por su menú (la jugada que se va a deshacer) y se suelta Blue-Eyes por Sacrificio en la zona 4.
      tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 2: elegir' }))
      dropBlueEyesForTributes(zone('Zona de monstruo 4'))
      tap(within(zone('Zona de monstruo 2')).getByRole('button', { name: 'Maxx C' }))
      expect(within(status()).getByText('Tocá 2 monstruos para sacrificar (1/2)')).toBeInTheDocument()

      // Deshacer saca a Maxx del campo: la selección ya no vale, y tocar a Ash abre su menú en vez de contar como el segundo Sacrificio.
      fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
      tap(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' }))

      expect(screen.getByRole('menu', { name: 'Ash Blossom' })).toBeInTheDocument()
      expect(within(status()).queryByText(/sacrificás/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'GY: 0' })).toBeInTheDocument()
      expect(within(hand()).getByRole('listitem', { name: 'Blue-Eyes' })).toBeInTheDocument()
    })
  })

  it('abrir un menú (tocando una carta o soltándola en una zona) pausa la reproducción del combo', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar combo' }))
    const dialog = screen.getByRole('dialog', { name: 'Guardar combo' })
    expect(dialog.parentElement!.querySelector('.animate-nav-scrim')).toBeNull()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Uno' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }))
    const aside = screen.getByRole('region', { name: 'Pasos y combos' })
    fireEvent.click(within(aside).getByRole('radio', { name: 'Combos' }))
    fireEvent.click(within(aside).getByRole('button', { name: 'Cargar Uno' }))
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()

    // Tocar una carta abre su menú y pausa: si no, los pasos seguirían avanzando por debajo de lo que se elige.
    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    expect(screen.getByRole('menu', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reproducir' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })

    // Soltarla en una zona (el menú de soltar) también.
    fireEvent.click(screen.getByRole('button', { name: 'Reproducir' }))
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeInTheDocument()
    dragToZone('Ash Blossom', zone('Zona de monstruo 3'))
    expect(screen.getByRole('menu', { name: 'Ash Blossom' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reproducir' })).toBeInTheDocument()
  })

  it('la ficha pide la posición (en ataque o en defensa) al soltarla o al tocarla, y se ve con la imagen de una ficha', () => {
    render(<Harness />)

    // Arrastrada, la ficha es una carta con su imagen; soltada en una zona libre pregunta la posición ahí mismo.
    const mz4 = zone('Zona de monstruo 4')
    document.elementFromPoint = () => mz4
    document.elementsFromPoint = () => [mz4]
    // El + va al medio del campo (entre las dos Zonas Extra), ya no en la barra de arriba.
    const plus = screen.getByRole('button', { name: 'Ficha' })
    fireEvent.pointerDown(plus, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(plus, { ...pointer, clientX: 40, clientY: 60 })
    fireEvent.pointerMove(plus, { ...pointer, clientX: 80, clientY: 120 })
    expect(document.querySelectorAll('img[src$="/cards_small/73915052.jpg"]')).toHaveLength(1)
    fireEvent.pointerUp(plus, { ...pointer, clientX: 80, clientY: 120 })

    const dropped = screen.getByRole('menu', { name: 'Ficha' })
    expect(within(screen.getByRole('region', { name: 'Ficha' })).getByText('Zona de monstruo 4')).toBeInTheDocument()
    expect(within(dropped).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['En ataque', 'En defensa'])
    fireEvent.click(within(dropped).getByRole('menuitem', { name: 'En ataque' }))
    expect(within(zone('Zona de monstruo 4')).getByRole('button', { name: 'Ficha' })).toBeInTheDocument()
    expect(within(status()).getByText('Ficha en ataque, zona 4')).toBeInTheDocument()

    // Soltada en una zona extra no pasa nada: una ficha no viene del Extra Deck.
    const emz1 = zone('Zona extra de monstruo 1')
    document.elementFromPoint = () => emz1
    document.elementsFromPoint = () => [emz1]
    fireEvent.pointerDown(plus, { ...pointer, clientX: 10, clientY: 10 })
    fireEvent.pointerMove(plus, { ...pointer, clientX: 80, clientY: 120 })
    fireEvent.pointerUp(plus, { ...pointer, clientX: 80, clientY: 120 })
    expect(screen.queryByRole('menu', { name: 'Ficha' })).not.toBeInTheDocument()

    // Tocada, pregunta qué agregar (una ficha o, como ya hay una carta en el campo, poner contadores), después la posición y después la zona (sólo las principales).
    tap(plus)
    expect(within(screen.getByRole('menu', { name: 'Agregar' })).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Ficha', 'Poner contadores'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Ficha' }))
    const menu = screen.getByRole('menu', { name: 'Ficha' })
    expect(within(screen.getByRole('region', { name: 'Ficha' })).getByText('Invocación Especial')).toBeInTheDocument()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'En defensa' }))
    expect(within(status()).getByText('Tocá la zona para la ficha')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /: elegir$/ })).toHaveLength(4)
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))

    const token = within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ficha, en defensa' })
    expect(within(token).getByRole('img', { name: 'Ficha' })).toHaveAttribute('src', '/api/card-image/cards_small/73915052.jpg')
    expect(within(status()).getByText('Ficha en defensa, zona 1')).toBeInTheDocument()

    // Como en DuelingBook: pasar a ataque, quitar y target (en la hoja del celular, las jugadas primero y el apoyo, el target, abajo).
    tap(token)
    expect(within(screen.getByRole('menu', { name: 'Ficha' })).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Pasar a ataque', 'Quitar la ficha', 'Target'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Pasar a ataque' }))
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ficha' })).toBeInTheDocument()
  })

  describe('al arrastrar una carta, la zona de abajo se enciende sin volver a dibujar la mesa', () => {
    // Acá los cuadros se juntan y se sueltan a mano, como en el navegador (el de los demás tests corre de inmediato y sólo deja pasar el primer movimiento).
    let frames: FrameRequestCallback[] = []
    const flush = () => act(() => { frames.splice(0).forEach((frame) => frame(0)) })
    const lit = () => [...document.querySelectorAll('[data-over="true"]')].map((element) => element.getAttribute('data-drop'))
    const over = (target: HTMLElement) => {
      document.elementFromPoint = () => target
      document.elementsFromPoint = () => [target]
    }

    beforeEach(() => {
      frames = []
      window.requestAnimationFrame = (callback) => {
        frames.push(callback)
        return frames.length
      }
    })

    it('si el navegador le quita el puntero a la carta sin avisar (el celular), el arrastre termina y no queda ninguna zona encendida', () => {
      render(<Harness />)

      const mz2 = zone('Zona de monstruo 2')
      const dragged = within(hand()).getByRole('listitem', { name: 'Maxx C' })
      over(mz2)
      fireEvent.pointerDown(dragged, { ...pointer, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(dragged, { ...pointer, clientX: 40, clientY: 60 })
      flush()
      expect(lit()).toEqual(['mz:1'])

      // Ni pointerup ni pointercancel: sólo se pierde la captura.
      fireEvent.lostPointerCapture(dragged, { ...pointer })
      expect(lit()).toEqual([])
      // Y la carta no se soltó en ninguna parte: sigue en la mano.
      expect(within(hand()).getByRole('listitem', { name: 'Maxx C' })).toBeInTheDocument()
    })

    it('red de seguridad: al levantar el dedo, aunque el arrastre nunca se haya enterado, se apagan las zonas que quedaron encendidas', () => {
      vi.useFakeTimers()

      try {
        render(<Harness />)

        const mz2 = zone('Zona de monstruo 2')
        // Una zona que quedó encendida de un arrastre que se perdió.
        mz2.setAttribute('data-over', 'true')
        expect(lit()).toEqual(['mz:1'])

        fireEvent.pointerUp(document.body, { ...pointer, clientX: 5, clientY: 5 })
        act(() => {
          vi.advanceTimersByTime(200)
        })
        expect(lit()).toEqual([])
      } finally {
        vi.useRealTimers()
      }
    })

    it('desde la mano: se enciende la zona que se cruza y se apaga la anterior; al soltar o cancelar no queda ninguna', () => {
      render(<Harness />)

      const mz2 = zone('Zona de monstruo 2')
      const gy = screen.getByRole('button', { name: 'GY: 0' })
      const dragged = within(hand()).getByRole('listitem', { name: 'Maxx C' })
      over(mz2)
      fireEvent.pointerDown(dragged, { ...pointer, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(dragged, { ...pointer, clientX: 40, clientY: 60 })
      // El movimiento se aplica en el cuadro siguiente.
      expect(lit()).toEqual([])
      flush()
      expect(lit()).toEqual(['mz:1'])
      const drawn = commits

      over(gy)
      fireEvent.pointerMove(dragged, { ...pointer, clientX: 80, clientY: 120 })
      flush()
      expect(lit()).toEqual(['gy'])
      expect(mz2).toHaveAttribute('data-over', 'false')
      over(zone('Zona de magia y trampa 3'))
      fireEvent.pointerMove(dragged, { ...pointer, clientX: 90, clientY: 130 })
      flush()
      expect(lit()).toEqual(['st:2'])
      expect(commits).toBe(drawn)

      fireEvent.pointerCancel(dragged, { ...pointer, clientX: 90, clientY: 130 })
      expect(lit()).toEqual([])
      expect(within(status()).queryByText(/1\/1/)).not.toBeInTheDocument()

      // Soltada sobre una zona: se juega y tampoco queda ninguna encendida.
      over(gy)
      fireEvent.pointerDown(dragged, { ...pointer, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(dragged, { ...pointer, clientX: 40, clientY: 60 })
      flush()
      expect(lit()).toEqual(['gy'])
      fireEvent.pointerUp(dragged, { ...pointer, clientX: 40, clientY: 60 })
      expect(lit()).toEqual([])
      expect(within(status()).getByText('Maxx C va al cementerio')).toBeInTheDocument()
    })

    it('desde la mesa (la ficha): lo mismo, y las pilas se encienden igual que las zonas', () => {
      render(<Harness />)

      // El + va al medio del campo (entre las dos Zonas Extra), ya no en la barra de arriba.
    const plus = screen.getByRole('button', { name: 'Ficha' })
      over(zone('Zona de monstruo 4'))
      fireEvent.pointerDown(plus, { ...pointer, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(plus, { ...pointer, clientX: 40, clientY: 60 })
      flush()
      expect(lit()).toEqual(['mz:3'])
      const drawn = commits

      over(screen.getByRole('button', { name: 'Banish: 0' }))
      fireEvent.pointerMove(plus, { ...pointer, clientX: 80, clientY: 120 })
      flush()
      expect(lit()).toEqual(['banished'])
      over(screen.getByRole('button', { name: 'Main: 1' }))
      fireEvent.pointerMove(plus, { ...pointer, clientX: 90, clientY: 130 })
      flush()
      expect(lit()).toEqual(['deck'])
      expect(commits).toBe(drawn)

      // Soltada en el deck no se juega nada; cancelada, tampoco.
      fireEvent.pointerUp(plus, { ...pointer, clientX: 90, clientY: 130 })
      expect(lit()).toEqual([])
      over(zone('Zona de monstruo 1'))
      fireEvent.pointerDown(plus, { ...pointer, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(plus, { ...pointer, clientX: 40, clientY: 60 })
      flush()
      expect(lit()).toEqual(['mz:0'])
      fireEvent.pointerCancel(plus, { ...pointer, clientX: 40, clientY: 60 })
      expect(lit()).toEqual([])
      expect(screen.queryByRole('menu', { name: 'Ficha' })).not.toBeInTheDocument()
    })

    it('la carta de la mano sigue al puntero por su transform, y volver a dibujar la mano a mitad del arrastre no la devuelve a su lugar', () => {
      render(<Harness />)

      const dragged = within(hand()).getByRole('listitem', { name: 'Maxx C' })
      const atRest = /^translate3d\(.+px, .+px, 0\) rotate\(.+deg\)$/
      expect(dragged).toHaveAttribute('data-state', 'rest')
      expect(dragged.style.transform).toMatch(atRest)

      document.elementsFromPoint = () => []
      fireEvent.pointerDown(dragged, { ...pointer, clientX: 10, clientY: 10 })
      fireEvent.pointerMove(dragged, { ...pointer, clientX: 40, clientY: 60 })
      // Levantada de entrada (sin esperar al cuadro): ya no lleva la transición del transform.
      expect(dragged).toHaveAttribute('data-state', 'dragging')
      expect(dragged.style.zIndex).toBe('100')
      flush()
      expect(dragged.style.transform).toContain('perspective(900px)')
      const following = dragged.style.transform

      // Una vecina cambia de lugar (se reordena la mano): la carta arrastrada sigue donde la puso el puntero.
      fireEvent.keyDown(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }), { key: 'ArrowRight' })
      expect(dragged.style.transform).toBe(following)

      fireEvent.pointerUp(dragged, { ...pointer, clientX: 40, clientY: 60 })
      expect(dragged).toHaveAttribute('data-state', 'rest')
      expect(dragged.style.transform).toMatch(atRest)
    })
  })

  it('el segundo paso del menú ("¿En ataque o en defensa?") aparece en el mismo lugar que el menú que se tocó, aunque sea mucho más corto', () => {
    const { offsetHeight, offsetWidth } = Object.getOwnPropertyDescriptors(HTMLElement.prototype)
    const rect = Element.prototype.getBoundingClientRect
    // jsdom no mide nada: cada línea del menú ocupa 30 px, y todo lo demás está a media pantalla (un menú largo cabe arriba de la carta, uno corto también: antes cada uno se pegaba a su manera).
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get(this: HTMLElement) { return this.getAttribute('role') === 'menu' ? this.querySelectorAll('[role="menuitem"]').length * 30 + 40 : 0 } })
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 208 })
    Element.prototype.getBoundingClientRect = () => ({ left: 100, top: 560, right: 180, bottom: 700, width: 80, height: 140, x: 100, y: 560, toJSON: () => ({}) })

    try {
      render(<Harness />)
      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      const menu = () => screen.getByRole('menu')
      const first = { left: menu().style.left, top: menu().style.top }
      expect(within(menu()).getAllByRole('menuitem').length).toBeGreaterThan(5)

      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))
      expect(within(menu()).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['En ataque', 'En defensa'])
      expect({ left: menu().style.left, top: menu().style.top }).toEqual(first)
    } finally {
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight!)
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetWidth!)
      Element.prototype.getBoundingClientRect = rect
    }
  })

  it('"Al deck" de una carta de la mano: pregunta si es al azar, arriba o abajo, y al azar la baraja adentro', () => {
    render(<Harness />)

    expect(screen.getByRole('button', { name: 'Main: 1' })).toBeInTheDocument()
    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Al deck' }))
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Al azar', 'Arriba', 'Abajo'])

    fireEvent.click(screen.getByRole('menuitem', { name: 'Al azar' }))
    expect(screen.getByRole('button', { name: 'Main: 2' })).toBeInTheDocument()
    expect(within(hand()).queryByRole('listitem', { name: 'Ash Blossom' })).not.toBeInTheDocument()
    expect(within(status()).getByText('Barajás Ash Blossom dentro del deck')).toBeInTheDocument()
  })

  it('desde el Extra, la Invocación Especial pide tocar los materiales en el campo y confirmar', () => {
    render(<Harness />)

    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))

    fireEvent.click(screen.getByRole('button', { name: 'Extra: 1' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Extra · 1' })).getByRole('button', { name: 'Zeus' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'En ataque' }))

    expect(within(status()).getByText('Materiales (opcionales): tocalos en el campo (0) y confirmá, o tocá una casilla para invocar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Invocar' })).toBeEnabled()
    tap(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' }))
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom (Material)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Invocar' }))

    // Quedan varias zonas para elegir, incluida la de Ash (que se va como material y sigue marcada): tocar a Ash elige esa zona.
    tap(within(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' })).getByRole('button', { name: 'Ash Blossom (Material)' }))
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Zeus, con 1 material' })).toBeInTheDocument()
    expect(within(status()).getByText('Invocación Xyz de Zeus (materiales: Ash Blossom)')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GY: 0' })).toBeInTheDocument()
  })

  describe('los materiales de una Invocación desde el Extra son una opción, no un requisito', () => {
    /** Ash en la zona 1 y, del Extra, Zeus en ataque: queda eligiendo materiales (o una casilla). */
    const startSummon = () => {
      render(<Harness />)

      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))
      fireEvent.click(screen.getByRole('button', { name: 'Extra: 1' }))
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Extra · 1' })).getByRole('button', { name: 'Zeus' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'En ataque' }))
    }

    it('sin elegir ninguno, Invocar sigue: se eligen las casillas iluminadas y los monstruos del campo se quedan', () => {
      startSummon()

      // Las casillas libres están encendidas para elegir dónde (la de Ash, ocupada, no).
      expect(screen.getByRole('button', { name: 'Zona de monstruo 2: elegir' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Zona de monstruo 1: elegir' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Invocar' }))
      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 4: elegir' }))

      expect(within(zone('Zona de monstruo 4')).getByRole('button', { name: 'Zeus' })).toBeInTheDocument()
      expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'GY: 0' })).toBeInTheDocument()
      expect(within(status()).getByText('Invocación Especial de Zeus (sin materiales)')).toBeInTheDocument()
    })

    it('tocar una casilla iluminada invoca ahí mismo, sin pasar por el botón', () => {
      startSummon()

      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 3: elegir' }))

      expect(within(zone('Zona de monstruo 3')).getByRole('button', { name: 'Zeus' })).toBeInTheDocument()
      expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Invocar' })).not.toBeInTheDocument()
    })

    it('con un material elegido y una casilla tocada, se usa el material y la carta sale en esa casilla', () => {
      startSummon()

      tap(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' }))
      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 3: elegir' }))

      expect(within(zone('Zona de monstruo 3')).getByRole('button', { name: 'Zeus, con 1 material' })).toBeInTheDocument()
      expect(within(zone('Zona de monstruo 1')).queryByRole('button', { name: 'Ash Blossom' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'GY: 0' })).toBeInTheDocument()
      expect(within(status()).getByText('Invocación Xyz de Zeus (materiales: Ash Blossom)')).toBeInTheDocument()
    })
  })

  it('con las cinco zonas de monstruo y una Extra ocupadas, la Invocación del Extra con materiales deja elegir entre las zonas que se liberan: no se cae sola en la Extra libre', () => {
    const cards = new Map(CARDS).set('card-8-1', { name: 'Hermes', apiCard: card(8, 'xyz') })
    const initial = replayMat(createMatState(['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1'], ['card-7-1', 'card-8-1'], 5), [
      ...['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1'].map((id, index) => ({ type: 'place', id, zone: 'mz', index, pos: 'atk' }) as const),
      { type: 'place', id: 'card-8-1', zone: 'emz', index: 0, pos: 'atk', how: 'special' },
    ])
    render(<Harness initial={initial} cards={cards} />)

    fireEvent.click(screen.getByRole('button', { name: 'Extra: 1' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Extra · 1' })).getByRole('button', { name: 'Zeus' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'En ataque' }))
    tap(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Ash Blossom' }))
    fireEvent.click(screen.getByRole('button', { name: 'Invocar' }))

    // Antes: la única zona libre de ese momento (la Extra 2) se elegía sola. Ahora se elige: la de Ash, que se libera, y la Extra libre.
    const freeExtra = screen.getByRole('button', { name: 'Zona extra de monstruo 2: elegir' })
    expect(within(freeExtra).queryByRole('button', { name: /^Zeus/ })).not.toBeInTheDocument()
    tap(within(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' })).getByRole('button', { name: 'Ash Blossom (Material)' }))
    expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Zeus, con 1 material' })).toBeInTheDocument()
  })

  describe('Desacoplar y Adjuntar: con varias cartas, una sola opción que abre la lista', () => {
    // Dos copias de Ash Blossom (se llaman igual) y Maxx C debajo de Zeus, en la Zona Extra 1; Hermes, otro Xyz, en la zona de monstruo 1; Droll en el cementerio.
    const cards = new Map(CARDS).set('card-1-2', { name: 'Ash Blossom', apiCard: card(1, 'effect') }).set('card-8-1', { name: 'Hermes', apiCard: card(8, 'xyz') })
    const table = replayMat(createMatState(['card-1-1', 'card-1-2', 'card-2-1', 'card-5-1', 'card-3-1', 'card-4-1', 'card-6-1'], ['card-7-1', 'card-8-1'], 5), [
      { type: 'place', id: 'card-7-1', zone: 'emz', index: 0, pos: 'atk', how: 'special' },
      ...['card-1-1', 'card-1-2', 'card-2-1'].map((id) => ({ type: 'attach', id, to: 'card-7-1' }) as const),
      { type: 'place', id: 'card-8-1', zone: 'mz', index: 0, pos: 'atk', how: 'special' },
      { type: 'move', id: 'card-5-1', to: 'gy' },
    ])
    const asDesktop = () => {
      const matchMedia = window.matchMedia

      window.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: query.includes('1101') || query.includes('reduce') })) as typeof window.matchMedia
    }
    /** Las advertencias de React por dos hijos con la misma clave (dos materiales que se llaman igual). */
    const keyWarnings = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.filter((call) => String(call[0]).includes('same key'))
    const items = () => screen.getAllByRole('menuitem').map((item) => item.textContent)

    for (const device of ['escritorio', 'celular'] as const) {
      it(`${device}: «Desacoplar» abre la lista de los materiales (dos que se llaman igual no chocan) y el elegido va al cementerio`, () => {
        const errors = vi.spyOn(console, 'error')

        try {
          if (device === 'escritorio') asDesktop()
          render(<Harness initial={table} cards={cards} />)

          tap(within(zone('Zona extra de monstruo 1')).getByRole('button', { name: /^Zeus/ }))
          expect(items().filter((label) => label?.startsWith('Desacoplar'))).toEqual(['Desacoplar'])
          fireEvent.click(screen.getByRole('menuitem', { name: 'Desacoplar' }))
          expect(items()).toEqual(['Ash Blossom', 'Ash Blossom', 'Maxx C'])
          expect(keyWarnings(errors)).toEqual([])

          fireEvent.click(screen.getByRole('menuitem', { name: 'Maxx C' }))
          expect(within(status()).getByText('Maxx C va al cementerio')).toBeInTheDocument()
          expect(screen.getByRole('button', { name: 'GY: 2' })).toBeInTheDocument()

          // Quedan los dos Ash Blossom: sigue siendo una sola opción con la lista.
          tap(within(zone('Zona extra de monstruo 1')).getByRole('button', { name: /^Zeus/ }))
          fireEvent.click(screen.getByRole('menuitem', { name: 'Desacoplar' }))
          expect(items()).toEqual(['Ash Blossom', 'Ash Blossom'])
          expect(keyWarnings(errors)).toEqual([])
        } finally {
          errors.mockRestore()
        }
      })

      it(`${device}: una carta del cementerio con dos Xyz en el campo se adjunta con «Adjuntar a un Xyz», eligiendo a cuál`, () => {
        if (device === 'escritorio') asDesktop()
        render(<Harness initial={table} cards={cards} />)

        fireEvent.click(screen.getByRole('button', { name: 'GY: 1' }))
        fireEvent.click(within(screen.getByRole('dialog', { name: 'GY · 1' })).getByRole('button', { name: 'Droll' }))
        expect(items().filter((label) => label?.startsWith('Adjuntar'))).toEqual(['Adjuntar a un Xyz'])
        fireEvent.click(screen.getByRole('menuitem', { name: 'Adjuntar a un Xyz' }))
        expect(items()).toEqual(['Hermes', 'Zeus'])

        fireEvent.click(screen.getByRole('menuitem', { name: 'Zeus' }))
        expect(within(status()).getByText('Adjuntás Droll a Zeus')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'GY: 0' })).toBeInTheDocument()
        expect(screen.queryByRole('dialog', { name: 'GY · 1' })).not.toBeInTheDocument()
      })
    }
  })

  describe('doble clic en el único material (escritorio)', () => {
    const asDesktop = () => {
      const matchMedia = window.matchMedia
      // Escritorio, y sin animaciones para que la mano llegue repartida.
      window.matchMedia = ((query: string) => ({ ...matchMedia(query), matches: query.includes('1101') || query.includes('reduce') })) as typeof window.matchMedia
    }
    /** Ash en la zona 1 (Normal) y, si se pide, Maxx C en la 2 (Especial); luego Zeus del Extra pidiendo materiales. */
    const startXyz = (withSecond = false) => {
      render(<Harness />)
      tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Normal' }))
      fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' }))

      if (withSecond) {
        tap(within(hand()).getByRole('listitem', { name: 'Maxx C' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'En ataque' }))
        fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 2: elegir' }))
      }

      fireEvent.click(screen.getByRole('button', { name: 'Extra: 1' }))
      fireEvent.click(within(screen.getByRole('dialog', { name: 'Extra · 1' })).getByRole('button', { name: 'Zeus' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))
      fireEvent.click(screen.getByRole('menuitem', { name: 'En ataque' }))
    }
    const ash = () => within(zone('Zona de monstruo 1')).getByRole('button', { name: /^Ash Blossom/ })
    const isMaterial = (button: HTMLElement) => button.getAttribute('aria-label')?.includes('(Material)')

    it('dos toques seguidos al único material lo confirman, sin tocar el botón, pero la casilla se elige', () => {
      const matchMedia = window.matchMedia
      asDesktop()

      try {
        startXyz()
        tap(ash())
        expect(within(status()).getByText('Con un solo material, doble clic en él para invocar')).toBeInTheDocument()
        tap(ash())

        // Se siguió como al confirmar: confirma el material pero no invoca solo, la mesa espera que se toque la casilla (también la de Ash, que se liberó).
        expect(within(status()).getByText(/^Tocá la zona para/)).toBeInTheDocument()
        expect(within(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' })).queryByRole('button', { name: /^Zeus/ })).not.toBeInTheDocument()
        tap(within(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' })).getByRole('button', { name: 'Ash Blossom (Material)' }))
        expect(within(status()).getByText('Invocación Xyz de Zeus (materiales: Ash Blossom)')).toBeInTheDocument()
      } finally {
        window.matchMedia = matchMedia
      }
    })

    it('el click que el navegador manda tras el segundo toque no elige la casilla del material: la casilla la elige el jugador', () => {
      const matchMedia = window.matchMedia
      asDesktop()

      try {
        startXyz()
        const material = ash()
        tap(material)
        tap(material)
        // El segundo toque confirmó y la mesa ya pide zona: el click que le sigue cae en la carta (dentro de su casilla) y no tiene que invocar ahí.
        fireEvent.click(material)

        expect(within(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' })).queryByRole('button', { name: /^Zeus/ })).not.toBeInTheDocument()
        expect(within(status()).getByText(/^Tocá la zona para/)).toBeInTheDocument()

        // Elegir a mano otra casilla sí invoca ahí.
        fireEvent.click(screen.getByRole('button', { name: 'Zona de monstruo 3: elegir' }))
        expect(within(zone('Zona de monstruo 3')).getByRole('button', { name: 'Zeus, con 1 material' })).toBeInTheDocument()
        expect(within(status()).getByText('Invocación Xyz de Zeus (materiales: Ash Blossom)')).toBeInTheDocument()
      } finally {
        window.matchMedia = matchMedia
      }
    })

    it('con una sola casilla libre al liberarse el material, el doble clic tampoco la elige: queda esperando que se toque', () => {
      const matchMedia = window.matchMedia
      asDesktop()

      try {
        const cards = new Map(CARDS).set('card-8-1', { name: 'Hermes', apiCard: card(8, 'xyz') }).set('card-9-1', { name: 'Atlas', apiCard: card(9, 'xyz') })
        // Cinco zonas de monstruo y las dos Zonas Extra ocupadas: al irse Ash queda sólo su casilla.
        const initial = replayMat(createMatState(['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1', 'card-6-1'], ['card-7-1', 'card-8-1', 'card-9-1'], 5), [
          ...['card-1-1', 'card-2-1', 'card-3-1', 'card-4-1', 'card-5-1'].map((id, index) => ({ type: 'place', id, zone: 'mz', index, pos: 'atk' }) as const),
          { type: 'place', id: 'card-8-1', zone: 'emz', index: 0, pos: 'atk', how: 'special' },
          { type: 'place', id: 'card-9-1', zone: 'emz', index: 1, pos: 'atk', how: 'special' },
        ])
        render(<Harness initial={initial} cards={cards} />)

        fireEvent.click(screen.getByRole('button', { name: 'Extra: 1' }))
        fireEvent.click(within(screen.getByRole('dialog', { name: 'Extra · 1' })).getByRole('button', { name: 'Zeus' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'Invocación Especial' }))
        fireEvent.click(screen.getByRole('menuitem', { name: 'En ataque' }))
        const material = ash()
        tap(material)
        tap(material)

        // Antes se invocaba solo en la única casilla libre (la del material).
        expect(within(status()).getByText(/^Tocá la zona para/)).toBeInTheDocument()
        expect(within(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' })).queryByRole('button', { name: /^Zeus/ })).not.toBeInTheDocument()
        tap(within(screen.getByRole('button', { name: 'Zona de monstruo 1: elegir' })).getByRole('button', { name: 'Ash Blossom (Material)' }))
        expect(within(zone('Zona de monstruo 1')).getByRole('button', { name: 'Zeus, con 1 material' })).toBeInTheDocument()
      } finally {
        window.matchMedia = matchMedia
      }
    })

    it('si el segundo toque llega tarde, deselecciona como siempre', () => {
      const matchMedia = window.matchMedia
      const now = vi.spyOn(Date, 'now')
      asDesktop()

      try {
        startXyz()
        now.mockReturnValue(1_000)
        tap(ash())
        now.mockReturnValue(1_000 + 900)
        tap(ash())

        expect(isMaterial(ash())).toBe(false)
        expect(within(status()).getByText('Materiales (opcionales): tocalos en el campo (0) y confirmá, o tocá una casilla para invocar')).toBeInTheDocument()
      } finally {
        now.mockRestore()
        window.matchMedia = matchMedia
      }
    })

    it('con dos materiales o sobre otra carta no confirma: hay que usar el botón', () => {
      const matchMedia = window.matchMedia
      asDesktop()

      try {
        startXyz(true)
        const maxx = () => within(zone('Zona de monstruo 2')).getByRole('button', { name: /^Maxx C/ })
        tap(ash())
        tap(maxx())
        tap(maxx())

        // Ash sigue elegida, Maxx C se deseleccionó: sigue pidiendo materiales.
        expect(isMaterial(ash())).toBe(true)
        expect(isMaterial(maxx())).toBe(false)
        expect(within(status()).getByText('Con un solo material, doble clic en él para invocar')).toBeInTheDocument()

        // Con Ash ya elegida, otro toque rápido a Maxx C (el mismo del toque anterior) la suma: son dos y nada se confirma.
        tap(maxx())
        expect(within(status()).getByText('Materiales (opcionales): tocalos en el campo (2) y confirmá, o tocá una casilla para invocar')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Invocar' })).toBeEnabled()
      } finally {
        window.matchMedia = matchMedia
      }
    })

    it('el segundo toque tiene que ser a la misma carta que el primero', () => {
      const matchMedia = window.matchMedia
      asDesktop()

      try {
        startXyz(true)
        const maxx = () => within(zone('Zona de monstruo 2')).getByRole('button', { name: /^Maxx C/ })
        tap(ash())
        tap(maxx())
        tap(maxx())
        // Sólo Ash quedó elegida, pero el toque anterior fue a Maxx C: tocar Ash la deselecciona, no confirma.
        tap(ash())

        expect(isMaterial(ash())).toBe(false)
        expect(within(status()).getByText('Materiales (opcionales): tocalos en el campo (0) y confirmá, o tocá una casilla para invocar')).toBeInTheDocument()
      } finally {
        window.matchMedia = matchMedia
      }
    })

    it('en el celular dos toques seguidos no confirman', () => {
      startXyz()
      tap(ash())
      expect(within(status()).getByText('Materiales (opcionales): tocalos en el campo (1) y confirmá, o tocá una casilla para invocar')).toBeInTheDocument()
      tap(ash())

      expect(isMaterial(ash())).toBe(false)
      expect(within(status()).getByText('Materiales (opcionales): tocalos en el campo (0) y confirmá, o tocá una casilla para invocar')).toBeInTheDocument()
    })
  })

})
