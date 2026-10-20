import { es } from './es'
import type { MessageArgs, MessageKey, Messages, PluralMessage } from './types'

export type { MessageKey } from './types'

export type Locale = 'es' | 'en'
export const LOCALES: readonly Locale[] = ['es', 'en']
export const LOCALE_STORAGE_KEY = 'ygo-lab:locale'

/**
 * Los textos de cada idioma. El español (el de siempre, el de quien llega sin elegir) viene con el archivo principal; el inglés es **otro archivo** que se baja sólo si es el idioma de la página (`loadLocale`): la
 * mitad de los textos de la app no viaja a quien no la usa. Hasta que llega, `t()` dice el español (la página no se pinta antes: `main.tsx` espera `loadLocale`).
 */
const MESSAGES: Partial<Record<Locale, Messages>> = { es }
const LOADERS: Partial<Record<Locale, () => Promise<Messages>>> = { en: () => import('./en').then((module) => module.en) }
const PLURAL_RULES: Record<Locale, Intl.PluralRules> = { es: new Intl.PluralRules('es'), en: new Intl.PluralRules('en') }

/** Etiquetas de `Intl` de cada idioma: números y fechas del español como estaban antes de traducir (coma decimal; día/mes/año). */
const INTL_TAGS: Record<Locale, { number: string; date: string; currency: string }> = {
  es: { number: 'es-ES', date: 'es-AR', currency: 'es-AR' },
  en: { number: 'en-US', date: 'en-US', currency: 'en-US' },
}

function isLocale(value: unknown): value is Locale {
  return value === 'es' || value === 'en'
}

/** Lo que eligió el usuario manda; si no, el primer idioma del navegador que la app tenga; si ninguno, inglés. Fuera del navegador, español. */
export function detectLocale(): Locale {
  if (typeof window === 'undefined') {
    // Un worker no ve el almacenamiento ni la página: quien lo crea le pasa el idioma como nombre (`new Worker(url, { name: getLocale() })`).
    const workerName = typeof self === 'undefined' ? undefined : (self as { name?: string }).name

    return isLocale(workerName) ? workerName : 'es'
  }

  try {
    const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY)

    if (isLocale(saved)) {
      return saved
    }
  } catch { /* sin acceso al almacenamiento: decide el navegador */ }

  for (const language of window.navigator.languages ?? [window.navigator.language]) {
    const base = language.slice(0, 2).toLowerCase()

    if (isLocale(base)) {
      return base
    }
  }

  return 'en'
}

let current: Locale = detectLocale()

/** Baja los textos de un idioma (el español ya está; el inglés es un archivo aparte). Antes de pintar, el de la página: `main.tsx` y el worker del Lab lo esperan. */
export async function loadLocale(locale: Locale): Promise<void> {
  const load = MESSAGES[locale] === undefined ? LOADERS[locale] : undefined

  if (load) MESSAGES[locale] = await load()
}

export function getLocale(): Locale {
  return current
}

/** Cambia el idioma de todo lo que se arme de ahí en adelante, y el `lang` de la página. `setLocale` es la que lo guarda y recarga. */
export function applyLocale(locale: Locale): void {
  current = locale

  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale
  }
}

applyLocale(current)

/**
 * Guarda el idioma y recarga la página. Todo el texto se arma al dibujar: recargar es lo único que no deja nada del otro idioma
 * en pantalla (lo que importa está guardado: deck, reglas, builds; sólo se pierde lo abierto, como una práctica en curso).
 */
export function setLocale(locale: Locale): void {
  if (locale === current) {
    return
  }

  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale)
  } catch { /* sin almacenamiento no se puede recordar, pero se cambia igual por esta visita */ }

  window.location.reload()
}

export const numberLocale = (): string => INTL_TAGS[current].number
export const dateLocale = (): string => INTL_TAGS[current].date
export const currencyLocale = (): string => INTL_TAGS[current].currency

/**
 * Un objeto de `Intl` por etiqueta de idioma, armado la primera vez que se pide: construir uno cuesta entre 40 y 190 µs y las listas lo piden por fila.
 * Se guarda por etiqueta (nunca uno solo) para que `applyLocale` siga cambiando lo que sale; los de `Intl` no cambian, así que se comparten.
 */
export function perLocale<T>(make: (tag: string) => T): (tag: string) => T {
  const made = new Map<string, T>()

  return (tag) => {
    let value = made.get(tag)

    if (value === undefined) {
      value = make(tag)
      made.set(tag, value)
    }

    return value
  }
}

const dayFormats = new Map<string, Intl.DateTimeFormat>()

/** El formato del día en el idioma actual. El de una zona fija se arma una vez por idioma; el de la zona del usuario, cada vez: la lee al armarse y así sigue un cambio de zona con la página abierta. */
function dayFormat(timeZone: string | undefined): Intl.DateTimeFormat {
  const make = () => {
    const options: Intl.DateTimeFormatOptions = current === 'es' ? { day: '2-digit', month: '2-digit', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' }

    return new Intl.DateTimeFormat(dateLocale(), { ...options, timeZone })
  }

  if (timeZone === undefined) {
    return make()
  }

  const key = `${current}|${timeZone}`
  let format = dayFormats.get(key)

  if (!format) {
    format = make()
    dayFormats.set(key, format)
  }

  return format
}

/**
 * Un día con año: "12/10/2026" en español y "Oct 12, 2026" en inglés (el número solo se confunde día con mes). Con `timeZone` el día
 * se lee en esa zona (los de torneo, en UTC); sin ella, en la del usuario. Una fecha que no se entiende se muestra tal cual.
 */
export function formatDay(value: Date | string | number, timeZone?: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return String(value)
  }

  return dayFormat(timeZone).format(date)
}

/** Arma un mensaje: elige la forma plural con `count` y reemplaza cada {nombre} por su parámetro (si falta, queda el {nombre}). */
export function formatMessage(message: string | PluralMessage, params: Record<string, string | number> | undefined, locale: Locale): string {
  const text = typeof message === 'string' ? message : message[PLURAL_RULES[locale].select(Number(params?.count)) === 'one' ? 'one' : 'other']

  return params ? text.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in params ? String(params[name]) : placeholder)) : text
}

/**
 * Traduce un mensaje al idioma actual. Los números van tal cual en el texto (quien quiere separador de miles pasa
 * `formatInteger(n)`); un mensaje plural elige su forma con `count`.
 * Se llama al dibujar, nunca al evaluar un módulo: las tablas guardan claves, no textos.
 */
export function t<K extends MessageKey>(key: K, ...args: MessageArgs<K>): string {
  // Si el idioma todavía no llegó (o no se pudo bajar), se dice en español: nunca una clave suelta.
  return formatMessage((MESSAGES[current] ?? es)[key] as string | PluralMessage, args[0] as Record<string, string | number> | undefined, current)
}

/** Los textos de `index.html` que ven los buscadores y los links compartidos quedan en español; en el navegador se pasan al idioma elegido. */
export function syncSiteMeta(): void {
  const set = (selector: string, value: string) => document.querySelector(selector)?.setAttribute('content', value)

  set('meta[name="description"]', t('common.siteDescription'))
  set('meta[property="og:description"]', t('common.siteDescription'))
  set('meta[property="og:image:alt"]', t('common.siteImageAlt'))
  set('meta[property="og:locale"]', current === 'es' ? 'es_AR' : 'en_US')
}
