// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import data from '../data/novedades.json'
import { readLastSeen, sortEntries, writeLastSeen, type NovedadesEntry } from '../app/novedades'
import { NovedadesLink } from '../components/novedades/NovedadesLink'
import { NovedadesScreen } from '../components/novedades/NovedadesScreen'

// Los datos reales, pero sin la etiqueta «arreglo»: así el estado vacío del filtro se prueba con cualquier cantidad de entradas.
vi.mock('../data/novedades.json', async (importOriginal) => {
  const original = await importOriginal<{ default: { entries: NovedadesEntry[] } }>()

  return { default: { entries: original.default.entries.map((entry) => ({ ...entry, tags: entry.tags.filter((tag) => tag !== 'arreglo') })) } }
})

const newest = sortEntries(data.entries as NovedadesEntry[])[0]!
const LISTS = [
  ['novedades', 'Novedades'],
  ['comoSeUsa', 'Cómo se usa'],
  ['arreglos', 'Cambios y arreglos'],
  ['ojo', 'Ojo'],
] as const

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
    // Las listas vacías no se dibujan y las que tienen algo, sí (con los datos reales, sean los que sean).
    const card = document.getElementById(`novedad-${newest.id}`)!
    for (const [list, name] of LISTS) {
      const heading = within(card).queryByRole('heading', { name })
      if (newest.es[list].length > 0) expect(heading).toBeInTheDocument()
      else expect(heading).toBeNull()
    }

    // El mock saca «arreglo» de todas las entradas: esa etiqueta queda sin nada.
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

  it('un enlace a una entrada que el filtro esconde lo vuelve a «Todas» y la muestra', () => {
    const hidden = (data.entries as NovedadesEntry[]).find((entry) => !entry.tags.includes('nuevo'))
    // Sin una entrada que no sea «Nuevo» no hay cómo esconderla con ese filtro: nada que probar.
    if (!hidden) return

    render(<NovedadesScreen />)
    fireEvent.click(screen.getByRole('button', { name: /^Nuevo/ }))
    expect(document.getElementById(`novedad-${hidden.id}`)).toBeNull()

    act(() => {
      window.history.replaceState(null, '', `#novedades?entrada=${hidden.id}`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(document.getElementById(`novedad-${hidden.id}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Todas' })).toHaveAttribute('aria-pressed', 'true')
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
