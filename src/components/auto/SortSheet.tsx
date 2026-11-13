import { useId } from 'react'

import type { AskWhyView } from '../../app/auto/ask-why'
import { t } from '../../i18n'
import { AskWhy } from '../duel/AskWhy'
import { Button } from '../ui/Button'
import { AutoPanel, PANEL_PRIMARY } from './AutoPanel'
import { PickCount, PickGrid, TRAY, usePicked, type PickCard } from './CardPicker'

interface SortSheetProps {
  /** Lo que pide el núcleo, o «Ordená las cartas». */
  title?: string
  /** Debajo del título: cómo se lee el orden (el tope del deck, o los eslabones de una cadena). */
  hint?: string
  /** Arriba del título: la carta que hace ordenar. */
  kicker?: string
  /** De qué carta es y si es su costo o su efecto (`AskWhy`): va en lugar de `kicker`. */
  why?: AskWhyView | null
  /** La principal: «Ordenar así», o lo que hace el orden («Pagar así»). */
  done?: string
  /** En el orden de ahora (la primera, arriba). */
  cards: readonly PickCard[]
  /** Las claves en el orden nuevo (la primera queda arriba), o `null`: como estaban. */
  onSort: (keys: string[] | null) => void
}

/**
 * Ordenar cartas (`sort_card`: el tope del deck; `sort_chain`: los costos de un ataque, que no son eslabones: varios disparos a la vez se piden de a uno con `select_chain`) en el cartel del automático (`AutoPanel`, la bandeja en una fila): tocarlas en el orden en que van las numera (el aro lima y el número de `PickGrid`) y tocar una numerada la suelta
 * (las de después se corren). «Ordenar así» se enciende con todas numeradas; «Dejar como está» contesta sin cambiar nada. Hay que contestar: Escape lo minimiza, sin
 * contestar.
 * Va dentro de un `Presence` (así sale al contestarse).
 */
export function SortSheet({ title = t('auto.sort.title'), hint = t('auto.sort.hint'), kicker, why, done = t('auto.sort.done'), cards, onSort }: SortSheetProps) {
  const whyId = useId()
  const [order, toggle] = usePicked(cards, cards.length)

  return (
    <AutoPanel
      kind="sort"
      label={title}
      {...(why ? { describedBy: whyId } : {})}
      focus='[role="option"][tabindex="0"]'
      escape
      top={
        <>
          {why ? <AskWhy id={whyId} why={why} /> : kicker ? <p className="m-0 text-micro font-semibold text-muted">{kicker}</p> : null}
          <p className="m-0 text-micro text-muted">{hint}</p>
        </>
      }
      aside={<PickCount chosen={order.length} max={cards.length} />}
      actions={
        <>
          <Button variant="tertiary" onClick={() => onSort(null)}>
            {t('auto.sort.asIs')}
          </Button>
          <Button variant="primary" className={PANEL_PRIMARY} disabled={order.length < cards.length} onClick={() => onSort(order)}>
            {done}
          </Button>
        </>
      }
    >
      <PickGrid label={title} cards={cards} chosen={order} multi onToggle={toggle} className={TRAY} />
    </AutoPanel>
  )
}
