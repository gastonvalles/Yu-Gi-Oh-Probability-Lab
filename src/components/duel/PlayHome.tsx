import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

import { canRunAuto, setAutoPref, useAutoPrefs, type AutoPrefs } from '../../app/auto-prefs'
import { getDeckFormatLabel } from '../../app/deck-format'
import { extractRoomCode, isWatchLink, type DuelView } from '../../app/duel-link'
import { pickRoom, readPrefs, writePrefs, type DuelPrefs, type RoomOptions } from '../../app/duel-prefs'
import { DUEL_FORMATS, DUEL_LIMIT_CHOICES, GENESYS_CAP_RANGE, MAX_NAME_LENGTH, TURN_BONUS_RANGE, TURN_MIN_RANGE } from '../../app/duel-protocol'
import type { RoomsApi } from '../../app/duel-rooms'
import type { PausedDuel } from '../../app/duel-save'
import { t } from '../../i18n'
import type { DeckFormat } from '../../types'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { cx } from '../ui/cx'
import { FieldBox, fieldInline } from '../ui/FieldBox'
import { Icon } from '../ui/Icon'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'
import { ShortcutGrid, ShortcutTile } from '../ui/ShortcutGrid'
import { Stepper } from '../ui/Stepper'
import { field, surface } from '../ui/surfaces'
import { Switch } from '../ui/Switch'
import { textLink } from '../ui/typography'
import { ArenaPanel } from './ArenaPanel'
import { DuelModeRow, useAutoRooms, type AutoRooms } from './DuelModeRow'
import { HandtrapsRow } from './HandtrapPool'
import { formatName } from './room-chips'

/** Lo que dice la búsqueda de «Jugar ahora» mientras pasa de verdad: se busca, se entra o se abre la tuya. */
type Search = { kind: 'searching' } | { kind: 'joining'; name: string } | { kind: 'opening' } | null

