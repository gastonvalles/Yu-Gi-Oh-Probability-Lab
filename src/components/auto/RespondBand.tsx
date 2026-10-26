import { useEffect, useId, useRef } from 'react'

import { useLeaving, usePresence } from '../../app/use-presence'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Segmented } from '../ui/Segmented'
import { chainModeOptions, type AutoChainMode } from './AutoBar'
import { PickGrid, type PickCard } from './CardPicker'

/** Una sola fila de cartas chicas (6 columnas): la banda tiene que caber arriba de tus monstruos en el celular y no tapar el campo en escritorio. */
const COLUMNS = 'grid-cols-6'

interface RespondBandProps {
  /** Arriba, chico: a qué eslabón respondés («Responder a CL2 · Rival»); sin cadena todavía, nada. */
  kicker?: string
  /** La pregunta («¿Encadenás a Ash Blossom & Joyous Spring?»). */
  title: string
  /** La carta a la que se responde (la del último eslabón), chica a la izquierda. */
  card?: { name: string; art: string | null }
  /** El número de eslabón que tomaría tu respuesta (1 = CL1). */
  link: number
  /** Las cartas con las que podés responder, cada una con su lugar en la pestaña (`place`: «Campo», «Mano», «Cementerio»). */
  cards: readonly PickCard[]
  /** La elegida (su `key`), o null: la principal se enciende recién con una. */
  chosen: string | null
  onToggle: (key: string) => void
  /** Qué haría la elegida: su nombre y, sólo si no hay duda, la frase de su efecto tal cual (`when` y lo que hace, `what`). */
  response: { name: string; effect: { when: string; what: string } | null } | null
  onChain: () => void
  onPass: () => void
  /** El modo de respuesta, a mano. Sólo en escritorio: en el celular queda en «Más opciones» (tres acciones no entran en la banda, que va arriba de tus monstruos). */
  mode?: { value: AutoChainMode; onChange: (mode: AutoChainMode) => void }
}

/**
 * Responder a una cadena (`select_chain` que se puede pasar) sin tapar la mesa: una banda en la ranura de la pregunta (`duel.prompt`, ancha por `data-prompt-row`, sin velo), como
 * `PickBand`. Arriba, a qué eslabón respondés y su carta; las candidatas con la pestaña de dónde están (`PickGrid`: flechas, Espacio y Enter); qué haría la elegida y con qué número
 * («Tu respuesta · CL3»); y abajo «No responder» sin caja y la principal al final («Encadenar como CL3»), que se enciende con una elegida. En escritorio, el modo arriba a la derecha.
 * Tocar la carta que brilla en la mesa sigue valiendo (su menú, como siempre). Al aparecer, el foco va a las cartas.
 */
export function RespondBand({ kicker, title, card, link, cards, chosen, onToggle, response, onChain, onPass, mode }: RespondBandProps) {
  const ref = useRef<HTMLDivElement | null>(null)
  const leaving = useLeaving()
  const titleId = useId()

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[role="option"][tabindex="0"]')?.focus({ preventScroll: true })
  }, [])

  return usePresence(
    !leaving,
    // En el celular, más apretada (sin la carta de arriba, sin los nombres debajo de las candidatas —van en su nombre accesible y en «Tu respuesta»— y la frase en dos renglones), para
    // caber arriba de tus monstruos con la píldora de la cadena a la vista.
    <div ref={ref} role="group" aria-labelledby={titleId} data-prompt="ask" data-prompt-row="" className="grid gap-3 rounded-card border border-info bg-card-background p-4 text-body text-foreground shadow-overlay motion-safe:animate-dialog-enter max-[1101px]:gap-2 max-[1101px]:p-3">
      <div className="flex items-center gap-3">
        {card ? (
          <span className="relative block aspect-[421/614] w-11 shrink-0 overflow-hidden bg-input max-[1101px]:hidden">
            <CardArt remoteUrl={card.art} name={card.name} className="block h-full w-full object-cover" />
          </span>
        ) : null}
        <div className="grid min-w-0 gap-0.5">
          {kicker ? <p className="m-0 text-micro font-semibold text-muted">{kicker}</p> : null}
          <p id={titleId} className="m-0 font-semibold [overflow-wrap:anywhere]">
            {title}
          </p>
        </div>
        {/* El modo, arriba a la derecha (en el pie, con «No responder» y la principal, no entra en una fila y la banda crecía). */}
        {mode ? (
          <div className="ml-auto grid shrink-0 justify-items-end gap-1 max-[1101px]:hidden">
            <span className="text-micro text-muted">{t('auto.respond.mode')}</span>
            <Segmented size="sm" dense label={t('auto.respond.mode')} value={mode.value} onChange={mode.onChange} options={chainModeOptions()} />
          </div>
        ) : null}
      </div>
      <PickGrid label={t('auto.respond.cards')} cards={cards} chosen={chosen === null ? [] : [chosen]} onToggle={onToggle} multi={false} tabs className={cx(COLUMNS, 'max-[1101px]:[&_[data-pick-name]]:hidden')} />
      <p className="m-0 text-micro text-muted max-[1101px]:line-clamp-2">
        <span className="font-semibold text-warning-soft">{t('auto.respond.yours', { link })}</span>{' '}
        {response ? (
          <>
            <span className="font-semibold text-foreground">{response.name}</span>
            {response.effect ? (
              <>
                {' '}“{response.effect.when ? `${response.effect.when}: ` : ''}
                <span className="font-semibold text-foreground">{response.effect.what}</span>”
              </>
            ) : null}
          </>
        ) : (
          t('auto.respond.pick')
        )}
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onClick={onPass}>
          {t('auto.lane.pass')}
        </Button>
        <Button variant="primary" disabled={chosen === null} onClick={onChain}>
          {link === 1 ? t('auto.respond.start') : t('auto.respond.chain', { link })}
        </Button>
      </div>
    </div>,
    () => [ref.current],
  )
}
