/** Sobretítulo: etiqueta corta en mayúsculas sobre un título o un grupo. Siempre neutro (el color se reserva para significar algo). */
export const overline = 'text-micro font-semibold uppercase tracking-[0.08em] text-soft'

/** Título de pantalla (h1). */
export const pageTitle = 'm-0 text-balance text-lead font-semibold tracking-[-0.01em] text-foreground min-[1101px]:text-title'

/** Título de tarjeta, diálogo o sección (h2). */
export const sectionTitle = 'm-0 text-balance text-lead font-semibold tracking-[-0.01em] text-foreground [overflow-wrap:anywhere]'

/** Título de un ítem adentro de una tarjeta o una lista (h3). */
export const cardTitle = 'm-0 text-balance text-body font-semibold text-foreground [overflow-wrap:anywhere]'

/** Texto de apoyo bajo un título. */
export const supportText = 'm-0 text-body text-muted'

/**
 * Un hipervínculo (el enlace que sale a otra página o abre otra cosa, sea `<a>` o un botón que se lee como enlace): siempre ámbar, el color de lo
 * destacado, y subrayado al pasar el mouse o enfocarlo. El que lo usa le suma el tamaño del texto y, si va solo, el alto táctil (`min-h-11`).
 */
export const textLink = 'font-semibold text-info-soft underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none focus-visible:shadow-focus'
