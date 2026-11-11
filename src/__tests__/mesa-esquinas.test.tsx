// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { TurnClock } from '../app/duel-clock'
import { LifeBadge } from '../components/duel/LifeScore'
import { TurnDial } from '../components/duel/TurnDial'
import { Icon } from '../components/ui/Icon'
import { IconButton } from '../components/ui/IconButton'
import { CardMenu, PlayTag, SaveComboDialog } from '../components/probability/MatDialogs'
import { PhaseRow } from '../components/probability/PhaseRow'
import { RulesPill } from '../components/probability/RulesPill'
import { BottomSheet } from '../components/ui/BottomSheet'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { Harness, hand, render, tap } from './support/practice-mat-harness'

vi.mock('../ygoprodeck', () => ({ fetchCardsByIds: vi.fn(async () => []) }))

/**
 * La mesa del duelo y sus hojas van con esquinas rectas (Gastón, 2026-11-10: «no me gustan los bordes redondeados»), sin tocar los tokens globales: `mat-square` (index.css) pone en 0 los radios de los
 * tokens en la raíz de la mesa y en la de cada hoja que sale por un portal. jsdom no corre Tailwind: se le cargan los radios globales y `mat-square` de `index.css` y, por cada elemento, el radio que le
 * darían sus clases (`rounded-*`, el reset de los controles) se lee con `getComputedStyle` (las variables se heredan como en el navegador; un portal no hereda de la mesa).
 * Lo que no sale de un token (`rounded-full`, `rounded-[…]`) no lo apaga `mat-square`: es el inventario de cada prueba, que sólo puede achicarse (los círculos pasan a cuadrados con las chapas, el
 * reloj y los menús de la mesa).
 */
