import { useEffect, useRef, useState } from 'react'

import { LANDING_COPIES, enterApp, handSizeFor, openingOdds, type LandingCopies, type LandingStats, type LandingTurn } from '../../app/landing'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { NOVEDADES_LISTS, sortEntries, type NovedadesEntry } from '../../app/novedades'
import { formatInteger } from '../../app/utils'
import { formatDay, getLocale, numberLocale, t } from '../../i18n'
import { tRich } from '../../i18n/rich'
import { AppBrand } from '../shell/AppBrand'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { LanguageSwitcher } from '../ui/LanguageSwitcher'
import { ProgressRing } from '../ui/ProgressRing'
import { formatPer100 } from '../ui/ring-shared'
import { Segmented } from '../ui/Segmented'
import { Skeleton } from '../ui/Skeleton'
import { SiteCredit, SOURCE_URL } from '../ui/SocialLinks'
import { supportText, textLink } from '../ui/typography'

/**
 * La portada de quien llega por primera vez a `/` (la decide `shouldShowLanding`): la calculadora de la app como primer pantallazo, lo que hay adentro, por qué es
 * gratis y abierta, lo último de Novedades y el pie. Va en su propio archivo y no importa nada de las pantallas: la app (`MainApp`) baja recién al entrar o cuando el
 * navegador está libre (`onPrefetch`). En el celular, cuando la calculadora sale de la pantalla, aparece abajo una barra con las dos entradas.
 */

/** Las cifras de «El meta», si el build las armó (`scripts/write-build-id.mjs`); sin build, las frases van sin cifra. */
const STATS = Object.values(import.meta.glob<LandingStats>('../../data/landing-stats.json', { eager: true, import: 'default' }))[0] ?? null

const INSIDE = ['lab', 'mesa', 'duelo', 'meta'] as const

/** Las capturas (390 px de ancho a 2×): un recorte de alto fijo, así una imagen que tarda o falta no corre nada. */
const SHOT_WIDTH = 780
const SHOT_HEIGHT = 1688

