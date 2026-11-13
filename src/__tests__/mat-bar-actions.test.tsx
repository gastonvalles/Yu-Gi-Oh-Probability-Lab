// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import { setDuelFullscreen, useDuelFullscreen } from '../app/duel-fullscreen'
import { MAT_STEPS_KEY } from '../app/mat-panels'
import { useMatSession } from '../app/use-mat-session'
import { AutoSoloScreen, type AutoSoloScreenProps } from '../components/auto/AutoSoloScreen'
import { PracticeMat } from '../components/probability/PracticeMat'
import { CARDS as AUTO_CARDS, fakeSession, type FakeSession } from './support/auto-session-fake'
import { openOptions, optionRow } from './support/mat-menu'
import { core, dispatches, renderAuto } from './support/auto-screen-harness'
import { CARDS, INITIAL, render } from './support/practice-mat-harness'

// La barra de arriba de la mesa es una sola (`MatBarActions`): la práctica y «Jugar solo automático» llevan los mismos íconos, en el mismo orden, con los mismos nombres y estados
// (Gastón, 2026-10-25: «TODAS las mesas deberían ser iguales… menos las opciones de cada una»): a la vista sólo salir, deshacer y el ⋯ (Gastón, 2026-10-26: «muchos íconos juntos»), y en el
// ⋯ lo demás, con el estado de cada ajuste en su interruptor. El automático no tiene ⋯ (Gastón, 2026-11-12): lo mismo va en su ⚙; «Nueva mano» es otro duelo, la ventana grande se apaga al salir
// y deshacer va abajo hasta 1100 px.

const ASH = { id: 14558127, name: 'Ash Blossom & Joyous Spring' }
type Options = Parameters<NonNullable<AutoSoloScreenProps['connect']>>[1]

/** La práctica con su flecha de salir (como la arma «Jugar solo»). */
function Practice() {
  const mat = useMatSession()
  const { start } = mat

  useEffect(() => start(INITIAL, [], {}), [start])

  return mat.session && mat.state ? <PracticeMat session={mat.session} state={mat.state} cardsById={CARDS} deckName="Test" onDispatch={mat.dispatch} onUndo={mat.undo} onSeek={mat.seek} onLoadCombo={() => {}} onNewHand={() => {}} onExit={() => {}} /> : null
}

