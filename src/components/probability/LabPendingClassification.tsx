import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

import { isCardFullyClassified } from '../../app/role-step'
import { useMediaQuery } from '../../app/use-media-query'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import type { CardEntry, CardOrigin, CardRole } from '../../types'
import { CardArt } from '../CardArt'
import { ClassificationEditor } from '../classification/ClassificationEditor'
import { ClassificationQueue } from '../classification/ClassificationQueue'
import { compareCardsForQueue } from '../classification/classification-model'
import { Button } from '../ui/Button'
import { Heading } from '../ui/Heading'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { ProgressRing } from '../ui/ProgressRing'
import { progressTone } from '../ui/tone'
import { overline, supportText } from '../ui/typography'

interface LabPendingClassificationProps {
  cards: CardEntry[]
  message: string
  onSetOrigin: (ygoprodeckId: number, origin: CardOrigin) => void
  onToggleRole: (ygoprodeckId: number, role: CardRole) => void
  onConfirm: (ygoprodeckId: number) => void
  /** Da por buenas todas las sugerencias (las que ya tienen origen y roles) de un toque. */
  onConfirmAll: () => void
  /** Avisa si hay una carta abierta: el Lab mantiene esta vista hasta que se cierra, aunque ya no falte nada. */
  onEditingChange: (editing: boolean) => void
}

/** El celular (el complemento de `md`): la cola va plegada y «Confirmar» queda fijo sobre la barra de abajo. */
const PHONE_MEDIA_QUERY = '(width < 768px)'
const PREVIEW_CARDS = 3

const isPending = (card: CardEntry) => !isCardFullyClassified(card) || card.needsReview

/**
 * El Lab no mide hasta que todas las cartas estén clasificadas: en vez de una pestaña vacía, dice cuántas faltan (con un anillo de progreso, «0 de 17»), ofrece
 * confirmar las sugerencias de un toque y deja revisarlas acá mismo. En el celular la cola va plegada y la acción, fija abajo (al alcance del pulgar).
 */
