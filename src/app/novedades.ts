/**
 * Novedades: las notas del parche para quien usa la página (`src/data/novedades.json`). Acá van los tipos, el orden, el filtro, el ancla compartible
 * (`#novedades?entrada=<id>`) y la «última vista» guardada en el navegador, que decide el punto de «hay novedades» del menú.
 * El JSON no se importa acá: el menú lo pide aparte (`import()`) para no sumarlo a lo primero que baja la app.
 */

// i18n-ignore: son las claves de las etiquetas en el JSON (el nombre que se ve sale de `novedades.tag.*`)
export const NOVEDADES_TAGS = ['nuevo', 'mejora', 'arreglo'] as const
export type NovedadesTag = (typeof NOVEDADES_TAGS)[number]

/** Las cuatro listas de una entrada, en el orden en que se leen (una vacía no se dibuja). */
export const NOVEDADES_LISTS = ['novedades', 'comoSeUsa', 'arreglos', 'ojo'] as const
export type NovedadesList = (typeof NOVEDADES_LISTS)[number]

export type NovedadesCopy = { title: string } & Record<NovedadesList, string[]>

export interface NovedadesEntry {
  id: string
  /** AAAA-MM-DD. */
  date: string
  tags: NovedadesTag[]
  es: NovedadesCopy
  en: NovedadesCopy
}

/** Lo más nuevo primero; el mismo día, por id (estable entre recargas). */
export function sortEntries(entries: readonly NovedadesEntry[]): NovedadesEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
}

/** `'all'` las deja todas. */
export function filterByTag(entries: readonly NovedadesEntry[], tag: NovedadesTag | 'all'): NovedadesEntry[] {
  return tag === 'all' ? [...entries] : entries.filter((entry) => entry.tags.includes(tag))
}

/**
 * Si hay algo que no se vio: la entrada más nueva no es la última vista. `undefined` es «no se puede leer el almacenamiento»: sin punto (la app anda igual).
 * Sin nada guardado (`null`, la primera visita) hay novedades.
 */
export function hasUnseen(entries: readonly NovedadesEntry[], lastSeenId: string | null | undefined): boolean {
  const newest = sortEntries(entries)[0]

  return lastSeenId !== undefined && newest !== undefined && newest.id !== lastSeenId
}

export const NOVEDADES_SEEN_KEY = 'ygo-lab:novedades-seen'
/** Lo avisa esta pestaña al guardar (las otras se enteran por `storage`). */
export const NOVEDADES_SEEN_EVENT = 'ygo-lab:novedades-seen'

/** La última entrada vista; `null` si nunca se abrió; `undefined` si el almacenamiento no se puede leer. */
export function readLastSeen(): string | null | undefined {
  try {
    return window.localStorage.getItem(NOVEDADES_SEEN_KEY)
  } catch {
    return undefined
  }
}

export function writeLastSeen(id: string): void {
  try {
    window.localStorage.setItem(NOVEDADES_SEEN_KEY, id)
    window.dispatchEvent(new Event(NOVEDADES_SEEN_EVENT))
  } catch {
    // Sin almacenamiento no hay punto que apagar.
  }
}

/** El enlace a una entrada: abre Novedades y la resalta. */
export function entryHash(id: string): string {
  return `#novedades?entrada=${encodeURIComponent(id)}`
}

/** La entrada que pide el hash (`#novedades?entrada=<id>`), o null. */
export function entryFromHash(hash: string): string | null {
  const [step = '', query = ''] = hash.replace(/^#/, '').split('?')

  return step === 'novedades' ? new URLSearchParams(query).get('entrada') : null
}