const CSS = readFileSync(path.resolve(__dirname, '..', 'index.css'), 'utf8')
const SQUARE = /@utility mat-square \{([^}]*)\}/.exec(CSS)![1]!
const TOKENS = [...SQUARE.matchAll(/--radius-([\w]+):\s*0px;/g)].map(([, name]) => name!)
const GLOBAL_RADII = [...CSS.matchAll(/^\s+(--radius-[a-z]+):\s*([^;]+);/gm)].map(([, name, value]) => `${name}:${value}`).join(';')
/** Las utilidades propias que dan un radio fijo (no un token). */
const FIXED_UTILITIES = [...CSS.matchAll(/@utility ([\w-]+) \{[^@]*?border-radius: (?!0|var\(--radius-)[^;]+;/g)].map(([, name]) => name!)

beforeEach(() => {
  localStorage.clear()
  HTMLElement.prototype.setPointerCapture = () => {}
  window.matchMedia = ((query: string) => ({ matches: query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
  const style = document.createElement('style')
  style.textContent = `:root{${GLOBAL_RADII}} .mat-square{${SQUARE}}`
  document.head.append(style)
})

afterEach(() => {
  cleanup()
  document.head.querySelectorAll('style').forEach((style) => style.remove())
})

/** El radio de una clase de Tailwind: el token que usa, `0` o un valor fijo (`null`: no es de radio). */
function radiusOf(className: string): { token: string } | { fixed: string } | 'zero' | null {
  const base = className.split(':').at(-1)!.replace(/^!|!$/g, '')
  const rounded = /^rounded(?:-(?:s|e|t|r|b|l|ss|se|ee|es|tl|tr|br|bl))?(?:-(.+))?$/.exec(base)

  if (rounded) {
    const size = rounded[1]

    if (size === 'none' || size === '0') return 'zero'
    return size && TOKENS.includes(size) ? { token: size } : { fixed: base }
  }
  return FIXED_UTILITIES.includes(base) ? { fixed: base } : null
}

/** `**:rounded-none!` (la raíz de la mesa, el panel de pasos, la hoja de las salidas) pone en 0, con `!important`, el radio de todo lo que lleva adentro (no el suyo). */
const SQUARED = '[class~="**:rounded-none!"]'

/** Los radios que no quedan en 0 dentro de `root` (incluido): el token que no vale 0, el estilo en línea o la clase de radio fijo. */
function roundCorners(root: Element): string[] {
  return [root, ...root.querySelectorAll('*')].flatMap((element) => {
    if (element.parentElement?.closest(SQUARED)) return []
    const style = getComputedStyle(element)
    const radii = [...element.classList].map(radiusOf).filter((radius) => radius !== null)
    // El reset de la base le da a todo control el radio de `--radius-control`, si sus clases no dicen otro.
    if (radii.length === 0 && /^(BUTTON|INPUT|SELECT|TEXTAREA)$/.test(element.tagName)) radii.push({ token: 'control' })
    const inline = (['borderRadius', 'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomLeftRadius', 'borderBottomRightRadius'] as const).map((key) => style[key]).filter((value) => value && !/^0(px)?$/.test(value))

    return [
      ...radii.flatMap((radius) => {
        if (radius === 'zero') return []
        if ('fixed' in radius) return [radius.fixed]
        const value = style.getPropertyValue(`--radius-${radius.token}`).trim()

        return value === '0px' ? [] : [`--radius-${radius.token}: ${value || 'sin valor'}`]
      }),
      ...inline.map((value) => `style: ${value}`),
    ]
  })
}

const ITEMS = [
  { label: 'Invocación Normal', onSelect: () => {} },
  { label: 'Colocar', onSelect: () => {} },
  { label: 'Al deck', onSelect: () => {}, utility: true, children: [{ label: 'Arriba', onSelect: () => {} }] },
]

describe('la mesa del duelo y sus hojas van con esquinas rectas', () => {
  it('los tokens globales no cambian: fuera de la mesa, una tarjeta y un botón siguen redondeados', () => {
    const outside = document.createElement('div')
    outside.className = 'rounded-card'
    outside.append(document.createElement('button'))
    document.body.append(outside)

    expect(roundCorners(outside)).toEqual(['--radius-card: 1rem', '--radius-control: 0.75rem'])
  })

  it('en la mesa ningún radio sale de un token: las casillas, las tarjetas, los botones y los paneles quedan rectos', () => {
    render(<Harness />)
    const mesa = screen.getByRole('region', { name: 'Mesa de práctica' })

    expect(mesa).toHaveClass('mat-square', '**:rounded-none!')
    // Ningún radio fijo: los círculos de la barra (`IconButton`, la píldora de salidas) los endereza `**:rounded-none!` sin cambiar esos componentes fuera de la mesa. Que no vuelva ninguno.
    expect(roundCorners(mesa)).toEqual([])
  })

  it('el panel «Pasos y combos» es recto: el lateral de escritorio (dentro de la mesa) y el diálogo del celular, con sus círculos de los pasos', () => {
    const plays = [{ type: 'activate', id: 'card-1-1' }, { type: 'target', id: 'card-2-1' }] satisfies ComponentProps<typeof Harness>['actions']
    // Escritorio: el panel va al costado, dentro de la mesa.
    const phone = window.matchMedia
    window.matchMedia = ((query: string) => ({ ...phone(query), matches: query.includes('reduce') || query.includes('min-width: 1101px') })) as typeof window.matchMedia
    render(<Harness actions={plays} />)
    const side = screen.getByRole('region', { name: 'Pasos y combos' })

    expect(side.closest('[aria-label="Mesa de práctica"]')).toHaveClass('**:rounded-none!')
    expect(roundCorners(side)).toEqual([])
    cleanup()

    // Celular: el mismo panel en un diálogo (un portal, fuera de la mesa), recto también.
    window.matchMedia = phone
    render(<Harness actions={plays} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Pasos y combos' })[0]!)
    const dialog = screen.getByRole('dialog', { name: 'Pasos y combos' })

    expect(dialog.closest('.mat-square')).not.toBeNull()
    expect(within(dialog).getAllByRole('listitem').length).toBeGreaterThan(0)
    expect(roundCorners(dialog.closest('.mat-square')!)).toEqual([])
  })

  it('la hoja de «Salidas y problemas» que abre la píldora de la barra (un portal) es recta, con sus fichas', () => {
    render(
      <RulesPill summary={{ openings: 1, problems: 1, unplayable: false, blocked: false }}>
        <button type="button" className="rounded-full">
          Salida básica
        </button>
      </RulesPill>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^Salidas y problemas de tu mano/ }))
    const sheet = screen.getByRole('dialog', { name: 'Salidas y problemas de tu mano' })

    expect(sheet).toHaveClass('mat-square')
    expect(roundCorners(sheet)).toEqual([])
  })

  it('la hoja de una carta del celular (`CardSheet`), abierta desde la mesa, también es recta', () => {
    render(<Harness />)
    tap(within(hand()).getByRole('listitem', { name: 'Ash Blossom' }))
    const sheet = screen.getByRole('region', { name: 'Ash Blossom' })

    expect(sheet).toHaveClass('mat-square')
    // La hoja, la caja de la carta, las jugadas, el asa, la X y la lupa: todo recto.
    expect(within(sheet).getAllByRole('menuitem').length).toBeGreaterThan(0)
    expect(roundCorners(sheet)).toEqual([])
  })

  it('la línea de las fases (`PhaseRow`) y los diálogos de la mesa (guardar un combo) son rectos; un `Modal` del resto de la app, no', () => {
    render(
      <>
        <PhaseRow anchor={new DOMRect(100, 300, 40, 40)} items={[{ label: 'Draw Phase', onSelect: () => {}, current: true }, { label: 'Main Phase 1', onSelect: () => {} }]} onClose={() => {}} />
        <SaveComboDialog isOpen defaultName="Combo" onSave={() => {}} onClose={() => {}} />
        <Modal isOpen onClose={() => {}} size="sm" title="Exportar">
          <Button>Copiar</Button>
        </Modal>
      </>,
    )
    const row = document.querySelector('[data-phase-row]')!.closest('.mat-square')!
    const save = screen.getByRole('dialog', { name: 'Guardar combo' }).closest('.mat-square')!

    expect(row.querySelectorAll('[role="menuitem"]')).toHaveLength(2)
    expect([...roundCorners(row), ...roundCorners(save)]).toEqual([])
    expect(roundCorners(screen.getByRole('dialog', { name: 'Exportar' }))).not.toEqual([])
  })

  it('la hoja de abajo (`BottomSheet`), el menú de escritorio (`CardMenu`, con su submenú) y la etiqueta de una jugada (`PlayTag`) son rectos', () => {
    render(
      <>
        <BottomSheet label="Cadena" head={<p>Cadena</p>} footer={<Button>Pasar</Button>}>
          <Button variant="secondary">Ver</Button>
        </BottomSheet>
        <CardMenu anchor={new DOMRect(100, 100, 60, 90)} kicker="Mano" title="Ash Blossom" items={ITEMS} onClose={() => {}} />
        <PlayTag anchor={new DOMRect(300, 300, 60, 90)} item={ITEMS[0]!} name="Ash Blossom" onClose={() => {}} />
      </>,
    )
    fireEvent.click(screen.getByRole('menuitem', { name: 'Al deck' }))
    const portals = [...document.body.children].filter((child) => child.classList.contains('mat-square'))

    expect(portals).toHaveLength(3)
    expect(screen.getByRole('menu', { name: 'Al deck' })).toBeInTheDocument()
    // El asa de la hoja (la pastilla y su raya) también es recta.
    expect(portals.flatMap(roundCorners)).toEqual([])
  })

  it('las chapas de vidas, la botonera y el reloj de turnos son rectos: ningún círculo; el reloj no anima `stroke-dashoffset` sino una barra con `scaleX`', () => {
    render(
      <div className="mat-square">
        <LifeBadge name="Vos" label="Vos" life={8000} mine turn="Tu turno · 1" onClick={() => {}} />
        <LifeBadge name="Rival" label="Rival" life={8000} />
        <IconButton tone="tile" size="sm" aria-label="Pasos y combos">
          <Icon name="list" />
        </IconButton>
        <TurnDial clock={{ banks: [120_000, 180_000], running: null, at: 0, span: 180_000 } satisfies TurnClock} owner={0} me={0} names={['Vos', 'Ana']} />
      </div>,
    )
    const table = document.querySelector('.mat-square')!

    expect(roundCorners(table)).toEqual([])
    expect(table.innerHTML).not.toMatch(/rounded-full|stroke-dash|<circle/)
    expect(screen.getByTestId('turn-dial-bar')).toHaveClass('origin-left', 'motion-reduce:transition-none')
    expect(screen.getByTestId('turn-dial-bar').style.transform).toMatch(/^scaleX\(0\.\d+\)$/)
  })
})
