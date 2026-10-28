// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FilterChips } from '../components/ui/FilterChips'
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

  it('la píldora (shape="pill"): 48 px de alto, redonda, con la lupa y la X de 44 px con el dedo; deshabilitada no se borra', () => {
    const { rerender } = render(<SearchField shape="pill" label="Buscar decks" value="elf" onChange={() => {}} />)
    const field = screen.getByRole('searchbox', { name: 'Buscar decks' })

    expect(field).toHaveClass('h-12', 'rounded-full', 'pl-11', 'pr-12', 'text-ellipsis')
    expect(field).not.toHaveClass('rounded-control')
    expect(screen.getByRole('button', { name: 'Borrar texto' })).toHaveClass('pointer-coarse:size-11')

    rerender(<SearchField shape="pill" label="Buscar decks" value="elf" onChange={() => {}} disabled />)
    expect(screen.getByRole('searchbox', { name: 'Buscar decks' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Borrar texto' })).not.toBeInTheDocument()
  })

  it('los chips de filtro son píldoras de 44 px con el dedo: interruptores con su cuenta, el elegido en violeta con texto blanco', () => {
    render(<FilterChips label="Puesto" all="Todos" allActive={false} onAll={() => {}} chips={[{ key: 'w', name: 'Winner', count: 7, active: true, onToggle: () => {} }]} variant="scroll" />)
    const chip = screen.getByRole('button', { name: 'Winner 7' })

    expect(screen.getByRole('group', { name: 'Puesto' })).toContainElement(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    expect(chip).toHaveClass('rounded-full', 'pointer-coarse:min-h-11', 'aria-pressed:bg-primary', 'aria-pressed:text-white')
    expect(chip).not.toHaveClass('rounded-control')
  })

  it('todo archivo que arma un <input type="search"> dibuja también una lupa (o pasa por SearchField)', () => {
    const files = componentFiles(join(__dirname, '..', 'components')).filter((path) => readFileSync(path, 'utf8').includes('type="search"'))

    expect(files.length).toBeGreaterThan(3)

    for (const path of files) {
      expect(readFileSync(path, 'utf8'), path).toContain('name="search"')
    }
  })
})
