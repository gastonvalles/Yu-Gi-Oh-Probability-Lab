import { currencyLocale, numberLocale, perLocale, t } from '../i18n'
import type { DeckFormat } from '../types'

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function buildInitials(name: string): string {
  const pieces = name
    .split(/\s+/)
    .filter((piece) => piece.length > 0)
    .slice(0, 2)

  if (pieces.length === 0) {
    return 'YG'
  }

  return pieces.map((piece) => piece[0]?.toUpperCase() ?? '').join('')
}

export function toNonNegativeInteger(value: string, fallback: number): number {
  const parsedValue = Number.parseInt(value, 10)

  if (!Number.isInteger(parsedValue) || parsedValue < 0) {
    return fallback
  }

  return parsedValue
}

export function parseRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(t('shell.parse.integer', { field: fieldName }))
  }

  return value
}

export function parseRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(t('shell.parse.string', { field: fieldName }))
  }

  return value
}

export function parseNullableInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return null
  }

  return value
}

export function parseNullableDisplayString(value: unknown): string | null {
  if (typeof value === 'number') {
    return String(value)
  }

  if (typeof value === 'string') {
    return value
  }

  return null
}

export function parseNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function parseArray(value: unknown, fieldName: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(t('shell.parse.array', { field: fieldName }))
  }

  return value
}

export function parseDeckFormat(value: unknown): DeckFormat {
  if (
    value === 'unlimited' ||
    value === 'tcg' ||
    value === 'ocg' ||
    value === 'goat' ||
    value === 'edison' ||
    value === 'genesys'
  ) {
    return value
  }

  return 'unlimited'
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function normalizeName(value: string): string {
  return value.trim().toLowerCase()
}

const NON_ASCII = /[\u0080-\uffff]/
// Lo único que el colapso de espacios deja intacto es un espacio suelto en el medio.
const NEEDS_SPACE_FIX = /\s\s|[^\S ]|^ | $/

export function normalizeSearchText(value: string): string {
  let text = value

  // El ASCII ya está en NFKD y no trae marcas: se salta ese paso, que es el grueso del costo en las descripciones.
  if (NON_ASCII.test(text)) {
    text = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  }

  // Se evalúa después de sacar las marcas: `¨` se descompone en un espacio más una marca.
  if (NEEDS_SPACE_FIX.test(text)) {
    text = text.replace(/\s+/g, ' ').trim()
  }

  return text.toLowerCase()
}

export function formatShortPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/** Entero, sin mentir en las puntas: 99,5 % no es "100%" (sale ">99%") ni 0,4 % es "0%" (sale "<1%"). */
export function formatWholePercent(value: number): string {
  const percent = value * 100
  const rounded = Math.round(percent)

  if (rounded === 100 && percent < 100) return '>99%'
  if (rounded === 0 && percent > 0) return '<1%'
  return `${rounded}%`
}

/** Notación única de copias en la app: "×3". */
export function formatCopies(copies: number): string {
  return `×${formatInteger(copies)}`
}

const integerFormat = perLocale((tag) => new Intl.NumberFormat(tag))
const usdFormat = perLocale((tag) => new Intl.NumberFormat(tag, { style: 'currency', currency: 'USD' }))

/** Un entero con el separador de miles de cada idioma. Del 0 al 999 no lleva ninguno, en ningún idioma: sale directo, sin armar el formato de `Intl` (de lo más caro del arranque) hasta que haga falta. */
export function formatInteger(value: number): string {
  if (Number.isInteger(value) && value >= 0 && value < 1000) {
    return String(value)
  }

  return integerFormat(numberLocale()).format(value)
}

/** Dólares como los escribe cada idioma ("$1,234.50" en inglés): los precios de TCGplayer. */
export function formatUsd(value: number): string {
  return usdFormat(currencyLocale()).format(value)
}
