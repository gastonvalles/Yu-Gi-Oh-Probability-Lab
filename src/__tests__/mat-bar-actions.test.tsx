// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'

import { setDuelFullscreen, useDuelFullscreen } from '../app/duel-fullscreen'
import { useMatSession } from '../app/use-mat-session'
import { AutoSoloScreen, type AutoSoloScreenProps } from '../components/auto/AutoSoloScreen'
import { PracticeMat } from '../components/probability/PracticeMat'
import { CARDS as AUTO_CARDS, fakeSession, type FakeSession } from './support/auto-session-fake'
import { core, dispatches, renderAuto } from './support/auto-screen-harness'
import { CARDS, INITIAL, render } from './support/practice-mat-harness'

// La barra de arriba de la mesa es una sola (`MatBarActions`): la práctica y «Jugar solo automático» llevan los mismos íconos, en el mismo orden, con los mismos nombres y estados
// (Gastón, 2026-10-25: «TODAS las mesas deberían ser iguales… menos las opciones de cada una»): a la vista sólo salir, deshacer y el ⋯ (Gastón, 2026-10-26: «muchos íconos juntos»), y en el
// ⋯ lo demás, con el estado de cada ajuste en su interruptor. Lo del automático: «Nueva mano» es otro duelo, la ventana grande se apaga al salir y deshacer va arriba.

const ASH = { id: 14558127, name: 'Ash Blossom & Joyous Spring' }
type Options = Parameters<NonNullable<AutoSoloScreenProps['connect']>>[1]

/** La práctica con su flecha de salir (como la arma «Jugar solo»). */
function Practice() {
  const mat = useMatSession()
  const { start } = mat

  useEffect(() => start(INITIAL, [], {}), [start])

  return mat.session && mat.state ? <PracticeMat session={mat.session} state={mat.state} cardsById={CARDS} deckName="Test" onDispatch={mat.dispatch} onUndo={mat.undo} onSeek={mat.seek} onLoadCombo={() => {}} onNewHand={() => {}} onExit={() => {}} /> : null
}

