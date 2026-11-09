// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import data from '../data/novedades.json'
import { readLastSeen, sortEntries, writeLastSeen, type NovedadesEntry } from '../app/novedades'
import { NovedadesLink } from '../components/novedades/NovedadesLink'
import { NovedadesScreen } from '../components/novedades/NovedadesScreen'

const newest = sortEntries(data.entries as NovedadesEntry[])[0]!

describe('Novedades', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    window.localStorage.clear()
    window.history.replaceState(null, '', '#')
  })

  it('muestra cada entrada con sus listas, filtra por etiqueta y, sin nada, el vacío vuelve a «Todas»', () => {
    render(<NovedadesScreen />)

    expect(screen.getByRole('heading', { level: 1, name: 'Novedades' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: newest.es.title })).toBeInTheDocument()
    // Las listas vacías no se dibujan.
    expect(screen.queryByRole('heading', { name: 'Cómo se usa' })).toBeNull()
    expect(screen.getByRole('heading', { name: 'Cambios y arreglos' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Arreglo 0' }))
    expect(screen.getByText('No hay novedades con esta etiqueta')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ver todas' }))
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { name: newest.es.title })).toBeInTheDocument()
  })

  it('abrir la pantalla guarda la más nueva como vista', () => {
    render(<NovedadesScreen />)

    expect(readLastSeen()).toBe(newest.id)
  })

  it('el ancla baja hasta la entrada y la enmarca en lima', () => {
    window.history.replaceState(null, '', `#novedades?entrada=${newest.id}`)
    render(<NovedadesScreen />)

    const card = document.getElementById(`novedad-${newest.id}`)!
    expect(card).toHaveClass('border-info/28')
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
  })

  it('el enlace del menú lleva un punto mientras la más nueva no se vio', async () => {
    render(<NovedadesLink />)

    const link = screen.getByRole('link', { name: /Novedades/ })
    expect(link).toHaveAttribute('href', '#novedades')
    await waitFor(() => expect(link).toHaveAccessibleName('Novedades (hay novedades sin leer)'))

    act(() => writeLastSeen(newest.id))
    expect(link).toHaveAccessibleName('Novedades')
  })
})
