import { Fragment, type ReactNode } from 'react'

import { t } from '.'
import type { MessageArgs, MessageKey } from './types'

const TAG = /<(\w+)>(.*?)<\/\1>/gs

/**
 * Mensajes con partes resaltadas: "Elegí <b>Main</b> o <b>Extra</b>". Cada etiqueta (sin anidar) se dibuja con su función de `tags`;
 * una etiqueta que no está en `tags` queda como texto. Una sola frase por mensaje: el orden de las palabras lo decide cada idioma.
 */
export function renderRich(text: string, tags: Record<string, (text: string) => ReactNode>): ReactNode {
  const parts = text.split(TAG)

  // `split` con dos grupos devuelve [texto, etiqueta, contenido, texto, etiqueta, contenido, …].
  return parts.map((part, index) => {
    if (index % 3 === 1) return null
    if (index % 3 === 0) return part

    return <Fragment key={index}>{tags[parts[index - 1]!]?.(part) ?? part}</Fragment>
  })
}

/** `t()` con partes resaltadas: el mensaje lleva <b>…</b> (o la etiqueta que sea) y `tags` dice cómo dibujar cada una. */
export function tRich<K extends MessageKey>(key: K, tags: Record<string, (text: string) => ReactNode>, ...args: MessageArgs<K>): ReactNode {
  return renderRich(t(key, ...args), tags)
}
