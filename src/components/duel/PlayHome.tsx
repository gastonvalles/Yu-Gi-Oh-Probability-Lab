import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { getDeckFormatLabel } from '../../app/deck-format'
import { extractRoomCode, isWatchLink, type DuelView } from '../../app/duel-link'
import { pickRoom, readPrefs, writePrefs, type DuelPrefs, type RoomOptions } from '../../app/duel-prefs'
import { DUEL_FORMATS, DUEL_LIMIT_CHOICES, GENESYS_CAP_RANGE, MAX_NAME_LENGTH } from '../../app/duel-protocol'
import { MAX_SPECTATORS, type LiveDuel, type PublicRoom } from '../../app/duel-relay-rules'
import type { RoomsApi } from '../../app/duel-rooms'
import type { PausedDuel } from '../../app/duel-save'
import { t } from '../../i18n'
import type { DeckFormat } from '../../types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { FieldBox, fieldInline } from '../ui/FieldBox'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'
import { Stepper } from '../ui/Stepper'
import { Switch } from '../ui/Switch'
import { DuelDeckPicker, type DuelDeck } from './DuelDeckPicker'
import { formatName, REFRESH_MS, roomChips } from './room-chips'

/** Cuántas salas o duelos se ven antes de «Ver las N» (la pantalla se entiende en tres segundos: lo demás está a un toque). */
const SHOWN = 3

/** Lo que dice la búsqueda de «Jugar ahora» mientras pasa de verdad: se busca, se entra o se abre la tuya. */
type Search = { kind: 'searching' } | { kind: 'joining'; name: string } | { kind: 'opening' } | null

interface PlayHomeProps {
  /** El paso que pidió el menú: abrir las reglas (`create`) o el campo del código (`join`). Mirar un duelo lo atiende el lobby. */
  view: DuelView | null
  name: string
  onName: (name: string) => void
  builder: DuelDeck
  imported: DuelDeck | null
  onImport: (deck: DuelDeck | null) => void
  deckReady: boolean
  deckSize: number
  minDeck: number
  /** Las salas y los duelos públicos del relay, si lo tiene. Sin esto «Jugar ahora» abre una sala privada y no hay arena que mostrar. */
  rooms?: RoomsApi
  /** Hay un deck armado en el builder: el entrenamiento juega con ése. */
  trainReady: boolean
  onTrain: () => void
  /** Abrir una sala (el anfitrión): con las reglas y si aparece en la lista mientras espera. */
  onOpenDuel: (options: RoomOptions) => void
  /** Entrar a una sala, a jugar o a mirar. */
  onJoin: (room: string, watch: boolean) => void
  paused: PausedDuel | null
  onResume: () => void
  onDropPaused: () => void
}

/** Hace cuánto espera una sala («hace 3 min»); la lista se vuelve a pedir sola cada 15 s, así que se va actualizando. */
function sinceLabel(createdAt: number): string {
  const min = Math.floor((Date.now() - createdAt) / 60_000)

  return min < 1 ? t('duel.arena.sinceNow') : t('duel.arena.since', { min })
}

const rulesLine = (prefs: DuelPrefs) => [formatName(prefs.format, prefs.genesysCap), prefs.limitMin > 0 ? t('duel.play.timeMin', { min: prefs.limitMin }) : t('duel.play.timeNone'), prefs.match ? t('duel.play.typeMatch') : t('duel.play.typeSingle')].join(' · ')

/** La arena: las salas que esperan rival y los duelos públicos en vivo. Sólo lo que dice el relay (nada se inventa) y, sin respuesta, nada: es un extra, no puede romper el inicio. */
function useArena(rooms: RoomsApi | undefined) {
  const [arena, setArena] = useState<{ rooms: PublicRoom[]; live: LiveDuel[] } | null>(null)

  const refresh = useCallback(() => {
    if (rooms) void rooms.overview().then(setArena)
  }, [rooms])

  useEffect(() => {
    refresh()

    const id = window.setInterval(refresh, REFRESH_MS)

    return () => window.clearInterval(id)
  }, [refresh])

  return { arena, refresh }
}

/**
 * El inicio de Jugar: primero entrar (una acción principal, «Jugar ahora», con las reglas que se recuerdan), después lo que pasa en la arena (salas que esperan y duelos en vivo,
 * a un toque) y por último las otras formas de entrar. No es un formulario: nada es obligatorio antes del botón, y las reglas y el deck están a un toque.
 */
