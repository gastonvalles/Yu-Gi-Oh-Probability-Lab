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
  /** La línea corta que dice qué hay adentro, bajo el nombre, en la hoja del celular (los grupos que no llevan estado). */
  blurb?: string
  /** No se dibuja en el menú ni en la hoja, pero sigue marcando su grupo como abierto (se llega desde otra pantalla: «Entrenar solo» está en el inicio de Jugar). */
  hidden?: boolean
  /** El estado a la derecha del nombre en la hoja del celular («Listo · 40», «23 sin confirmar»); `ok` lo pinta en verde. */
  pill?: { label: string; ok?: boolean }
}

/** Un grupo del menú: su nombre va sobre los destinos, en mayúsculas chicas. */
export interface NavGroup {
  key: string
  label: string
  /** El ícono del grupo en la barra de abajo del celular. */
  icon: IconName
  items: NavItem[]
  /**
   * Cómo se dibuja la hoja del celular: 'status' (ícono, nombre y el estado a la derecha: los pasos del deck) o 'description' (nombre y una línea que explica, sin ícono).
   */
  sheet?: 'status' | 'description'
  /** Lo que lista la hoja del celular si es distinto de lo que lista el menú lateral (el duelo ofrece cuatro entradas en la hoja). */
  sheetItems?: NavItem[]
  /** Un aviso arriba de la hoja con una acción (el duelo en pausa). */
  sheetNotice?: { title: string; text: string; actionLabel: string; actionKey: string }
}

/**
 * Las mascotas no son un destino sino una preferencia (como el idioma): no van en un grupo del menú sino abajo, y abren su panel (`onSelect('mascots')`). Lo usan el menú lateral y el cajón del celular.
 */
export const mascotsNavItem = (): NavItem => ({ key: 'mascots', label: t('shell.mascot.title'), title: t('shell.mascot.title'), icon: 'paw', detail: t('shell.blurb.mascots') })

/**
 * La búsqueda de cartas no es un destino sino una herramienta que se abre encima de cualquier pantalla (menos el builder, la práctica y un duelo): `onSelect('search')`.
 */
export const searchNavItem = (): NavItem => ({ key: 'search', label: t('shell.search.title'), title: t('shell.search.title'), icon: 'search', detail: t('shell.blurb.search') })

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
  // Sólo los pasos del deck dicen cómo vienen («Listo», «Pendiente»): una referencia (las tier lists, las banlists) no es un paso y no está «pendiente». Las que traen su línea que explica (`blurb`) no son pasos.
  return [item.title, item.tone && !item.blurb ? navToneLabel(item.tone) : null, item.detail].filter(Boolean).join('. ')
}
