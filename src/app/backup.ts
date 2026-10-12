import { t } from '../i18n'
import { isRecord } from './utils'

/**
 * Copia de seguridad de todo lo que la app guarda en este navegador (deck, roles, reglas, builds, combos,
 * calculadora de LP, preferencias): un JSON que se baja y se vuelve a cargar en otro navegador o después de
 * borrar los datos. Las cachés se regeneran solas y no van.
 */

const BACKUP_APP = 'ygo-probability-lab'

const PREFIXES = ['ygo-lab:', 'ygo-probability-lab:']
const SKIPPED = /cache|chunk-reload/

export interface LabBackup {
  app: typeof BACKUP_APP
  version: 1
  savedAt: string
  entries: Record<string, string>
}

const isOurs = (key: string) => PREFIXES.some((prefix) => key.startsWith(prefix)) && !SKIPPED.test(key)

export function collectBackup(storage: Storage = localStorage, now = new Date()): LabBackup {
  const entries: Record<string, string> = {}

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    const value = key && isOurs(key) ? storage.getItem(key) : null

    if (key && value !== null) {
      entries[key] = value
    }
  }

  return { app: BACKUP_APP, version: 1, savedAt: now.toISOString(), entries }
}

/** Lee una copia; con cualquier otro archivo tira un error en español. */
export function parseBackup(text: string): LabBackup {
  let parsed: unknown

  try {
    parsed = JSON.parse(text)
  } catch {
    throw new Error(t('shell.backup.invalidJson'))
  }

  if (!isRecord(parsed) || parsed.app !== BACKUP_APP || !isRecord(parsed.entries)) {
    throw new Error(t('shell.backup.notBackup'))
  }

  const entries = Object.fromEntries(Object.entries(parsed.entries).filter((entry): entry is [string, string] => isOurs(entry[0]) && typeof entry[1] === 'string'))

  if (Object.keys(entries).length === 0) {
    throw new Error(t('shell.backup.empty'))
  }

  return { app: BACKUP_APP, version: 1, savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '', entries }
}

/** Escribe la copia encima de lo que hay (lo que la copia no trae queda como está). Devuelve cuántas claves escribió. */
export function restoreBackup(backup: LabBackup, storage: Storage = localStorage): number {
  for (const [key, value] of Object.entries(backup.entries)) {
    storage.setItem(key, value)
  }

  return Object.keys(backup.entries).length
}
