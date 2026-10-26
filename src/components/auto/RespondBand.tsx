import { useId } from 'react'

import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { MatPrompt } from '../duel/MatPrompt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Segmented } from '../ui/Segmented'
import { chainModeOptions, type AutoChainMode } from './AutoBar'
import { PickGrid, type PickCard } from './CardPicker'

/** Una sola fila de cartas chicas (6 columnas): la banda tiene que caber arriba de tus monstruos en el celular y no tapar el campo en escritorio. */
const COLUMNS = 'grid-cols-6'

interface RespondBandProps {
  /** A qué eslabón respondés, sin nombres («Responder a CL2 · Rival»); sin cadena todavía, «¿Activás algo ahora?». */
  title: string
  /** La carta a la que se responde (la del último eslabón), chica a la izquierda: la dice su arte. */
  card?: { name: string; art: string | null }
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
 * Arriba, a qué eslabón respondés y el arte de su carta; las candidatas con la pestaña de dónde están (`PickGrid`: flechas, Espacio y Enter); y abajo «No responder» sin caja y la
 * principal al final («Encadenar como CL3»), que se enciende con una elegida. En escritorio, el modo debajo del título. Tocar la carta que brilla en la mesa sigue valiendo (su
 * menú, como siempre). Al aparecer, el foco va a las cartas. Escape es «No responder» (lo da la mesa), así que no la minimiza.
 */
export function RespondBand({ title, card, link, cards, chosen, onToggle, onChain, onPass, mode }: RespondBandProps) {
  const titleId = useId()

  return (
    // En el celular, más apretada (sin la carta de arriba ni los nombres debajo de las candidatas, que van en su nombre accesible), para caber arriba de tus monstruos con la píldora de la cadena a la vista.
    <MatPrompt
      kind="ask"
      row
      role="group"
      labelledBy={titleId}
      label={title}
      focus='[role="option"][tabindex="0"]'
      className="max-[1101px]:gap-2 max-[1101px]:p-3"
      head={
        <>
          {card ? (
            <span className="relative block aspect-[421/614] w-11 shrink-0 overflow-hidden bg-input max-[1101px]:hidden">
              <CardArt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />
            </span>
          ) : null}
          {/* El título, solo en su fila (no se parte a mitad de palabra); debajo, el modo con su nombre al lado: así no le aprieta la columna (en el pie, con «No responder» y la principal, no entra). */}
          <div className="grid min-w-0 flex-1 gap-2">
            <p id={titleId} className="m-0 font-semibold break-words">
              {title}
            </p>
            {mode ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 max-[1101px]:hidden">
                <span className="text-micro text-muted">{t('auto.respond.mode')}</span>
                <Segmented size="sm" dense label={t('auto.respond.mode')} value={mode.value} onChange={mode.onChange} options={chainModeOptions()} />
              </div>
            ) : null}
          </div>
        </>
      }
    >
      <PickGrid label={t('auto.respond.cards')} cards={cards} chosen={chosen === null ? [] : [chosen]} onToggle={onToggle} multi={false} tabs className={cx(COLUMNS, 'max-[1101px]:[&_[data-pick-name]]:hidden')} />
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onClick={onPass}>
          {t('auto.lane.pass')}
        </Button>
        <Button variant="primary" disabled={chosen === null} onClick={onChain}>
          {link === 1 ? t('auto.respond.start') : t('auto.respond.chain', { link })}
        </Button>
      </div>
    </MatPrompt>
  )
}
