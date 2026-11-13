import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { canRunAuto, setAutoPref, useAutoPrefs, type AutoPrefs } from '../../app/auto-prefs'
import { botDeckList } from '../../app/bot-deck-lists'
import { cardSmallImageUrl } from '../../app/card-prices'
import { BOT_DECK_MENU, botDeckMain, hasHandtrapConfig, isBotModified, poolCount, readHandtrapConfig, rivalKindOf, withBotFlex, withRival, writeHandtrapConfig, type BotDeckInfo, type HandtrapConfig, type HandtrapPick, type RivalKind } from '../../app/handtraps'
import { STARTING_LP } from '../../app/life-calculator'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { useOnline } from '../../app/use-online'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { StepHero } from '../StepHero'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { Card } from '../ui/Card'
import { CopiesBadge } from '../ui/CopiesBadge'
import { cx } from '../ui/cx'
import { Icon } from '../ui/Icon'
import { ListGroup, ListRow } from '../ui/ListRow'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'
import { ShineFrame } from '../ui/ShineFrame'
import { StepPage } from '../ui/StepPage'
import { Switch } from '../ui/Switch'
import { overline, textLink } from '../ui/typography'
import { BotDeckEditor } from './BotDeckEditor'
import { BotDeckSheet } from './BotDeckSheet'
import { HandtrapPicker } from './HandtrapPool'

/** Cómo se abre la mesa: con el núcleo de reglas o la manual de siempre. */
export type SoloMode = 'auto' | 'manual'

interface SoloScreenProps {
  deckName: string
  deckSize: number
  /** Las cartas que hacen falta para repartir la mano: con menos, la principal lleva al builder. */
  minDeck: number
  /** Ver o cambiar el deck: va al builder (con «Volver a Jugar»). */
  onOpenBuilder: () => void
  /** Lo elegido ya está guardado (`HandtrapConfig`): la pantalla abre la mesa en ese modo. */
  onPlay: (mode: SoloMode) => void
  /** El orden fijo de los bots (los mazos listos); se cambia en las pruebas. */
  decks?: readonly BotDeckInfo[]
}

/** Lo elegido: el rival y, con el bot, su mazo. */
interface Pick {
  kind: RivalKind
  deck: BotDeckInfo | null
}

/** Cuántas cartas tiene una lista (la suma de las copias). */
const copies = (cards: readonly (readonly [number, number])[]) => cards.reduce((total, [, count]) => total + count, 0)

/**
 * El recuadro de un mazo: su primera carta (la que lo define, por el proxy de imágenes), recta como toda carta. Es decorativo: el nombre ya va en texto.
 * Sin imagen, las iniciales de `CardArt`.
 */
function DeckArt({ deck, large = false }: { deck: BotDeckInfo; large?: boolean }) {
  const face = botDeckList(deck.id)?.main[0]?.[0]

  return (
    <span aria-hidden="true" className={cx('block aspect-[421/614] shrink-0 overflow-hidden rounded-none bg-input', large ? 'w-16' : 'w-10')}>
      <CardArt remoteUrl={face ? cardSmallImageUrl(face) : null} name={deck.name} className="block h-full w-full object-cover" />
    </span>
  )
}

/** El ícono del pasivo, en su círculo (el de las filas de `ListRow`). */
function PassiveIcon({ large = false }: { large?: boolean }) {
  return (
    <span aria-hidden="true" className={cx('grid shrink-0 place-items-center rounded-full bg-tint/14 text-white', large ? 'size-16' : 'size-10')}>
      <Icon name="target" size={large ? 28 : 20} variant="bulk" />
    </span>
  )
}

const FAN_SPOTS = { small: ['left-0 top-2', 'left-1 top-1', 'left-2 top-0'], large: ['left-0 top-3', 'left-2 top-1.5', 'left-4 top-0'] }

/**
 * El arte del rival de handtraps, en el lugar del de los bots: hasta 3 de sus cartas, las de más copias adelante, encimadas y rectas. Por el proxy de imágenes con el passcode
 * guardado (sin pedirle nada a la API: el nombre ya está en lo guardado); mientras carga, el esqueleto de `CardArt`, y sin imagen, sus iniciales. Decorativo.
 */
