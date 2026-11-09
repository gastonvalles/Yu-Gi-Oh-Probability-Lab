// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import data from '../data/novedades.json'
import {
  entryFromHash,
  entryHash,
  filterByTag,
  hasUnseen,
  NOVEDADES_LISTS,
  NOVEDADES_SEEN_EVENT,
  NOVEDADES_TAGS,
  readLastSeen,
  sortEntries,
  writeLastSeen,
  type NovedadesEntry,
} from '../app/novedades'

const copy = (title: string) => ({ title, novedades: [], comoSeUsa: [], arreglos: [], ojo: [] })
const entry = (id: string, date: string, tags: NovedadesEntry['tags'] = ['nuevo']): NovedadesEntry => ({ id, date, tags, es: copy(id), en: copy(id) })

describe('novedades: helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('ordena de la más nueva a la más vieja (el mismo día, por id) y filtra por etiqueta', () => {
    const list = [entry('a', '2026-01-02', ['arreglo']), entry('c', '2026-03-01', ['nuevo', 'mejora']), entry('b', '2026-03-01', ['mejora'])]

    expect(sortEntries(list).map((item) => item.id)).toEqual(['c', 'b', 'a'])
    expect(filterByTag(list, 'mejora').map((item) => item.id)).toEqual(['c', 'b'])
    expect(filterByTag(list, 'all')).toHaveLength(3)
    expect(filterByTag(list, 'arreglo').map((item) => item.id)).toEqual(['a'])
  })

  it('hay novedades si la más nueva no es la última vista; sin almacenamiento (undefined) o sin entradas, no', () => {
    const list = [entry('vieja', '2026-01-01'), entry('nueva', '2026-02-01')]

    expect(hasUnseen(list, null)).toBe(true)
    expect(hasUnseen(list, 'vieja')).toBe(true)
    expect(hasUnseen(list, 'nueva')).toBe(false)
    expect(hasUnseen(list, undefined)).toBe(false)
    expect(hasUnseen([], null)).toBe(false)
  })

  it('guarda la última vista, avisa a la pestaña y no rompe si el almacenamiento falla', () => {
    const heard = vi.fn()
    window.addEventListener(NOVEDADES_SEEN_EVENT, heard)

    expect(readLastSeen()).toBeNull()
    writeLastSeen('nueva')
    expect(readLastSeen()).toBe('nueva')
    expect(heard).toHaveBeenCalledTimes(1)
    window.removeEventListener(NOVEDADES_SEEN_EVENT, heard)

    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado')
    })
    expect(readLastSeen()).toBeUndefined()
    expect(() => writeLastSeen('otra')).not.toThrow()
  })

  it('el ancla va y vuelve por el hash', () => {
    expect(entryHash('2026-11-09-paleta')).toBe('#novedades?entrada=2026-11-09-paleta')
    expect(entryFromHash(entryHash('2026-11-09-paleta'))).toBe('2026-11-09-paleta')
    expect(entryFromHash('#novedades')).toBeNull()
    expect(entryFromHash('#meta?entrada=x')).toBeNull()
  })
})

describe('novedades: el JSON', () => {
  const entries = data.entries as NovedadesEntry[]

  it('tiene entradas con id único, fecha válida y etiquetas conocidas', () => {
    expect(entries.length).toBeGreaterThan(0)
    expect(new Set(entries.map((item) => item.id)).size).toBe(entries.length)

    for (const item of entries) {
      expect(item.date, item.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(new Date(`${item.date}T00:00:00Z`).toISOString().slice(0, 10), item.id).toBe(item.date)
      expect(item.tags.length, item.id).toBeGreaterThan(0)
      for (const tag of item.tags) expect(NOVEDADES_TAGS, item.id).toContain(tag)
    }
  })

  it('cada entrada está en español y en inglés, con título y las mismas viñetas por lista', () => {
    for (const item of entries) {
      expect(item.es.title.trim(), item.id).not.toBe('')
      expect(item.en.title.trim(), item.id).not.toBe('')

      for (const list of NOVEDADES_LISTS) {
        expect(Array.isArray(item.es[list]), `${item.id} es.${list}`).toBe(true)
        expect(item.en[list].length, `${item.id} ${list}`).toBe(item.es[list].length)
        for (const text of [...item.es[list], ...item.en[list]]) expect(text.trim(), `${item.id} ${list}`).not.toBe('')
      }
    }
  })
})
