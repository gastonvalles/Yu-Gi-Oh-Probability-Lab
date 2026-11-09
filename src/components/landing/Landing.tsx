import { useEffect, useState } from 'react'

import { LANDING_COPIES, enterApp, handSizeFor, openingOdds, type LandingCopies, type LandingStats, type LandingTurn } from '../../app/landing'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { NOVEDADES_LISTS, sortEntries, type NovedadesEntry } from '../../app/novedades'
import { formatInteger } from '../../app/utils'
import { formatDay, getLocale, numberLocale, t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { AppBrand } from '../shell/AppBrand'
import { MobileTabBar } from '../shell/MobileTabBar'
import { PLAY_GROUP_KEY, type NavGroup } from '../shell/nav-model'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Icon, type IconName } from '../ui/Icon'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { ProgressRing } from '../ui/ProgressRing'
import { formatPer100 } from '../ui/ring-shared'
import { Segmented } from '../ui/Segmented'
import { ShineFrame } from '../ui/ShineFrame'
import { Skeleton } from '../ui/Skeleton'
import { SiteCredit, SOURCE_URL } from '../ui/SocialLinks'
import { supportText, textLink } from '../ui/typography'

/**
 * La portada de quien llega por primera vez a `/` (la decide `shouldShowLanding`) y la de «Inicio» (`#inicio`, encima de la app montada). Propuesta A de TI-113: una página
 * aparte con la estructura de una portada: la barra con los lugares, la promesa con una sola acción principal, la calculadora como un bloque, el destacado «Jugar ahora», lo que hay
 * adentro, lo más jugado del meta, Novedades y el pie. Va en su propio archivo y no importa nada de las pantallas: la app (`MainApp`) baja recién al entrar o cuando el navegador
 * está libre (`onPrefetch`). `LandingContent` es lo mismo sin barra ni pie: lo que la propuesta B pone adentro de la app (`InicioPrototype`).
 */

/** Las cifras de «El meta», si el build las armó (`scripts/write-build-id.mjs`); sin build, las frases van sin cifra. */
const STATS = Object.values(import.meta.glob<LandingStats>('../../data/landing-stats.json', { eager: true, import: 'default' }))[0] ?? null

/** Los lugares de la app: la barra de arriba (escritorio) y la de abajo (celular), en el orden de la card. Jugar es el círculo del centro. */
const PLACES = [
  { key: 'lab', label: 'landing.nav.lab', hash: '#probability-lab', icon: 'flask' },
  { key: 'build', label: 'landing.nav.build', hash: '#deck-builder', icon: 'cards' },
  { key: PLAY_GROUP_KEY, label: 'landing.nav.play', hash: '#duel', icon: 'target' },
  { key: 'meta', label: 'landing.nav.meta', hash: '#meta', icon: 'compass' },
  { key: 'news', label: 'landing.nav.news', hash: '#novedades', icon: 'book' },
] as const satisfies ReadonlyArray<{ key: string; label: string; hash: string; icon: IconName }>

/** Lo que hay adentro (el duelo ya es el destacado): cada fila entra a su lugar. */
const INSIDE: Array<{ key: 'lab' | 'mesa' | 'meta'; hash: string; icon: IconName }> = [
  { key: 'lab', hash: '#probability-lab', icon: 'flask' },
  { key: 'mesa', hash: '#solo', icon: 'hand' },
  { key: 'meta', hash: '#meta', icon: 'compass' },
]