function HandtrapFan({ picks, large = false }: { picks: readonly HandtrapPick[]; large?: boolean }) {
  const front = [...picks].sort((a, b) => b.copies - a.copies).slice(0, 3).reverse()

  return (
    <span aria-hidden="true" data-testid="handtrap-fan" className={cx('relative block shrink-0', large ? 'h-24 w-18' : 'h-14 w-10')}>
      {front.map((pick, index) => (
        <span key={pick.id} className={cx('absolute block aspect-[421/614] overflow-hidden bg-input ring-1 ring-background', large ? 'w-14' : 'w-7.5', FAN_SPOTS[large ? 'large' : 'small'][index])}>
          <CardArt remoteUrl={cardSmallImageUrl(pick.id)} name={pick.name} className="block h-full w-full object-cover" />
        </span>
      ))}
    </span>
  )
}

/** Las cartas del rival de handtraps, cada una con sus copias (con más de una). */
function RivalCards({ picks, large = false }: { picks: readonly HandtrapPick[]; large?: boolean }) {
  return (
    <ul aria-label={t('solo.rivalCards')} className={cx('m-0 flex list-none flex-wrap p-0', large ? 'gap-3' : 'gap-2')}>
      {picks.map((pick) => (
        <li key={pick.id} className={cx('relative aspect-[421/614] shrink-0', large ? 'w-10 min-[1101px]:w-12' : 'w-7')}>
          <span className="block h-full w-full overflow-hidden bg-input">
            <CardArt remoteUrl={cardSmallImageUrl(pick.id)} name={pick.name} className="block h-full w-full object-cover" />
          </span>
          {pick.copies > 1 ? <CopiesBadge copies={pick.copies} placement="overlay" /> : null}
        </li>
      ))}
    </ul>
  )
}

/** Un ajuste de la ficha en su fila: el nombre (y una línea, si aclara; y debajo, lo que muestre) a la izquierda y el control a la derecha; si no entra, el control baja. */
function SettingRow({ label, hint, below, children }: { label: string; hint?: string; below?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
      <div className="grid min-w-0 flex-1 basis-40 gap-0.5">
        <span className="text-body font-semibold text-foreground">{label}</span>
        {hint ? <span className="text-micro text-soft">{hint}</span> : null}
        {below ? <div className="pt-2">{below}</div> : null}
      </div>
      {children}
    </div>
  )
}

/**
 * Solo: contra quién jugás, como la lista de rivales de Master Duel. Arriba, «Probá tu combo»: el de handtraps (elegido la primera vez, sin nada guardado; con sus cartas como arte y, en el
 * celular y elegido, debajo, sus cartas y «Elegir…») y el pasivo; abajo, un bot por mazo listo (`BOT_DECK_MENU`, en su orden fijo; el último que jugaste queda elegido y lleva «Último»).
 * Tocar una fila la elige y se guarda (`HandtrapConfig`, sin claves nuevas). La ficha de lo elegido (lo que es, quién empieza, la mano del bot y,
 * sin bot, el modo y las handtraps) es el panel de la derecha en escritorio y una hoja en el celular, y la acción principal, «Jugar contra X», va abajo a la derecha: en el celular, en una barra
 * pegada sobre la de navegación, con lo elegido a la izquierda. Los bots juegan siempre en automático; sin bot, el modo es el de Online (una sola preferencia). Sin núcleo en el navegador
 * (`canRunAuto`) los bots se ven apagados con el porqué y lo demás va en manual. Cada ajuste va en su fila, con su nombre: nunca dos segmentados seguidos.
 */
