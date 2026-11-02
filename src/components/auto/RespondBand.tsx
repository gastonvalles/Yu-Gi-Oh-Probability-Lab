import { useId } from 'react'

import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { t } from '../../i18n'
import { MatPrompt } from '../duel/MatPrompt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Segmented } from '../ui/Segmented'
import { chainModeOptions, type AutoChainMode } from './AutoBar'
import { PickGrid, type PickCard } from './CardPicker'

/** Una sola fila de cartas chicas (6 columnas): la banda tiene que caber arriba de tus monstruos en el celular y no tapar el campo en escritorio. */
const COLUMNS = 'grid-cols-6'
/** En escritorio, las columnas de esas 6 pero sólo las que hay (`@container` de afuera): con pocas, las acciones entran a su derecha y la carta se queda con el alto. */
const DESKTOP_COLUMNS = 'grid-flow-col auto-cols-[calc((100cqw-2.5rem)/6)]'

interface RespondBandProps {
  /** «Responder a la cadena» (a qué eslabón lo dice la pila de la cadena, arriba); sin cadena todavía, «¿Activás algo ahora?». */
  title: string
  /** El número de eslabón que tomaría tu respuesta (1 = CL1). */
  link: number
  /** Las cartas con las que podés responder, cada una con su lugar en la pestaña (`place`: «Campo», «Mano», «Cementerio»). */
  cards: readonly PickCard[]
  /** La elegida (su `key`), o null: la principal se enciende recién con una. */
  chosen: string | null
  onToggle: (key: string) => void
  onChain: () => void
  onPass: () => void
  /** El modo de respuesta, a mano. Sólo en escritorio: en el celular queda en «Más opciones» (tres acciones no entran en la banda, que va arriba de tus monstruos). */
  mode?: { value: AutoChainMode; onChange: (mode: AutoChainMode) => void }
}

/**
 * Responder a una cadena (`select_chain` que se puede pasar) sin tapar la mesa: una banda en la ranura de la pregunta (`MatPrompt`: ancha, sin velo, minimizable), como `PickBand`.
 * Arriba, qué se decide (a qué eslabón lo dice la pila de la cadena, desplegada arriba: acá no se repite); las candidatas con la pestaña de dónde están (`PickGrid`: flechas, Espacio y Enter); y abajo «No responder» sin caja y la
 * principal al final («Encadenar como CL3»), que se enciende con una elegida. En escritorio, el modo a la derecha del título. En el celular el título no se ve (la cinta de la cadena, arriba, ya dice a qué
 * eslabón respondés; queda para el lector de pantalla). Las dos acciones van después de las cartas: primero se ve qué se encadena (en escritorio, a su derecha si entran, como en las
 * tarjetas: lo que decide y su acción en la misma fila; si no, debajo). Tocar la carta que brilla en la mesa sigue valiendo (su
 * menú, como siempre). Al aparecer, el foco va a las cartas. Escape es «No responder» (lo da la mesa), así que no la minimiza.
 */
export function RespondBand({ title, link, cards, chosen, onToggle, onChain, onPass, mode }: RespondBandProps) {
  const titleId = useId()
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const pass = (
    <Button variant="tertiary" size={desktop ? 'md' : 'sm'} onClick={onPass}>
      {t('auto.lane.pass')}
    </Button>
  )
  const chain = (
    <Button variant="primary" size={desktop ? 'md' : 'sm'} disabled={chosen === null} onClick={onChain}>
      {link === 1 ? t('auto.respond.start') : t('auto.respond.chain', { link })}
    </Button>
  )

  return (
    // En el celular, más apretada (sin los nombres debajo de las candidatas, que van en su nombre accesible): va en la hoja de abajo (`MatPrompt`), con la cadena en su pie.
    <MatPrompt
      kind="ask"
      row
      role="group"
      labelledBy={titleId}
      label={title}
      focus='[role="option"][tabindex="0"]'
      head={
        <p id={titleId} className={cx('m-0 min-w-0 flex-1 font-semibold break-words', !desktop && 'sr-only')}>
          {title}
        </p>
      }
      // El modo con su nombre al lado, a la derecha del título y la fase (sin un renglón propio: el alto es de las cartas). En el pie, con «No responder» y la principal, no entra.
      aside={
        mode ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-micro text-muted">{t('auto.respond.mode')}</span>
            <Segmented size="sm" dense label={t('auto.respond.mode')} value={mode.value} onChange={mode.onChange} options={chainModeOptions()} />
          </div>
        ) : undefined
      }
    >
      {desktop ? (
        // Una sola fila con las cartas y, abajo a la derecha, las acciones; con muchas cartas, las acciones bajan (`flex-wrap`).
        <div className="@container flex flex-wrap items-end gap-2">
          <PickGrid label={t('auto.respond.cards')} cards={cards} chosen={chosen === null ? [] : [chosen]} onToggle={onToggle} multi={false} tabs className={DESKTOP_COLUMNS} />
          <div className="ml-auto flex items-center gap-2">
            {pass}
            {chain}
          </div>
        </div>
      ) : (
        <>
          <PickGrid label={t('auto.respond.cards')} cards={cards} chosen={chosen === null ? [] : [chosen]} onToggle={onToggle} multi={false} tabs className={cx(COLUMNS, '[&_[data-pick-name]]:hidden')} />
          {/* Debajo de las candidatas: primero se ve qué se encadena. */}
          <div className="flex items-center justify-between gap-2">
            {pass}
            {chain}
          </div>
        </>
      )}
    </MatPrompt>
  )
}
