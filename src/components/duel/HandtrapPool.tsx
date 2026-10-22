import { useId, useState } from 'react'

import { cardSmallImageUrl, type Expansion } from '../../app/card-prices'
import {
  HANDTRAP_CATALOG,
  MAX_COPIES,
  MAX_RIVAL_HAND,
  handCount,
  readHandtrapConfig,
  writeHandtrapConfig,
  type HandtrapCard,
  type HandtrapConfig,
  type HandtrapPick,
} from '../../app/handtraps'
import { useCardHits } from '../../app/use-card-hits'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { SearchField } from '../ui/SearchField'
import { Stepper } from '../ui/Stepper'
import { listItemSelected } from '../ui/surfaces'
import { Switch } from '../ui/Switch'

/** Sin expansiones: la búsqueda de «Agregar otra carta» es por nombre (los códigos de impresión son de la vista de Expansiones). */
const NO_EXPANSIONS: Expansion[] = []

/**
 * El simulador de handtraps en las reglas de la sala, con el modo Solo: encenderlo, cuántas tiene el rival en la mano («3 en mano») y la hoja para elegirlas.
 * Se recuerda en el navegador (`app/handtraps.ts`) y vale para la próxima mano de «Jugar solo».
 */
export function HandtrapsRow() {
  const [config, setConfig] = useState<HandtrapConfig>(readHandtrapConfig)
  const [choosing, setChoosing] = useState(false)
  const count = handCount(config.picks)
  const save = (next: HandtrapConfig) => {
    setConfig(next)
    writeHandtrapConfig(next)
  }

  return (
    <div className="flex items-center justify-between gap-3 sm:col-span-2">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-body font-semibold text-foreground">{t('handtraps.title')}</span>
        <span className="text-micro text-soft">{count === 0 ? t('handtraps.row.empty') : t('handtraps.row.summary', { count })}</span>
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <Button variant="secondary" size="sm" aria-label={t('handtraps.row.chooseLabel')} aria-haspopup="dialog" onClick={() => setChoosing(true)}>
          {t('handtraps.row.choose')}
        </Button>
        <Switch checked={config.enabled} onChange={(enabled) => save({ ...config, enabled })} label={t('handtraps.title')} />
      </span>
      <HandtrapPicker
        isOpen={choosing}
        config={config}
        onClose={() => setChoosing(false)}
        onSave={(picks) => {
          // Elegir la mano es querer usarla: el simulador queda encendido.
          save({ enabled: true, picks })
          setChoosing(false)
        }}
      />
    </div>
  )
}

/**
 * El simulador de handtraps dentro de la práctica: «Entrenar solo» entra directo a la mesa, sin pasar por las reglas de la sala, así que el botón de la barra de la mesa abre
 * la misma hoja. Aplicar guarda lo elegido y reparte una mano nueva (`onApply`), con el simulador encendido o apagado; se recuerda igual que lo de las reglas de la sala.
 */
export function HandtrapsMatButton({ onApply, className }: { onApply: () => void; className?: string }) {
  const [config, setConfig] = useState<HandtrapConfig>(readHandtrapConfig)
  const [choosing, setChoosing] = useState(false)
  const apply = (next: HandtrapConfig) => {
    setConfig(next)
    writeHandtrapConfig(next)
    setChoosing(false)
    // Lo elegido ya está guardado: la mano nueva se reparte con eso.
    onApply()
  }

  return (
    <>
      <IconButton
        tone="flat"
        size="sm"
        className={className}
        aria-label={t('handtraps.title')}
        title={t(config.enabled ? 'handtraps.mat.on' : 'handtraps.mat.off')}
        aria-haspopup="dialog"
        aria-pressed={config.enabled}
        onClick={() => setChoosing(true)}
      >
        <Icon name="hand" />
      </IconButton>
      <HandtrapPicker
        isOpen={choosing}
        config={config}
        dealsNew
        onClose={() => setChoosing(false)}
        // Elegir la mano es querer usarla: el simulador queda encendido.
        onSave={(picks) => apply({ enabled: true, picks })}
        onTurnOff={config.enabled ? () => apply({ ...config, enabled: false }) : undefined}
      />
    </>
  )
}

/** La lista de la hoja: una columna en el celular y dos desde 640 px, sin cajas (sólo la que está en la mano se marca). */
const POOL_LIST = 'm-0 grid list-none gap-1 p-0 sm:grid-cols-2'

