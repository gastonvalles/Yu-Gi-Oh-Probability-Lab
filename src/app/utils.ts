import type { DeckFormat } from '../types'
import type { CalculatorMode } from './model'

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

export function parseMode(value: unknown): CalculatorMode {
  if (value === 'deck' || value === 'manual' || value === 'gambling') {
    return value
  }

  return 'deck'
}

export function parseDeckFormat(value: unknown): DeckFormat {
  if (value === 'unlimited' || value === 'tcg' || value === 'ocg' || value === 'goat') {
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

export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(3)}%`
}

export function formatInteger(value: number): string {
  return new Intl.NumberFormat('es-ES').format(value)
}

export function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''

  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }

  const encodedValue = btoa(binary)

  return encodedValue.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function decodeBase64Url(value: string): string {
  const normalizedValue = value.replace(/-/g, '+').replace(/_/g, '/')
  const paddedValue = normalizedValue.padEnd(Math.ceil(normalizedValue.length / 4) * 4, '=')
  const binary = atob(paddedValue)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))

  return new TextDecoder().decode(bytes)
}