export function PlayHome({ view, name, onName, builder, imported, onImport, deckReady, deckSize, minDeck, rooms, trainReady, onTrain, onOpenDuel, onJoin, paused, onResume, onDropPaused }: PlayHomeProps) {
  const [prefs, setPrefs] = useState<DuelPrefs>(() => readPrefs())
  const [search, setSearch] = useState<Search>(null)
  const [deckOpen, setDeckOpen] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
  const [code, setCode] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const codeRef = useRef<HTMLInputElement | null>(null)
  const alive = useRef(true)
  const { arena, refresh } = useArena(rooms)

  useEffect(() => {
    alive.current = true

    return () => {
      alive.current = false
    }
  }, [])

  // Lo que pide el menú se aplica una vez, también si el inicio ya estaba abierto: «Nueva sala» abre las reglas y «Entrar con un enlace» abre el campo del código y le da el foco.
  const focusCode = useRef(false)

  useEffect(() => {
    if (view === 'create') {
      setRulesOpen(true)
    } else if (view === 'join') {
      focusCode.current = true
      setCodeOpen(true)
    }
  }, [view])

  useEffect(() => {
    if (codeOpen && focusCode.current) {
      focusCode.current = false
      codeRef.current?.focus()
    }
  }, [codeOpen])

  const busy = search !== null
  const deckName = imported?.name ?? builder.name
  const format = getDeckFormatLabel(prefs.format)

  // «Jugar ahora»: busca una sala pública compatible y entra; si no hay, abre una pública con las reglas que se recuerdan. Todo es lo que pasa de verdad, sin esperas de mentira.
  const playNow = async () => {
    if (!deckReady) {
      setDeckOpen(true)
      return
    }

    if (busy) {
      return
    }

    setSearch({ kind: 'searching' })

    const list = rooms ? await rooms.list() : []

    if (!alive.current) {
      return
    }

    const found = pickRoom(list, prefs)

    if (found) {
      setSearch({ kind: 'joining', name: found.host })
      onJoin(found.code, false)
      return
    }

    setSearch({ kind: 'opening' })
    writePrefs(prefs)
    onOpenDuel({ ...prefs, isPublic: Boolean(rooms) })
  }

  const challenge = () => {
    writePrefs(prefs)
    onOpenDuel({ ...prefs, isPublic: false })
  }

  /** Con el código (o el enlace) pegado: entrar a jugar, o a mirar (sin deck ni nombre; vale para una sala pública o una privada). */
  const join = (watch: boolean) => {
    const room = extractRoomCode(code)

    if (room) {
      onJoin(room, watch || isWatchLink(code))
    } else {
      setInvalid(true)
    }
  }

  const statusText =
    search?.kind === 'searching'
      ? t('duel.play.searching', { format })
      : search?.kind === 'joining'
        ? t('duel.play.joining', { name: search.name })
        : search?.kind === 'opening'
          ? t('duel.play.opening', { format })
          : t('duel.play.nowHint')

  const waiting = arena?.rooms ?? []
  const live = arena?.live ?? []
  const shownWaiting = expanded ? waiting : waiting.slice(0, SHOWN)
  const shownLive = expanded ? live : live.slice(0, SHOWN)

  return (
    <>
      {/* El título «Jugar» ya está en la barra de arriba (y es el h1 de la pantalla): acá sólo la línea que invita. */}
      <p className="m-0 text-lead text-muted">{t('duel.play.subtitle')}</p>

      {paused ? (
        <div className="grid gap-2 rounded-card border border-primary/40 bg-card-background p-3">
          <p className="m-0 flex items-center gap-2 text-body font-semibold text-foreground" role="status">
            <Icon name="pause" size={16} />
            {paused.rival ? t('duel.lobby.paused', { name: paused.rival }) : t('duel.lobby.pausedNoName')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="tertiary" size="sm" onClick={onDropPaused}>
              {t('duel.lobby.dropPaused')}
            </Button>
            <Button variant="primary" size="sm" onClick={onResume}>
              {t('duel.lobby.resume')}
            </Button>
          </div>
        </div>
      ) : null}

      {deckReady ? null : <Callout tone="warning" icon="alert">{t('duel.lobby.needDeck', { count: deckSize, min: minDeck })}</Callout>}

      {/* Vos: el nombre (como te ve tu rival) y el deck, en una línea. El deck se cambia en una hoja; sin deck, la acción principal lleva a elegirlo. */}
      <div className="flex items-center gap-2">
        <FieldBox className="min-w-0 flex-1">
          <input aria-label={t('duel.lobby.name')} placeholder={t('duel.lobby.namePlaceholder')} maxLength={MAX_NAME_LENGTH} value={name} onChange={(event) => onName(event.target.value)} className={fieldInline} />
        </FieldBox>
        <Button variant="secondary" size="sm" icon="cards" className="max-w-[58%] shrink-0" aria-haspopup="dialog" onClick={() => setDeckOpen(true)}>
          <span className="truncate">{deckReady ? `${deckName} · ${deckSize}` : t('duel.play.deckNone')}</span>
        </Button>
      </div>

      {/* La acción principal. Una sola por vista: con un duelo en pausa, volver a él es lo principal. */}
      <div className="grid gap-2">
        <Button variant={paused ? 'secondary' : 'primary'} size="lg" icon="play" fullWidth aria-busy={busy} disabled={busy} onClick={() => void playNow()}>
          {deckReady ? t('duel.play.now') : t('duel.play.needDeck')}
        </Button>
        <p className="m-0 min-h-5 text-micro text-muted" role="status" aria-live="polite">
          {deckReady ? statusText : ''}
        </p>
        <button
          type="button"
          aria-haspopup="dialog"
          className="flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-control border border-border-subtle bg-transparent px-3 text-left text-body text-muted hover:border-tint/40 focus-visible:outline-none focus-visible:shadow-focus"
          onClick={() => setRulesOpen(true)}
        >
          <span className="min-w-0 truncate">
            <span className="text-soft">{t('duel.play.rules')} ·</span>{' '}
            <span className="font-semibold text-foreground">{rulesLine(prefs)}</span>
          </span>
          <Icon name="chevron-right" size={16} />
        </button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon="link" disabled={busy || !deckReady} onClick={challenge}>
            {t('duel.play.friend')}
          </Button>
          <Button variant="secondary" icon="tag" aria-expanded={codeOpen} onClick={() => setCodeOpen((open) => !open)}>
            {t('duel.play.code')}
          </Button>
        </div>
        {codeOpen ? (
          <form
            className="grid gap-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              join(false)
            }}
          >
            <FieldBox>
              <input
                ref={codeRef}
                aria-label={t('duel.lobby.joinPlaceholder')}
                placeholder={t('duel.lobby.joinPlaceholder')}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value)
                  setInvalid(false)
                }}
                className={fieldInline}
              />
            </FieldBox>
            <div className="grid grid-cols-2 gap-2">
              <Button type="submit" variant="secondary" disabled={(!deckReady && !isWatchLink(code)) || code.trim() === ''}>
                {t('duel.lobby.joinAction')}
              </Button>
              <Button type="button" variant="secondary" icon="eye" disabled={code.trim() === ''} onClick={() => join(true)}>
                {t('duel.arena.watch')}
              </Button>
            </div>
            <p className={invalid ? 'm-0 text-micro text-danger' : 'm-0 text-micro text-soft'} role={invalid ? 'alert' : undefined}>
              {invalid ? t('duel.lobby.joinInvalid') : t('duel.lobby.joinHint')}
            </p>
          </form>
        ) : null}
      </div>

      {/* La arena: lo que dice el relay, nada más. Con salas o duelos, a un toque; sin nada, lo dice y empuja a abrir la tuya. */}
      {rooms ? (
        <section aria-label={t('duel.arena.title')} className="grid gap-2">
          <div className="flex items-center justify-between gap-2">
            <Heading level="card">{t('duel.arena.title')}</Heading>
            <IconButton tone="raised" size="sm" aria-label={t('duel.arena.refresh')} title={t('duel.arena.refresh')} onClick={refresh}>
              <Icon name="refresh" />
            </IconButton>
          </div>

          {arena === null ? (
            <p className="m-0 text-micro text-soft" aria-busy="true">
              {t('duel.arena.loading')}
            </p>
          ) : waiting.length === 0 && live.length === 0 ? (
            <p className="m-0 text-micro text-soft">{t('duel.arena.empty')}</p>
          ) : (
            <>
              <p className="m-0 flex items-center gap-2 text-micro text-muted" role="status">
                <i aria-hidden="true" className="size-2 shrink-0 rounded-full bg-accent" />
                {[waiting.length > 0 ? t('duel.arena.waiting', { count: waiting.length }) : null, live.length > 0 ? t('duel.arena.playing', { count: live.length }) : null].filter(Boolean).join(' · ')}
              </p>

              {shownWaiting.length > 0 ? (
                <ul className="m-0 grid list-none gap-2 p-0">
                  {shownWaiting.map((room) => (
                    <li key={room.code} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border-subtle bg-card-background px-3 py-2.5">
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-body font-semibold text-foreground">{room.host}</span>
                          <span className="shrink-0 text-micro text-soft">{sinceLabel(room.createdAt)}</span>
                        </span>
                        <span className="flex flex-wrap gap-1">
                          {roomChips(room).map((chip) => (
                            <Badge key={chip} size="sm">
                              {chip}
                            </Badge>
                          ))}
                        </span>
                      </span>
                      <Button variant="secondary" size="sm" aria-label={t('duel.arena.enterLabel', { name: room.host })} disabled={busy || !deckReady} onClick={() => onJoin(room.code, false)}>
                        {t('duel.arena.enter')}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}

              {shownLive.length > 0 ? (
                <div className="grid gap-2">
                  <Heading level="card">{t('duel.arena.live')}</Heading>
                  <ul className="m-0 grid list-none gap-2 p-0">
                    {shownLive.map((duel) => {
                      const full = duel.watchers >= MAX_SPECTATORS

                      return (
                        <li key={duel.code} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border-subtle bg-card-background px-3 py-2.5">
                          <span className="grid min-w-0 flex-1 gap-1">
                            <span className="truncate text-body font-semibold text-foreground">{t('duel.arena.isPlaying', { name: duel.host })}</span>
                            <span className="flex flex-wrap items-center gap-1">
                              {roomChips(duel).map((chip) => (
                                <Badge key={chip} size="sm">
                                  {chip}
                                </Badge>
                              ))}
                              <span className="text-micro text-soft">{t('duel.arena.watchers', { count: duel.watchers, max: MAX_SPECTATORS })}</span>
                            </span>
                          </span>
                          <Button variant="secondary" size="sm" icon="eye" aria-label={t('duel.arena.watchLabel', { name: duel.host })} disabled={full} onClick={() => onJoin(duel.code, true)}>
                            {full ? t('duel.arena.full') : t('duel.arena.watch')}
                          </Button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}

              {waiting.length > SHOWN || live.length > SHOWN ? (
                <Button variant="tertiary" size="sm" aria-expanded={expanded} onClick={() => setExpanded((open) => !open)}>
                  {expanded ? t('duel.arena.less') : t('duel.arena.more', { count: waiting.length + live.length })}
                </Button>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      <div className="grid gap-1 border-t border-border-subtle pt-3">
        <Button variant="tertiary" icon="hand" className="justify-start" disabled={!trainReady} onClick={onTrain}>
          {t('duel.play.train')}
        </Button>
        <p className="m-0 px-1 text-micro text-soft">{trainReady ? t('duel.play.trainHint') : t('duel.play.trainNeedDeck')}</p>
      </div>

      <RulesSheet
        isOpen={rulesOpen}
        prefs={prefs}
        canPublish={Boolean(rooms)}
        canOpen={deckReady}
        onClose={() => setRulesOpen(false)}
        onSave={(next) => {
          setPrefs(next)
          writePrefs(next)
          setRulesOpen(false)
        }}
        onOpen={(next, isPublic) => {
          setPrefs(next)
          writePrefs(next)
          setRulesOpen(false)
          onOpenDuel({ ...next, isPublic })
        }}
      />

      <Modal isOpen={deckOpen} onClose={() => setDeckOpen(false)} size="md" title={t('duel.play.deckTitle')}>
        <DuelDeckPicker builder={builder} imported={imported} onImport={onImport} />
      </Modal>
    </>
  )
}

interface RulesSheetProps {
  isOpen: boolean
  prefs: DuelPrefs
  /** Hay lista de salas públicas: se puede elegir publicar la sala que se abre. */
  canPublish: boolean
  /** Hay deck para repartir la mano: sin eso no se abre el duelo (las reglas sí se guardan). */
  canOpen: boolean
  onClose: () => void
  onSave: (prefs: DuelPrefs) => void
  onOpen: (prefs: DuelPrefs, isPublic: boolean) => void
}

/** Un campo de la hoja: su nombre en mayúsculas chicas arriba y el control abajo (con una línea que aclara, sólo si hace falta). */
function RuleField({ label, hint, className, children }: { label: string; hint?: string | null; className?: string; children: ReactNode }) {
  return (
    <div className={cx('grid content-start gap-1.5', className)}>
      <span className="text-micro font-semibold uppercase text-soft">{label}</span>
      {children}
      {hint ? <p className="m-0 text-micro text-soft">{hint}</p> : null}
    </div>
  )
}

/**
 * Las reglas del duelo en una hoja (no en una pantalla de formulario): se guardan para «Jugar ahora», o se abre un duelo ya con ellas, público o con enlace. Los campos van de a dos
 * (tipo y tiempo, formato y quién entra) donde hay lugar y en una columna en el celular; cada uno con una sola línea de ayuda, y sólo cuando aclara algo. El tiempo es de 50 minutos o ninguno;
 * en Genesys aparece el tope de puntos del deck.
 */
function RulesSheet({ isOpen, prefs, canPublish, canOpen, onClose, onSave, onOpen }: RulesSheetProps) {
  const [draft, setDraft] = useState<DuelPrefs>(prefs)
  const [isPublic, setIsPublic] = useState(true)
  const set = (patch: Partial<DuelPrefs>) => setDraft((current) => ({ ...current, ...patch }))

  // Cada vez que se abre arranca de lo que está guardado.
  useEffect(() => {
    if (isOpen) {
      setDraft(prefs)
    }
  }, [isOpen, prefs])

  const genesys = draft.format === 'genesys'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={t('duel.play.rules')}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => onSave(draft)}>
            {t('duel.play.rulesSave')}
          </Button>
          <Button variant="primary" disabled={!canOpen} onClick={() => onOpen(draft, canPublish && isPublic)}>
            {t('duel.play.rulesOpen')}
          </Button>
        </div>
      }
    >
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
        <RuleField label={t('duel.create.type')} hint={draft.match ? t('duel.create.matchHint') : null}>
          <Segmented<'single' | 'match'>
            label={t('duel.create.type')}
            fullWidth
            value={draft.match ? 'match' : 'single'}
            onChange={(value) => set({ match: value === 'match', siding: value === 'match' && draft.siding })}
            options={[
              { value: 'single', label: t('duel.create.single') },
              { value: 'match', label: t('duel.create.match') },
            ]}
          />
        </RuleField>

        <RuleField label={t('duel.create.time')}>
          <Segmented<string>
            label={t('duel.create.time')}
            fullWidth
            value={String(draft.limitMin)}
            onChange={(value) => set({ limitMin: Number(value) })}
            options={DUEL_LIMIT_CHOICES.map((min) => ({ value: String(min), label: min === 0 ? t('duel.play.timeNone') : t('duel.play.timeMin', { min }) }))}
          />
        </RuleField>

        {draft.match ? (
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <span className="grid min-w-0 gap-0.5">
              <span className="text-body font-semibold text-foreground">{t('duel.create.siding')}</span>
              <span className="text-micro text-soft">{t('duel.create.sidingHint')}</span>
            </span>
            <Switch checked={draft.siding} onChange={(siding) => set({ siding })} label={t('duel.create.siding')} />
          </div>
        ) : null}

        <RuleField label={t('duel.create.format')}>
          <FieldBox>
            <select aria-label={t('duel.create.format')} value={draft.format} onChange={(event) => set({ format: event.target.value as DeckFormat })} className={fieldInline}>
              {DUEL_FORMATS.map((value) => (
                <option key={value} value={value}>
                  {getDeckFormatLabel(value)}
                </option>
              ))}
            </select>
          </FieldBox>
        </RuleField>

        {canPublish ? (
          <RuleField label={t('duel.create.visibility')} hint={isPublic ? t('duel.create.publicHint') : t('duel.create.privateHint')}>
            <Segmented<'public' | 'private'>
              label={t('duel.create.visibility')}
              fullWidth
              value={isPublic ? 'public' : 'private'}
              onChange={(value) => setIsPublic(value === 'public')}
              options={[
                { value: 'public', label: t('duel.create.public') },
                { value: 'private', label: t('duel.create.private') },
              ]}
            />
          </RuleField>
        ) : null}

        {genesys ? (
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <span className="grid min-w-0 gap-0.5">
              <span className="text-body font-semibold text-foreground">{t('duel.create.genesysCap')}</span>
              <span className="text-micro text-soft">{t('duel.create.genesysCapHint')}</span>
            </span>
            <Stepper
              label={t('duel.create.genesysCap')}
              value={draft.genesysCap}
              min={GENESYS_CAP_RANGE.min}
              max={GENESYS_CAP_RANGE.max}
              step={10}
              onChange={(value) => set({ genesysCap: value })}
            />
          </div>
        ) : null}
      </div>

      <p className="m-0 mt-4 text-micro text-soft">{draft.format === 'unlimited' ? t('duel.create.formatNoneHint') : t('duel.create.formatHint')}</p>
    </Modal>
  )
}
