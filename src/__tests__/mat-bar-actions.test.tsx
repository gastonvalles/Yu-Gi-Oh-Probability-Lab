// @vitest-environment jsdom
import { act, cleanup, fireEvent, renderHook, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { setDuelFullscreen, useDuelFullscreen } from '../app/duel-fullscreen'
import { useMatSession } from '../app/use-mat-session'
import { AutoSoloScreen, type AutoSoloScreenProps } from '../components/auto/AutoSoloScreen'
import { PracticeMat } from '../components/probability/PracticeMat'
import { CARDS as AUTO_CARDS, fakeSession, type FakeSession } from './support/auto-session-fake'
import { core, dispatches, renderAuto } from './support/auto-screen-harness'
import { CARDS, INITIAL, render } from './support/practice-mat-harness'

// La barra de arriba de la mesa es una sola (`MatBarActions`): la práctica y «Jugar solo automático» llevan los mismos íconos, en el mismo orden, con los mismos nombres y estados
// (Gastón, 2026-10-25: «TODAS las mesas deberían ser iguales… menos las opciones de cada una»). Lo del automático: «Nueva mano» es otro duelo, la ventana grande se apaga al salir,
// deshacer va arriba y, en el celular, las vidas van abajo.

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

/** Del primero de los íconos compartidos (la vista) hasta «Guardar combo»: lo que tiene que ser igual en las dos mesas. */
const shared = (buttons: ReturnType<typeof barButtons>) => buttons.slice(buttons.findIndex((button) => button.name?.startsWith('Cambiar a la vista')), buttons.findIndex((button) => button.name === 'Guardar combo') + 1)

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

      cleanup()
      renderAuto()
      const auto = barButtons()

      expect(shared(auto)).toEqual(shared(practice))
      expect(shared(practice).map((button) => button.name)).toEqual(['Cambiar a la vista superior', 'Sonidos', ...(layout === 'escritorio' ? ['Ventana grande'] : []), 'Handtraps del rival', 'Nueva mano', 'Deshacer', 'Guardar combo'])
      // Lo de cada una, después: los pasos (la práctica; los del automático van abajo a la derecha); el engranaje (el automático).
      expect(practice.slice(practice.findIndex((button) => button.name === 'Guardar combo') + 1).map((button) => button.name)).toEqual(['Pasos y combos'])
      expect(auto.slice(auto.findIndex((button) => button.name === 'Guardar combo') + 1).map((button) => button.name)).toEqual(['Más opciones del duelo'])
      // La flecha de «Volver a Jugar»: en la práctica y en el automático, a la izquierda de los íconos (en el celular, en la misma fila).
      expect(screen.getByRole('button', { name: 'Volver a Jugar' })).toBeInTheDocument()
      if (layout === 'celular') expect([practice[0]!.name, auto[0]!.name]).toEqual(['Volver a Jugar', 'Volver a Jugar'])
      cleanup()
    }
  })

  it('«Nueva mano» del automático es otro duelo, con otra semilla (sin volver a cargar el núcleo), y cambiar las handtraps después sigue con esa mano; «Reiniciar el mismo duelo» repite la semilla', () => {
    const { calls, fakes } = mountAuto()
    const first = fakes[0]!

    fireEvent.click(screen.getByRole('button', { name: 'Nueva mano' }))
    expect(first.restart).toHaveBeenCalledTimes(1)
    const seed = vi.mocked(first.restart).mock.calls[0]![0]

    expect(seed).toEqual(expect.any(Number))
    expect(seed).not.toBe(99)
    expect(calls).toHaveLength(1)

    // Las handtraps desde la barra (como en la práctica): la hoja es la del automático y, al aplicar, el duelo se arma de nuevo con la mano de ahora.
    fireEvent.click(screen.getByRole('button', { name: 'Handtraps del rival' }))
    const sheet = screen.getByRole('dialog', { name: 'Handtraps del rival' })

    expect(sheet).toHaveTextContent('Al aplicar, el duelo empieza de nuevo.')
    fireEvent.click(within(within(sheet).getByRole('group', { name: `Copias de ${ASH.name} en el deck del rival` })).getByRole('button', { name: 'Uno más' }))
    fireEvent.click(within(sheet).getByRole('button', { name: 'Usar estas handtraps' }))
    expect(calls).toHaveLength(2)
    expect(calls[1]).toMatchObject({ seed })
    expect(calls[1]!.rival!.main).toContainEqual([ASH.id, 2])
    expect(first.destroyed).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Más opciones del duelo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar el mismo duelo' }))
    expect(fakes[1]!.restart).toHaveBeenCalledWith()
    expect(dispatches).toBe(0)
  })

  it('la ventana grande: el ícono de la barra del automático la prende (en escritorio) y salir de la mesa la apaga', () => {
    desktop()
    renderAuto()
    fireEvent.click(screen.getByRole('button', { name: 'Ventana grande' }))
    expect(screen.getByRole('button', { name: 'Salir de la ventana grande' })).toHaveAttribute('aria-pressed', 'true')

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

  it('las vidas de los dos: en el celular, abajo (en la botonera, donde va la tuya en el duelo por enlace: arriba no entran con los íconos); en escritorio, en la barra', () => {
    const field = () => screen.getByLabelText('Campo')
    const after = (element: HTMLElement) => Boolean(field().compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)

    renderAuto()
    expect(after(screen.getByRole('group', { name: 'Puntos de vida de Rival: 8000' }))).toBe(true)
    expect(after(screen.getByRole('group', { name: 'Puntos de vida de Vos: 8000' }))).toBe(true)
    cleanup()

    desktop()
    renderAuto()
    expect(after(screen.getByRole('group', { name: 'Puntos de vida de Rival: 8000' }))).toBe(false)
    expect(screen.getAllByRole('group', { name: /^Puntos de vida/ })).toHaveLength(2)
  })

  it('la hoja de las handtraps de la práctica sigue diciendo que aplicar reparte otra mano', () => {
    render(<Practice />)
    fireEvent.click(screen.getByRole('button', { name: 'Handtraps del rival' }))

    expect(screen.getByRole('dialog', { name: 'Handtraps del rival' })).toHaveTextContent('Al aplicar, se reparte una mano nueva.')
  })
})