const percent = (value: number) => new Intl.NumberFormat(numberLocale(), { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
const strong = (text: string) => <strong className="font-semibold text-foreground">{text}</strong>
const LINK_ROW = 'inline-flex min-h-11 w-fit items-center rounded-control text-body'

interface LandingProps {
  /** La app se está cargando después de un toque: la landing sigue a la vista hasta que llega. */
  entering?: boolean
  /** Precarga el archivo de la app. */
  onPrefetch?: () => unknown
}

export default function Landing({ entering = false, onPrefetch }: LandingProps) {
  // La app se precarga cuando el navegador está libre, salvo que se pidió ahorrar datos.
  useEffect(() => {
    const saveData = (window.navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true

    if (!onPrefetch || saveData || typeof window.requestIdleCallback !== 'function') return undefined

    const id = window.requestIdleCallback(() => void onPrefetch(), { timeout: 5000 })

    return () => window.cancelIdleCallback(id)
  }, [onPrefetch])

  const prefetch = { onPointerEnter: onPrefetch, onFocus: onPrefetch }
  const groups: NavGroup[] = PLACES.map((place) => ({ key: place.key, label: t(place.label), icon: place.icon, items: [] }))

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-content items-center justify-between gap-6 px-gutter py-3 min-[1101px]:px-12 min-[1101px]:py-5">
        <AppBrand />
        {/* Los lugares, en escritorio (botones, como el menú de la app: las rutas viajan en el hash y entran sin recargar). En el celular, la barra de abajo. */}
        <nav aria-label={t('landing.nav.label')} className="mr-auto hidden items-center gap-1 min-[1101px]:flex">
          {groups.map((group, index) => (
            <Button key={group.key} variant="tertiary" {...prefetch} onClick={() => enterApp(PLACES[index]!.hash)}>
              {group.label}
            </Button>
          ))}
        </nav>
        <LanguageSwitcher />
      </header>

      <main aria-busy={entering || undefined} className="mx-auto max-w-content px-gutter min-[1101px]:px-12">
        <LandingContent onPrefetch={onPrefetch} />
      </main>

      <footer className="mx-auto grid max-w-content gap-6 px-gutter pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-12 min-[1101px]:grid-cols-[minmax(0,1fr)_auto] min-[1101px]:px-12 min-[1101px]:pb-12">
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

      {/* La barra de abajo de la app, con los lugares: lo conocido (Jakob) y al alcance del pulgar (Fitts). */}
      <MobileTabBar groups={groups} activeKey={null} openKey={null} onOpen={(key) => enterApp(PLACES.find((place) => place.key === key)!.hash)} className="min-[1101px]:hidden" />
    </div>
  )
}

/** El contenido de la portada sin la barra ni el pie: la promesa con la calculadora, el destacado, lo que hay adentro (sólo en la página aparte), el meta y Novedades. */
export function LandingContent({ onPrefetch, inApp = false }: { onPrefetch?: () => unknown; inApp?: boolean }) {
  const prefetch = { onPointerEnter: onPrefetch, onFocus: onPrefetch }

  return (
    <div className="grid gap-12 pt-2 min-[1101px]:gap-16 min-[1101px]:pt-6">
      <section aria-labelledby="landing-title" className="grid gap-4 min-[1101px]:grid-cols-[minmax(0,1fr)_25rem] min-[1101px]:gap-6">
        {/* La promesa y una sola acción principal, grande y abajo (Fitts); la calculadora al lado (escritorio) o debajo (celular): el número grande es la prueba. */}
        <Card as="div" level="hero" padding="lg" className="grid content-center gap-6 min-[1101px]:px-12 min-[1101px]:py-12">
          <div className="grid gap-3">
            <h1 id="landing-title" className="m-0 text-balance text-stat font-bold tracking-[-0.02em] min-[1101px]:text-display">
              {t('landing.title')}
            </h1>
            <p className="m-0 max-w-xl text-body text-muted min-[1101px]:text-lead">{t('landing.subtitle')}</p>
          </div>
          <div className="grid gap-3 min-[1101px]:flex min-[1101px]:items-center min-[1101px]:gap-6">
            <Button variant="primary" size="lg" icon="flask" fullWidth className="min-[1101px]:w-auto" {...prefetch} onClick={() => enterApp('#deck-builder')}>
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

      <PlayBanner onPrefetch={onPrefetch} />

      {inApp ? null : (
        <section aria-labelledby="landing-inside" className="grid gap-4">
          <Heading level="page" as="h2" id="landing-inside">{t('landing.inside.title')}</Heading>
          <Card as="ul" padding="sm" className="m-0 grid list-none divide-y divide-border-subtle p-0 min-[1101px]:grid-cols-3 min-[1101px]:divide-x min-[1101px]:divide-y-0">
            {INSIDE.map((place) => (
              <li key={place.key} className="grid min-w-0 content-start gap-2 p-5 min-[1101px]:p-6">
                <div className="flex items-center gap-3">
                  <Icon name={place.icon} size={22} className="text-foreground" />
                  <Heading level="section" as="h3" className="flex-1">{t(`landing.inside.${place.key}.title`)}</Heading>
                  <a href={place.hash} {...prefetch} className={cx('-my-3 inline-flex min-h-11 items-center gap-1 rounded-control text-micro', textLink)}>
                    {t(`landing.inside.${place.key}.verb`)}
                    <Icon name="chevron-right" size={16} />
                  </a>
                </div>
                <p className={supportText}>{t(`landing.inside.${place.key}.text`)}</p>
              </li>
            ))}
          </Card>
        </section>
      )}

      <TopCards />

      <LatestNews />
    </div>
  )
}

/** La calculadora: el anillo con el número que decide y los dos controles. La hipergeométrica de la app (`openingOdds`), sin cifras inventadas. */
function Calculator() {
  const [copies, setCopies] = useState<LandingCopies>(3)
  const [turn, setTurn] = useState<LandingTurn>('first')
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const odds = openingOdds(copies, turn)
  const per100 = formatPer100(odds)

  return (
    <Card as="div" padding="lg" role="group" aria-label={t('landing.calc.label')} className="grid content-center gap-5">
      <div className="flex items-center gap-5 min-[1101px]:flex-col min-[1101px]:items-stretch">
        {/* Quieto al cambiar: la pista y el arco no se animan (el arco repinta al moverse); el número cambia de una. */}
        <div className="[&_circle]:transition-none min-[1101px]:mx-auto">
          <ProgressRing value={odds} size={desktop ? 168 : 132} label={t('landing.calc.ringLabel', { percent: percent(odds) })} valueText={t('landing.calc.ringValue', { n: per100 })}>
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

/** El destacado: el duelo por enlace con las vidas de arranque (la mesa, propia de la app) y «Jugar ahora» con su brillo, el único que se mueve de la portada. */
function PlayBanner({ onPrefetch }: { onPrefetch?: () => unknown }) {
  return (
    <Card as="section" padding="lg" aria-labelledby="landing-play" className="grid gap-5 min-[1101px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[1101px]:items-center min-[1101px]:gap-12 min-[1101px]:px-8">
      <div className="grid gap-1">
        <Heading level="page" as="h2" id="landing-play">{t('landing.inside.duelo.title')}</Heading>
        <p className={cx(supportText, 'max-w-xl')}>{t('landing.inside.duelo.text')}</p>
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
        <Button variant="primary" color="success" size="lg" icon="target" fullWidth onPointerEnter={onPrefetch} onFocus={onPrefetch} onClick={() => enterApp('#duel')}>
          {t('landing.cta.play')}
        </Button>
      </ShineFrame>
    </Card>
  )
}

/**
 * Lo más jugado del meta: las seis cartas que más decks TCG llevan en el Main, del mismo archivo que el resto de las cifras (`landing-stats.json`, que arma el build con
 * `meta-decks.json`). PROTOTIPO: el arte va como recuadro neutro; en la app saldría del proxy (`/api/card-image/*`), nunca guardado en el repo.
 */
function TopCards() {
  const top = STATS?.topCards ?? []

  return (
    <section aria-labelledby="landing-top" className="grid gap-4">
      <div className="grid gap-1 min-[1101px]:flex min-[1101px]:items-end min-[1101px]:justify-between min-[1101px]:gap-6">
        <div className="grid gap-1">
          <Heading level="page" as="h2" id="landing-top">{t('landing.top.title')}</Heading>
          {STATS ? <MetaFacts stats={STATS} /> : null}
        </div>
        <a href="#meta" className={cx(LINK_ROW, textLink)}>
          {t('landing.top.all')}
        </a>
      </div>
      <ol className="m-0 grid list-none grid-cols-3 gap-x-3 gap-y-5 p-0 min-[1101px]:grid-cols-6 min-[1101px]:gap-x-5">
        {(top.length > 0 ? top : Array.from({ length: 6 }, () => null)).map((card, index) => (
          <li key={card?.id ?? index} className="grid min-w-0 content-start gap-2">
            <div className="relative grid aspect-[59/86] place-items-center border border-dashed border-border-strong bg-tint/5 p-2">
              <span className="text-center text-micro text-soft">{t('landing.top.placeholder')}</span>
              <span className="absolute left-0 top-0 bg-background px-2 text-lead font-bold tabular-nums">{index + 1}</span>
            </div>
            {card ? (
              <span className="grid min-w-0">
                <span className="truncate text-body font-semibold">{card.name}</span>
                <span className="text-micro tabular-nums text-soft">{t('landing.top.decks', { count: card.decks, n: formatInteger(card.decks) })}</span>
              </span>
            ) : (
              <Skeleton className="h-9" />
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}

function MetaFacts({ stats }: { stats: LandingStats }) {
  const day = (date: string) => formatDay(`${date.length > 7 ? date : `${date}-01`}T00:00:00Z`, 'UTC')

  return (
    <p className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-micro tabular-nums text-soft">
      <span>{tRich('landing.inside.meta.decks', { b: strong }, { count: stats.tcgDecks, n: formatInteger(stats.tcgDecks), weeks: stats.weeks })}</span>
      {stats.banlist ? <span>{tRich('landing.inside.meta.banlist', { b: strong }, { date: day(stats.banlist) })}</span> : null}
      {stats.prices ? <span>{tRich('landing.inside.meta.prices', { b: strong }, { date: day(stats.prices) })}</span> : null}
    </p>
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
    <section aria-labelledby="landing-news" aria-busy={news.status === 'loading' || undefined} className="grid gap-4">
      <div className="flex items-end justify-between gap-6">
        <Heading level="page" as="h2" id="landing-news">{t('landing.news.title')}</Heading>
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
      ) : null}
    </section>
  )
}
