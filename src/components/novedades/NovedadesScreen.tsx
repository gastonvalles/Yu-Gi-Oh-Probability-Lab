import { useEffect, useState } from 'react'

import data from '../../data/novedades.json'
import { entryFromHash, entryHash, filterByTag, NOVEDADES_LISTS, NOVEDADES_TAGS, sortEntries, writeLastSeen, type NovedadesEntry, type NovedadesList, type NovedadesTag } from '../../app/novedades'
import { showToastMessage } from '../../app/use-toast-message'
import { formatDay, getLocale, t } from '../../i18n'
import { StepHero } from '../StepHero'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { FilterChips } from '../ui/FilterChips'
import { Heading } from '../ui/Heading'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { StepPage } from '../ui/StepPage'

const ENTRIES = sortEntries(data.entries as NovedadesEntry[])

/** El `id` de la tarjeta de una entrada (adonde lleva el ancla). */
const cardId = (id: string) => `novedad-${id}`

/** Una lista de la entrada («Qué trae», «Cómo se usa»…): su título y sus renglones, que no pasan de ~65 caracteres. */
function EntryList({ list, items, className }: { list: NovedadesList; items: readonly string[]; className?: string }) {
  return (
    <div className={cx('grid content-start gap-2', className)}>
      <Heading level="card">{t(`novedades.list.${list}`)}</Heading>
      <ul className="m-0 grid max-w-prose list-disc gap-1.5 pl-5 text-body text-foreground marker:text-soft">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  )
}

async function copyLink(id: string): Promise<void> {
  const url = `${window.location.origin}${window.location.pathname}${entryHash(id)}`

  try {
    await navigator.clipboard.writeText(url)
    showToastMessage(t('novedades.linkCopied'), 'success')
  } catch {
    showToastMessage(t('novedades.copyFailed', { url }), 'error')
  }
}

/**
 * Novedades (`#novedades`): las notas del parche para quien usa la página, lo más nuevo arriba. Un filtro por etiqueta y una tarjeta por entrada (fecha, etiquetas, título y sus
 * listas). `#novedades?entrada=<id>` baja hasta esa entrada y la enmarca en lima; el ícono de enlace de cada tarjeta copia ese enlace. Abrir la pantalla guarda la más nueva como vista
 * (apaga el punto del menú).
 */
export function NovedadesScreen() {
  const [tag, setTag] = useState<NovedadesTag | 'all'>('all')
  const [anchor, setAnchor] = useState(() => entryFromHash(window.location.hash))
  const locale = getLocale()
  const shown = filterByTag(ENTRIES, tag)

  useEffect(() => {
    if (ENTRIES[0]) writeLastSeen(ENTRIES[0].id)
  }, [])

  // Pegar otro enlace estando acá no cambia de paso: el ancla se lee del hash cada vez que cambia. Si pide una entrada, el
  // filtro vuelve a «Todas»: con una etiqueta puesta la entrada podría no dibujarse y el enlace quedaría sin efecto.
  useEffect(() => {
    const onHash = () => {
      const next = entryFromHash(window.location.hash)
      setAnchor(next)
      if (next) setTag('all')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (anchor) document.getElementById(cardId(anchor))?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }, [anchor])

  return (
    <StepPage as="article">
      <StepHero title={t('novedades.title')} icon="book" subtitle={t('novedades.subtitle')} />

      <div className="grid w-full max-w-3xl gap-4 min-[1101px]:max-w-none">
        <FilterChips
          label={t('novedades.filter.label')}
          all={t('novedades.filter.all')}
          allActive={tag === 'all'}
          onAll={() => setTag('all')}
          chips={NOVEDADES_TAGS.map((key) => ({
            key,
            name: t(`novedades.tag.${key}`),
            count: filterByTag(ENTRIES, key).length,
            active: tag === key,
            // Una sola a la vez: tocar la elegida vuelve a «Todas».
            onToggle: () => setTag((current) => (current === key ? 'all' : key)),
          }))}
        />

        {shown.length === 0 ? (
          <EmptyState
            icon="book"
            title={tag === 'all' ? t('novedades.empty.none') : t('novedades.empty.title')}
            actions={
              tag === 'all' ? undefined : (
                <Button variant="secondary" onClick={() => setTag('all')}>
                  {t('novedades.empty.all')}
                </Button>
              )
            }
          >
            {tag === 'all' ? null : t('novedades.empty.text')}
          </EmptyState>
        ) : (
          shown.map((entry) => {
            const copy = entry[locale]
            const [first, ...rest] = NOVEDADES_LISTS.filter((list) => copy[list].length > 0)

            return (
              <Card
                key={entry.id}
                as="section"
                id={cardId(entry.id)}
                aria-labelledby={`${cardId(entry.id)}-title`}
                tone={entry.id === anchor ? 'info' : undefined}
                className="grid scroll-mt-4 gap-4"
              >
                <header className="grid gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <time dateTime={entry.date} className="text-micro tabular-nums text-muted">
                      {formatDay(`${entry.date}T00:00:00Z`, 'UTC')}
                    </time>
                    {entry.tags.map((key) => (
                      <Badge key={key} size="sm">
                        {t(`novedades.tag.${key}`)}
                      </Badge>
                    ))}
                    <IconButton tone="ghost" size="sm" className="-my-2 -mr-2 ml-auto" aria-label={t('novedades.copyLink', { title: copy.title })} title={t('novedades.copyLink', { title: copy.title })} onClick={() => void copyLink(entry.id)}>
                      <Icon name="link" />
                    </IconButton>
                  </div>
                  <Heading level="section" id={`${cardId(entry.id)}-title`}>
                    {copy.title}
                  </Heading>
                </header>

                {/* En escritorio, dos columnas: lo que trae a la izquierda y, apiladas a la derecha, las demás (cómo se usa, arreglos, ojo). Chico, todo en fila con una línea fina entre listas. */}
                {first ? (
                  <div className="grid gap-4 min-[1101px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] min-[1101px]:gap-x-10">
                    <EntryList list={first} items={copy[first]} />
                    {rest.length > 0 ? (
                      <div className="grid content-start gap-4 border-t border-border-subtle pt-4 min-[1101px]:border-t-0 min-[1101px]:pt-0">
                        {rest.map((list, index) => (
                          <EntryList key={list} list={list} items={copy[list]} className={index > 0 ? 'border-t border-border-subtle pt-4' : undefined} />
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </Card>
            )
          })
        )}
      </div>
    </StepPage>
  )
}