interface HandtrapPoolCardProps {
  card: HandtrapCard
  /** Cuántas copias tiene el rival en la mano (0: no la tiene). */
  copies: number
  /** Hasta cuántas se puede subir: `MAX_COPIES`, o menos si la mano ya está llena. */
  max: number
  onChange: (copies: number) => void
}

/**
 * Una carta de la hoja: su arte, su nombre y, debajo, cuántas copias tiene el rival en la mano (de 0 a `max`). Con una o más lleva el aro ámbar de lo elegido; con 0, apagada.
 * La carta se elige subiendo su contador (la fila no es un botón).
 */
export function HandtrapPoolCard({ card, copies, max, onChange }: HandtrapPoolCardProps) {
  const chosen = copies > 0

  return (
    <li className={cx('flex min-w-0 items-center gap-2.5 rounded-control p-1.5 transition-colors duration-150 motion-reduce:transition-none', chosen && listItemSelected)}>
      {/* `rounded-none`: las cartas van rectas. La tilde de elegida, en ámbar como todo lo elegido. La imagen no se lee: el nombre ya va al lado. */}
      <span aria-hidden="true" className="relative aspect-[421/614] w-10 shrink-0 overflow-hidden rounded-none bg-input">
        <CardArt remoteUrl={cardSmallImageUrl(card.id)} name={card.name} className={cx('block h-full w-full object-cover transition-opacity duration-150 motion-reduce:transition-none', !chosen && 'opacity-55')} />
        {chosen ? (
          <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-info text-info-foreground">
            <Icon name="check" size={11} strokeWidth={3} />
          </span>
        ) : null}
      </span>
      <span className="grid min-w-0 flex-1 justify-items-start gap-1">
        <span className={cx('max-w-full truncate text-body font-semibold', chosen ? 'text-foreground' : 'text-muted')}>{card.name}</span>
        <Stepper size="lg" label={t('handtraps.picker.copies', { name: card.name })} value={copies} min={0} max={max} onChange={onChange} />
      </span>
    </li>
  )
}

interface Draft {
  /** Las copias de cada carta (0, o sin anotar: no está en la mano). */
  copies: Readonly<Record<number, number>>
  /** Las cartas que no son del catálogo (agregadas con el buscador): siguen en la lista aunque bajen a 0, hasta cerrar la hoja. */
  extras: readonly HandtrapCard[]
}

const CATALOG_IDS = new Set(HANDTRAP_CATALOG.map((card) => card.id))

const draftOf = (config: HandtrapConfig): Draft => ({
  copies: Object.fromEntries(config.picks.map((pick) => [pick.id, pick.copies])),
  extras: config.picks.filter((pick) => !CATALOG_IDS.has(pick.id)).map(({ id, name }) => ({ id, name })),
})

interface HandtrapPickerProps {
  isOpen: boolean
  config: HandtrapConfig
  onClose: () => void
  /** La mano elegida: las cartas con al menos una copia, en el orden del catálogo y después las agregadas. */
  onSave: (picks: HandtrapPick[]) => void
  /** Dentro de la práctica: aplicar reparte una mano nueva, y la hoja lo avisa abajo. */
  dealsNew?: boolean
  /** Con el simulador encendido, «Apagar el simulador» (sin caja: es lo que descarta). */
  onTurnOff?: () => void
}

/**
 * La hoja de la mano del rival: las handtraps del catálogo (y las que se agregan con el buscador), cada una con su contador de copias (hasta `MAX_COPIES` por carta y `MAX_RIVAL_HAND`
 * en total: el «+» se apaga en cualquiera de los dos topes). Abajo, cuántas tiene en total y, en el tope o sin ninguna, el aviso. Cada vez que se abre arranca de lo guardado.
 */