export function LabPendingClassification({ cards, message, onSetOrigin, onToggleRole, onConfirm, onConfirmAll, onEditingChange }: LabPendingClassificationProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [queueOpen, setQueueOpen] = useState(false)
  const isPhone = useMediaQuery(PHONE_MEDIA_QUERY)
  const isEditing = selectedId !== null

  useEffect(() => {
    onEditingChange(isEditing)
  }, [isEditing, onEditingChange])

  const pendingCount = useMemo(() => cards.filter(isPending).length, [cards])
  // La carta abierta queda en la lista aunque ya esté resuelta: el usuario avanza con "Siguiente".
  const visible = useMemo(
    () => cards.filter((card) => isPending(card) || card.id === selectedId).sort(compareCardsForQueue),
    [cards, selectedId],
  )
  const index = visible.findIndex((card) => card.id === selectedId)
  const selected = index >= 0 ? visible[index] : null
  const previous = index > 0 ? visible[index - 1] : null
  const next = index >= 0 && index < visible.length - 1 ? visible[index + 1] : null
  const classified = cards.length - pendingCount
  // Las sugerencias que sólo esperan un «sí»: completas pero sin confirmar. Las que les falta origen o roles hay que decidirlas.
  const suggestions = useMemo(() => cards.filter((card) => card.needsReview && isCardFullyClassified(card)).length, [cards])
  // Si todo lo que falta son sugerencias, se dice así («17 cartas tienen una sugerencia sin confirmar»); si no, cuántas quedan por cerrar.
  const onlySuggestions = pendingCount > 0 && suggestions === pendingCount
  const first = visible[0]

  const confirm =
    suggestions > 0 && !isEditing ? (
      <Button variant="primary" icon="check" className="max-md:w-full" onClick={onConfirmAll}>
        {t('lab.pending.confirmAll', { count: suggestions })}
      </Button>
    ) : null

  return (
    <div className={cx('grid min-w-0 content-start gap-4', isPhone && confirm && 'pb-20')}>
      <Card tone={pendingCount > 0 ? 'warning' : 'success'} padding="lg" className="grid gap-4">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
          <div className="grid min-w-0 gap-1">
            <p className={cx('m-0', overline)}>{pendingCount > 0 ? t('lab.pending.overline') : t('lab.pending.allDone')}</p>
            <Heading level="section" className="leading-tight">
              {pendingCount === 0
                ? t('lab.pending.none')
                : onlySuggestions
                  ? t('lab.pending.suggestions', { count: pendingCount, n: formatInteger(pendingCount) })
                  : t('lab.pending.count', { count: pendingCount, n: formatInteger(pendingCount) })}
            </Heading>
            <p className={supportText}>
              {pendingCount === 0 ? t('lab.pending.closeEditor') : onlySuggestions ? t('lab.pending.confirmHelp', { count: pendingCount }) : t('lab.pending.help', { message })}
            </p>
          </div>
          <ProgressRing
            value={cards.length > 0 ? classified / cards.length : 0}
            tone={progressTone(classified, cards.length)}
            size={72}
            strokeWidth={7}
            label={t('lab.pending.ringLabel', { done: formatInteger(classified), total: formatInteger(cards.length) })}
          >
            <span className="grid justify-items-center leading-tight">
              <span className="text-lead font-bold">{formatInteger(classified)}</span>
              <span className="text-micro font-normal text-muted">{t('lab.pending.ofTotal', { total: formatInteger(cards.length) })}</span>
            </span>
          </ProgressRing>
        </div>

        {!isPhone && (confirm || (first && !isEditing)) ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {first && !isEditing ? (
              <Button variant="tertiary" onClick={() => setSelectedId(first.id)}>
                {t('lab.pending.review')}
              </Button>
            ) : null}
            {confirm}
          </div>
        ) : null}
      </Card>

      {isPhone && !isEditing && first ? (
        <Card padding="sm">
          <button
            type="button"
            aria-expanded={queueOpen}
            className="flex min-h-12 w-full items-center gap-3 rounded-control px-1 text-left focus-visible:outline-none focus-visible:shadow-focus"
            onClick={() => setQueueOpen((open) => !open)}
          >
            <Icon name="cards" size={20} className="shrink-0 text-foreground" />
            <span className="grid min-w-0 flex-1">
              <strong className="text-body font-semibold text-foreground">{t('lab.pending.fold')}</strong>
              <span className="text-body text-muted">{t('lab.pending.foldDetail', { count: pendingCount, n: formatInteger(pendingCount) })}</span>
            </span>
            <span className="flex shrink-0" aria-hidden="true">
              {visible.slice(0, PREVIEW_CARDS).map((card) => (
                <span key={card.id} className="-ml-1.5 block w-6 ring-2 ring-card-background first:ml-0">
                  <CardArt remoteUrl={card.apiCard?.imageUrlSmall ?? null} name={card.name} className="block aspect-[421/614] w-full object-cover" />
                </span>
              ))}
            </span>
            <Icon name={queueOpen ? 'chevron-down' : 'chevron-right'} size={20} className="shrink-0 text-soft" />
          </button>
        </Card>
      ) : null}

      {!isPhone || queueOpen || isEditing ? <ClassificationQueue cards={visible} selectedId={selectedId} onSelect={setSelectedId} /> : null}

      {selected ? (
        <ClassificationEditor
          card={selected}
          position={index + 1}
          total={visible.length}
          onSetOrigin={onSetOrigin}
          onToggleRole={onToggleRole}
          onConfirm={onConfirm}
          onPrevious={previous ? () => setSelectedId(previous.id) : undefined}
          onNext={next ? () => setSelectedId(next.id) : undefined}
          onClose={() => setSelectedId(null)}
        />
      ) : null}

      {/* En el celular la acción queda fija sobre la barra de abajo. Va al `body`: los bloques de la pantalla entran con un `transform` y un `fixed` adentro se correría. */}
      {isPhone && confirm
        ? createPortal(
            <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-30 border-t border-border-subtle bg-background px-gutter pb-5 pt-3">{confirm}</div>,
            document.body,
          )
        : null}
    </div>
  )
}
