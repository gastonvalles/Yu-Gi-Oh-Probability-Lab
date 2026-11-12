import { useId } from 'react'

import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Segmented } from '../ui/Segmented'
import { chainModeOptions, type AutoChainMode } from './AutoBar'
import { AutoPanel, PANEL_MAIN } from './AutoPanel'
import { PickGrid, TRAY, type PickCard } from './CardPicker'

interface RespondBandProps {
  /** Qué pasó y qué se te pide («Se activó «Ash Blossom». ¿Respondés?»); sin cadena todavía, «¿Activás una carta o efecto?». */
  title: string
  /** El número de eslabón que tomaría tu respuesta (1 = CL1). No se muestra: la principal dice «Activar» (decisión 6). */
  link: number
  /** Las cartas con las que podés responder, cada una con su lugar en la pestaña (`place`: «Campo», «Mano», «Cementerio»). */
  cards: readonly PickCard[]
  /** La elegida (su `key`), o null: la principal se enciende recién con una. */
  chosen: string | null
  onToggle: (key: string) => void
  onChain: () => void
  onPass: () => void
  /** El modo de respuesta, a mano. Sólo en escritorio: en el celular queda en «Más opciones». */
  mode?: { value: AutoChainMode; onChange: (mode: AutoChainMode) => void }
}

/**
 * Responder a una cadena (M-02, `select_chain` que se puede pasar) en el cartel del automático (`AutoPanel`): la frase, las candidatas centradas en la bandeja con la pestaña de dónde están
 * (`PickGrid`: flechas, Espacio y Enter) y abajo «Pasar» sin caja y la principal a la derecha («Activar»), que se enciende con una elegida. En escritorio, la ventana apaisada (la carta a la
 * izquierda del texto) y el modo a la derecha de la frase. Tocar la carta que brilla en la mesa sigue valiendo. Al aparecer, el foco va a las cartas. Escape es «Pasar» (lo da la mesa), así que
 * no lo minimiza.
 */
export function RespondBand({ title, cards, chosen, onToggle, onChain, onPass, mode }: RespondBandProps) {
  const titleId = useId()
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)

  return (
    <AutoPanel
      kind="ask"
      role="group"
      label={title}
      labelledBy={titleId}
      focus='[role="option"][tabindex="0"]'
      side
      head={
        <h2 id={titleId} className="m-0 min-w-0 text-body font-semibold break-words">
          {title}
        </h2>
      }
      aside={
        mode && desktop ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-micro text-muted">{t('auto.respond.mode')}</span>
            <Segmented size="sm" dense label={t('auto.respond.mode')} value={mode.value} onChange={mode.onChange} options={chainModeOptions()} />
          </div>
        ) : undefined
      }
      actions={
        <>
          <Button variant="tertiary" onClick={onPass}>
            {t('auto.lane.pass')}
          </Button>
          <Button variant="primary" className={PANEL_MAIN} disabled={chosen === null} onClick={onChain}>
            {t('auto.respond.start')}
          </Button>
        </>
      }
    >
      <PickGrid label={t('auto.respond.cards')} cards={cards} chosen={chosen === null ? [] : [chosen]} onToggle={onToggle} multi={false} tabs className={TRAY} />
    </AutoPanel>
  )
}