export function HandtrapPicker({ isOpen, config, dealsNew = false, onClose, onSave, onTurnOff }: HandtrapPickerProps) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(config))
  const [query, setQuery] = useState('')
  const [wasOpen, setWasOpen] = useState(isOpen)
  const addId = useId()
  const hits = useCardHits(isOpen ? query : '', NO_EXPANSIONS)

  // Al abrirse vuelve a lo guardado (sin una `key` que cambie al cerrar: la hoja sale con su animación).
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)

    if (isOpen) {
      setDraft(draftOf(config))
      setQuery('')
    }
  }

  const entries = [...HANDTRAP_CATALOG, ...draft.extras]
  const copiesOf = (card: HandtrapCard) => draft.copies[card.id] ?? 0
  const picks = entries.filter((card) => copiesOf(card) > 0).map((card) => ({ ...card, copies: copiesOf(card) }))
  const total = handCount(picks)
  const room = MAX_RIVAL_HAND - total
  const listed = new Set(entries.map((card) => card.id))

  const setCopies = (card: HandtrapCard, copies: number) => setDraft((current) => ({ ...current, copies: { ...current.copies, [card.id]: copies } }))
  // Lo agregado entra con una copia si todavía hay lugar en la mano; si no, en 0 (queda en la lista).
  const add = (card: HandtrapCard) => setDraft((current) => (listed.has(card.id) ? current : { extras: [...current.extras, card], copies: { ...current.copies, [card.id]: room > 0 ? 1 : 0 } }))

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={t('handtraps.title')}
      subtitle={t('handtraps.picker.subtitle')}
      footer={
        <div className="grid w-full gap-3">
          <p className="m-0 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1" role="status">
            <span className="text-body font-semibold tabular-nums text-foreground">{t('handtraps.picker.count', { count: total })}</span>
            <span className="min-h-5 text-micro text-warning">{total === 0 ? t('handtraps.picker.empty') : room === 0 ? t('handtraps.picker.cap', { max: MAX_RIVAL_HAND }) : ''}</span>
          </p>
          {dealsNew ? <p className="m-0 text-micro text-soft">{t('handtraps.picker.dealsNew')}</p> : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onTurnOff ? (
              <Button variant="tertiary" className="mr-auto" onClick={onTurnOff}>
                {t('handtraps.picker.turnOff')}
              </Button>
            ) : null}
            <Button variant="tertiary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" disabled={total === 0} onClick={() => onSave(picks)}>
              {t('handtraps.picker.use')}
            </Button>
          </div>
        </div>
      }
    >
      <ul aria-label={t('handtraps.picker.list')} className={POOL_LIST}>
        {entries.map((card) => (
          <HandtrapPoolCard key={card.id} card={card} copies={copiesOf(card)} max={Math.min(MAX_COPIES, copiesOf(card) + room)} onChange={(copies) => setCopies(card, copies)} />
        ))}
      </ul>

      <section aria-labelledby={addId} className="mt-5 grid gap-2 border-t border-border-subtle pt-4">
        <Heading level="card" as="h3" id={addId}>
          {t('handtraps.picker.add')}
        </Heading>
        <SearchField label={t('handtraps.picker.search')} value={query} onChange={setQuery} placeholder={t('handtraps.picker.searchPlaceholder')} />
        {hits.status === 'loading' ? (
          <p className="m-0 text-micro text-soft" role="status">
            {t('handtraps.picker.searching')}
          </p>
        ) : null}
        {hits.status === 'ready' && hits.hits.length === 0 ? <p className="m-0 text-micro text-soft">{t('handtraps.picker.noResults', { query: query.trim() })}</p> : null}
        {hits.hits.length > 0 ? (
          <ul className="m-0 grid list-none gap-1 p-0 sm:grid-cols-2">
            {hits.hits.map((hit) => {
              const inList = listed.has(hit.cardId)

              return (
                <li key={hit.cardId} className="min-w-0">
                  <button
                    type="button"
                    disabled={inList}
                    aria-label={inList ? t('handtraps.picker.listed', { name: hit.name }) : t('handtraps.picker.addCard', { name: hit.name })}
                    className="group flex w-full items-center gap-2.5 rounded-control p-1.5 text-left transition-colors duration-150 hover:bg-tint/6 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default disabled:hover:bg-transparent motion-reduce:transition-none"
                    onClick={() => add({ id: hit.cardId, name: hit.name })}
                  >
                    <span className="aspect-[421/614] w-7 shrink-0 overflow-hidden rounded-none bg-input">
                      <CardArt remoteUrl={cardSmallImageUrl(hit.cardId)} name={hit.name} className="block h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-body text-foreground">{hit.name}</span>
                    <span aria-hidden="true" className={cx('grid size-7 shrink-0 place-items-center rounded-full', inList ? 'bg-success-solid text-white' : 'bg-background/85 text-foreground group-hover:text-info group-focus-visible:text-info')}>
                      <Icon name={inList ? 'check' : 'plus'} size={14} />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}
      </section>
    </Modal>
  )
}
