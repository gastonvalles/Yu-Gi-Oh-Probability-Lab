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
    throw new Error(`"${fieldName}" debe ser un entero.`)
  }

  return value
}

export function parseRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new Error(`"${fieldName}" debe ser un string.`)
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
    throw new Error(`"${fieldName}" debe ser un array.`)
  }

  return value
}

export function parseMode(_value: unknown): 'deck' {
  return 'deck'
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

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

export function formatShortPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

export function formatPercentPoints(delta: number): string {
  return `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)} pp`
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat('es-ES').format(value)
}
