// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { toast } from 'react-hot-toast'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { BUILD_DRAFT_KEY } from '../app/build-draft'
import { COMPARISON_SELECTION_KEY } from '../app/comparison-selection'
import type { DeckCardInstance } from '../app/model'
import { readSavedBuilds, SAVED_BUILDS_KEY, type SavedBuild } from '../app/saved-builds'
import { ComparisonScreen } from '../components/comparison/ComparisonScreen'
import { AppToaster } from '../components/ui/AppToaster'
import { copies, deckState, fortyCardMain, storeWith } from './support/deck-fixtures'

/** Lo que tarda el motor en jsdom (sin workers, en el hilo principal): un deck de 40 por build y uno por cambio. */
const SLOW = { timeout: 20000 }

const idCount = (cards: readonly DeckCardInstance[], id: number) => cards.filter((card) => card.apiCard.ygoprodeckId === id).length

function build(id: string, name: string, main: DeckCardInstance[], from?: SavedBuild['from']): SavedBuild {
  return { id, name, savedAt: '2026-10-22T12:00:00.000Z', ...(from ? { from } : {}), main, extra: [], side: [] }
}

/** Tu deck con un Brick menos y un Starter Uno más (la 3.ª copia): abre mejor. */
function oneMoreStarter(): DeckCardInstance[] {
  const main = fortyCardMain()
  const brick = main.findIndex((card) => card.apiCard.ygoprodeckId === 20)

  return [...main.slice(0, brick), ...main.slice(brick + 1), { ...main[0]!, instanceId: 'starter-3' }]
}

