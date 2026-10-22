// @vitest-environment jsdom
import { configureStore } from '@reduxjs/toolkit'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { useState } from 'react'
import { Provider } from 'react-redux'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MetaDeck } from '../app/meta'
import type { DeckBuilderState } from '../app/model'
import { Presence } from '../app/use-presence'
import { CardZoom } from '../components/card-detail/CardZoom'
import { buildAppNavGroups, buildDeckWorkflowNavigationItems } from '../components/deck-mode/deck-workflow-navigation'
import { DeckImportDrawer } from '../components/deck-mode/DeckImportDrawer'
import { PassPrompt } from '../components/duel/PassPrompt'
import { MetaDeckModal } from '../components/meta/MetaDeckModal'
import { PatternEditorDrawer } from '../components/probability/PatternEditorDrawer'
import type { PatternEditorActions } from '../components/probability/pattern-editor-actions'
import { AppSidebar } from '../components/shell/AppSidebar'
import type { ApiCardReference } from '../types'
import type { ApiCardSearchResult } from '../ygoprodeck'

// Lo que se cierra de este lote (la carta en grande, los cajones, la lista de un grupo de la mini guía, el deck de torneo y la pregunta de pasar de fase) también sale: la inversa de su entrada (`usePresence`).

vi.mock('../components/CardArt', () => ({ CardArt: () => null }))

const apiCard = (ygoprodeckId: number, name: string): ApiCardSearchResult => ({
  ygoprodeckId, name, cardType: 'Effect Monster', frameType: 'effect', description: null, race: 'Zombie', attribute: 'FIRE', level: 3,
  linkValue: null, atk: '0', def: '0', archetype: null, ygoprodeckUrl: null, imageUrl: null, imageUrlSmall: null,
  banlist: { tcg: null, ocg: null, goat: null }, genesys: { points: null },
})
const ASH = apiCard(14558127, 'Ash Blossom & Joyous Spring')

// El catálogo del importador (de verdad se baja de YGOPRODeck) y la lista del deck de torneo (no llega: queda cargando).
vi.mock('../ygoprodeck', async (importOriginal) => ({ ...(await importOriginal<typeof import('../ygoprodeck')>()), loadCardCatalog: async () => [ASH] }))
vi.mock('../app/meta', async (importOriginal) => ({ ...(await importOriginal<typeof import('../app/meta')>()), loadMetaDecklist: () => new Promise(() => {}) }))

const original = { animate: Element.prototype.animate, matchMedia: window.matchMedia }

beforeEach(() => {
  window.scrollTo = () => {}
})

afterEach(() => {
  cleanup()
  Element.prototype.animate = original.animate
  window.matchMedia = original.matchMedia
  document.head.querySelectorAll('style[data-test]').forEach((style) => style.remove())
})

/** Una salida de mentira que se termina a mano (`finish()`), y lo que se le pidió a cada elemento. Con ella, las entradas de la app (jsdom no carga index.css: van acá). */
function fakeAnimate() {
  const calls: { element: HTMLElement; keyframes: Keyframe[]; animation: Animation }[] = []
  let finish = () => {}
  const finished = new Promise<void>((resolve) => {
    finish = resolve
  })

  Element.prototype.animate = function (this: Element, keyframes) {
    const animation = { finished, reverse: vi.fn(), cancel: vi.fn() } as unknown as Animation

    calls.push({ element: this as HTMLElement, keyframes: keyframes as Keyframe[], animation })
    return animation
  }
  window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
  const style = Object.assign(document.createElement('style'), {
    textContent: ['dialog-enter', 'nav-scrim', 'side-drawer', 'drawer-enter', 'pop'].map((name) => `.animate-${name} { animation-name: ${name} }`).join(' ') + ' .motion-safe\\:animate-dialog-enter { animation-name: dialog-enter }',
  })
  style.dataset.test = ''
  document.head.append(style)

  return { calls, finish: async () => act(async () => finish()), resolve: () => finish() }
}

/** Lo que salió de adentro de `root`, en orden: la etiqueta del elemento y su fotograma de salida. */
const exits = (calls: ReturnType<typeof fakeAnimate>['calls'], root: HTMLElement) => calls.filter(({ element }) => root.contains(element)).map(({ element, keyframes }) => [element.tagName, keyframes])

const leavingNow = (root: HTMLElement) => ({ inert: root.inert, leaving: root.hasAttribute('data-leaving'), pointerEvents: root.style.pointerEvents })
const LEAVING = { inert: true, leaving: true, pointerEvents: 'none' }