interface PlayHomeProps {
  /** El paso que pidió el menú: abrir las reglas (`create`) o el campo del código (`join`). Mirar un duelo lo atiende el lobby. */
  view: DuelView | null
  name: string
  onName: (name: string) => void
  /** El nombre del deck armado en el builder. */
  deckName: string
  /** Ver o armar el deck: toda referencia al deck va al builder (el lobby no lo cambia acá). */
  onOpenBuilder: () => void
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

/** Las reglas con que se abre tu sala, en una línea (con reglas automáticas, también eso). */
const rulesLine = (prefs: DuelPrefs, auto: boolean) => [formatName(prefs.format, prefs.genesysCap), prefs.limitMin > 0 ? t('duel.play.timeMin', { min: prefs.limitMin }) : t('duel.play.timeNone'), prefs.match ? t('duel.play.typeMatch') : t('duel.play.typeSingle'), ...(auto ? [t('duel.auto.rulesRow')] : [])].join(' · ')

/**
 * El inicio de Jugar: primero entrar (una acción principal, «Jugar ahora», con las reglas que se recuerdan), después lo que pasa en la arena (salas que esperan y duelos en vivo,
 * a un toque) y por último las otras formas de entrar. No es un formulario: nada es obligatorio antes del botón, y las reglas y el deck están a un toque.
 */
export function PlayHome({ view, name, onName, deckName, onOpenBuilder, deckReady, deckSize, minDeck, rooms, trainReady, onTrain, onOpenDuel, onJoin, paused, onResume, onDropPaused }: PlayHomeProps) {
  const [prefs, setPrefs] = useState<DuelPrefs>(() => readPrefs())
  const [search, setSearch] = useState<Search>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [codeOpen, setCodeOpen] = useState(false)
    const [code, setCode] = useState('')
  const [invalid, setInvalid] = useState(false)
  const codeRef = useRef<HTMLInputElement | null>(null)
  const nameId = useId()
  const alive = useRef(true)
  // El modo automático («Modo del duelo» de las reglas; automático de entrada): la sala que abrís, pública o privada, tiene reglas automáticas si está
  // prendido y se puede. Se decide al abrirla y queda así mientras dure.
  const autoDuel = useAutoPrefs().duel
  const autoRooms = useAutoRooms(rulesOpen || autoDuel)
  const autoRoom = autoDuel && autoRooms === 'on'

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
  const format = getDeckFormatLabel(prefs.format)
  const rules = rulesLine(prefs, autoRoom)

  // «Jugar ahora»: busca una sala pública compatible y entra; si no hay, abre una pública con las reglas que se recuerdan. Todo es lo que pasa de verdad, sin esperas de mentira.
  const playNow = async () => {
    if (!deckReady) {
      onOpenBuilder()
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
    // Con el modo automático, también automática: la lista no lo dice (el relay no publica ese dato), la ficha de la sala sí.
    onOpenDuel({ ...prefs, isPublic: Boolean(rooms), ...(autoRoom ? { auto: true } : {}) })
  }

  const challenge = () => {
    writePrefs(prefs)
    onOpenDuel({ ...prefs, isPublic: false, ...(autoRoom ? { auto: true } : {}) })
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

  return (
    <>
      <div className="grid items-start gap-4 min-[1101px]:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="stagger grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4">
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

          {/* La portada (movimiento 4 de G): arriba el deck con que entrás (lleva al builder: ahí se tocan las cartas), el titular y lo que va a pasar; en la última fila, las reglas con que
              entrás a la izquierda y la acción principal a la derecha, al pulgar (una sola por vista: con un duelo en pausa, volver a él es lo principal). */}
          <section aria-label={t('duel.play.subtitle')} className="grid gap-3 rounded-panel border border-nav-raised bg-nav p-4 min-[1101px]:p-5">
            <div className="flex items-center gap-3">
              <span className="grid min-w-0 flex-1">
                <span className="text-micro text-muted">{t('duel.room.deckTitle')}</span>
                <span className="truncate text-body font-semibold text-foreground">{deckReady ? `${deckName} · ${deckSize}` : t('duel.play.deckNone')}</span>
              </span>
              <button type="button" aria-label={t('duel.room.deckChange')} className={cx('inline-flex min-h-11 shrink-0 items-center rounded-control px-1 text-body', textLink)} onClick={onOpenBuilder}>
                {t('duel.play.deckChange')}
              </button>
            </div>
            <div className="grid gap-1">
              <h2 className="m-0 text-title font-extrabold leading-tight text-foreground">{t('duel.play.subtitle')}</h2>
              <p className="m-0 min-h-5 text-body text-muted" role="status" aria-live="polite">
                {deckReady ? statusText : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-tint/18 pt-3">
              {/* Sin «Automáticas (beta)»: eso lo dice el atajo de las reglas, que lo lleva entero (cada dato una vez). */}
              <span className="grid min-w-0 flex-1 basis-28">
                <span className="text-micro text-muted">{t('duel.play.rulesYours')}</span>
                <span className="text-body font-semibold text-foreground">{rulesLine(prefs, false)}</span>
              </span>
              {/* Lo que se distingue de la vista: lavanda clara sobre la portada violeta (`onBrand`; el violeta lleno no se despegaba de ella). Con un duelo en pausa, lo principal es volver a él. */}
              <Button variant={paused ? 'secondary' : 'onBrand'} icon="play" className="ml-auto" aria-busy={busy} disabled={busy} onClick={() => void playNow()}>
                {deckReady ? t('duel.play.now') : t('duel.play.needDeck')}
              </Button>
            </div>
          </section>

          {/* Las otras formas de entrar, cuatro atajos de un solo tinte: un amigo, un código, entrenar y las reglas. Lo que hace cada uno (o lo que le falta) lo dice el lector; apagado, el toque no hace nada. */}
          <ShortcutGrid>
            <ShortcutTile icon="link" label={t('duel.play.friend')} hint={t('duel.play.friendHint')} disabled={busy || !deckReady} onClick={() => !busy && deckReady && challenge()} />
            <ShortcutTile icon="tag" label={t('duel.play.code')} hint={t('duel.play.codeHint')} expanded={codeOpen} onClick={() => setCodeOpen((open) => !open)} />
            <ShortcutTile icon="hand" label={t('duel.play.train')} hint={trainReady ? t('duel.play.trainHint') : t('duel.play.trainNeedDeck')} disabled={!trainReady} onClick={() => trainReady && onTrain()} />
            <ShortcutTile icon="gear" label={t('duel.play.rules')} hint={rules} popup onClick={() => setRulesOpen(true)} />
          </ShortcutGrid>
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

          {/* El nombre (como te ve tu rival), escrito acá mismo: se guarda mientras se escribe (lo limpia y lo recorta la pantalla); vacío, vale «Duelista». Nada lo enfoca solo
              (`opensKeyboard`). Con 16 px de letra: con menos, iOS agranda la página al enfocarlo. Automático o manual va en las reglas («Modo del duelo»). */}
          <div className={cx(surface.card, 'grid gap-1.5 p-4')}>
            <label htmlFor={nameId} className="text-body font-semibold text-foreground">
              {t('duel.lobby.name')}
            </label>
            <input
              id={nameId}
              aria-describedby={`${nameId}-hint`}
              placeholder={t('duel.lobby.defaultName')}
              maxLength={MAX_NAME_LENGTH}
              autoComplete="nickname"
              value={name}
              onChange={(event) => onName(event.target.value)}
              className={cx(field, 'h-11 w-full min-w-0 px-3 text-base font-semibold placeholder:font-normal placeholder:text-soft')}
            />
            <span id={`${nameId}-hint`} className="text-micro text-soft">
              {t('duel.lobby.namePlaceholder')}
            </span>
          </div>
        </div>

        {/* La arena, al costado en escritorio (debajo en el celular): una tarjeta por sala que espera y por duelo en vivo. Sólo lo que dice el relay; sin relay no hay arena. */}
        {rooms ? <ArenaPanel rooms={rooms} busy={busy} deckReady={deckReady} onJoin={onJoin} /> : null}
      </div>

      <RulesSheet
        isOpen={rulesOpen}
        prefs={prefs}
        canPublish={Boolean(rooms)}
        canOpen={deckReady}
        canTrain={trainReady}
        autoRooms={autoRooms}
        onClose={() => setRulesOpen(false)}
        onTrain={() => {
          setRulesOpen(false)
          onTrain()
        }}
        onSave={(next) => {
          setPrefs(next)
          writePrefs(next)
          setRulesOpen(false)
        }}
        onOpen={(next, isPublic) => {
          setPrefs(next)
          writePrefs(next)
          setRulesOpen(false)
          onOpenDuel({ ...next, isPublic, ...(autoRoom ? { auto: true } : {}) })
        }}
      />

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
  /** Hay un deck armado en el builder: «Solo» juega con ése. */
  canTrain: boolean
  /** Si se pueden abrir salas con reglas automáticas (y si no, por qué): «Modo del duelo». */
  autoRooms: AutoRooms
  onClose: () => void
  onSave: (prefs: DuelPrefs) => void
  onOpen: (prefs: DuelPrefs, isPublic: boolean) => void
  onTrain: () => void
}

/** Los tres modos de una sala: un solo duelo, un Match, o Solo (la mesa sin rival ni sala: no es una regla que se guarde sino otra forma de entrar). */
type RoomMode = 'single' | 'match' | 'solo'

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
function RulesSheet({ isOpen, prefs, canPublish, canOpen, canTrain, autoRooms, onClose, onSave, onOpen, onTrain }: RulesSheetProps) {
  const [draft, setDraft] = useState<DuelPrefs>(prefs)
  const [isPublic, setIsPublic] = useState(true)
  const [solo, setSolo] = useState(false)
  const set = (patch: Partial<DuelPrefs>) => setDraft((current) => ({ ...current, ...patch }))
  const autoPrefsNow = useAutoPrefs()
  const autoSolo = autoPrefsNow.duel && canRunAuto()

  // Cada vez que se abre arranca de lo que está guardado (y en un duelo con rival: «Solo» no se recuerda).
  useEffect(() => {
    if (isOpen) {
      setDraft(prefs)
      setSolo(false)
    }
  }, [isOpen, prefs])

  const genesys = draft.format === 'genesys'
  const match = draft.match && !solo
  const turnOn = draft.turnLimit
  const mode: RoomMode = solo ? 'solo' : match ? 'match' : 'single'

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={t('duel.play.rules')}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {solo ? (
            <Button variant="primary" icon="hand" disabled={!canTrain} onClick={onTrain}>
              {t('duel.play.rulesSolo')}
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onSave(draft)}>
                {t('duel.play.rulesSave')}
              </Button>
              <Button variant="primary" disabled={!canOpen} onClick={() => onOpen(draft, canPublish && isPublic)}>
                {t('duel.play.rulesOpen')}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="grid gap-x-4 gap-y-4 sm:grid-cols-2">
        <RuleField label={t('duel.create.type')} hint={solo ? (canTrain ? t('duel.create.soloHint') : t('duel.play.trainNeedDeck')) : match ? t('duel.create.matchHint') : null} className="sm:col-span-2">
          <Segmented<RoomMode>
            label={t('duel.create.type')}
            fullWidth
            value={mode}
            onChange={(value) => {
              setSolo(value === 'solo')

              if (value !== 'solo') {
                set({ match: value === 'match', siding: value === 'match' && draft.siding })
              }
            }}
            options={[
              { value: 'single', label: t('duel.create.single') },
              { value: 'match', label: t('duel.create.match') },
              { value: 'solo', label: t('duel.create.solo') },
            ]}
          />
        </RuleField>

        {/* Automático o manual (una sola preferencia: con rival, la sala que se abre; en Solo, la mesa de «Entrenar solo»). Solo: el simulador de handtraps del rival (apagado, la mesa es la de siempre). */}
        <DuelModeRow rooms={autoRooms} solo={solo} className="sm:col-span-2" />
        {solo ? <HandtrapsRow /> : null}

        {/* Solo automático: quién empieza (el núcleo arranca con el asiento 0; ir segundo es ocupar el 1). La práctica manual no tiene turnos del rival: no va. */}
        {solo && autoSolo ? (
          <RuleField label={t('auto.first.label')} className="sm:col-span-2">
            <Segmented<AutoPrefs['first']>
              label={t('auto.first.label')}
              fullWidth
              value={autoPrefsNow.first}
              onChange={(value) => setAutoPref('first', value)}
              options={[
                { value: 'me', label: t('auto.first.me') },
                { value: 'rival', label: t('auto.first.rival') },
                { value: 'random', label: t('auto.first.random') },
              ]}
            />
          </RuleField>
        ) : null}

        {solo ? null : (
          <RuleField label={t('duel.create.time')} className="sm:col-span-2">
            <Segmented<string>
              label={t('duel.create.time')}
              fullWidth
              value={String(draft.limitMin)}
              onChange={(value) => set({ limitMin: Number(value) })}
              options={DUEL_LIMIT_CHOICES.map((min) => ({ value: String(min), label: min === 0 ? t('duel.play.timeNone') : t('duel.play.timeMin', { min }) }))}
            />
          </RuleField>
        )}

        {solo ? null : (
          <div className="grid gap-3 sm:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <span className="grid min-w-0 gap-0.5">
                <span className="text-body font-semibold text-foreground">{t('duel.create.turn')}</span>
                <span className="text-micro text-soft">{t('duel.create.turnHint')}</span>
              </span>
              <Switch checked={turnOn} onChange={(turnLimit) => set({ turnLimit })} label={t('duel.create.turn')} />
            </div>
            {turnOn ? (
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body text-muted">{t('duel.create.turnBank')}</span>
                  <Stepper label={t('duel.create.turnBank')} value={draft.turnMin} min={TURN_MIN_RANGE.min} max={TURN_MIN_RANGE.max} step={1} onChange={(value) => set({ turnMin: value })} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-body text-muted">{t('duel.create.turnBonus')}</span>
                  <Stepper label={t('duel.create.turnBonus')} value={draft.turnBonusMin} min={TURN_BONUS_RANGE.min} max={TURN_BONUS_RANGE.max} step={1} onChange={(value) => set({ turnBonusMin: value })} />
                </div>
              </div>
            ) : null}
          </div>
        )}

        {match && !solo ? (
          <div className="flex items-center justify-between gap-3 sm:col-span-2">
            <span className="grid min-w-0 gap-0.5">
              <span className="text-body font-semibold text-foreground">{t('duel.create.siding')}</span>
              <span className="text-micro text-soft">{t('duel.create.sidingHint')}</span>
            </span>
            <Switch checked={draft.siding} onChange={(siding) => set({ siding })} label={t('duel.create.siding')} />
          </div>
        ) : null}

        {solo ? null : (
          <>
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
          </>
        )}
      </div>

      {solo ? null : <p className="m-0 mt-4 text-micro text-soft">{draft.format === 'unlimited' ? t('duel.create.formatNoneHint') : t('duel.create.formatHint')}</p>}
    </Modal>
  )
}
