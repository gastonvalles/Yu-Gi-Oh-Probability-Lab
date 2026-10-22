import { useId, useState } from 'react'

import { cardSmallImageUrl, type Expansion } from '../../app/card-prices'
import {
  HANDTRAP_CATALOG,
  HANDTRAP_KINDS,
  RIVAL_COUNT_RANGE,
  maxRivalHand,
  readHandtrapConfig,
  writeHandtrapConfig,
  type HandtrapConfig,
  type HandtrapKind,
  type HandtrapPick,
} from '../../app/handtraps'
import { useCardHits } from '../../app/use-card-hits'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { SearchField } from '../ui/SearchField'
import { Stepper } from '../ui/Stepper'
import { listItemSelected } from '../ui/surfaces'
import { Switch } from '../ui/Switch'

const KIND_LABEL = { repeatable: 'handtraps.kind.repeatable', single: 'handtraps.kind.single', charmy: 'handtraps.kind.charmy' } as const satisfies Record<HandtrapKind, string>

/** El tipo que sigue al tocarlo: Repetible → Una sola → Charmy → Repetible. */
const nextKind = (kind: HandtrapKind): HandtrapKind => HANDTRAP_KINDS[(HANDTRAP_KINDS.indexOf(kind) + 1) % HANDTRAP_KINDS.length]!

/** Sin expansiones: la búsqueda de «Agregar otra carta» es por nombre (los códigos de impresión son de la vista de Expansiones). */
const NO_EXPANSIONS: Expansion[] = []

/**
 * El simulador de handtraps en las reglas de la sala, con el modo Solo: encenderlo, lo que tiene el rival («3 en mano · pool de 8») y la hoja para elegir el pool.
 * Se recuerda en el navegador (`app/handtraps.ts`) y vale para la próxima mano de «Jugar solo».
 */
export function HandtrapsRow() {
  const [config, setConfig] = useState<HandtrapConfig>(readHandtrapConfig)
  const [choosing, setChoosing] = useState(false)
  const save = (next: HandtrapConfig) => {
    setConfig(next)
    writeHandtrapConfig(next)
  }

  return (
    <div className="flex items-center justify-between gap-3 sm:col-span-2">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-body font-semibold text-foreground">{t('handtraps.title')}</span>
        <span className="text-micro text-soft">{t('handtraps.row.summary', { count: Math.min(config.count, maxRivalHand(config.picks)), pool: config.picks.length })}</span>
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
        onSave={(picks, count) => {
          // Elegir un pool es querer usarlo: el simulador queda encendido.
          save({ enabled: true, picks, count })
          setChoosing(false)
        }}
      />
    </div>
  )
}

/** La lista del pool: una columna en el celular y dos desde 640 px, sin cajas (sólo la elegida se marca). */
const POOL_LIST = 'm-0 grid list-none gap-1 p-0 sm:grid-cols-2'

interface HandtrapPoolCardProps {
  card: HandtrapPick
  kind: HandtrapKind
  chosen: boolean
  onToggle: () => void
  onCycle: () => void
}

/**
 * Una carta del pool: la carta y su nombre se marcan o desmarcan con un toque (`aria-pressed`); elegida, lleva el aro ámbar de lo elegido y, debajo del nombre, su tipo,
 * que cambia con otro toque (Repetible → Una sola → Charmy). Sin elegir el tipo sólo se lee, en el mismo lugar: marcarla no corre nada.
 */
export function HandtrapPoolCard({ card, kind, chosen, onToggle, onCycle }: HandtrapPoolCardProps) {
  const label = t(KIND_LABEL[kind])

  return (
    <li className="relative min-w-0">
      <button
        type="button"
        aria-pressed={chosen}
        aria-label={card.name}
        className={cx(
          'flex w-full items-center gap-2.5 rounded-control p-1.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
          chosen ? listItemSelected : 'hover:bg-tint/6',
        )}
        onClick={onToggle}
      >
        {/* `rounded-none`: las cartas van rectas. La tilde de elegida, en ámbar como todo lo elegido. La imagen no se lee: el nombre ya va al lado. */}
        <span aria-hidden="true" className="relative aspect-[421/614] w-10 shrink-0 overflow-hidden rounded-none bg-input">
          <CardArt remoteUrl={cardSmallImageUrl(card.id)} name={card.name} className={cx('block h-full w-full object-cover transition-opacity duration-150 motion-reduce:transition-none', !chosen && 'opacity-55')} />
          {chosen ? (
            <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-info text-info-foreground">
              <Icon name="check" size={11} strokeWidth={3} />
            </span>
          ) : null}
        </span>
        <span className="grid min-w-0 flex-1 gap-1">
          <span className={cx('truncate text-body font-semibold', chosen ? 'text-foreground' : 'text-muted')}>{card.name}</span>
          {/* El tipo: elegida, es el botón de abajo (que se apoya acá, sin correr nada); sin elegir, sólo se lee. */}
          <span className={cx('flex min-h-9 items-center text-micro text-soft pointer-coarse:min-h-11', chosen && 'invisible')}>{label}</span>
        </span>
      </button>
      {chosen ? (
        <Button variant="secondary" size="sm" className="absolute bottom-1.5 left-14 max-w-[calc(100%-4rem)] px-3" aria-label={t('handtraps.kind.change', { name: card.name, kind: label })} onClick={onCycle}>
          <span className="truncate">{label}</span>
        </Button>
      ) : null}
    </li>
  )
}

