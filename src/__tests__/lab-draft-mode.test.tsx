// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { useMemo } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BUILD_DRAFT_KEY } from '../app/build-draft'
import { deriveMainDeckCardsFromZone } from '../app/calculator-state'
import { readComparisonSelection } from '../app/comparison-selection'
import { setDeckCards } from '../app/deck-builder-slice'
import { buildActiveRuleSet } from '../app/pattern-presets'
import { computeLabResults } from '../app/probability-lab'
import { useAppSelector } from '../app/store-hooks'
import { ProbabilityPanel } from '../components/ProbabilityPanel'
import { APPLIED_NOTICE_MS } from '../components/probability/LabAppliedNotice'
import { LabScoreCard } from '../components/probability/LabScoreCard'
import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'
import { fireKingDeck, storeWith } from './support/deck-fixtures'

/**
 * «Probar el cambio» de punta a punta con un deck de verdad (el Fire King del navegador) y las reglas de hoy. Sin workers (jsdom), el Lab calcula en el hilo
 * principal: es el mismo motor y las mismas cuentas que en la app.
 */

const noop = () => {}
// El editor de reglas no se abre en estas pruebas.
const patternActions = new Proxy({}, { get: () => () => '' }) as PatternEditorActions

function Lab({ handSize = 5 }: { handSize?: number }) {
  const main = useAppSelector((state) => state.deckBuilder.main)
  const cards = useMemo(() => deriveMainDeckCardsFromZone(main), [main])
  const defaults = useMemo(() => ({ derivedMainCards: cards }), [cards])

  return (
    <ProbabilityPanel
      handSize={handSize}
      patterns={[]}
      disabledGenericRuleIds={[]}
      onSetGenericRuleEnabled={noop}
      systemRuleNames={{}}
      onRenameSystemRule={noop}
      derivedMainCards={cards}
      patternActions={patternActions}
      patternEditorDefaults={defaults}
      isEditingDeck={false}
      onSetOrigin={noop}
      onToggleRole={noop}
      onConfirmClassification={noop}
      onConfirmAllClassifications={noop}
    />
  )
}

/** `handSize` distinto: otra clave del caché por contenido (las pruebas que miran «midiendo» necesitan un cálculo que no esté hecho). */
function mount({ handSize }: { handSize?: number } = {}) {
  const store = storeWith(fireKingDeck())

  render(
    <Provider store={store}>
      <Lab handSize={handSize} />
    </Provider>,
  )

  return store
}

const count = (main: { name: string }[], name: string) => main.filter((card) => card.name === name).length
const verdict = () => screen.getByRole('region', { name: 'Resultado' })
const changeCard = () => screen.getByRole('region', { name: 'El cambio que estás probando' })

/** Hasta que la sugerencia terminó de medir sus cambios y ofrece «Probar el cambio»; lo toca y espera a que el Lab termine de medir tu deck con el cambio. */
async function startTrying() {
  const suggestion = await screen.findByRole('region', { name: 'Qué mejorar primero' })
  fireEvent.click(await within(suggestion).findByRole('button', { name: 'Probar el cambio' }))
  // El chip «Con el cambio» ya está mientras mide; el «antes» llega con el número nuevo.
  await within(verdict()).findByText(/que antes del cambio/)
}

/** Con «reducir movimiento» los anillos muestran su número de una (sin contar desde 0); `phone` simula el celular del Lab (menos de 768 px). */
function stubMedia({ phone = false } = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' || (phone && query === '(width < 768px)'),
    media: query,
    addEventListener: noop,
    removeEventListener: noop,
  }))
}

