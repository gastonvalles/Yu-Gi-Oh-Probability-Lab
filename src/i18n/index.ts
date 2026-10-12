import { en } from './en'
import { es } from './es'
import type { MessageArgs, MessageKey, Messages, PluralMessage } from './types'

export type { MessageKey } from './types'

export type Locale = 'es' | 'en'
export const LOCALES: readonly Locale[] = ['es', 'en']
export const LOCALE_STORAGE_KEY = 'ygo-lab:locale'

const MESSAGES: Record<Locale, Messages> = { es, en }
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
  return formatMessage(MESSAGES[current][key] as string | PluralMessage, args[0] as Record<string, string | number> | undefined, current)
}

/** Los textos de `index.html` que ven los buscadores y los links compartidos quedan en español; en el navegador se pasan al idioma elegido. */
export function syncSiteMeta(): void {
  const set = (selector: string, value: string) => document.querySelector(selector)?.setAttribute('content', value)

  set('meta[name="description"]', t('common.siteDescription'))
  set('meta[property="og:description"]', t('common.siteDescription'))
  set('meta[property="og:image:alt"]', t('common.siteImageAlt'))
  set('meta[property="og:locale"]', current === 'es' ? 'es_AR' : 'en_US')
}