interface Draft {
  chosen: ReadonlySet<number>
  /** El tipo de cada carta (también de las que se desmarcaron: al volver a marcarlas, vuelve el suyo). */
  kinds: Readonly<Record<number, HandtrapKind>>
  count: number
  /** Las cartas del pool que no son del catálogo (agregadas con el buscador): siguen en la lista aunque se desmarquen, hasta cerrar la hoja. */
  extras: readonly HandtrapPick[]
}

const CATALOG_IDS = new Set(HANDTRAP_CATALOG.map((card) => card.id))

const draftOf = (config: HandtrapConfig): Draft => ({
  chosen: new Set(config.picks.map((pick) => pick.id)),
  kinds: Object.fromEntries(config.picks.map((pick) => [pick.id, pick.kind])),
  count: config.count,
  extras: config.picks.filter((pick) => !CATALOG_IDS.has(pick.id)),
})

interface HandtrapPickerProps {
  isOpen: boolean
  config: HandtrapConfig
  onClose: () => void
  onSave: (picks: HandtrapPick[], count: number) => void
}

/**
 * La hoja del pool: las handtraps del catálogo (y las que se agregan con el buscador) como cartas que se marcan; cada elegida dice su tipo y se cambia con un toque.
 * Abajo, cuántas tiene el rival en la mano y, si el pool no alcanza, hasta cuántas puede tener. Cada vez que se abre arranca de lo guardado.
 */
export function HandtrapPicker({ isOpen, config, onClose, onSave }: HandtrapPickerProps) {
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
  const kindOf = (card: HandtrapPick) => draft.kinds[card.id] ?? card.kind
  const picks = entries.filter((card) => draft.chosen.has(card.id)).map((card) => ({ ...card, kind: kindOf(card) }))
  const possible = maxRivalHand(picks)
  const inPool = new Set(entries.map((card) => card.id))

  const toggle = (card: HandtrapPick) =>
    setDraft((current) => {
      const chosen = new Set(current.chosen)

      if (!chosen.delete(card.id)) chosen.add(card.id)

      return { ...current, chosen }
    })
  const cycle = (card: HandtrapPick) => setDraft((current) => ({ ...current, kinds: { ...current.kinds, [card.id]: nextKind(current.kinds[card.id] ?? card.kind) } }))
  const add = (card: HandtrapPick) =>
    setDraft((current) => (inPool.has(card.id) ? current : { ...current, extras: [...current.extras, card], chosen: new Set([...current.chosen, card.id]), kinds: { ...current.kinds, [card.id]: card.kind } }))

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={t('handtraps.title')}
      subtitle={t('handtraps.picker.subtitle')}
      footer={
        <div className="grid w-full gap-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="text-body font-semibold text-foreground">{t('handtraps.picker.count')}</span>
            <Stepper label={t('handtraps.picker.count')} value={draft.count} min={RIVAL_COUNT_RANGE.min} max={RIVAL_COUNT_RANGE.max} onChange={(count) => setDraft((current) => ({ ...current, count }))} />
            <p className={cx('m-0 min-h-5 basis-full text-micro', picks.length === 0 || possible < draft.count ? 'text-warning' : 'text-soft')} role="status">
              {picks.length === 0 ? t('handtraps.picker.empty') : possible < draft.count ? t('handtraps.picker.max', { max: possible }) : ''}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="tertiary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" disabled={picks.length === 0} onClick={() => onSave(picks, draft.count)}>
              {t('handtraps.picker.use')}
            </Button>
          </div>
        </div>
      }
    >
      <ul aria-label={t('handtraps.picker.list')} className={POOL_LIST}>
        {entries.map((card) => (
          <HandtrapPoolCard key={card.id} card={card} kind={kindOf(card)} chosen={draft.chosen.has(card.id)} onToggle={() => toggle(card)} onCycle={() => cycle(card)} />
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
              const listed = inPool.has(hit.cardId)

              return (
                <li key={hit.cardId} className="min-w-0">
                  <button
                    type="button"
                    disabled={listed}
                    aria-label={listed ? t('handtraps.picker.inPool', { name: hit.name }) : t('handtraps.picker.addCard', { name: hit.name })}
                    className="group flex w-full items-center gap-2.5 rounded-control p-1.5 text-left transition-colors duration-150 hover:bg-tint/6 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default disabled:hover:bg-transparent motion-reduce:transition-none"
                    onClick={() => add({ id: hit.cardId, name: hit.name, kind: 'single' })}
                  >
                    <span className="aspect-[421/614] w-7 shrink-0 overflow-hidden rounded-none bg-input">
                      <CardArt remoteUrl={cardSmallImageUrl(hit.cardId)} name={hit.name} className="block h-full w-full object-cover" />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-body text-foreground">{hit.name}</span>
                    <span aria-hidden="true" className={cx('grid size-7 shrink-0 place-items-center rounded-full', listed ? 'bg-success-solid text-white' : 'bg-background/85 text-foreground group-hover:text-info group-focus-visible:text-info')}>
                      <Icon name={listed ? 'check' : 'plus'} size={14} />
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
