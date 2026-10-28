// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Button } from '../components/ui/Button'
import { Carousel } from '../components/ui/Carousel'
import { ListGroup, ListRow } from '../components/ui/ListRow'
import { SectionHeader } from '../components/ui/SectionHeader'
import { ShortcutGrid, ShortcutTile } from '../components/ui/ShortcutGrid'

afterEach(cleanup)

describe('ListRow y ListGroup', () => {
  it('una lista es una sola tarjeta con filas: botón con flecha, enlace, fila quieta con su botón y elegida', () => {
    const open = vi.fn()

    render(
      <ListGroup label="Salas">
        <ListRow initials="NI" title="Sala de Nico" subtitle="Match · TCG" end={<Button size="sm">Entrar</Button>} />
        <ListRow initials="LU" title="Lu vs Fede" onClick={open} selected />
        <ListRow icon="trophy" title="Ganaste" href="#ganaste" />
      </ListGroup>,
    )

    const list = screen.getByRole('list', { name: 'Salas' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
    // Una sola caja: la de la lista; adentro, las filas no llevan borde propio (las separa `divide-y`).
    expect(list).toHaveClass('rounded-card', 'divide-y')
    expect(list.querySelectorAll('.border, .rounded-card')).toHaveLength(0)

    const row = screen.getByRole('button', { name: /Lu vs Fede/ })
    expect(row).toHaveAttribute('aria-current', 'true')
    expect(row).toHaveClass('min-h-16', 'focus-visible:shadow-focus')
    fireEvent.click(row)
    expect(open).toHaveBeenCalledOnce()

    expect(screen.getByRole('link', { name: /Ganaste/ })).toHaveAttribute('href', '#ganaste')
    // La fila con su botón no es un botón: el único objetivo es «Entrar».
    expect(screen.queryByRole('button', { name: /Sala de Nico/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('con `toggle`, la fila entera es el interruptor: el título es su nombre y el apoyo, su descripción', () => {
    const onChange = vi.fn()

    render(
      <ListGroup>
        <ListRow title="Límite de tiempo" subtitle="Corre sólo en tu turno." toggle={{ checked: false, onChange }} />
      </ListGroup>,
    )

    const toggle = screen.getByRole('switch', { name: 'Límite de tiempo' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(toggle).toHaveAccessibleDescription('Corre sólo en tu turno.')
    fireEvent.click(toggle)
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('apagada no se toca; cargando dice `aria-busy`; vacía muestra el estado vacío', () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <ListGroup>
        <ListRow title="Cerrada" disabled onClick={onClick} />
      </ListGroup>,
    )

    expect(screen.getByRole('button', { name: 'Cerrada' })).toBeDisabled()

    rerender(<ListGroup label="Cargando" loading />)
    expect(screen.getByRole('list', { name: 'Cargando' })).toHaveAttribute('aria-busy', 'true')

    rerender(<ListGroup label="Vacía" empty="Todavía no hay salas" />)
    expect(screen.getByText('Todavía no hay salas')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})

describe('ShortcutGrid y ShortcutTile', () => {
  it('cuatro por fila (dos si la grilla es angosta), cada atajo con su borde y la insignia en el nombre accesible', () => {
    const onClick = vi.fn()

    render(
      <ShortcutGrid label="Atajos">
        <ShortcutTile icon="cards" label="Deck" onClick={onClick} />
        <ShortcutTile icon="tag" label="Roles" badge={{ text: '3', label: '3 cartas sin rol' }} />
        <ShortcutTile icon="heart" label="Vidas" href="#vidas" />
      </ShortcutGrid>,
    )

    const grid = screen.getByRole('list', { name: 'Atajos' })
    expect(grid).toHaveClass('grid-cols-2', '@min-[19rem]:grid-cols-4')

    const deck = screen.getByRole('button', { name: 'Deck' })
    expect(deck).toHaveClass('rounded-card', 'border', 'min-h-23', 'focus-visible:shadow-focus')
    fireEvent.click(deck)
    expect(onClick).toHaveBeenCalledOnce()

    expect(screen.getByRole('button', { name: 'Roles, 3 cartas sin rol' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Vidas' })).toHaveAttribute('href', '#vidas')

    // La insignia es un aro ámbar sobre el lienzo, nunca un relleno ámbar con texto blanco.
    const badge = screen.getByText('3')
    expect(badge).toHaveClass('border-info', 'bg-background', 'text-info')
    expect(badge.className).not.toMatch(/\bbg-info\b|text-white/)
  })

  it('apagado se ve al 40 % pero sigue enfocable y el clic llega (para decir qué falta); cargando dice `aria-busy`', () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <ShortcutGrid>
        <ShortcutTile icon="download" label="Exportar" disabled onClick={onClick} />
      </ShortcutGrid>,
    )

    const tile = screen.getByRole('button', { name: 'Exportar' })
    expect(tile).toHaveAttribute('aria-disabled', 'true')
    expect(tile).not.toBeDisabled()
    fireEvent.click(tile)
    expect(onClick).toHaveBeenCalledOnce()

    rerender(<ShortcutGrid label="Cargando" loading={4} />)
    expect(screen.getByRole('list', { name: 'Cargando' })).toHaveAttribute('aria-busy', 'true')
  })
})

describe('SectionHeader con enlace', () => {
  it('la acción es un enlace ámbar de 44 px de toque que no agranda el renglón, botón o `<a>`', () => {
    const onClick = vi.fn()

    render(
      <>
        <SectionHeader title="En la arena ahora" link={{ label: 'Ver las 12', onClick }} />
        <SectionHeader title="Tus decks" link={{ label: 'Ver todos', href: '#decks' }} />
      </>,
    )

    const button = screen.getByRole('button', { name: 'Ver las 12' })
    expect(button).toHaveClass('text-info-soft', 'min-h-11', '-my-2.25')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'Ver todos' })).toHaveAttribute('href', '#decks')
  })

  it('sin enlace queda como siempre', () => {
    render(<SectionHeader title="Reglas" actions={<Button>Sumar</Button>} />)

    expect(screen.getByRole('heading', { name: 'Reglas' })).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})

describe('Carousel', () => {
  it('es una región «carrusel» con cada tarjeta «N de M» y puntos con nombre que llevan a la suya', () => {
    const scrolled: string[] = []
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.getAttribute('aria-label') ?? '')
    }

    render(
      <Carousel label="Decks ganadores">
        <button type="button">Uno</button>
        <button type="button">Dos</button>
        <button type="button">Tres</button>
      </Carousel>,
    )

    const region = screen.getByRole('region', { name: 'Decks ganadores' })
    expect(region).toHaveAttribute('aria-roledescription', 'carrusel')
    expect(within(region).getAllByRole('group').map((slide) => slide.getAttribute('aria-label'))).toEqual(['1 de 3', '2 de 3', '3 de 3'])

    expect(screen.getByRole('button', { name: 'Ver la 1 de 3' })).toHaveAttribute('aria-current', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Ver la 3 de 3' }))
    expect(scrolled).toEqual(['3 de 3'])
    expect(screen.getByRole('button', { name: 'Ver la 3 de 3' })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Ver lo que sigue' })).toBeDisabled()

    // Con el foco adentro, ← y → pasan de a una.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Uno' }), { key: 'ArrowLeft' })
    expect(scrolled.at(-1)).toBe('2 de 3')
    expect(screen.getByRole('button', { name: 'Ver la 2 de 3' })).toHaveAttribute('aria-current', 'true')
  })

  it('con una sola tarjeta no hay puntos ni flechas', () => {
    render(
      <Carousel label="Un deck">
        <p>Único</p>
      </Carousel>,
    )

    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

describe('el código de las piezas', () => {
  it('sin tamaños de texto sueltos ni clases armadas con `${}`, y sin sombras que caen', () => {
    for (const file of ['ListRow.tsx', 'ShortcutGrid.tsx', 'Carousel.tsx', 'SectionHeader.tsx']) {
      const source = readFileSync(path.join(process.cwd(), 'src', 'components', 'ui', file), 'utf8')

      expect(source, file).not.toMatch(/text-\[/)
      expect(source, file).not.toMatch(/className=\{`/)
      expect(source, file).not.toMatch(/shadow-(card|overlay|lg|md|xl)\b/)
    }
  })
})