const percent = (value: number) => new Intl.NumberFormat(numberLocale(), { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)
const strong = (text: string) => <strong className="font-semibold text-foreground">{text}</strong>

interface LandingProps {
  /** La app se está cargando después de un toque: la landing sigue a la vista hasta que llega. */
  entering?: boolean
  /** Precarga el archivo de la app. */
  onPrefetch?: () => unknown
}

export default function Landing({ entering = false, onPrefetch }: LandingProps) {
  const [copies, setCopies] = useState<LandingCopies>(3)
  const [turn, setTurn] = useState<LandingTurn>('first')
  const calcRef = useRef<HTMLDivElement>(null)
  const [calcVisible, setCalcVisible] = useState(true)
  const desktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const odds = openingOdds(copies, turn)
  const per100 = formatPer100(odds)

  // La barra de abajo, sólo mientras la calculadora no se ve.
  useEffect(() => {
    const calc = calcRef.current

    if (!calc || typeof IntersectionObserver === 'undefined') return undefined

    const observer = new IntersectionObserver(([entry]) => setCalcVisible(entry?.isIntersecting ?? true))

    observer.observe(calc)

    return () => observer.disconnect()
  }, [])

  // La app se precarga cuando el navegador está libre, salvo que se pidió ahorrar datos.
  useEffect(() => {
    const saveData = (window.navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true

    if (!onPrefetch || saveData || typeof window.requestIdleCallback !== 'function') return undefined

    const id = window.requestIdleCallback(() => void onPrefetch(), { timeout: 5000 })

    return () => window.cancelIdleCallback(id)
  }, [onPrefetch])

  const prefetch = { onPointerEnter: onPrefetch, onFocus: onPrefetch }
  const measure = (className?: string) => (
    <Button variant="primary" className={className} {...prefetch} onClick={() => enterApp('#deck-builder')}>
      {t('landing.cta.measure')}
    </Button>
  )
  const play = (className?: string) => (
    <a href="#duel" className={cx('inline-flex min-h-11 items-center rounded-control text-body', textLink, className)} {...prefetch} onClick={(event) => { event.preventDefault(); enterApp('#duel') }}>
      {t('landing.cta.play')}
    </a>
  )

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="mx-auto flex max-w-content items-center justify-between gap-4 px-gutter py-3 min-[1101px]:px-12 min-[1101px]:py-5">
        <AppBrand />
        <LanguageSwitcher />
      </header>

      <main aria-busy={entering || undefined} className="mx-auto grid max-w-content gap-10 px-gutter min-[1101px]:grid-cols-[35rem_minmax(0,1fr)] min-[1101px]:gap-20 min-[1101px]:px-12">
        {/* La calculadora queda pegada arriba en escritorio mientras se lee la columna de al lado (`self-start`: por eso no estira). */}
        <section aria-labelledby="landing-title" className="grid content-start gap-5 min-[1101px]:sticky min-[1101px]:top-0 min-[1101px]:self-start min-[1101px]:pt-8">
          <div className="grid gap-3">
            <h1 id="landing-title" className="m-0 text-balance text-stat font-bold tracking-[-0.02em] min-[1101px]:text-display">
              {t('landing.title')}
            </h1>
            <p className="m-0 text-body text-muted min-[1101px]:text-lead">{t('landing.subtitle')}</p>
          </div>

          <div ref={calcRef}>
            <Card as="div" padding="lg" role="group" aria-label={t('landing.calc.label')} className="grid gap-4">
              <div className="flex items-center gap-4 min-[1101px]:gap-6">
                {/* Quieto al cambiar: la pista y el arco no se animan (el arco repinta al moverse); el número cambia de una. */}
                <div className="[&_circle]:transition-none">
                  <ProgressRing value={odds} size={desktop ? 184 : 140} label={t('landing.calc.ringLabel', { percent: percent(odds) })} valueText={t('landing.calc.ringValue', { n: per100 })}>
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
              <p aria-live="polite" className="m-0 text-body text-muted">
                <span className="sr-only">{t('landing.calc.ringValue', { n: per100 })}. </span>
                {tRich(turn === 'first' ? 'landing.calc.sayFirst' : 'landing.calc.saySecond', { b: strong }, { hand: handSizeFor(turn) })}
              </p>
              {/* Número + acción (G.4): el que decide arriba y «Medir mi deck» abajo a la derecha, al alcance del pulgar. */}
              <div className="flex items-center justify-between gap-3 border-t border-border-subtle pt-4">
                <p className="m-0 text-body text-muted">{t('landing.calc.next')}</p>
                {measure()}
              </div>
            </Card>
          </div>

          <div className="flex items-center justify-between gap-3 px-1">
            <p className="m-0 text-body text-muted">{t('landing.cta.playAsk')}</p>
            {play()}
          </div>
        </section>

        <div className="grid min-w-0 content-start gap-12 min-[1101px]:pt-8">
          <section aria-labelledby="landing-inside" className="grid gap-1">
            <Heading level="page" as="h2" id="landing-inside">{t('landing.inside.title')}</Heading>
            <ul className="m-0 grid list-none p-0">
              {INSIDE.map((key) => (
                <li key={key} className="grid gap-2 border-b border-border-subtle py-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <Heading level="section" as="h3">{t(`landing.inside.${key}.title`)}</Heading>
                    <span className="text-micro text-soft">{t(`landing.inside.${key}.verb`)}</span>
                  </div>
                  <p className={supportText}>{t(`landing.inside.${key}.text`)}</p>
                  {key === 'meta' && STATS ? <MetaFacts stats={STATS} /> : null}
                  <Shot name={key} />
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="landing-open" className="grid gap-2">
            <Heading level="page" as="h2" id="landing-open">{t('landing.open.title')}</Heading>
            <p className={supportText}>{t('landing.open.text')}</p>
            <a href={SOURCE_URL} target="_blank" rel="noreferrer" className={cx('inline-flex min-h-11 w-fit items-center rounded-control text-body', textLink)}>
              {t('landing.open.code')}
            </a>
          </section>

          <LatestNews />
        </div>
      </main>

      {/* El pie va con la columna de la derecha en escritorio; en el celular deja lugar para la barra de abajo. */}
      <footer className="mx-auto grid max-w-content gap-2 px-gutter pb-[calc(6rem+env(safe-area-inset-bottom,0px))] pt-10 min-[1101px]:grid-cols-[35rem_minmax(0,1fr)] min-[1101px]:gap-x-20 min-[1101px]:px-12 min-[1101px]:pb-10">
        <div className="grid gap-1 border-t border-border-subtle pt-4 min-[1101px]:col-start-2">
          <a href="#reportar" className={cx('inline-flex min-h-11 w-fit items-center rounded-control text-body', textLink)}>
            {t('reportar.link')}
          </a>
          <a href={t('shell.legal.page')} target="_blank" rel="noreferrer" className={cx('inline-flex min-h-11 w-fit items-center rounded-control text-body', textLink)}>
            {t('shell.legal.label')}
          </a>
          <SiteCredit withDisclaimer />
        </div>
      </footer>

      <div
        role="group"
        aria-label={t('landing.cta.bar')}
        inert={calcVisible}
        className={cx(
          'fixed inset-x-0 bottom-0 z-10 flex items-center justify-between gap-3 border-t border-border-subtle bg-background px-gutter pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] pt-2 transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-none min-[1101px]:hidden',
          calcVisible ? 'pointer-events-none translate-y-full opacity-0' : 'translate-y-0 opacity-100',
        )}
      >
        {play()}
        {measure()}
      </div>
    </div>
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

/** Una captura de la app (`public/landing/<name>.webp`), recortada arriba. Si no carga, queda el recuadro vacío del mismo alto. */
function Shot({ name }: { name: (typeof INSIDE)[number] }) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="mt-2 h-56 overflow-hidden rounded-card border border-border-subtle bg-card-background min-[1101px]:h-76">
      {failed ? null : (
        <img
          src={`/landing/${name}.webp`}
          alt={t(`landing.inside.${name}.alt`)}
          width={SHOT_WIDTH}
          height={SHOT_HEIGHT}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="block size-full object-cover object-top"
        />
      )}
    </div>
  )
}

type NewsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; entries: NovedadesEntry[] }

/** Las tres entradas más nuevas de Novedades: el JSON baja aparte, después del primer pintado. */
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
    <section aria-labelledby="landing-news" aria-busy={news.status === 'loading' || undefined} className="grid gap-1">
      <Heading level="page" as="h2" id="landing-news">{t('landing.news.title')}</Heading>
      {news.status === 'loading' ? (
        <div role="status" aria-label={t('landing.news.loading')} className="grid gap-3 pt-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : news.status === 'ready' ? (
        <ul className="m-0 grid list-none p-0">
          {news.entries.map((entry) => {
            const copy = entry[locale]
            const line = NOVEDADES_LISTS.map((list) => copy[list][0]).find(Boolean)

            return (
              <li key={entry.id} className="grid gap-1 border-b border-border-subtle py-4">
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
                {line ? <p className={supportText}>{line}</p> : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      <a href="#novedades" className={cx('inline-flex min-h-11 w-fit items-center rounded-control text-body', textLink)}>
        {t('landing.news.all')}
      </a>
    </section>
  )
}
