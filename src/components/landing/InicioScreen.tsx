import { useEffect, useId, useMemo, useState } from 'react'

import { deriveMainDeckCardsFromZone } from '../../app/calculator-state'
import { cardSmallImageUrl } from '../../app/card-prices'
import { LANDING_COPIES, handSizeFor, openingOdds, type LandingCopies, type LandingStats, type LandingTurn } from '../../app/landing'
import { NOVEDADES_LISTS, sortEntries, type NovedadesEntry } from '../../app/novedades'
import { isClassificationStepComplete } from '../../app/role-step'
import { useAppSelector } from '../../app/store-hooks'
import { useInstallPrompt, type InstallCase } from '../../app/use-install-prompt'
import { formatInteger } from '../../app/utils'
import { formatDay, getLocale, numberLocale, t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { CardArt } from '../CardArt'
import { getRecommendedStep, type DeckWorkflowStepKey } from '../deck-mode/deck-workflow-navigation'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { CloseButton } from '../ui/IconButton'
import { ProgressRing } from '../ui/ProgressRing'
import { formatPer100 } from '../ui/ring-shared'
import { Segmented } from '../ui/Segmented'
import { ShineFrame } from '../ui/ShineFrame'
import { Skeleton } from '../ui/Skeleton'
import { SiteCredit, SOURCE_URL } from '../ui/SocialLinks'
import { supportText, textLink } from '../ui/typography'

/**
 * «Inicio» (`#inicio`): la portada de la app, un paso más con el menú y las barras de siempre. Llega acá la primera carga de cada sesión en `/` (`shouldShowLanding`) y se vuelve
 * desde el menú. De arriba abajo: «Seguir con tu deck» (sólo con un deck con cartas) e «Instalá YGOUltraLab» (sólo en un navegador de celular), la promesa con una sola acción principal y la calculadora al lado, el destacado del duelo
 * por enlace, lo más jugado del meta, las tres últimas Novedades y el pie (reportar, código y privacidad). Lo que hay en la app no se repite: lo dice el menú.
 */

/** Las cifras de «Lo más jugado del meta», si el build las armó (`scripts/write-build-id.mjs`); sin el archivo (en dev), el bloque no sale. */
const STATS = Object.values(import.meta.glob<LandingStats>('../../data/landing-stats.json', { eager: true, import: 'default' }))[0] ?? null

const percent = (value: number) => new Intl.NumberFormat(numberLocale(), { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
const strong = (text: string) => <strong className="font-semibold text-foreground">{text}</strong>
const LINK_ROW = 'inline-flex min-h-11 w-fit items-center rounded-control text-body'
const go = (hash: string) => () => {
  window.location.hash = hash
}

/** `stats` es de las pruebas: el archivo del build no se versiona, y sin él el CI no vería «Lo más jugado del meta». */
export function InicioScreen({ stats = STATS }: { stats?: LandingStats | null } = {}) {
  return (
    <div className="stagger mx-auto grid w-full min-w-0 max-w-content content-start gap-10 px-gutter pb-8 pt-4 min-[1101px]:gap-12 min-[1101px]:px-6 min-[1101px]:pt-6">
      {/* Lo de quien vuelve: retomar el deck y, debajo y más quieta, instalar la app. Sin ninguna de las dos, la caja no ocupa lugar. */}
      <div className="grid gap-4 empty:hidden">
        <ResumeDeck />
        <InstallApp />
      </div>
      <section aria-labelledby="inicio-title" className="grid gap-4 min-[1101px]:grid-cols-[minmax(0,1fr)_26rem] min-[1101px]:gap-6">
        {/* La promesa y una sola acción principal, grande y abajo (Fitts); la calculadora al lado (escritorio) o debajo (celular): el número grande es la prueba. */}
        <Card as="div" level="hero" padding="lg" className="grid content-center gap-6 min-[1101px]:px-10">
          <div className="grid gap-3">
            <h1 id="inicio-title" className="m-0 text-balance text-stat font-bold tracking-[-0.02em] min-[1101px]:text-display">
              {t('landing.title')}
            </h1>
            <p className="m-0 max-w-xl text-body text-muted min-[1101px]:text-lead">{t('landing.subtitle')}</p>
          </div>
          <div className="grid gap-3 min-[1101px]:flex min-[1101px]:items-center min-[1101px]:gap-6">
            <Button variant="primary" size="lg" icon="flask" fullWidth className="min-[1101px]:w-auto" onClick={go('#deck-builder')}>
              {t('landing.cta.measure')}
            </Button>
            <p className="m-0 flex items-center justify-center gap-2 text-body text-muted">
              <Icon name="check" size={18} className="text-success" />
              {t('landing.open.title')}
            </p>
          </div>
        </Card>
        <Calculator />
      </section>

      <PlayBanner />

      {stats && stats.topCards.length > 0 ? <TopCards stats={stats} /> : null}

      <LatestNews />

      <footer className="grid gap-6 min-[1101px]:grid-cols-[minmax(0,1fr)_auto]">
        <div className="grid content-start gap-1 border-t border-border-subtle pt-6">
          <p className={cx(supportText, 'max-w-xl')}>{t('landing.open.text')}</p>
          <a href={SOURCE_URL} target="_blank" rel="noreferrer" className={cx(LINK_ROW, textLink)}>
            {t('landing.open.code')}
          </a>
        </div>
        <div className="grid content-start gap-1 border-t border-border-subtle pt-6">
          <a href="#reportar" className={cx(LINK_ROW, textLink)}>
            {t('reportar.link')}
          </a>
          <a href={t('shell.legal.page')} target="_blank" rel="noreferrer" className={cx(LINK_ROW, textLink)}>
            {t('shell.legal.label')}
          </a>
          <SiteCredit withDisclaimer />
        </div>
      </footer>
    </div>
  )
}

/** El deck guardado, del store (ya cargado: «Inicio» es un paso de la app). Sin cartas en el Main, no sale. */
function ResumeDeck() {
  const deck = useAppSelector((state) => state.deckBuilder)
  const classified = useMemo(() => isClassificationStepComplete(deriveMainDeckCardsFromZone(deck.main)), [deck.main])

  if (deck.main.length === 0) return null

  return <ResumeDeckCard name={deck.deckName} main={deck.main.length} extra={deck.extra.length} side={deck.side.length} step={getRecommendedStep(deck.main.length, classified)} />
}

interface ResumeDeckCardProps {
  name: string
  main: number
  extra: number
  side: number
  /** Adónde lleva el botón: el paso recomendado (`getRecommendedStep`). */
  step: DeckWorkflowStepKey
}

/**
 * «Seguir con tu deck»: lo primero de «Inicio» para quien vuelve con un deck. El nombre arriba y, abajo, el número que decide (Main + Extra + Side y cuánto falta) a la
 * izquierda con el botón a la derecha (G.4). La tarjeta teñida de lo tuyo es lo único que se distingue en esa franja.
 */
export function ResumeDeckCard({ name, main, extra, side, step }: ResumeDeckCardProps) {
  const missing = Math.max(0, 40 - main)
  const titleId = useId()

  return (
    <Card as="section" tone="brand" aria-labelledby={titleId} className="grid gap-3">
      <Heading level="section" as="p" id={titleId} className="truncate">
        {name.trim() || t('deck.export.preview.unnamed')}
      </Heading>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p className="m-0 grid">
          <span aria-hidden="true" className="text-lead font-semibold tabular-nums">
            {t('landing.resume.count', { main: formatInteger(main), extra: formatInteger(extra), side: formatInteger(side) })}
          </span>
          <span className="sr-only">{t('landing.resume.countLabel', { main: formatInteger(main), extra: formatInteger(extra), side: formatInteger(side) })}</span>
          {missing > 0 ? <span className="text-micro text-muted">{t('landing.resume.missing', { count: missing, n: formatInteger(missing) })}</span> : null}
        </p>
        <Button variant="primary" icon="cards" onClick={go(`#${step}`)}>
          {t('landing.resume.continue')}
        </Button>
      </div>
    </Card>
  )
}

function InstallApp() {
  const { kind, install, hide } = useInstallPrompt()

  return <InstallAppCard kind={kind} onInstall={install} onHide={hide} />
}

interface InstallAppCardProps {
  kind: InstallCase | 'hidden'
  onInstall: () => void
  onHide: () => void
}

/**
 * «Instalá YGOUltraLab»: sólo en un navegador de celular o tableta (`useInstallPrompt`). Con el aviso de Chrome, «Instalar la app»; sin él, los pasos de Android o de iOS. Va
 * con contorno y un botón secundario: lo que se distingue en «Inicio» es «Seguir con tu deck». La X la esconde 30 días.
 */
export function InstallAppCard({ kind, onInstall, onHide }: InstallAppCardProps) {
  const titleId = useId()

  if (kind !== 'prompt' && kind !== 'android' && kind !== 'ios') return null

  return (
    <Card as="section" aria-labelledby={titleId} className="flex items-start gap-3">
      <Icon name="download" size={20} className="mt-0.5 shrink-0 text-muted" />
      <div className="grid min-w-0 flex-1 gap-1">
        <Heading level="card" as="p" id={titleId}>{t('landing.install.title')}</Heading>
        <p className={supportText}>{t('landing.install.text')}</p>
        {kind === 'prompt' ? (
          <Button variant="secondary" icon="download" className="mt-2 w-fit" onClick={onInstall}>
            {t('landing.install.button')}
          </Button>
        ) : (
          <p className="m-0 text-body text-foreground">{t(kind === 'ios' ? 'landing.install.ios' : 'landing.install.android')}</p>
        )}
      </div>
      <CloseButton aria-label={t('landing.install.later')} title={t('landing.install.later')} className="-mr-2 -mt-2" onClick={onHide} />
    </Card>
  )
}

/** La calculadora: el anillo con el número que decide y los dos controles. La hipergeométrica de la app (`openingOdds`), sin cifras inventadas. */
function Calculator() {
  const [copies, setCopies] = useState<LandingCopies>(3)
  const [turn, setTurn] = useState<LandingTurn>('first')
  const odds = openingOdds(copies, turn)
  const per100 = formatPer100(odds)

  return (
    <Card as="div" padding="lg" role="group" aria-label={t('landing.calc.label')} className="grid content-center gap-5">
      <div className="flex items-center gap-5">
        {/* Quieto al cambiar: la pista y el arco no se animan (el arco repinta al moverse); el número cambia de una. */}
        <div className="[&_circle]:transition-none">
          <ProgressRing value={odds} size={132} label={t('landing.calc.ringLabel', { percent: percent(odds) })} valueText={t('landing.calc.ringValue', { n: per100 })}>
            <span className="grid justify-items-center">
              {per100}
              <span className="text-micro font-normal tracking-normal text-muted">{t('landing.calc.per100')}</span>
            </span>
          </ProgressRing>
        </div>
        <div className="grid min-w-0 flex-1 gap-3">
          <div className="grid gap-1.5">
            <span aria-hidden="true" className="text-micro font-semibold text-soft">{t('landing.calc.copies')}</span>
            <Segmented
              fullWidth
              label={t('landing.calc.copies')}
              value={String(copies)}
              onChange={(value) => setCopies(Number(value) as LandingCopies)}
              options={LANDING_COPIES.map((count) => ({ value: String(count), label: String(count), ariaLabel: t('landing.calc.copiesOption', { count }) }))}
            />
          </div>
          <div className="grid gap-1.5">
            <span aria-hidden="true" className="text-micro font-semibold text-soft">{t('landing.calc.turn')}</span>
            <Segmented<LandingTurn>
              fullWidth
              label={t('landing.calc.turn')}
              value={turn}
              onChange={setTurn}
              options={[
                { value: 'first', label: t('landing.calc.first'), ariaLabel: t('landing.calc.firstLong') },
                { value: 'second', label: t('landing.calc.second'), ariaLabel: t('landing.calc.secondLong') },
              ]}
            />
          </div>
        </div>
      </div>
      <p aria-live="polite" className="m-0 border-t border-border-subtle pt-4 text-body text-muted">
        <span className="sr-only">{t('landing.calc.ringValue', { n: per100 })}. </span>
        {tRich(turn === 'first' ? 'landing.calc.sayFirst' : 'landing.calc.saySecond', { b: strong }, { hand: handSizeFor(turn) })}
      </p>
    </Card>
  )
}

/** El destacado: el duelo por enlace con las vidas de arranque (la mesa, propia de la app) y «Jugar ahora» con su brillo, lo único que se mueve en «Inicio». */
function PlayBanner() {
  return (
    <Card as="section" padding="lg" aria-labelledby="inicio-play" className="grid gap-5 min-[1101px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[1101px]:items-center min-[1101px]:gap-12 min-[1101px]:px-8">
      <div className="grid gap-1">
        <Heading level="page" as="h2" id="inicio-play">{t('landing.play.title')}</Heading>
        <p className={cx(supportText, 'max-w-xl')}>{t('landing.play.text')}</p>
      </div>
      {/* Las vidas de arranque, como en la mesa: lo tuyo en violeta, el rival en lima. Es la regla del juego, no una cifra de uso. */}
      <div aria-hidden="true" className="flex items-end justify-between gap-6 border-y border-border-subtle py-3 tabular-nums min-[1101px]:border-y-0 min-[1101px]:py-0">
        <span className="grid">
          <span className="text-micro font-semibold text-primary-soft">{t('landing.play.you')}</span>
          <span className="text-stat font-bold leading-none">8000</span>
        </span>
        <span className="pb-1 text-micro text-soft">vs</span>
        <span className="grid justify-items-end">
          <span className="text-micro font-semibold text-info-soft">{t('landing.play.rival')}</span>
          <span className="text-stat font-bold leading-none">8000</span>
        </span>
      </div>
      <ShineFrame className="w-full min-[1101px]:w-auto">
        <Button variant="primary" color="success" size="lg" icon="target" fullWidth onClick={go('#duel')}>
          {t('landing.cta.play')}
        </Button>
      </ShineFrame>
    </Card>
  )
}

/** Lo más jugado del meta: las seis cartas que más decks TCG llevan en el Main (`landing-stats.json`). El arte baja en vivo por el proxy, como en el resto de la app. */
function TopCards({ stats }: { stats: LandingStats }) {
  const day = (date: string) => formatDay(`${date.length > 7 ? date : `${date}-01`}T00:00:00Z`, 'UTC')

  return (
    <section aria-labelledby="inicio-top" className="grid gap-4">
      <div className="grid gap-1 min-[1101px]:flex min-[1101px]:items-end min-[1101px]:justify-between min-[1101px]:gap-6">
        <div className="grid gap-1">
          <Heading level="page" as="h2" id="inicio-top">{t('landing.top.title')}</Heading>
          <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-micro tabular-nums text-soft">
            <span>{tRich('landing.top.decksIn', { b: strong }, { count: stats.tcgDecks, n: formatInteger(stats.tcgDecks), weeks: stats.weeks })}</span>
            {stats.banlist ? <span>{tRich('landing.top.banlist', { b: strong }, { date: day(stats.banlist) })}</span> : null}
            {stats.prices ? <span>{tRich('landing.top.prices', { b: strong }, { date: day(stats.prices) })}</span> : null}
          </p>
        </div>
        <a href="#meta" className={cx(LINK_ROW, textLink)}>
          {t('landing.top.all')}
        </a>
      </div>
      <ol className="m-0 grid list-none grid-cols-3 gap-x-3 gap-y-5 p-0 min-[1101px]:grid-cols-6 min-[1101px]:gap-x-5">
        {stats.topCards.map((card) => (
          <li key={card.id} className="grid min-w-0 content-start gap-2">
            <div className="aspect-[59/86] w-full">
              <CardArt remoteUrl={cardSmallImageUrl(card.id)} name={card.name} tilt className="h-full w-full object-cover" />
            </div>
            <span className="grid min-w-0">
              <span className="truncate text-body font-semibold" title={card.name}>{card.name}</span>
              <span className="text-micro tabular-nums text-soft">{t('landing.top.decks', { count: card.decks, n: formatInteger(card.decks) })}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

type NewsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; entries: NovedadesEntry[] }

/** Las tres entradas más nuevas de Novedades (el JSON baja aparte, después del primer pintado): en escritorio, lado a lado. */
function LatestNews() {
  const [news, setNews] = useState<NewsState>({ status: 'loading' })
  const locale = getLocale()

  useEffect(() => {
    let alive = true

    import('../../data/novedades.json').then(
      (module) => alive && setNews({ status: 'ready', entries: sortEntries(module.default.entries as NovedadesEntry[]).slice(0, 3) }),
      () => alive && setNews({ status: 'error' }),
    )

    return () => {
      alive = false
    }
  }, [])

  return (
    <section aria-labelledby="inicio-news" aria-busy={news.status === 'loading' || undefined} className="grid gap-4">
      <div className="flex items-end justify-between gap-6">
        <Heading level="page" as="h2" id="inicio-news">{t('landing.news.title')}</Heading>
        <a href="#novedades" className={cx(LINK_ROW, textLink)}>
          {t('landing.news.all')}
        </a>
      </div>
      {news.status === 'loading' ? (
        <div role="status" aria-label={t('landing.news.loading')} className="grid gap-3 min-[1101px]:grid-cols-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : news.status === 'ready' ? (
        <ul className="m-0 grid list-none border-t border-border-subtle p-0 min-[1101px]:grid-cols-3 min-[1101px]:gap-8">
          {news.entries.map((entry) => {
            const copy = entry[locale]
            const line = NOVEDADES_LISTS.map((list) => copy[list][0]).find(Boolean)

            return (
              <li key={entry.id} className="grid content-start gap-1 border-b border-border-subtle py-4 min-[1101px]:border-b-0 min-[1101px]:pt-5">
                <div className="flex min-w-0 items-center gap-2">
                  <time dateTime={entry.date} className="text-micro tabular-nums text-muted">
                    {formatDay(`${entry.date}T00:00:00Z`, 'UTC')}
                  </time>
                  {entry.tags.map((key) => (
                    <Badge key={key} size="sm">
                      {t(`novedades.tag.${key}`)}
                    </Badge>
                  ))}
                </div>
                <Heading level="card" as="h3">{copy.title}</Heading>
                {line ? <p className={cx(supportText, 'line-clamp-3')}>{line}</p> : null}
              </li>
            )
          })}
        </ul>
      ) : (
        // Sin red al pedir el archivo: se dice, y queda el enlace de arriba a la pantalla entera.
        <p className={supportText}>{t('landing.news.error')}</p>
      )}
    </section>
  )
}
