import { useEscapeKey } from '../../app/use-overlay'
import { useLeaving } from '../../app/use-presence'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { PickGrid, usePicked, type PickCard } from './CardPicker'

interface SortSheetProps {
  /** Lo que pide el núcleo, o «Ordená las cartas». */
  title?: string
  /** Arriba del título: la carta que hace ordenar. */
  kicker?: string
  /** En el orden de ahora (la primera, arriba). */
  cards: readonly PickCard[]
  /** Las claves en el orden nuevo (la primera queda arriba), o `null`: como estaban. */
  onSort: (keys: string[] | null) => void
}

/**
 * Ordenar cartas (`sort_card`: el tope del deck) en una hoja chica (`Modal keypad`): tocarlas en el orden en que van las numera (el aro ámbar y el número de `PickGrid`) y tocar una numerada la suelta
 * (las de después se corren). «Ordenar así» se enciende con todas numeradas; «Dejar como está» contesta sin cambiar nada. Hay que contestar: no se cierra con Escape ni tocando afuera (en el celular, su asa
 * la baja sin contestar).
 * Va dentro de un `Presence` (así sale al contestarse).
 */
export function SortSheet({ title = t('auto.sort.title'), kicker, cards, onSort }: SortSheetProps) {
  const leaving = useLeaving()
  const [order, toggle] = usePicked(cards, cards.length)

  useEscapeKey(() => {}, !leaving)

  return (
    <Modal
      isOpen={!leaving}
      onClose={() => {}}
      dismissible={false}
      size="keypad"
      lowerable
      veil={false}
      kicker={kicker}
      title={title}
      subtitle={t('auto.sort.hint')}
      footer={
        <>
          <p role="status" className="m-0 mr-auto text-body tabular-nums text-muted">
            {t('auto.picker.status', { chosen: order.length, max: cards.length })}
          </p>
          <Button variant="tertiary" size="sm" onClick={() => onSort(null)}>
            {t('auto.sort.asIs')}
          </Button>
          <Button variant="primary" size="sm" disabled={order.length < cards.length} onClick={() => onSort(order)}>
            {t('auto.sort.done')}
          </Button>
        </>
      }
    >
      <PickGrid label={title} cards={cards} chosen={order} multi onToggle={toggle} className="grid-cols-3 sm:grid-cols-4" />
    </Modal>
  )
}
