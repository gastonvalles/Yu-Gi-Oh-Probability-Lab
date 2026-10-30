import { useId, useState, type ReactNode } from 'react'

import { cardSmallImageUrl, type Expansion } from '../../app/card-prices'
import {
  AUTO_RULES,
  DEFAULT_RIVAL_EXTRA,
  HANDTRAP_CATALOG,
  MAX_COPIES,
  MAX_RIVAL_HAND,
  MIN_RIVAL_HAND,
  poolCount,
  readHandtrapConfig,
  writeHandtrapConfig,
  type ExtraPick,
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
import { Modal } from '../ui/Modal'
import { SearchField } from '../ui/SearchField'
import { Stepper } from '../ui/Stepper'
import { listItemSelected } from '../ui/surfaces'
import { Switch } from '../ui/Switch'
import { RivalExtraDeck } from './RivalExtraDeck'

/** Sin expansiones: la búsqueda de «Agregar otra carta» es por nombre (los códigos de impresión son de la vista de Expansiones). */
const NO_EXPANSIONS: Expansion[] = []

/**
 * El simulador de handtraps en las reglas de la sala, con el modo Solo: encenderlo, cuántas tiene el rival en la mano y entre cuántas cartas se reparten («3 en mano · de 9 cartas»)
 * y la hoja para elegirlas. Se recuerda en el navegador (`app/handtraps.ts`) y vale para la próxima mano de «Jugar solo».
 */
export function HandtrapsRow() {
  const [config, setConfig] = useState<HandtrapConfig>(readHandtrapConfig)
  const [choosing, setChoosing] = useState(false)
  const count = poolCount(config.picks)
  const save = (next: HandtrapConfig) => {
    setConfig(next)
    writeHandtrapConfig(next)
  }

  return (
    <div className="flex items-center justify-between gap-3 sm:col-span-2">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-body font-semibold text-foreground">{t('handtraps.title')}</span>
        {/* Con menos cartas que la mano, la mano sale con todas: se dice lo que sale. */}
        <span className="text-micro text-soft">{t('handtraps.row.summary', { hand: Math.min(config.hand, count), count })}</span>
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
        onSave={(picks, hand, extra) => {
          // Elegir las handtraps es querer usarlas: el simulador queda encendido.
          save({ enabled: true, picks, hand, extra })
          setChoosing(false)
        }}
      />
    </div>
  )
}

/**
 * El simulador de handtraps dentro de la mesa: «Entrenar solo» entra directo a la mesa, sin pasar por las reglas de la sala, así que «Handtraps del rival» del menú ⋯ de la barra (`MatMoreMenu`)
 * abre la misma hoja (`open`; la hoja es `sheet`). Aplicar guarda lo elegido y reparte una mano nueva (`onApply`), con el simulador encendido o apagado; se recuerda igual que lo de las reglas de la sala.
 * En el duelo automático (`auto`) la hoja es la suya: aplicar arma el duelo de nuevo.
 */
export function useHandtrapsSheet({ onApply, auto = false }: { onApply: () => void; auto?: boolean }): { config: HandtrapConfig; open: () => void; sheet: ReactNode } {
  const [config, setConfig] = useState<HandtrapConfig>(readHandtrapConfig)
  const [choosing, setChoosing] = useState(false)
  const apply = (next: HandtrapConfig) => {
    setConfig(next)
    writeHandtrapConfig(next)
    setChoosing(false)
    // Lo elegido ya está guardado: la mano nueva se reparte con eso.
    onApply()
  }

  return {
    config,
    open: () => setChoosing(true),
    sheet: (
      <HandtrapPicker
        isOpen={choosing}
        config={config}
        dealsNew={!auto}
        auto={auto}
        onClose={() => setChoosing(false)}
        // Elegir las handtraps es querer usarlas: el simulador queda encendido.
        onSave={(picks, hand, extra) => apply({ enabled: true, picks, hand, extra })}
        onTurnOff={config.enabled ? () => apply({ ...config, enabled: false }) : undefined}
      />
    ),
  }
}

/** La lista de la hoja: una columna en el celular y dos desde 640 px, sin cajas (sólo la que está en el deck del rival se marca). */
const POOL_LIST = 'm-0 grid list-none gap-1 p-0 sm:grid-cols-2'

interface HandtrapPoolCardProps {
  card: HandtrapCard
  /** Cuántas copias tiene el rival en su deck (0: no la tiene). */
  copies: number
  onChange: (copies: number) => void
  /** Una línea chica debajo del nombre (en el duelo automático, que el rival todavía no la usa solo). */
  note?: string
}

/**
 * Una carta de la hoja: su arte, su nombre y, debajo, cuántas copias tiene el rival en su deck (de 0 a `MAX_COPIES`). Con una o más lleva el aro ámbar de lo elegido; con 0, apagada.
 * La carta se elige subiendo su contador (la fila no es un botón).
 */
export function HandtrapPoolCard({ card, copies, onChange, note }: HandtrapPoolCardProps) {
  const chosen = copies > 0

  return (
    <li className={cx('flex min-w-0 items-center gap-2.5 rounded-control p-1.5 transition-colors duration-150 motion-reduce:transition-none', chosen && listItemSelected)}>
      {/* `rounded-none`: las cartas van rectas. La tilde de elegida, en ámbar como todo lo elegido. La imagen no se lee: el nombre ya va al lado. */}
      <span aria-hidden="true" className="relative aspect-[421/614] w-10 shrink-0 overflow-hidden rounded-none bg-input">
        <CardArt remoteUrl={cardSmallImageUrl(card.id)} name={card.name} className={cx('block h-full w-full object-cover transition-opacity duration-150 motion-reduce:transition-none', !chosen && 'opacity-55')} />
        {chosen ? (
          <span className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-primary text-white">
            <Icon name="check" size={11} strokeWidth={3} />
          </span>
        ) : null}
      </span>
      <span className="grid min-w-0 flex-1 justify-items-start gap-1">
        <span className={cx('max-w-full truncate text-body font-semibold', chosen ? 'text-foreground' : 'text-muted')}>{card.name}</span>
        {note ? <span className="text-micro text-soft">{note}</span> : null}
        <Stepper size="lg" label={t('handtraps.picker.copies', { name: card.name })} value={copies} min={0} max={MAX_COPIES} onChange={onChange} />
      </span>
    </li>
  )
}

interface Draft {
  /** Las copias de cada carta (0, o sin anotar: no está en el deck del rival). */
  copies: Readonly<Record<number, number>>
  /** Las cartas que no son del catálogo (agregadas con el buscador): siguen en la lista aunque bajen a 0, hasta cerrar la hoja. */
  extras: readonly HandtrapCard[]
  /** Cuántas cartas tiene el rival en la mano (de `MIN_RIVAL_HAND` a `MAX_RIVAL_HAND`). */
  hand: number
  /** Su Extra Deck, en orden de preferencia. */
  extra: ExtraPick[]
}

const CATALOG_IDS = new Set(HANDTRAP_CATALOG.map((card) => card.id))

const draftOf = (config: HandtrapConfig): Draft => ({
  copies: Object.fromEntries(config.picks.map((pick) => [pick.id, pick.copies])),
  extras: config.picks.filter((pick) => !CATALOG_IDS.has(pick.id)).map(({ id, name }) => ({ id, name })),
  hand: config.hand,
  extra: (config.extra ?? DEFAULT_RIVAL_EXTRA).map((card) => ({ ...card })),
})

interface HandtrapPickerProps {
  isOpen: boolean
  config: HandtrapConfig
  onClose: () => void
  /** Las handtraps del deck del rival (las cartas con al menos una copia, en el orden del catálogo y después las agregadas), cuántas tiene en la mano y su Extra Deck. */
  onSave: (picks: HandtrapPick[], hand: number, extra: ExtraPick[]) => void
  /** Dentro de la práctica: aplicar reparte una mano nueva, y la hoja lo avisa abajo. */
  dealsNew?: boolean
  /** En el duelo automático: aplicar reinicia el duelo (la hoja lo avisa abajo) y las cartas sin regla (`AUTO_RULES`) dicen que el rival todavía no las usa solo. */
  auto?: boolean
  /** Con el simulador encendido, «Apagar el simulador» (sin caja: es lo que descarta). */
  onTurnOff?: () => void
}

/**
 * La hoja de las handtraps del rival: las del catálogo (y las que se agregan con el buscador), cada una con su contador de copias en el deck del rival (hasta `MAX_COPIES`; el deck no
 * tiene tope). Abajo, cuántas cartas tiene en la mano (de 1 a 5) y entre cuántas se reparten al azar; sin ninguna carta no se puede usar. Cada vez que se abre arranca de lo guardado.
 */
export function HandtrapPicker({ isOpen, config, dealsNew = false, auto = false, onClose, onSave, onTurnOff }: HandtrapPickerProps) {
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
  const total = poolCount(picks)
  const listed = new Set(entries.map((card) => card.id))
  const summary = total === 0 ? t('handtraps.picker.empty') : total < draft.hand ? t('handtraps.picker.short', { count: total }) : t('handtraps.picker.pool', { count: total })

  const setCopies = (card: HandtrapCard, copies: number) => setDraft((current) => ({ ...current, copies: { ...current.copies, [card.id]: copies } }))
  // Lo agregado entra con una copia y queda en la lista.
  const add = (card: HandtrapCard) => setDraft((current) => (listed.has(card.id) ? current : { ...current, extras: [...current.extras, card], copies: { ...current.copies, [card.id]: 1 } }))

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      // Abierta desde la mesa (la práctica o el duelo automático), sin velo como los demás menús de la mesa; desde el lobby, con velo.
      veil={!dealsNew && !auto}
      title={t('handtraps.title')}
      subtitle={t('handtraps.picker.subtitle')}
      footer={
        <div className="grid w-full gap-3">
          <div className="grid gap-1">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-body font-semibold text-foreground">
                {t('handtraps.picker.hand')}
              </span>
              <Stepper size="lg" label={t('handtraps.picker.hand')} value={draft.hand} min={MIN_RIVAL_HAND} max={MAX_RIVAL_HAND} onChange={(hand) => setDraft((current) => ({ ...current, hand }))} />
            </div>
            <p className={cx('m-0 min-h-5 text-micro', total === 0 || total < draft.hand ? 'text-warning' : 'text-soft')} role="status">
              {summary}
            </p>
          </div>
          {dealsNew || auto ? <p className="m-0 text-micro text-soft">{t(auto ? 'handtraps.picker.restarts' : 'handtraps.picker.dealsNew')}</p> : null}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {onTurnOff ? (
              <Button variant="tertiary" className="mr-auto" onClick={onTurnOff}>
                {t('handtraps.picker.turnOff')}
              </Button>
            ) : null}
            <Button variant="tertiary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" disabled={total === 0} onClick={() => onSave(picks, draft.hand, draft.extra)}>
              {t('handtraps.picker.use')}
            </Button>
          </div>
        </div>
      }
    >
      <ul aria-label={t('handtraps.picker.list')} className={POOL_LIST}>
        {entries.map((card) => (
          <HandtrapPoolCard key={card.id} card={card} copies={copiesOf(card)} onChange={(copies) => setCopies(card, copies)} {...(auto && !AUTO_RULES[card.id] ? { note: t('handtraps.picker.notAuto') } : {})} />
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

      {/* Sólo cuenta en el duelo automático (el núcleo lo usa); en la práctica manual el rival no tiene Extra Deck. */}
      {dealsNew ? null : (
        <div className="mt-5 border-t border-border-subtle pt-4">
          <RivalExtraDeck extra={draft.extra} picks={picks} active={isOpen} onChange={(extra) => setDraft((current) => ({ ...current, extra }))} />
        </div>
      )}
    </Modal>
  )
}