describe('la carta en grande', () => {
  const card = { ...ASH, ygoprodeckId: 1 } as ApiCardReference

  function Screen({ onClose = () => {} }: { onClose?: () => void }) {
    const [open, setOpen] = useState(true)

    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Abrir
        </button>
        <Presence>
          {open ? (
            <CardZoom
              card={card}
              name="Maxx"
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

  it('sin la Web Animations API (jsdom) se va enseguida, como antes, y suelta el scroll', () => {
    render(<Screen />)
    expect(document.body.style.position).toBe('fixed')

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.position).toBe('')
  })

  it('al cerrarla se achica y se funde (la inversa de su entrada) sin atajar toques, y lo atado a «abierta» se suelta enseguida: el scroll, Escape y las teclas', async () => {
    const { calls, finish } = fakeAnimate()
    const onClose = vi.fn()
    render(<Screen onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: 'Maxx en grande' })

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }))

    expect(dialog).toBeInTheDocument()
    expect(leavingNow(dialog)).toEqual(LEAVING)
    expect(exits(calls, dialog)).toEqual([['DIV', [{ opacity: 0, transform: 'scale(0.96)' }]]])
    expect(document.body.style.position).toBe('')
    // Escape ya no la cierra otra vez y F no la da vuelta: las teclas son de lo que quedó abajo.
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'f' })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(dialog.querySelector('[data-flipped]')).toHaveAttribute('data-flipped', 'false')

    await finish()
    expect(dialog).not.toBeInTheDocument()
  })

  it('si se vuelve a abrir mientras sale es la misma (no se monta otra) y vuelve a bloquear el scroll y a atender las teclas', () => {
    fakeAnimate()
    render(<Screen />)
    const dialog = screen.getByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))

    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(leavingNow(dialog)).toEqual({ inert: false, leaving: false, pointerEvents: '' })
    expect(document.body.style.position).toBe('fixed')
    fireEvent.keyDown(window, { key: 'f' })
    expect(dialog.querySelector('[data-flipped]')).toHaveAttribute('data-flipped', 'true')
  })

  it('si se vuelve a abrir justo cuando terminó de salir, antes de desmontarse, queda abierta y viva (no transparente e inerte, como quedaba): la salida vuelve al revés', async () => {
    const { calls, resolve } = fakeAnimate()
    render(<Screen />)
    const dialog = screen.getByRole('dialog')

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cerrar' }))
    // La salida termina y, en el mismo dibujo en que se iba a desmontar, se vuelve a abrir (lo midió Edge: un segundo toque a los ~150 ms).
    await act(async () => {
      resolve()
      await new Promise((done) => setTimeout(done, 0))
      fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
    })

    expect(screen.getByRole('dialog')).toBe(dialog)
    expect(leavingNow(dialog)).toEqual({ inert: false, leaving: false, pointerEvents: '' })
    expect(calls.map(({ element, animation }) => [element, (animation.reverse as ReturnType<typeof vi.fn>).mock.calls.length])).toEqual([[dialog, 1]])
  })
})