/** Escritorio (desde 1101 px): jsdom es un celular. */
const desktop = () => {
  window.matchMedia = ((query: string) => ({ matches: query === '(min-width: 1101px)' || query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
}

/** Los botones de la barra de arriba («Mesa»), con lo que se ve y lo que se lee de cada uno. */
const barButtons = () =>
  within(screen.getByRole('toolbar', { name: 'Mesa' }))
    .getAllByRole('button')
    .map((button) => ({ name: button.getAttribute('aria-label'), title: button.getAttribute('title'), pressed: button.getAttribute('aria-pressed'), disabled: (button as HTMLButtonElement).disabled }))

/** Lo que tiene que ser igual en las dos mesas: deshacer y el ⋯. */
const shared = (buttons: ReturnType<typeof barButtons>) => buttons.slice(buttons.findIndex((button) => button.name === 'Deshacer'), buttons.findIndex((button) => button.name === 'Más opciones') + 1)

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
  it('la práctica y «Jugar solo automático» llevan arriba la flecha de volver y los mismos íconos, en el mismo orden, con los mismos nombres y estados; después, lo de cada una (en el celular y en escritorio)', () => {
    for (const layout of ['celular', 'escritorio'] as const) {
      if (layout === 'escritorio') desktop()
      render(<Practice />)
      const practice = barButtons()
      const practiceRows = menuRows()

      cleanup()
      renderAuto()
      const auto = barButtons()
      const autoRows = menuRows()

      expect(shared(auto)).toEqual(shared(practice))
      // A la vista, tres: salir, deshacer y el ⋯ (en el celular la hamburguesa del armazón es la cuarta; en escritorio la flecha del automático va fuera de la fila de íconos); la práctica suma sus pasos.
      expect(auto.map((button) => button.name)).toEqual([...(layout === 'celular' ? ['Volver a Jugar'] : []), 'Deshacer', 'Más opciones'])
      expect(screen.getByRole('button', { name: 'Volver a Jugar' })).toBeInTheDocument()
      expect(practice.map((button) => button.name)).toEqual(['Volver a Jugar', 'Deshacer', 'Más opciones', 'Pasos y combos'])
      // Ningún ícono de la barra queda en ámbar por un ajuste prendido: ninguno lleva `aria-pressed`.
      expect([...practice, ...auto].filter((button) => button.pressed !== null)).toEqual([])
      // En el ⋯, lo mismo en las dos y en el mismo orden: «La mesa» con sus interruptores (la vista 3D y los sonidos vienen prendidos) y «El duelo»; el automático suma sus opciones en el celular (en escritorio están en la botonera).
      expect(practiceRows).toEqual([
        { text: 'Vista 3D', checked: 'true', disabled: false },
        { text: 'Sonidos', checked: 'true', disabled: false },
        ...(layout === 'escritorio' ? [{ text: 'Ventana grande', checked: 'false', disabled: false }] : []),
        { text: 'Handtraps del rivalapagadas', checked: null, disabled: false },
        { text: 'Nueva mano', checked: null, disabled: false },
        { text: 'Guardar combosin jugadas', checked: null, disabled: true },
      ])
      // Hasta 1100 px el automático no tiene fila de abajo: «Pasos y combos» va primero.
      const steps = layout === 'escritorio' ? [] : [{ text: 'Pasos y combos', checked: null, disabled: false }]

      expect(autoRows).toEqual([...steps, ...practiceRows, ...(layout === 'escritorio' ? [] : [{ text: 'Opciones del duelo', checked: null, disabled: false }])])
      expect(within(screen.getByRole('menu')).getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual(['La mesa', 'El duelo'])
      cleanup()
    }
  })

  it('«Nueva mano» del automático es otro duelo, con otra semilla (sin volver a cargar el núcleo), y cambiar las handtraps después sigue con esa mano; «Reiniciar el mismo duelo» repite la semilla', () => {
    const { calls, fakes } = mountAuto()
    const first = fakes[0]!

    fireEvent.click(menuRow(/^Nueva mano/))
    expect(first.restart).toHaveBeenCalledTimes(1)
    const seed = vi.mocked(first.restart).mock.calls[0]![0]

    expect(seed).toEqual(expect.any(Number))
    expect(seed).not.toBe(99)
    expect(calls).toHaveLength(1)

    // Las handtraps desde la barra (como en la práctica): la hoja es la del automático y, al aplicar, el duelo se arma de nuevo con la mano de ahora.
    fireEvent.click(menuRow(/^Handtraps del rival/))
    const sheet = screen.getByRole('dialog', { name: 'Handtraps del rival' })

    expect(sheet).toHaveTextContent('Al aplicar, el duelo empieza de nuevo.')
    fireEvent.click(within(within(sheet).getByRole('group', { name: `Copias de ${ASH.name} en el deck del rival` })).getByRole('button', { name: 'Uno más' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Usar estas handtraps' }))
    expect(calls).toHaveLength(2)
    expect(calls[1]).toMatchObject({ seed })
    expect(calls[1]!.rival!.main).toContainEqual([ASH.id, 2])
    expect(first.destroyed).toBe(true)

    fireEvent.click(menuRow(/^Opciones del duelo/))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Más opciones del duelo' })).getByRole('button', { name: 'Reiniciar el mismo duelo' }))
    expect(fakes[1]!.restart).toHaveBeenCalledWith()
    expect(dispatches).toBe(0)
  })

  it('la ventana grande: su interruptor del ⋯ del automático la prende (en escritorio; el menú sigue abierto y dice que está prendida) y salir de la mesa la apaga', () => {
    desktop()
    renderAuto()
    fireEvent.click(menuRow(/^Ventana grande/))
    expect(menuRow(/^Ventana grande/)).toHaveAttribute('aria-checked', 'true')

    cleanup()
    expect(renderHook(() => useDuelFullscreen()).result.current).toBe(false)
  })

  it('deshacer del automático va arriba, con los íconos (abajo ya no hay): apagado sin una orden tuya; con una, deshace la última', () => {
    const fake = renderAuto()
    const undo = () => screen.getByRole('button', { name: 'Deshacer' })

    expect(screen.getAllByRole('button', { name: 'Deshacer' })).toHaveLength(1)
    expect(within(screen.getByRole('toolbar', { name: 'Mesa' })).getByRole('button', { name: 'Deshacer' })).toBe(undo())
    expect(undo()).toBeDisabled()

    core(() => fake.set({ answers: [{ seat: 0, answer: { type: 'select_idlecmd', action: 0, index: 0 } }] }))
    expect(undo()).toBeEnabled()
    fireEvent.click(undo())
    expect(fake.undos).toBe(1)
    // Mientras el núcleo vuelve atrás, apagado.
    expect(undo()).toBeDisabled()
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
    expect(mine.lastElementChild).toHaveClass('text-stat')
    expect(document.querySelector('.life-plate, [role="meter"]')).toBeNull()
    expect(after(rival)).toBe(false)
    expect(after(mine)).toBe(true)
    expect(within(screen.getByRole('toolbar', { name: 'Mesa' })).queryByRole('group', { name: /^Puntos de vida/ })).toBeNull()
    // La fase, una sola vez: sin píldora en la barra; el botón del campo, sólo con su sigla (el nombre, en su `aria-label`).
    expect(screen.queryByTestId('auto-phase')).toBeNull()
    expect(screen.getByRole('button', { name: /^Fases: [A-Z][a-z]+ Phase( 1| 2)?$/ })).toHaveTextContent(/^(DP|SP|M1|BP|M2|EP)$/)
  })

  it.each([
    ['en el celular en vertical', true],
    ['de 640 a 1100 px', false],
  ])('%s (opción A, «Marcador arriba»): las vidas van en el marcador de la barra, no hay fila de abajo, «Pasos y combos» es lo primero del ⋯, el botón de la fase sólo con su sigla y los avisos van arriba', (_, phone) => {
    const original = window.matchMedia

    onTestFinished(() => {
      window.matchMedia = original
    })
    window.matchMedia = ((query: string) => ({ matches: phone && query === '(max-width: 639.98px)', media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    renderAuto()
    const score = screen.getByTestId('auto-score')

    // El `body` lo dice (hasta 1100 px los avisos van arriba: index.css).
    expect(document.body.dataset.duel).toBe('solo')
    // El botón de la fase, sólo con su sigla de dos letras en todos los anchos (Gastón, 2026-10-27); el nombre completo lo oye el lector de pantalla.
    expect(screen.getByRole('button', { name: /^Fases: [A-Z][a-z]+ Phase( 1| 2)?$/ })).toHaveTextContent(/^(DP|SP|M1|BP|M2|EP)$/)
    expect(screen.getByRole('button', { name: /^Fases: / })).toHaveClass('size-11')

    expect(within(score).getByRole('group', { name: 'Puntos de vida de Vos: 8000' })).toBeInTheDocument()
    expect(within(score).getByRole('group', { name: 'Puntos de vida de Rival: 8000' })).toBeInTheDocument()
    expect(document.querySelector('[data-corner]')).toBeNull()
    expect(screen.getAllByRole('group', { name: /^Puntos de vida/ })).toHaveLength(2)
    expect(screen.queryByTestId('auto-phase')).toBeNull()
    // Sin fila de abajo: el único «Pasos y combos» es el del ⋯, primero.
    expect(screen.queryByRole('button', { name: 'Pasos y combos' })).toBeNull()
    expect(menuRows()[0]!.text).toBe('Pasos y combos')
    fireEvent.click(menuRow(/^Pasos y combos$/))
    expect(screen.getByRole('dialog', { name: 'Pasos y combos' })).toBeInTheDocument()
  })

  it('la botonera de escritorio: «Automático» (prendido) abre «Seguir en modo manual», «Cadena» cambia las respuestas, «Pasos» oculta y muestra el panel, «Opciones» trae el resto de «Más opciones»', () => {
    desktop()
    const onManual = vi.fn()
    renderAuto(fakeSession(), () => {}, onManual)
    const dock = screen.getByRole('group', { name: 'Botonera del duelo' })
    const button = (name: RegExp) => within(dock).getByRole('button', { name })

    expect(within(dock).getAllByRole('button').map((element) => element.textContent)).toEqual(['Automático', 'Cadena', 'Pasos', 'Opciones'])
    // El modo de ahora: prendido. El camino de vuelta (de manual a automático) no existe: tocarlo es «Seguir en modo manual» (sin una jugada tuya todavía, una mano nueva en la mesa manual, sin diálogo).
    expect(button(/^Automático/)).toHaveAccessibleName('Automático: seguir en modo manual')
    expect(button(/^Automático/)).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button(/^Automático/))
    expect(onManual).toHaveBeenCalledWith(null)

    fireEvent.click(button(/^Cadena/))
    const chain = screen.getByRole('dialog', { name: 'Respuestas a la cadena' })

    fireEvent.click(within(chain).getByRole('radio', { name: 'Siempre' }))
    expect(button(/^Cadena/)).toHaveAccessibleName('Cadena: Siempre')
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(screen.getByRole('region', { name: 'Pasos y combos' })).toBeInTheDocument()
    fireEvent.click(button(/^Pasos/))
    expect(button(/^Pasos/)).toHaveAttribute('aria-pressed', 'false')
    expect(screen.queryByRole('region', { name: 'Pasos y combos' })).toBeNull()
    fireEvent.click(button(/^Pasos/))
    expect(screen.getByRole('region', { name: 'Pasos y combos' })).toBeInTheDocument()

    // Lo que tiene botón en la botonera no se repite en «Opciones».
    fireEvent.click(button(/opciones/i))
    const more = screen.getByRole('dialog', { name: 'Más opciones del duelo' })

    expect(within(more).getByRole('radiogroup', { name: 'Casilla' })).toBeInTheDocument()
    expect(within(more).queryByRole('radiogroup', { name: 'Respuestas' })).toBeNull()
    expect(within(more).queryByRole('button', { name: 'Seguir en modo manual' })).toBeNull()
    expect(within(more).getByRole('button', { name: 'Reiniciar el mismo duelo' })).toBeInTheDocument()
  })

  it('la hoja de las handtraps de la práctica sigue diciendo que aplicar reparte otra mano', () => {
    render(<Practice />)
    fireEvent.click(menuRow(/^Handtraps del rival/))

    expect(screen.getByRole('dialog', { name: 'Handtraps del rival' })).toHaveTextContent('Al aplicar, se reparte una mano nueva.')
  })
})