export function SoloScreen({ deckName, deckSize, minDeck, onOpenBuilder, onPlay, decks = BOT_DECK_MENU }: SoloScreenProps) {
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const prefs = useAutoPrefs()
  const engine = canRunAuto()
  const online = useOnline()
  // Sin red el núcleo no se puede bajar: como sin núcleo, los bots se apagan y lo demás va en manual (con señal, vuelve lo elegido).
  const canAuto = engine && online
  // La primera vez (nada guardado) queda elegido Handtraps; se guarda al tocar algo o al jugar. `DEFAULT_HANDTRAP_CONFIG` (la mesa de `#practice`) sigue apagado.
  const [config, setConfig] = useState<HandtrapConfig>(() => (hasHandtrapConfig() ? readHandtrapConfig() : { ...readHandtrapConfig(), enabled: true }))
  // El último que jugaste: el bot guardado al entrar (lo que se toca después no le mueve el chip).
  const [last] = useState(() => config.botDeck)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [choosing, setChoosing] = useState(false)
  const [deckOpen, setDeckOpen] = useState(false)
  const [editing, setEditing] = useState(false)

  const save = (next: HandtrapConfig) => {
    setConfig(next)
    writeHandtrapConfig(next)
  }
  // Sin núcleo, un bot guardado no se puede jugar: vale el rival sin bot de siempre.
  const kind: RivalKind = canAuto ? rivalKindOf(config, decks) : config.enabled ? 'handtraps' : 'passive'
  const pick: Pick = { kind, deck: kind === 'bot' ? (decks.find((deck) => deck.id === config.botDeck) ?? null) : null }
  const choose = (next: RivalKind, deck?: string) => save(withRival(config, next, deck))
  // Sin bot, el modo de siempre; los bots, siempre automáticos.
  const auto = canAuto && (kind === 'bot' || prefs.duel)
  const deckReady = deckSize >= minDeck
  const count = poolCount(config.picks)
  const summary = t('handtraps.row.summary', { hand: Math.min(config.hand, count), count })
  // Un bot con cartas cambiadas lo dice en su nombre («Sky Striker · modificado»).
  const botName = (deck: BotDeckInfo) => (isBotModified(config, botDeckList(deck.id)) ? t('solo.deck.modified', { name: deck.name }) : deck.name)
  const name = pick.deck ? botName(pick.deck) : t(`auto.rival.kind.${kind}`)
  const playLabel = !deckReady
    ? t('solo.needDeck')
    : pick.deck
      ? t('solo.play', { name: pick.deck.name })
      : kind === 'handtraps'
        ? t('solo.playHandtraps')
        : auto
          ? t('auto.rival.playPassive')
          : t('solo.playTable')

  const play = () => {
    if (!deckReady) {
      onOpenBuilder()
      return
    }

    // La mesa lee lo guardado: la primera vez, lo elegido todavía no lo estaba.
    writeHandtrapConfig(config)
    setSheetOpen(false)
    setDeckOpen(false)
    setEditing(false)
    onPlay(auto ? 'auto' : 'manual')
  }

  const lead = (large = false) => (pick.deck ? <DeckArt deck={pick.deck} large={large} /> : kind === 'handtraps' ? <HandtrapFan picks={config.picks} large={large} /> : <PassiveIcon large={large} />)
  const chooseButton = (size: 'sm' | 'md') => (
    <Button variant="secondary" size={size} aria-label={t('handtraps.row.chooseLabel')} aria-haspopup="dialog" className="shrink-0" onClick={() => setChoosing(true)}>
      {t('handtraps.row.choose')}
    </Button>
  )
  // «El rival juega su turno», sólo con el de handtraps en automático: lo dicen un chip de la ficha y la barra del celular.
  const ownTurn = kind === 'handtraps' && auto && config.ownTurn === true

  const deckRow = (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid min-w-0 flex-1">
        <span className="text-micro text-muted">{t('duel.room.deckTitle')}</span>
        <span className="truncate text-body font-semibold text-foreground">{deckReady ? `${deckName} · ${deckSize}` : t('duel.play.deckNone')}</span>
      </span>
      <button type="button" aria-label={t('duel.room.deckChange')} className={cx('inline-flex min-h-11 shrink-0 items-center rounded-control px-1 text-body', textLink)} onClick={onOpenBuilder}>
        {t('duel.play.deckChange')}
      </button>
    </div>
  )

  // A todo el ancho (la hoja del celular) va en `md`: con `lg`, «Jugar contra …» con un nombre de mazo largo se parte en dos renglones a 390 px.
  const playButton = (fullWidth: boolean) => (
    <ShineFrame className={fullWidth ? 'w-full' : 'ml-auto'} active={deckReady}>
      <Button variant="primary" color="success" size={fullWidth ? 'md' : 'lg'} icon={deckReady ? 'play' : 'cards'} fullWidth={fullWidth} onClick={play}>
        {playLabel}
      </Button>
    </ShineFrame>
  )

  // Lo que dice la ficha: lo que es, los chips y los ajustes de lo elegido (cada uno en su fila).
  const list = pick.deck ? botDeckList(pick.deck.id) : null
  // «Ver mazo» muestra el Main con sus cartas cambiadas.
  const shown = list && pick.deck ? { ...list, name: botName(pick.deck), main: botDeckMain(list, config.botFlex?.[list.id]) } : null
  const chips = [auto ? t('auto.mode.auto') : t('auto.mode.manual'), ...(auto ? [t('solo.lp', { lp: STARTING_LP })] : []), ...(list ? [t('solo.deckSize', { main: copies(list.main), extra: copies(list.extra) })] : []), ...(ownTurn ? [t('solo.ownTurnOn')] : [])]
  // «Ver mazo», sólo los bots (Pasivo y Handtraps no tienen lista): en escritorio, arriba a la derecha de la ficha; en el celular, a todo el ancho debajo de lo que es.
  const viewDeck = list ? (
    <Button variant="secondary" size={desktop ? 'sm' : 'md'} icon="cards" fullWidth={!desktop} aria-haspopup="dialog" className={desktop ? 'ml-auto shrink-0' : undefined} onClick={() => setDeckOpen(true)}>
      {t('solo.deck.view')}
    </Button>
  ) : null
  const first = (
    <SettingRow label={t('auto.first.label')}>
      <Segmented<AutoPrefs['first']>
        label={t('auto.first.label')}
        size="sm"
        value={prefs.first}
        onChange={(value) => setAutoPref('first', value)}
        options={[
          { value: 'me', label: t('auto.first.me') },
          { value: 'rival', label: t('auto.first.rival') },
          { value: 'random', label: t('auto.first.random') },
        ]}
      />
    </SettingRow>
  )
  const ficha = (
    <div className="grid min-w-0 gap-4">
      <div className="flex min-w-0 items-start gap-4">
        {lead(true)}
        <span className="grid min-w-0 gap-1">
          <span className={overline}>{pick.deck ? t('auto.rival.kind.bot') : t('solo.group.combo')}</span>
          {desktop ? <h2 className="m-0 text-title font-bold leading-tight text-foreground">{name}</h2> : null}
          <span className="text-body text-muted">{pick.deck ? t(pick.deck.line) : kind === 'handtraps' ? t('solo.handtrapsLine') : auto ? t('auto.rival.passive') : t('solo.passiveManual')}</span>
          <span className="flex flex-wrap gap-1.5 pt-1">
            {chips.map((chip) => (
              <Badge key={chip}>{chip}</Badge>
            ))}
          </span>
        </span>
        {desktop ? viewDeck : null}
      </div>
      {desktop ? null : viewDeck}
      <div className="grid divide-y divide-border-subtle border-t border-border-subtle">
        {/* Con el de handtraps, primero lo suyo: sus cartas y si juega su turno. */}
        {kind === 'handtraps' ? (
          <SettingRow label={t('solo.rivalCards')} hint={summary} below={<RivalCards picks={config.picks} large />}>
            {chooseButton(desktop ? 'sm' : 'md')}
          </SettingRow>
        ) : null}
        {kind === 'handtraps' && auto ? (
          <SettingRow label={t('handtraps.picker.ownTurn')} hint={t('handtraps.picker.ownTurnHint')}>
            <Switch checked={config.ownTurn === true} onChange={(on) => save({ ...config, ownTurn: on })} label={t('handtraps.picker.ownTurn')} />
          </SettingRow>
        ) : null}
        {pick.deck ? null : (
          <SettingRow label={t('auto.mode.auto')} hint={canAuto ? t(prefs.duel ? 'auto.mode.soloHint' : 'auto.mode.soloManualHint') : t(engine ? 'duel.offline.autoHint' : 'auto.entry.unsupported')}>
            <Switch checked={auto} disabled={!canAuto} onChange={(on) => setAutoPref('duel', on)} label={t('auto.mode.auto')} />
          </SettingRow>
        )}
        {/* Quién empieza sólo con el núcleo: la mesa manual no tiene turnos del rival. */}
        {auto ? first : null}
        {pick.deck ? (
          <SettingRow label={t('auto.rival.botHand')} hint={t('auto.rival.botHandHint')}>
            <Switch checked={prefs.botHand} onChange={(on) => setAutoPref('botHand', on)} label={t('auto.rival.botHand')} />
          </SettingRow>
        ) : null}
      </div>
      {pick.deck ? (
        <p className="m-0 flex items-start gap-2 text-micro text-soft">
          <Icon name="info" size={14} className="mt-px shrink-0" />
          {t('auto.rival.botLimits')}
        </p>
      ) : null}
    </div>
  )

  return (
    <StepPage>
      <StepHero title={t('shell.solo.title')} icon="user" subtitle={t('solo.subtitle')} />
      {canAuto ? null : (
        <Callout tone="warning" icon={engine ? 'link-off' : 'info'}>
          {t(engine ? 'duel.offline.solo' : 'solo.noAuto')}
        </Callout>
      )}
      {deckReady ? null : (
        <Callout tone="warning" icon="alert">
          {t('duel.lobby.needDeck', { count: deckSize, min: minDeck })}
        </Callout>
      )}

      {/* `items-start`: la lista y la ficha miden lo suyo (la ficha cambia de alto con lo elegido y no tiene por qué estirarse hasta el final de la lista). */}
      <div className="grid min-w-0 items-start gap-5 min-[1101px]:grid-cols-[26.875rem_minmax(0,1fr)]">
        <div className="grid min-w-0 content-start gap-4">
          {desktop ? null : deckRow}
          {/* Una sola elección para las dos listas: «Probá tu combo» (handtraps y pasivo) y los bots. */}
          <div role="radiogroup" aria-label={t('solo.rival')} className="grid min-w-0 gap-4">
            <section className="grid min-w-0 gap-2">
              <h2 className={cx(overline, 'm-0 px-1')}>{t('solo.group.combo')}</h2>
              <ListGroup>
                <ListRow
                  choice
                  title={t('auto.rival.kind.handtraps')}
                  subtitle={t('solo.handtraps')}
                  media={<HandtrapFan picks={config.picks} />}
                  selected={kind === 'handtraps'}
                  // En el celular, elegido, sus cartas y «Elegir…» sin abrir la ficha (en escritorio la ficha está al lado y ya los muestra).
                  below={!desktop && kind === 'handtraps' ? (
                    <div className="flex items-center gap-3">
                      <div className="grid min-w-0 flex-1 gap-1.5">
                        <RivalCards picks={config.picks} />
                        <span className="text-micro text-muted">{summary}</span>
                      </div>
                      {chooseButton('md')}
                    </div>
                  ) : undefined}
                  onClick={() => choose('handtraps')}
                />
                <ListRow choice title={t('auto.rival.kind.passive')} subtitle={canAuto && prefs.duel ? t('solo.passive') : t('solo.passiveManual')} icon="target" selected={kind === 'passive'} onClick={() => choose('passive')} />
              </ListGroup>
            </section>
            {/* ponytail: con 7 o más bots, «Buscar un mazo» arriba y, en el celular, los primeros 6 con «Ver los N» (propuesta); con 3 no hace falta. */}
            {decks.length === 0 ? null : <section className="grid min-w-0 gap-2">
              <h2 className={cx(overline, 'm-0 px-1')}>{t('solo.group.bots')}</h2>
              <ListGroup>
                {decks.map((deck) => (
                  <ListRow
                    key={deck.id}
                    choice
                    title={botName(deck)}
                    subtitle={canAuto ? t(deck.line) : t(engine ? 'duel.offline.bot' : 'solo.botNeedsAuto')}
                    media={<DeckArt deck={deck} />}
                    selected={pick.deck?.id === deck.id}
                    disabled={!canAuto}
                    end={deck.id === last && canAuto ? <Badge>{t('solo.last')}</Badge> : undefined}
                    onClick={() => choose('bot', deck.id)}
                  />
                ))}
              </ListGroup>
            </section>}
          </div>
        </div>

        {desktop ? (
          <Card as="section" aria-label={name} className="grid min-w-0 gap-4">
            {ficha}
            <div className="flex flex-wrap items-center gap-4 border-t border-border-subtle pt-4">
              <div className="min-w-0 flex-1 basis-52">{deckRow}</div>
              {playButton(false)}
            </div>
          </Card>
        ) : null}
      </div>

      {desktop ? null : (
        <>
          {/* El alto de la barra fija: lo último de la lista no queda debajo de ella. */}
          <div aria-hidden="true" className="h-16" />
          {/* La barra del pulgar, fija encima de la de navegación (siempre a la vista, también con la lista corta; la página deja su alto abajo): contra quién (abre la ficha) a la izquierda y «Jugar» a la derecha. Va al `body`: la pantalla entra con un `transform` (el barrido) y un `fixed` adentro se correría. */}
          {createPortal(<div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] z-30 flex items-center gap-3 border-t border-border-subtle bg-background px-gutter py-3">
            <button type="button" aria-haspopup="dialog" className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-control text-left focus-visible:outline-none focus-visible:shadow-focus" onClick={() => setSheetOpen(true)}>
              {lead()}
              <span className="grid min-w-0">
                <span className="truncate text-body font-semibold text-foreground">{pick.deck ? name : `${name} · ${ownTurn ? t('solo.ownTurnOn') : auto ? t('auto.mode.auto') : t('auto.mode.manual')}`}</span>
                <span className={cx('inline-flex items-center gap-0.5 text-micro', textLink)}>
                  {t('solo.sheet')}
                  <Icon name="chevron-right" size={14} />
                </span>
              </span>
            </button>
            <ShineFrame active={deckReady}>
              <Button variant="primary" color="success" icon={deckReady ? 'play' : 'cards'} aria-label={playLabel} onClick={play}>
                {deckReady ? t('solo.playShort') : t('solo.needDeck')}
              </Button>
            </ShineFrame>
          </div>, document.body)}
          <Modal isOpen={sheetOpen} onClose={() => setSheetOpen(false)} size="keypad" title={name} footer={playButton(true)}>
            {ficha}
          </Modal>
        </>
      )}

      <BotDeckSheet
        isOpen={deckOpen && shown !== null}
        deck={shown}
        onClose={() => setDeckOpen(false)}
        footer={
          <div className="grid w-full gap-2">
            <Button variant="secondary" icon="pencil" fullWidth aria-haspopup="dialog" onClick={() => setEditing(true)}>
              {t('solo.deck.edit')}
            </Button>
            {playButton(true)}
          </div>
        }
      />
      {list ? (
        <BotDeckEditor
          isOpen={editing && deckOpen}
          list={list}
          flex={config.botFlex?.[list.id]}
          onClose={() => setEditing(false)}
          onSave={(flex) => {
            save(withBotFlex(config, list, flex))
            setEditing(false)
          }}
        />
      ) : null}
      <HandtrapPicker
        isOpen={choosing}
        config={config}
        onClose={() => setChoosing(false)}
        onSave={(picks, hand, extra, ownTurn) => {
          save({ ...config, picks, hand, extra, ownTurn })
          setChoosing(false)
        }}
      />
    </StepPage>
  )
}
