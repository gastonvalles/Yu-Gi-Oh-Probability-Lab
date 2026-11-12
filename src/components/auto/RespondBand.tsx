import { useId } from 'react'

import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { AutoPanel, PANEL_PRIMARY } from './AutoPanel'
import { PickGrid, TRAY, type PickCard } from './CardPicker'

const NAME_AT = String.fromCharCode(1)

interface RespondBandProps {
  /** Qué pasó y qué se te pide («Se activó «Ash Blossom». ¿Respondés?»); sin cadena todavía, «¿Activás una carta o efecto?». */
  title: string
  /** La carta del último eslabón: la tira minimizada pregunta «¿Respondés a «X»?» en un renglón y, si no entra, corta el nombre, nunca la pregunta. */
  about?: string
  /** El número de eslabón que tomaría tu respuesta (1 = CL1). No se muestra: la principal dice «Activar» (decisión 6). */
  link: number
  /** Las cartas con las que podés responder, cada una con su lugar en la pestaña (`place`: «Campo», «Mano», «Cementerio»). */
  cards: readonly PickCard[]
  /** La elegida (su `key`), o null: la principal se enciende recién con una. */
  chosen: string | null
  onToggle: (key: string) => void
  onChain: () => void
  onPass: () => void
  /** Sólo el catálogo lo fuerza (la ventana de escritorio en su marco); en la mesa, según el ancho. */
  variant?: 'floating'
}

/**
 * Responder a una cadena (M-02, `select_chain` que se puede pasar) en el cartel del automático (`AutoPanel`): la frase, las candidatas centradas en la bandeja con la pestaña de dónde están
 * (`PickGrid`: flechas, Espacio y Enter) y abajo «Pasar» sin caja y la principal a la derecha («Activar»), que se enciende con una elegida. En escritorio, la ventana apaisada (la carta a la
 * izquierda del texto). El modo de respuesta («Siempre · Nunca») no va acá: vive en Opciones («Respuestas»). Tocar la carta que brilla en la mesa sigue valiendo. Al aparecer, el foco va a las
 * cartas. Escape es «Pasar» (lo da la mesa), así que no lo minimiza.
 */
export function RespondBand({ title, about, cards, chosen, onToggle, onChain, onPass, variant }: RespondBandProps) {
  const titleId = useId()
  // El nombre va aparte (se corta él, no la pregunta): se parte la frase donde iría.
  const [lead, tail] = t('auto.respond.strip', { name: NAME_AT }).split(NAME_AT)
  // La barra de la ventana de escritorio dice la frase entera («Se activó «X». ¿Respondés?») en un renglón: si no entra, se corta el nombre.
  const at = about ? title.indexOf(about) : -1
  const line =
    about && at >= 0 ? (
      <span className="flex min-w-0">
        <span className="shrink-0">{title.slice(0, at)}</span>
        <span className="truncate">{about}</span>
        <span className="shrink-0">{title.slice(at + about.length)}</span>
      </span>
    ) : null

  return (
    <AutoPanel
      kind="ask"
      variant={variant}
      role="group"
      label={title}
      {...(about
        ? {
            strip: (
              <span className="flex min-w-0">
                <span className="shrink-0">{lead}</span>
                <span className="truncate">{about}</span>
                <span className="shrink-0">{tail}</span>
              </span>
            ),
          }
        : {})}
      titleId={titleId}
      {...(line ? { line } : {})}
      focus='[role="option"][tabindex="0"]'
      side
      actions={
        <>
          <Button variant="tertiary" onClick={onPass}>
            {t('auto.lane.pass')}
          </Button>
          <Button variant="primary" className={PANEL_PRIMARY} disabled={chosen === null} onClick={onChain}>
            {t('auto.respond.start')}
          </Button>
        </>
      }
    >
      <PickGrid label={t('auto.respond.cards')} cards={cards} chosen={chosen === null ? [] : [chosen]} onToggle={onToggle} multi={false} tabs className={TRAY} />
    </AutoPanel>
  )
}