/** Escritorio (desde 1101 px; `wide`, desde 1440): jsdom es un celular. */
const desktop = (wide = true) => {
  window.matchMedia = ((query: string) => ({ matches: query === '(min-width: 1101px)' || (wide && query === '(min-width: 1440px)') || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
}

/** Los botones de la barra de arriba («Mesa»), con lo que se ve y lo que se lee de cada uno. */
const barButtons = () =>
  within(screen.getByRole('toolbar', { name: 'Mesa' }))
    .getAllByRole('button')
    .map((button) => ({ name: button.getAttribute('aria-label'), title: button.getAttribute('title'), pressed: button.getAttribute('aria-pressed'), disabled: (button as HTMLButtonElement).disabled }))

/** Abre el ⋯ de la barra (si no está abierto) y devuelve sus filas: lo que dicen, si son un ajuste prendido o apagado y si se pueden tocar. */
const menuRows = () => {
  if (!screen.queryByRole('menu')) fireEvent.click(within(screen.getByRole('toolbar', { name: 'Mesa' })).getByRole('button', { name: 'Más opciones' }))
  return rowsOfMenu().map((row) => ({ text: row.textContent, checked: row.getAttribute('aria-checked'), disabled: (row as HTMLButtonElement).disabled }))
}
/** Las filas del ⋯ abierto (`menuitem` y, los ajustes, `menuitemcheckbox`). */
const rowsOfMenu = () => [...screen.getByRole('menu').querySelectorAll<HTMLElement>('[role^="menuitem"]')]
/** Una fila del ⋯ (lo abre si hace falta). */
const menuRow = (name: RegExp) => {
  menuRows()
  const row = rowsOfMenu().find((element) => name.test(element.textContent ?? ''))

  if (!row) throw new Error(`No hay una fila ${name} en el ⋯`)
  return row
}

/** La pantalla automática con una sesión de mentira por cada `connect` (con semilla 99; reiniciar con otra semilla la cambia), y lo que se le pidió a cada una. */
function mountAuto() {
  const calls: Options[] = []
  const fakes: FakeSession[] = []

  render(
    <AutoSoloScreen
      mainIds={[...AUTO_CARDS.keys()].filter((id) => id !== 'card-500-1')}
      extraIds={['card-500-1']}
      cardsById={AUTO_CARDS}
      deckName="Test"
      onExit={() => {}}
      connect={(_deck, options) => {
        const fake = fakeSession()
        const restart = fake.restart

        fake.set({ seed: 99, names: { ...fake.getSnapshot().names, [ASH.id]: ASH.name } })
        fake.restart = vi.fn((seed?: number) => {
          restart()
          fake.set({ seed: seed ?? fake.getSnapshot().seed, status: 'ready', replaying: false })
        })
        calls.push(options)
        fakes.push(fake)

        return fake
      }}
    />,
  )

  return { calls, fakes }
}

// La ventana grande vive fuera de React: que una prueba que falla no la deje prendida para la siguiente.
afterEach(() => act(() => setDuelFullscreen(false)))

describe('la barra de la mesa es una sola', () => {
  it('la práctica lleva arriba salir, deshacer, el ⋯ y sus pasos; «Jugar solo automático» no tiene ⋯ (Gastón, 2026-11-12: «compite con el de configuración»): todo va en ⚙, en «La mesa» y «El duelo», sin repetir nada (en el celular y en escritorio)', () => {
    for (const layout of ['celular', 'escritorio'] as const) {
      if (layout === 'escritorio') desktop()
      render(<Practice />)
      const practice = barButtons()
      const practiceRows = menuRows()

      cleanup()
      renderAuto()
      const auto = barButtons()

      // El automático: hasta 1100 px su barra lleva sólo la flecha (Deshacer va abajo, con el ⚙); en escritorio, Deshacer arriba (la flecha va fuera de la fila de íconos). Sin ⋯.
      expect(auto.map((button) => button.name)).toEqual(layout === 'celular' ? ['Volver a Jugar'] : ['Deshacer'])
      expect(screen.queryByRole('button', { name: 'Más opciones' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Volver a Jugar' })).toBeInTheDocument()
      expect(practice.map((button) => button.name)).toEqual(['Volver a Jugar', 'Deshacer', 'Más opciones', 'Pasos y combos'])
      // Ningún ícono de la barra queda en ámbar por un ajuste prendido: ninguno lleva `aria-pressed`.
      expect([...practice, ...auto].filter((button) => button.pressed !== null)).toEqual([])
      // La práctica no cambia: «La mesa» con sus interruptores (la vista 3D y los sonidos vienen prendidos) y «El duelo».
      expect(practiceRows).toEqual([
        { text: 'Vista 3D', checked: 'true', disabled: false },
        { text: 'Sonidos', checked: 'true', disabled: false },
        ...(layout === 'escritorio' ? [{ text: 'Ventana grande', checked: 'false', disabled: false }] : []),
        { text: 'Handtraps del rivalapagadas', checked: null, disabled: false },
        { text: 'Nueva mano', checked: null, disabled: false },
        { text: 'Guardar combosin jugadas', checked: null, disabled: true },
      ])
      // El ⚙ del automático: «La mesa» (la vista 3D, los sonidos, la ventana grande en escritorio, los colores y los menús flotantes) y «El duelo», con «Rival» una sola vez y «Rendirse» al final.
      const dialog = openOptions()
      const table = within(within(dialog).getByRole('group', { name: 'La mesa' }))
      const duel = within(dialog).getByRole('group', { name: 'El duelo' })
      const duelRows = within(duel).getAllByRole('button').map((button) => button.getAttribute('aria-label'))

      expect(table.getAllByRole('switch').map((element) => element.getAttribute('aria-label'))).toEqual(['Vista 3D', 'Sonidos', ...(layout === 'escritorio' ? ['Ventana grande'] : []), 'Menús flotantes'])
      expect(table.getByRole('group', { name: 'Colores' })).toBeInTheDocument()
      expect(duelRows.filter((name) => name === 'Cambiar rival')).toHaveLength(1)
      expect(duelRows).toEqual(expect.arrayContaining(['Cambiar rival', 'Nueva mano', 'Guardar combo', 'Reiniciar el mismo duelo']))
      expect(within(duel).getByRole('button', { name: 'Guardar combo' })).toBeDisabled()
      expect(duelRows.at(-1)).toBe('Rendirse')
      cleanup()
    }
  })

  it('«Nueva mano» del automático es otro duelo, con otra semilla (sin volver a cargar el núcleo), y cambiar las handtraps después sigue con esa mano; «Reiniciar el mismo duelo» repite la semilla', () => {
    const { calls, fakes } = mountAuto()
    const first = fakes[0]!

    fireEvent.click(optionRow('Nueva mano'))
    expect(first.restart).toHaveBeenCalledTimes(1)
    const seed = vi.mocked(first.restart).mock.calls[0]![0]

    expect(seed).toEqual(expect.any(Number))
    expect(seed).not.toBe(99)
    expect(calls).toHaveLength(1)

    // Las handtraps desde Opciones: «Cambiar rival» abre su hoja y, con Handtraps, «Elegir…» la del automático; al aplicar, el duelo se arma de nuevo con la mano de ahora.
    fireEvent.click(optionRow('Cambiar rival'))
    const rivalSheet = screen.getByRole('dialog', { name: 'Rival' })

    fireEvent.click(within(rivalSheet).getByRole('radio', { name: 'Handtraps' }))
    fireEvent.click(within(rivalSheet).getByRole('button', { name: 'Elegir… las handtraps del rival' }))
    const sheet = screen.getByRole('dialog', { name: 'Handtraps del rival' })

    expect(sheet).toHaveTextContent('Al aplicar, el duelo empieza de nuevo.')
    fireEvent.click(within(within(sheet).getByRole('group', { name: `Copias de ${ASH.name} en el deck del rival` })).getByRole('button', { name: 'Uno más' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Usar estas handtraps' }))
    expect(calls).toHaveLength(2)
    expect(calls[1]).toMatchObject({ seed })
    expect(calls[1]!.rival!.main).toContainEqual([ASH.id, 2])
    expect(first.destroyed).toBe(true)

    fireEvent.click(within(openOptions()).getByRole('button', { name: 'Reiniciar el mismo duelo' }))
    expect(fakes[1]!.restart).toHaveBeenCalledWith()
    expect(dispatches).toBe(0)
  })

  it('la ventana grande: su interruptor de Opciones del automático la prende (en escritorio; el panel sigue abierto y dice que está prendida) y salir de la mesa la apaga', () => {
    desktop()
    renderAuto()
    fireEvent.click(optionRow('Ventana grande'))
    expect(optionRow('Ventana grande')).toHaveAttribute('aria-checked', 'true')

    cleanup()
    expect(renderHook(() => useDuelFullscreen()).result.current).toBe(false)
  })

  it('deshacer del automático va abajo hasta 1100 px (Gastón, 2026-11-12: «debería estar abajo, no arriba»), el primero de la botonera y de 44 px: apagado sin una orden tuya; con una, deshace la última. En escritorio, arriba', () => {
    const fake = renderAuto()
    const undo = () => screen.getByRole('button', { name: 'Deshacer' })

    expect(screen.getAllByRole('button', { name: 'Deshacer' })).toHaveLength(1)
    expect(within(screen.getByRole('toolbar', { name: 'Mesa' })).queryByRole('button', { name: 'Deshacer' })).toBeNull()
    expect([...undo().parentElement!.children].map((element) => element.getAttribute('aria-label'))).toEqual(['Deshacer', 'Pasos y combos', 'Botonera del duelo'])
    expect(undo()).toHaveClass('size-11')
    expect(undo()).toBeDisabled()

    core(() => fake.set({ answers: [{ seat: 0, answer: { type: 'select_idlecmd', action: 0, index: 0 } }] }))
    expect(undo()).toBeEnabled()
    fireEvent.click(undo())
    expect(fake.undos).toBe(1)
    // Mientras el núcleo vuelve atrás, apagado.
    expect(undo()).toBeDisabled()
    cleanup()

    // En escritorio (el mouse), arriba con los íconos, y la botonera no lo repite.
    desktop()
    renderAuto()
    expect(screen.getAllByRole('button', { name: 'Deshacer' })).toHaveLength(1)
    expect(within(screen.getByRole('toolbar', { name: 'Mesa' })).getByRole('button', { name: 'Deshacer' })).toBe(undo())
  })

  it('en escritorio (opción D2, «esquinas sin caja»): cada vida en su esquina, plana (Gastón: «la vida de ambos jugadores junta»): el rival arriba a la derecha del campo, junto a su mano, y vos abajo a la izquierda, junto a la tuya; la fase, sólo en su botón', () => {
    const field = () => screen.getByLabelText('Campo')
    const after = (element: HTMLElement) => Boolean(field().compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)

    desktop()
    renderAuto()
    const rival = screen.getByRole('group', { name: 'Puntos de vida de Rival: 8000' })
    const mine = screen.getByRole('group', { name: 'Puntos de vida de Vos: 8000' })

    expect(rival.closest('[data-corner="theirs"]')).not.toBeNull()
    expect(mine.closest('[data-corner="mine"]')).not.toBeNull()
    // Plana: el nombre y el número grande (33 px), sin placa, barra de 8000 ni cartas en la mano.
    expect(rival).toHaveTextContent(/^Rival8000$/)
    expect(mine).toHaveTextContent(/^Vos8000$/)
    expect(mine.querySelector('.text-stat')).toHaveTextContent('8000')
    expect(document.querySelector('.life-plate, [role="meter"]')).toBeNull()
    expect(after(rival)).toBe(false)
    expect(after(mine)).toBe(true)
    expect(within(screen.getByRole('toolbar', { name: 'Mesa' })).queryByRole('group', { name: /^Puntos de vida/ })).toBeNull()
    // La fase, una sola vez: sin píldora en la barra; su botón va en el medio del campo, entre las dos Zonas Extra (`p2`).
    expect(screen.queryByTestId('auto-phase')).toBeNull()
    expect(screen.getByRole('button', { name: /^Fases: [A-Z][a-z]+ Phase( 1| 2)?$/ }).parentElement).toHaveStyle({ gridArea: 'p2' })
  })

  it('en el celular en vertical las vidas salen del marcador: tu chapa abajo, con la botonera a la derecha (↶ ≡ ⚙), y la del rival en la barra; sin ⋯', () => {
    const original = window.matchMedia

    onTestFinished(() => {
      window.matchMedia = original
    })
    window.matchMedia = ((query: string) => ({ matches: query === '(max-width: 639.98px)', media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    renderAuto()

    expect(screen.queryByTestId('auto-score')).toBeNull()
    const seat = document.querySelector<HTMLElement>('[data-mat-seat]')!
    const mine = within(seat).getByRole('group', { name: 'Puntos de vida de Vos: 8000' })

    expect(mine).toHaveAttribute('data-life-badge')
    expect(within(seat).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Deshacer', 'Pasos y combos', 'Opciones'])
    expect(within(screen.getByRole('toolbar', { name: 'Mesa' })).getByRole('group', { name: 'Puntos de vida de Rival: 8000' })).toHaveAttribute('data-life-badge')
    expect(document.querySelector('[data-corner="theirs"]')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Más opciones' })).toBeNull()
  })

  it('de 640 a 1100 px (la tableta) es la mesa del celular: tu chapa abajo y la del rival en la barra, sin marcador plano ni el turno dicho con texto, ↶ ≡ ⚙ a la derecha, el botón de la fase sólo con su sigla y los avisos van arriba', () => {
    const original = window.matchMedia

    onTestFinished(() => {
      window.matchMedia = original
    })
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    renderAuto()

    expect(screen.queryByTestId('auto-score')).toBeNull()
    expect(screen.queryByTestId('auto-turn')).toBeNull()
    // El `body` lo dice (hasta 1100 px los avisos van arriba: index.css).
    expect(document.body.dataset.duel).toBe('solo')
    // El botón de la fase, sólo con su sigla de dos letras en todos los anchos (Gastón, 2026-10-27); el nombre completo lo oye el lector de pantalla.
    expect(screen.getByRole('button', { name: /^Fases: [A-Z][a-z]+ Phase( 1| 2)?$/ })).toHaveTextContent(/^(DP|SP|M1|BP|M2|EP)$/)
    expect(screen.getByRole('button', { name: /^Fases: / })).toHaveClass('size-11')

    const seat = document.querySelector<HTMLElement>('[data-mat-seat]')!

    expect(within(seat).getByRole('group', { name: 'Puntos de vida de Vos: 8000' })).toHaveAttribute('data-life-badge')
    expect(within(screen.getByRole('toolbar', { name: 'Mesa' })).getByRole('group', { name: 'Puntos de vida de Rival: 8000' })).toHaveAttribute('data-life-badge')
    expect(document.querySelector('[data-corner]')).toBeNull()
    expect(screen.getAllByRole('group', { name: /^Puntos de vida/ })).toHaveLength(2)
    expect(screen.queryByTestId('auto-phase')).toBeNull()
    // Sin ⋯: Deshacer, «Pasos y combos» y el ⚙, a la derecha de tu fila de abajo.
    const steps = screen.getByRole('button', { name: 'Pasos y combos' })

    expect([...steps.parentElement!.children].map((element) => element.getAttribute('aria-label'))).toEqual(['Deshacer', 'Pasos y combos', 'Botonera del duelo'])
    expect(screen.queryByRole('button', { name: 'Más opciones' })).toBeNull()
    fireEvent.click(steps)
    expect(screen.getByRole('dialog', { name: 'Pasos y combos' })).toBeInTheDocument()
  })

  it('el panel de Pasos va plegado de fábrica por debajo de 1440 px (el campo gana alto) y abierto desde 1440; lo elegido con ≡ se recuerda y manda en todos los anchos; plegado, «Guardar combo» sigue en ⚙', () => {
    localStorage.removeItem(MAT_STEPS_KEY)
    onTestFinished(() => localStorage.removeItem(MAT_STEPS_KEY))
    const steps = () => within(screen.getByRole('group', { name: 'Botonera del duelo' })).getByRole('button', { name: /^Pasos/ })

    desktop(false)
    renderAuto(fakeSession())
    expect(screen.queryByRole('region', { name: 'Pasos y combos' })).toBeNull()
    expect(steps()).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(screen.getByRole('button', { name: /^Opciones/ }))
    expect(within(screen.getByRole('dialog', { name: 'Opciones' })).getByRole('button', { name: 'Guardar combo' })).toBeInTheDocument()
    cleanup()

    // Abierto a mano a 1101 px: se queda abierto al volver; plegado a mano a 1440, se queda plegado.
    renderAuto(fakeSession())
    fireEvent.click(steps())
    expect(localStorage.getItem(MAT_STEPS_KEY)).toBe('open')
    cleanup()
    renderAuto(fakeSession())
    expect(screen.getByRole('region', { name: 'Pasos y combos' })).toBeInTheDocument()
    cleanup()

    desktop()
    localStorage.setItem(MAT_STEPS_KEY, 'closed')
    renderAuto(fakeSession())
    expect(screen.queryByRole('region', { name: 'Pasos y combos' })).toBeNull()
  })

  it('las herramientas de escritorio, dos cuadrados de 44 px: ≡ oculta y muestra los pasos y ⚙ abre Opciones (la vista 3D, los menús flotantes, la cadena, la casilla, el modo manual, reiniciar y, al final, Rendirse)', () => {
    onTestFinished(() => localStorage.removeItem(MAT_STEPS_KEY))
    desktop()
    const onManual = vi.fn()
    renderAuto(fakeSession(), () => {}, onManual)
    const tools = screen.getByRole('group', { name: 'Botonera del duelo' })
    const button = (name: RegExp) => within(tools).getByRole('button', { name })

    expect(within(tools).getAllByRole('button').map((element) => element.getAttribute('aria-label'))).toEqual(['Pasos y combos', 'Opciones'])
    for (const element of within(tools).getAllByRole('button')) expect(element).toHaveClass('size-11')
    expect(screen.queryByText('Automático')).toBeNull()

    expect(screen.getByRole('region', { name: 'Pasos y combos' })).toBeInTheDocument()
    fireEvent.click(button(/^Pasos/))
    expect(button(/^Pasos/)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('region', { name: 'Pasos y combos' })).toBeNull()
    fireEvent.click(button(/^Pasos/))
    expect(screen.getByRole('region', { name: 'Pasos y combos' })).toBeInTheDocument()

    // Opciones trae todo, con Rendirse al final.
    fireEvent.click(button(/^Opciones/))
    const more = screen.getByRole('dialog', { name: 'Opciones' })

    expect(within(more).getAllByRole('switch').slice(0, 4).map((element) => element.getAttribute('aria-label'))).toEqual(['Vista 3D', 'Sonidos', 'Ventana grande', 'Menús flotantes'])
    expect(within(more).getByRole('radiogroup', { name: 'Respuestas' })).toBeInTheDocument()
    expect(within(more).getByRole('radiogroup', { name: 'Casilla' })).toBeInTheDocument()
    expect(within(more).getByRole('button', { name: 'Reiniciar el mismo duelo' })).toBeInTheDocument()
    expect(within(more).getAllByRole('button').at(-1)).toHaveAccessibleName('Rendirse')
    fireEvent.click(within(more).getByRole('button', { name: 'Seguir en modo manual' }))
    expect(onManual).toHaveBeenCalledWith(null)
  })

  it('la hoja de las handtraps de la práctica sigue diciendo que aplicar reparte otra mano', () => {
    render(<Practice />)
    fireEvent.click(menuRow(/^Handtraps del rival/))

    expect(screen.getByRole('dialog', { name: 'Handtraps del rival' })).toHaveTextContent('Al aplicar, se reparte una mano nueva.')
  })
})