function setup({ builds = [], selectB, desktop = false, draft }: { builds?: SavedBuild[]; selectB?: string; desktop?: boolean; draft?: object } = {}) {
  localStorage.setItem(SAVED_BUILDS_KEY, JSON.stringify(builds))
  if (selectB) localStorage.setItem(COMPARISON_SELECTION_KEY, JSON.stringify({ a: 'current', b: selectB, pickedAt: '2099-01-01T00:00:00.000Z' }))
  if (draft) sessionStorage.setItem(BUILD_DRAFT_KEY, JSON.stringify({ v: 1, draft }))
  // El escritorio es desde 1101 px; los avisos (react-hot-toast) también preguntan por el movimiento reducido.
  window.matchMedia = ((query: string) => ({ matches: desktop && query.includes('1101'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia

  const store = storeWith(deckState({ main: fortyCardMain() }, 'Mi deck'))

  render(
    <Provider store={store}>
      <ComparisonScreen />
      <AppToaster />
    </Provider>,
  )

  return store
}

const verdict = (name: string) => screen.findByRole('heading', { name }, SLOW)

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.location.hash = '#workspace'
})

afterEach(() => {
  cleanup()
  toast.remove()
})

describe('Comparar', () => {
  // Va primera: el resultado de cada build queda en caché por contenido y las que siguen ya no esperan.
  it('mientras mide, la tarjeta del veredicto está ocupada (aria-busy) y en lugar de los anillos van sus esqueletos', async () => {
    setup({ builds: [build('b-1', 'Con un starter más', oneMoreStarter())] })
    const card = screen.getByRole('region', { name: 'Midiendo las dos builds…' })

    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(within(card).queryByRole('img', { name: /^Build B/ })).toBeNull()
    expect(await verdict('B abre mejor')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'B abre mejor' })).toHaveAttribute('aria-busy', 'false')
  }, 30000)

  it('la primera vez (sin B): en el lugar del veredicto, las dos puertas', () => {
    setup()

    expect(screen.getByText('Todavía no tenés con qué comparar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar la build A: Tu deck actual' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Elegir la build B' })).toHaveTextContent('Elegí con qué comparar')
    expect(screen.getByRole('button', { name: 'Importar un deck' })).toBeInTheDocument()
    // Sin B no hay nada que cargar ni barra de abajo.
    expect(screen.queryByRole('button', { name: 'Cargar B en el builder' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Intercambiar A y B' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Probar un cambio en el Lab' }))
    expect(window.location.hash).toBe('#probability-lab')
  })

  it('el veredicto: quién abre mejor, los dos anillos de reparto y sin salida / con problema en espejo; la lente cambia los números sin mover nada', async () => {
    setup({ builds: [build('b-1', 'Con un starter más', oneMoreStarter())] })
    await verdict('B abre mejor')
    const card = screen.getByRole('region', { name: 'B abre mejor' })
    const lens = within(card).getByRole('radiogroup', { name: 'Qué mano mirar' })
    const ringB = () => within(card).getByRole('img', { name: /^Build B: de cada 100 manos, \d+,\d buenas/ })
    const noOpening = () => within(card).getByRole('button', { name: /^Sin salida: A \d+,\d, B \d+,\d de cada 100; \d+ menos con B$/ })

    expect(within(card).getByRole('img', { name: /^Build A: de cada 100 manos/ })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /^Con problema: A/ })).toBeInTheDocument()
    expect(within(lens).getByRole('radio', { name: 'Promedio' })).toHaveAttribute('aria-checked', 'true')
    // La elegida dice qué mano mira; las otras, su ▲/▼, también en palabras para el lector de pantalla.
    expect(within(lens).getByRole('radio', { name: 'Promedio' })).toHaveTextContent('5 y 6 cartas')
    expect(within(lens).getByRole('radio', { name: 'Yendo 1º' })).toHaveAccessibleDescription(/^\d+ más con B$/)

    const before = { ring: ringB().getAttribute('aria-label'), row: noOpening().getAttribute('aria-label'), nodes: card.querySelectorAll('*').length }

    fireEvent.click(within(lens).getByRole('radio', { name: 'Yendo 1º' }))

    expect(within(lens).getByRole('radio', { name: 'Yendo 1º' })).toHaveAttribute('aria-checked', 'true')
    expect(within(lens).getByRole('radio', { name: 'Yendo 1º' })).toHaveTextContent('5 cartas')
    expect(ringB().getAttribute('aria-label')).not.toBe(before.ring)
    expect(noOpening().getAttribute('aria-label')).not.toBe(before.row)
    // Cambian los números, no lo que hay: la tarjeta tiene las mismas piezas.
    expect(card.querySelectorAll('*').length).toBe(before.nodes)
  }, 30000)

  it('una fila espejo se abre con qué la mueve (cada cambio, con lo que mueve solo) y las manos exactas de cada turno; se vuelve a cerrar', async () => {
    setup({ builds: [build('b-1', 'Con un starter más', oneMoreStarter())] })
    await verdict('B abre mejor')
    const row = screen.getByRole('button', { name: /^Sin salida: A/ })

    expect(row).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'true')

    const panel = document.getElementById(row.getAttribute('aria-controls')!)!

    expect(within(panel).getByText('Qué lo mueve')).toBeInTheDocument()
    // Las dos builds tienen 40 cartas: el total va una sola vez, en el medio de la fila.
    expect(within(panel).getByText('Yendo 1º · de 658.008')).toBeInTheDocument()
    expect(within(panel).getByText('Yendo 2º · de 3.838.380')).toBeInTheDocument()
    // El cambio que la mueve: el Starter Uno en lugar del Brick, con menos manos sin salida.
    expect(await within(panel).findByText('Starter Uno', {}, SLOW)).toBeInTheDocument()
    expect(within(panel).getByText(/^\d+ menos con este cambio$/)).toBeInTheDocument()

    fireEvent.click(row)
    expect(row).toHaveAttribute('aria-expanded', 'false')
    expect(document.getElementById(row.getAttribute('aria-controls')!)).toBeNull()
  }, 30000)

  it('lo que da igual en las dos va plegado en una sola fila, y se abre', async () => {
    setup({ builds: [build('b-1', 'Con un starter más', oneMoreStarter())] })
    await verdict('B abre mejor')
    const fold = screen.getByRole('button', { name: /^Igual en las dos: / })

    expect(fold).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: /^Tienen Interacción: A/ })).toBeNull()
    fireEvent.click(fold)
    expect(fold).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: /^Tienen Interacción: A \d+,\d, B \d+,\d de cada 100; igual en las dos$/ })).toBeInTheDocument()
  }, 30000)

  it('«Qué cambiaste»: el cambio de a par con su efecto solo (un esqueleto mientras se mide), el Extra y el Side, y las dos listas a un toque', async () => {
    setup({ builds: [build('b-1', 'Con un starter más', oneMoreStarter())] })
    const list = screen.getByRole('region', { name: 'Qué cambiaste' })

    expect(within(list).getByText('Starter Uno')).toBeInTheDocument()
    expect(within(list).getByText('Starter · ahora son 3 · en lugar de Brick')).toBeInTheDocument()
    expect(within(list).getByText('Midiendo este cambio')).toBeInTheDocument()
    expect(within(list).getByText('El Extra y el Side quedan igual.')).toBeInTheDocument()
    expect(await within(list).findByText(/^Con este cambio solo, \d+ manos buenas más de cada 100$/, {}, SLOW)).toBeInTheDocument()

    fireEvent.click(within(list).getByRole('button', { name: 'Ver las dos listas' }))
    const sheet = screen.getByRole('dialog', { name: 'Las dos listas' })

    // En A va marcado el Brick que sale y en B el Starter que entra; el resto, atenuado.
    expect(within(sheet).getByText('−1').closest('button')).toHaveAttribute('title', 'Brick')
    expect(within(sheet).getByText('+1').closest('button')).toHaveAttribute('title', 'Starter Uno')
    expect(within(sheet).getAllByTitle('Handtrap')[0]).toHaveClass('opacity-40')
    expect(within(sheet).getByText('salen 1 · entran 1')).toBeInTheDocument()
  }, 30000)

  it('el selector: tocar B abre «Mis builds» con tus fuentes (la A, apagada); elegir otra es el segundo toque', async () => {
    setup({ builds: [build('b-1', 'Con un starter más', oneMoreStarter()), build('b-2', 'Otra build', oneMoreStarter(), 'import')], selectB: 'b-1' })

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar la build B: Con un starter más' }))
    const sheet = screen.getByRole('dialog', { name: 'Mis builds' })

    expect(within(sheet).getByText('Tocá una para compararla como B')).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: /^Tu deck actual.*Mi deck · 40 cartas · ya es la A$/ })).toBeDisabled()
    expect(within(sheet).getByRole('button', { name: /^Con un starter más/ })).toHaveAttribute('aria-current', 'true')
    expect(within(sheet).getByRole('button', { name: /^Otra build.*importada/ })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: 'Más opciones de Otra build' })).toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('button', { name: /^Otra build/ }))

    expect(screen.queryByRole('dialog', { name: 'Mis builds' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Cambiar la build B: Otra build' })).toBeInTheDocument()
  })

  it('las builds guardadas se renombran y se borran desde sus tres puntos, en el mismo selector', () => {
    setup({ builds: [build('b-1', 'Con un starter más', oneMoreStarter()), build('b-2', 'Otra build', oneMoreStarter())], selectB: 'b-1' })

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar la build B: Con un starter más' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Mis builds' })).getByRole('button', { name: 'Más opciones de Otra build' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Renombrar' }))
    const rename = screen.getByRole('dialog', { name: 'Renombrar build' })
    fireEvent.change(within(rename).getByRole('textbox', { name: 'Nombre' }), { target: { value: 'Versión locals' } })
    fireEvent.click(within(rename).getByRole('button', { name: 'Guardar' }))

    expect(readSavedBuilds().map((saved) => saved.name)).toEqual(['Con un starter más', 'Versión locals'])

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar la build B: Con un starter más' }))
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Mis builds' })).getByRole('button', { name: 'Más opciones de Con un starter más' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Borrar' }))
    fireEvent.click(within(screen.getByRole('alertdialog', { name: '¿Borrar la build?' })).getByRole('button', { name: 'Borrar build' }))

    expect(readSavedBuilds().map((saved) => saved.name)).toEqual(['Versión locals'])
    // La B borrada vuelve sola a la de entrada: la que queda.
    expect(screen.getByRole('button', { name: 'Cambiar la build B: Versión locals' })).toBeInTheDocument()
  })

  it('⇅ intercambia A y B', () => {
    setup({ builds: [build('b-1', 'Con un starter más', oneMoreStarter())] })

    fireEvent.click(screen.getByRole('button', { name: 'Intercambiar A y B' }))

    expect(screen.getByRole('button', { name: 'Cambiar la build A: Con un starter más' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar la build B: Tu deck actual' })).toBeInTheDocument()
  })

  it('«Cargar B en el builder» cambia el deck y avisa (también al lector) con «Deshacer», que lo deja como estaba; A pasa a ser tu deck nuevo y B, el que dejaste', async () => {
    const store = setup({ builds: [build('b-1', 'Con un starter más', oneMoreStarter())] })
    await verdict('B abre mejor')

    fireEvent.click(screen.getByRole('button', { name: 'Cargar B en el builder' }))

    expect(idCount(store.getState().deckBuilder.main, 20)).toBe(2)
    expect(store.getState().deckBuilder.deckName).toBe('Con un starter más')
    expect(screen.getByText('Cargaste "Con un starter más" en el builder. Tu deck de antes quedó guardado.', { selector: 'p[aria-live]' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar la build A: Tu deck actual' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar la build B: Tu deck de antes' })).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Deshacer' }))

    expect(idCount(store.getState().deckBuilder.main, 20)).toBe(3)
    expect(store.getState().deckBuilder.deckName).toBe('Mi deck')
    expect(screen.getByText('Tu deck volvió a como estaba.', { selector: 'p[aria-live]' })).toBeInTheDocument()
  }, 30000)

  it('dos decks idénticos: «Son el mismo deck», con un solo anillo y lo que sigue', async () => {
    setup({ builds: [build('same', 'Igual', fortyCardMain())], selectB: 'same' })

    expect(screen.getByRole('heading', { name: 'Son el mismo deck' })).toBeInTheDocument()
    expect(screen.getByText('Tienen las mismas 40 cartas en el Main, el Extra y el Side.')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: /^De cada 100 manos, \d+,\d son buenas en las dos$/ }, SLOW)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cargar B en el builder' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ir al builder' }))
    expect(window.location.hash).toBe('#deck-builder')
  }, 30000)

  it('cartas sin clasificar: cuántas faltan, el anillo de B «sin medir», el «?» del cambio y la puerta para clasificarlas acá', async () => {
    const main = [...fortyCardMain().slice(0, 39), ...copies(77, 'Carta nueva', 1, [], { origin: null })]
    setup({ builds: [build('pending', 'Importada', main, 'import')] })

    expect(screen.getByRole('heading', { name: 'Falta clasificar 1 carta de B' })).toBeInTheDocument()
    expect(screen.getByText('Carta nueva: sin su rol no se sabe si arranca o traba.')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Qué cambiaste' })).getByText('Se mide al clasificar sus cartas')).toBeInTheDocument()
    expect(await screen.findByRole('img', { name: 'Build B: sin medir' }, SLOW)).toBeInTheDocument()
    // Con cartas sin clasificar no se ofrece cargar B: lo que sigue es clasificarlas.
    expect(screen.queryByRole('button', { name: 'Cargar B en el builder' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Clasificar 1 carta' }))

    // La carta sólo está en esa build: se clasifica acá.
    expect(screen.getByRole('dialog', { name: 'Clasificar Carta nueva' })).toBeInTheDocument()
  }, 30000)

  it('B es el borrador del Lab: «Guardar B» lo deja como build (del Lab) y la elige', async () => {
    setup({ selectB: 'draft', draft: { kind: 'swap', out: 20, in: 1 } })

    expect(screen.getByRole('button', { name: 'Cambiar la build B: Borrador del Lab' })).toHaveTextContent('sin guardar')
    await verdict('B abre mejor')

    fireEvent.click(screen.getByRole('button', { name: 'Guardar B' }))

    const saved = readSavedBuilds()
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ from: 'lab' })
    expect(screen.getByRole('button', { name: `Cambiar la build B: ${saved[0]!.name}` })).toBeInTheDocument()
  }, 30000)

  it('en escritorio no hay barra: el par va en la cabecera con ⇅ y la acción vive en la tarjeta, pegada a su número', async () => {
    setup({ builds: [build('b-1', 'Con un starter más', oneMoreStarter())], desktop: true })
    await verdict('B abre mejor')
    const card = screen.getByRole('region', { name: 'B abre mejor' })

    expect(within(card).getByRole('button', { name: 'Cargar B en el builder' })).toHaveClass('bg-primary')
    expect(within(card).getByText('manos buenas más de cada 100 con B')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Intercambiar A y B' })).toHaveLength(1)
    expect(screen.getByRole('heading', { level: 1 }).closest('header')).toContainElement(screen.getByRole('group', { name: 'Qué se compara' }))
  }, 30000)
})
