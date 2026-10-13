import { t } from '../../i18n'
import type { IconName } from '../ui/Icon'

/** Estado de un destino del menú en pocas palabras: el punto de color (verde listo, naranja a medio hacer; pendiente no lleva punto). */
export type NavTone = 'complete' | 'progress' | 'pending'

export interface NavItem {
  key: string
  /** Nombre corto: el que se ve en el menú. */
  label: string
  /** Nombre completo: tooltip y lectores de pantalla. */
  title: string
  icon: IconName
  /** Estado o ayuda en una línea: tooltip y lectores de pantalla (en el menú sólo se ve el punto de color). */
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

/** "Deck Builder. Listo. Base principal lista.": lo que anuncia un lector de pantalla de un destino del menú. */
export function navItemDescription(item: NavItem): string {
  return [item.title, item.tone ? t(TONE_LABEL_KEY[item.tone]) : null, item.detail].filter(Boolean).join('. ')
}
