import { t } from '../../i18n'
import type { IconName } from '../ui/Icon'

/** Estado de un destino del menú en pocas palabras (listo, en progreso, pendiente): lo dicen el tooltip y el nombre accesible. */
export type NavTone = 'complete' | 'progress' | 'pending'

export interface NavItem {
  key: string
  /** Nombre corto: el que se ve en el menú. */
  label: string
  /** Nombre completo: tooltip y lectores de pantalla. */
  title: string
  icon: IconName
  /** Estado o ayuda en una línea: tooltip y lectores de pantalla. */
  detail?: string
  tone?: NavTone
}

/** Un grupo del menú: su nombre va sobre los destinos, en mayúsculas chicas. */
export interface NavGroup {
  key: string
  label: string
  items: NavItem[]
}

const TONE_LABEL_KEY = {
  complete: 'shell.tone.complete',
  progress: 'shell.tone.progress',
  pending: 'shell.tone.pending',
} as const

/** "Listo", "En progreso", "Pendiente". */
export function navToneLabel(tone: NavTone): string {
  return t(TONE_LABEL_KEY[tone])
}

/** "Deck Builder. Listo. Base principal lista.": lo que anuncia un lector de pantalla de un destino del menú. */
export function navItemDescription(item: NavItem): string {
  return [item.title, item.tone ? navToneLabel(item.tone) : null, item.detail].filter(Boolean).join('. ')
}