describe('el importador de decks', () => {
  const instance = { instanceId: 'main:1:0', name: ASH.name, origin: null, roles: [], needsReview: false, apiCard: ASH }
  const DECK: DeckBuilderState = { deckName: '', main: [instance], extra: [], side: [], isEditingDeck: false }

  function Screen() {
    const [open, setOpen] = useState(true)

    return <DeckImportDrawer isOpen={open} deckBuilder={DECK} deckFormat="unlimited" onApplyImport={() => {}} onClose={() => setOpen(false)} />
  }

  it('entra por la derecha sobre un velo que se funde (antes aparecía de golpe)', () => {
    render(<Screen />)
    const drawer = screen.getByRole('dialog', { name: 'Importador de deck' })

    expect(drawer).toHaveClass('animate-side-drawer', 'motion-reduce:animate-none')
    expect(drawer.parentElement!.querySelector(':scope > button')).toHaveClass('animate-nav-scrim', 'motion-reduce:animate-none')
  })

  it('al reemplazar el deck salen los dos, el cajón (a la derecha, el velo se funde) y la confirmación: la confirmación no se queda abierta mientras el cajón sale', async () => {
    const { calls, finish } = fakeAnimate()
    render(<Screen />)

    fireEvent.change(screen.getByRole('textbox', { name: 'Lista de cartas' }), { target: { value: '3 Ash Blossom & Joyous Spring' } })
    fireEvent.click(screen.getByRole('button', { name: 'Procesar texto' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reemplazar deck actual' }))
    const confirm = screen.getByRole('alertdialog')
    fireEvent.click(within(confirm).getByRole('button', { name: 'Reemplazar deck' }))

    const drawer = screen.getByRole('dialog', { name: 'Importador de deck' })
    const root = drawer.parentElement!

    expect(leavingNow(root)).toEqual(LEAVING)
    expect(exits(calls, root)).toEqual([
      ['BUTTON', [{ opacity: 0 }]],
      ['ASIDE', [{ transform: 'translateX(100%)' }]],
    ])
    expect(leavingNow(confirm.parentElement!)).toEqual(LEAVING)

    await finish()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })
})

describe('el editor de reglas del Lab', () => {
  it('la salida de `drawer-enter` es su fotograma inicial en index.css: 1,35 rem a la derecha y transparente', () => {
    const css = readFileSync(path.join(process.cwd(), 'src', 'index.css'), 'utf8')
    const from = /@keyframes drawer-enter\s*\{\s*from\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''

    expect(from).toMatch(/opacity:\s*0;/)
    expect(from).toMatch(/transform:\s*translateX\(1\.35rem\);/)
  })

  it('al cerrarlo el panel se corre a la derecha y se funde, y el velo también (antes desaparecían de golpe); el foco ya volvió a lo que lo abrió', async () => {
    const { calls, finish } = fakeAnimate()

    function Screen() {
      const [mode, setMode] = useState<'edit' | null>(null)

      return (
        <>
          <button type="button" onClick={() => setMode('edit')}>
            Editar
          </button>
          <PatternEditorDrawer isOpen={mode !== null} mode="edit" showExamples={false} actions={{} as PatternEditorActions} canSave={false} impact={{ impact: null, pending: false }} blockReason={null} duplicateOf={null} derivedMainCards={[]} pattern={null} onPickExample={() => null} onClose={() => setMode(null)} onSave={() => {}} />
        </>
      )
    }

    render(<Screen />)
    const opener = screen.getByRole('button', { name: 'Editar' })
    opener.focus()
    fireEvent.click(opener)
    const drawer = screen.getByRole('dialog')

    fireEvent.click(within(drawer).getByRole('button', { name: 'Cancelar' }))

    const root = drawer.parentElement!

    expect(drawer).toBeInTheDocument()
    expect(leavingNow(root)).toEqual(LEAVING)
    expect(exits(calls, root)).toEqual([
      ['BUTTON', [{ opacity: 0 }]],
      ['ASIDE', [{ opacity: 0, transform: 'translateX(1.35rem)' }]],
    ])
    expect(document.activeElement).toBe(opener)

    await finish()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('la lista de un grupo de la mini guía (el menú contraído)', () => {
  const GROUPS = buildAppNavGroups(buildDeckWorkflowNavigationItems({ mainDeckCount: 42, roleCardCount: 40, unclassifiedCardCount: 3, hasCompletedRoleStep: false, patternCount: 0 }), { practice: true })

  it('pasar a otro grupo es la misma lista, sin salida; cerrada con Escape se achica y se funde (la inversa de su `pop`) sin atajar toques', async () => {
    const { calls, finish } = fakeAnimate()
    render(<AppSidebar groups={GROUPS} activeKey="export" onSelect={() => {}} collapsed onToggleCollapsed={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Descubrir' }))
    const menu = screen.getByRole('menu', { name: 'Descubrir' })

    fireEvent.click(screen.getByRole('button', { name: 'Cartas' }))
    expect(screen.getByRole('menu', { name: 'Cartas' })).toBe(menu)
    expect(calls).toHaveLength(0)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(menu).toBeInTheDocument()
    expect(leavingNow(menu)).toEqual(LEAVING)
    expect(exits(calls, menu)).toEqual([['DIV', [{ opacity: 0, transform: 'scale(0.7)' }]]])

    await finish()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('el deck de torneo', () => {
  const deck: MetaDeck = { id: 1, region: 'tcg', name: 'Branded', date: '2026-10-01', tournament: 'YCS', placement: 'Top 8', players: 500, player: 'Ana', cover: null, url: null, main: [], side: [] }
  const store = configureStore({
    reducer: {
      settings: (state = { handSize: 5, deckFormat: 'tcg' }) => state,
      deckBuilder: (state = { deckName: '', main: [], extra: [], side: [], isEditingDeck: false }) => state,
    },
  })
  const ui = (shown: MetaDeck | null) => (
    <Provider store={store}>
      <MetaDeckModal deck={shown} onClose={() => {}} onOpenDeck={() => {}} />
    </Provider>
  )

  it('sin la Web Animations API se va enseguida, como antes', () => {
    const view = render(ui(deck))

    view.rerender(ui(null))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('al cerrarlo el modal sale con el deck que se veía (no se vuelve a dibujar vacío) y sin atajar toques', async () => {
    const { finish } = fakeAnimate()
    const view = render(ui(deck))
    const dialog = screen.getByRole('dialog', { name: 'Branded' })

    view.rerender(ui(null))
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Branded')
    expect(leavingNow(dialog.parentElement!)).toEqual(LEAVING)

    await finish()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('la pregunta de pasar de fase', () => {
  const prompt = (open: boolean) => <Presence>{open ? <PassPrompt name="Ana" phase="battle" endsTurn={false} responders={[]} onAllow={() => {}} onDeny={() => {}} /> : null}</Presence>

  it('contestada, se achica y se funde (la inversa de su entrada) sin atajar toques; sin la Web Animations API se va enseguida', async () => {
    const plain = render(prompt(true))

    plain.rerender(prompt(false))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    plain.unmount()

    const { calls, finish } = fakeAnimate()
    const view = render(prompt(true))
    const box = screen.getByRole('status')

    view.rerender(prompt(false))
    expect(box).toHaveTextContent('Ana quiere pasar a la Battle Phase')
    expect(leavingNow(box)).toEqual(LEAVING)
    expect(exits(calls, box)).toEqual([['DIV', [{ opacity: 0, transform: 'scale(0.96)' }]]])

    await finish()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
