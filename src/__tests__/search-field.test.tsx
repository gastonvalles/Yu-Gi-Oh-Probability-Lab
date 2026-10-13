// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SearchField } from '../components/ui/SearchField'

afterEach(cleanup)

/** Todos los archivos .tsx de `src/components`, menos los de pruebas. */
function componentFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)

    return statSync(path).isDirectory() ? componentFiles(path) : path.endsWith('.tsx') ? [path] : []
  })
}

describe('los campos de búsqueda llevan la lupa', () => {
  it('SearchField: el nombre es el rótulo (no se ve), lleva la lupa, y avisa lo que se escribe', () => {
    const onChange = vi.fn()
    const { container } = render(<SearchField label="Buscar decks" value="" placeholder="Deck, torneo o jugador" onChange={onChange} />)

    const field = screen.getByRole('searchbox', { name: 'Buscar decks' })

    expect(field).toHaveAttribute('placeholder', 'Deck, torneo o jugador')
    expect(container.querySelector('svg')).not.toBeNull()
    expect(field).toHaveClass('pl-9')

    fireEvent.change(field, { target: { value: 'elfnote' } })

    expect(onChange).toHaveBeenCalledWith('elfnote')
  })

  it('con algo escrito hay una X que lo borra y devuelve el foco al campo; vacío, no hay X (la del navegador va oculta)', () => {
    const onChange = vi.fn()
    const { rerender } = render(<SearchField label="Buscar decks" value="" onChange={onChange} />)

    expect(screen.queryByRole('button', { name: 'Borrar texto' })).not.toBeInTheDocument()

    rerender(<SearchField label="Buscar decks" value="elf" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Borrar texto' }))

    expect(onChange).toHaveBeenCalledWith('')
    expect(screen.getByRole('searchbox', { name: 'Buscar decks' })).toHaveFocus()
  })

  it('todo archivo que arma un <input type="search"> dibuja también una lupa (o pasa por SearchField)', () => {
    const files = componentFiles(join(__dirname, '..', 'components')).filter((path) => readFileSync(path, 'utf8').includes('type="search"'))

    expect(files.length).toBeGreaterThan(3)

    for (const path of files) {
      expect(readFileSync(path, 'utf8'), path).toContain('name="search"')
    }
  })
})