const noticeOf = (text: string) => screen.getByText(text).closest('[role="status"]') as HTMLElement

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.location.hash = '#probability-lab'
  stubMedia()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('«Probar el cambio» en el Lab', () => {
  it('con el Fire King la sugerencia aparece, y probarla muestra todo el Lab con el cambio sin tocar tu deck', async () => {
    const store = mount()

    const suggestion = await screen.findByRole('region', { name: 'Qué mejorar primero' })
    expect(await within(suggestion).findByText('Fire King Island')).toBeInTheDocument()
    expect(within(suggestion).getByText('Ash Blossom & Joyous Spring')).toBeInTheDocument()
    expect(within(verdict()).getByText('81')).toBeInTheDocument()

    await startTrying()

    // El veredicto mide tu deck con el cambio (85) y dice cuál era sin él; «Sin salida» baja 4.
    expect(within(verdict()).getByText('85')).toBeInTheDocument()
    expect(within(verdict()).getByText('4 más que antes del cambio (81 de cada 100)')).toBeInTheDocument()
    expect(within(verdict()).getByText('15')).toBeInTheDocument()
    expect(within(verdict()).getByText('4 menos')).toBeInTheDocument()
    // La lente también: 82 yendo 1º y 87 yendo 2º.
    expect(screen.getByRole('radio', { name: 'Yendo 1º: 82 de cada 100' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Yendo 2º: 87 de cada 100' })).toBeInTheDocument()
    // Qué robás de cada rol: los Starters suben (11 copias) y el botón lo dice como descripción.
    expect(screen.getByRole('button', { name: /^Starters: .* Ver cartas$/ })).toHaveAccessibleDescription('4 más')
    expect(screen.getByText('11 copias')).toBeInTheDocument()

    // La tarjeta del cambio, con las dos cartas, y tu deck sin tocar.
    expect(within(changeCard()).getByText('Sacar 1 Ash Blossom & Joyous Spring')).toBeInTheDocument()
    expect(within(changeCard()).getByText('Handtrap · quedan 2')).toBeInTheDocument()
    expect(within(changeCard()).getByText('Starter · ahora son 3')).toBeInTheDocument()
    expect(count(store.getState().deckBuilder.main, 'Fire King Island')).toBe(2)
    // La sugerencia queda debajo, invisible (no se lee ni se enfoca): la fila mide lo mismo con y sin el cambio.
    expect(screen.queryByRole('region', { name: 'Qué mejorar primero' })).not.toBeInTheDocument()
    // El foco no se pierde con el botón que se fue: pasa al título del cambio.
    expect(document.activeElement).toBe(within(changeCard()).getByText('Estás probando un cambio').parentElement)
  })

  it('la lente sigue funcionando con el cambio: cada turno con su «antes»', async () => {
    mount()
    await startTrying()

    fireEvent.click(screen.getByRole('radio', { name: 'Yendo 1º: 82 de cada 100' }))
    expect(within(verdict()).getByText('82')).toBeInTheDocument()
    expect(within(verdict()).getByText('4 más que antes del cambio (78 de cada 100)')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: 'Yendo 2º: 87 de cada 100' }))
    expect(within(verdict()).getByText('3 más que antes del cambio (84 de cada 100)')).toBeInTheDocument()
  })

  it('«Aplicar al deck» cambia el deck y avisa con «Deshacer», que vuelve el deck y el borrador', async () => {
    const store = mount()
    await startTrying()

    fireEvent.click(within(changeCard()).getByRole('button', { name: 'Aplicar al deck' }))

    expect(count(store.getState().deckBuilder.main, 'Fire King Island')).toBe(3)
    expect(count(store.getState().deckBuilder.main, 'Ash Blossom & Joyous Spring')).toBe(2)
    expect(sessionStorage.getItem(BUILD_DRAFT_KEY)).toBeNull()
    // El aviso entra en una región `status` que ya estaba (así el lector lo anuncia).
    const notice = noticeOf('Aplicaste el cambio')
    expect(notice.parentElement).toBe(document.body)
    // El Lab vuelve a su modo normal, con el deck ya cambiado (85, sin el chip), y el foco pasa a «Deshacer».
    expect(within(verdict()).queryByText('Con el cambio')).not.toBeInTheDocument()
    expect(within(verdict()).getByText('85')).toBeInTheDocument()
    expect(document.activeElement).toBe(within(notice).getByRole('button', { name: 'Deshacer' }))

    fireEvent.click(within(notice).getByRole('button', { name: 'Deshacer' }))

    expect(count(store.getState().deckBuilder.main, 'Fire King Island')).toBe(2)
    expect(count(store.getState().deckBuilder.main, 'Ash Blossom & Joyous Spring')).toBe(3)
    expect(await within(verdict()).findByText('Con el cambio')).toBeInTheDocument()
    expect(within(notice).queryByText('Aplicaste el cambio')).not.toBeInTheDocument()
  })

  it('el aviso se va solo a los 10 s, o al tocar otra cosa', async () => {
    mount()
    await startTrying()
    vi.useFakeTimers()

    fireEvent.click(within(changeCard()).getByRole('button', { name: 'Aplicar al deck' }))
    expect(screen.getByText('Aplicaste el cambio')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(APPLIED_NOTICE_MS - 100))
    expect(screen.getByText('Aplicaste el cambio')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(200))
    expect(screen.queryByText('Aplicaste el cambio')).not.toBeInTheDocument()
  })

  it('el aviso también se va al hacer otra cosa en la pantalla', async () => {
    mount()
    await startTrying()

    fireEvent.click(within(changeCard()).getByRole('button', { name: 'Aplicar al deck' }))
    expect(screen.getByText('Aplicaste el cambio')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /^Yendo 1º/ }))
    expect(screen.queryByText('Aplicaste el cambio')).not.toBeInTheDocument()
  })

  it('«Descartar» vuelve a tu deck de verdad y a la sugerencia', async () => {
    const store = mount()
    await startTrying()

    fireEvent.click(within(changeCard()).getByRole('button', { name: 'Descartar' }))

    expect(sessionStorage.getItem(BUILD_DRAFT_KEY)).toBeNull()
    expect(within(verdict()).queryByText('Con el cambio')).not.toBeInTheDocument()
    expect(within(verdict()).getByText('81')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Qué mejorar primero' })).toBeInTheDocument()
    expect(count(store.getState().deckBuilder.main, 'Fire King Island')).toBe(2)
  })

  it('«Comparar con mi deck» deja A = tu deck y B = con el cambio, y lleva a Comparar', async () => {
    mount()
    await startTrying()

    fireEvent.click(within(changeCard()).getByRole('button', { name: 'Comparar con mi deck' }))

    expect(window.location.hash).toBe('#workspace')
    expect(readComparisonSelection()).toMatchObject({ a: 'current', b: 'draft' })
    // El borrador sigue: al volver, el Lab está en el cambio.
    expect(sessionStorage.getItem(BUILD_DRAFT_KEY)).not.toBeNull()
  })

  it('si el deck cambió y el cambio ya no se puede aplicar, lo dice con el motivo y deja descartarlo', async () => {
    const store = mount()
    await startTrying()

    // En el builder: sacaste las dos Fire King Island y subiste dos Ghost Ogre del Side (el deck sigue con 40).
    act(() => {
      const { main, extra, side } = store.getState().deckBuilder
      const ogres = side.filter((card) => card.name.startsWith('Ghost Ogre'))
      store.dispatch(setDeckCards({ zones: { main: [...main.filter((card) => card.name !== 'Fire King Island'), ...ogres], extra, side: side.filter((card) => !ogres.includes(card)) }, as: 'edit' }))
    })

    const stale = await screen.findByRole('region', { name: 'El cambio que estás probando' })
    expect(within(stale).getByText('Este cambio ya no se puede probar')).toBeInTheDocument()
    expect(within(stale).getByText('Una de las dos cartas ya no está en tu deck.')).toBeInTheDocument()
    // El veredicto es el de tu deck (sin el chip): el cambio no se aplica en silencio ni se pierde.
    expect(within(verdict()).queryByText('Con el cambio')).not.toBeInTheDocument()
    expect(sessionStorage.getItem(BUILD_DRAFT_KEY)).not.toBeNull()

    fireEvent.click(within(stale).getByRole('button', { name: 'Descartar el cambio' }))
    expect(sessionStorage.getItem(BUILD_DRAFT_KEY)).toBeNull()
    expect(await screen.findByRole('region', { name: 'Qué mejorar primero' })).toBeInTheDocument()
  })

  it('el límite del formato también lo vuelve imposible: lo dice con el mensaje del builder', async () => {
    const store = mount()
    await startTrying()

    // Metiste a mano la 3.ª Fire King Island (por una Dominus Impulse): el cambio pediría una 4.ª.
    act(() => {
      const { main, extra, side } = store.getState().deckBuilder
      const island = main.find((card) => card.name === 'Fire King Island')!
      const drop = main.findIndex((card) => card.name === 'Dominus Impulse')
      store.dispatch(setDeckCards({ zones: { main: [...main.filter((_, index) => index !== drop), { ...island, instanceId: 'otra-island' }], extra, side }, as: 'edit' }))
    })

    expect(await screen.findByText('Fire King Island ya alcanzó el límite de 3 copias en este formato.')).toBeInTheDocument()
  })

  it('en el celular las acciones van en la barra fija de abajo (la X, «Comparar» y «Aplicar al deck»), no en la tarjeta', async () => {
    stubMedia({ phone: true })
    const store = mount()
    await startTrying()

    expect(within(changeCard()).queryByRole('button')).not.toBeInTheDocument()
    const bar = screen.getByRole('group', { name: 'El cambio que estás probando' })
    // Fija y por portal (los bloques de la pantalla entran con `transform`), sobre la barra del armazón.
    expect(bar.parentElement).toBe(document.body)
    expect(bar).toHaveClass('fixed', 'bottom-[calc(4rem+env(safe-area-inset-bottom,0px))]')
    const buttons = within(bar).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Descartar el cambio', 'Comparar', 'Aplicar al deck'])

    fireEvent.click(within(bar).getByRole('button', { name: 'Aplicar al deck' }))
    expect(count(store.getState().deckBuilder.main, 'Fire King Island')).toBe(3)
    expect(screen.queryByRole('group', { name: 'El cambio que estás probando' })).not.toBeInTheDocument()
  })

  it('al tocar «Probar el cambio», mientras se mide el deck con el cambio el Lab no muestra el número de tu deck como si fuera el nuevo', async () => {
    mount({ handSize: 6 })

    const suggestion = await screen.findByRole('region', { name: 'Qué mejorar primero' })
    fireEvent.click(await within(suggestion).findByRole('button', { name: 'Probar el cambio' }))

    // Todavía midiendo: el anillo es un esqueleto (ocupado) y no hay ningún número, ni el de antes con el chip nuevo, ni un error de cuenta.
    expect(verdict()).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('img', { name: 'Midiendo tu deck con el cambio' })).toBeInTheDocument()
    expect(within(verdict()).queryByText(/que antes del cambio/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // Y cuando llega, el número nuevo con su «antes».
    expect(await within(verdict()).findByText(/que antes del cambio/)).toBeInTheDocument()
    expect(verdict()).toHaveAttribute('aria-busy', 'false')
  })

  it('mientras se mide el deck con el cambio, el veredicto es un esqueleto ocupado: nunca el número de antes como si fuera el nuevo', () => {
    const deck = fireKingDeck()
    const cards = deriveMainDeckCardsFromZone(deck.main)
    const computation = computeLabResults(cards, buildActiveRuleSet(cards, [], []), 5)

    if (computation.status !== 'ok') throw new Error('no calculable')

    render(<LabScoreCard results={computation.results} before={computation.results} measuring view="average" onViewChange={noop} isRecalculating={false} handSize={5} onOpenDisclaimer={noop} />)

    expect(verdict()).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByRole('img', { name: 'Midiendo tu deck con el cambio' })).toBeInTheDocument()
    expect(within(verdict()).getByText('Con el cambio')).toBeInTheDocument()
    // Ni el 81 de tu deck ni sus «Sin salida» (19) ni los anillos de la lente: todo espera al deck con el cambio.
    expect(within(verdict()).queryByText('81')).not.toBeInTheDocument()
    expect(within(verdict()).queryByText('19')).not.toBeInTheDocument()
    expect(screen.queryAllByRole('meter')).toEqual([])
    // Las filas no se abren (mostrarían los problemas de antes) y la ficha espera.
    expect(screen.getByRole('button', { name: /^Sin salida/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cómo se calcula: abrir la ficha' })).toBeDisabled()
  })

  it('el borrador sobrevive a recargar la pestaña: el Lab arranca con el cambio', async () => {
    sessionStorage.setItem(BUILD_DRAFT_KEY, JSON.stringify({ v: 1, draft: { kind: 'swap', out: 14558127, in: 57554544 } }))
    mount()

    expect(await within(await screen.findByRole('region', { name: 'Resultado' })).findByText('Con el cambio')).toBeInTheDocument()
    expect(within(changeCard()).getByText('Meter 1 Fire King Island')).toBeInTheDocument()
    // Al recargar nadie tocó «Probar el cambio»: el foco no se mueve solo.
    expect(document.activeElement).toBe(document.body)
  })
})
