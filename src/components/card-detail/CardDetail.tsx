import { isCardAllowedInDeckZone } from '../../app/deck-builder'
import type { DeckZone } from '../../app/model'
import type { DeckFormat } from '../../types'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardArt } from '../CardArt'
import { Button } from '../ui/Button'
import { CloseButton } from '../ui/IconButton'
import { Skeleton } from '../ui/Skeleton'

interface CardDetailProps {
  card: ApiCardSearchResult
  deckFormat: DeckFormat
  layoutMode: 'desktop' | 'mobile'
  showActions?: boolean
  onAddToZone: (zone: DeckZone) => boolean
  onClose: () => void
}

interface CardFact {
  label: string
  value: string
  icon: FactIcon
}

type FactIcon = 'type' | 'attribute' | 'typing' | 'level' | 'atk' | 'def' | 'archetype' | 'link' | 'frame'

export function CardDetail({
  card,
  deckFormat,
  layoutMode,
  showActions = true,
  onAddToZone,
  onClose,
}: CardDetailProps) {
  const isMobileLayout = layoutMode === 'mobile'
  const actionEntries = showActions ? buildActionEntries(card) : []
  const cardFacts = buildCardFacts(card)
  const formatTags = buildCardFormatTags(card, deckFormat)

  const handleAddToZone = (zone: DeckZone) => {
    if (onAddToZone(zone)) {
      onClose()
    }
  }

  return (
    <section className="flex min-h-0 flex-col bg-[var(--card-background)] text-(--text-main)">
      <div className="relative min-h-0 overflow-y-auto px-4 pb-4 pt-4 min-[860px]:px-6 min-[860px]:pb-5 min-[860px]:pt-5">
        <div className="absolute right-4 top-4 z-10 min-[860px]:right-6 min-[860px]:top-5">
          <CloseButton
            size="md"
            aria-label="Cerrar detalle"
            onClick={onClose}
          />
        </div>

        <div className="grid gap-4">
          <div
            className={[
              'grid gap-4',
              isMobileLayout
                ? 'content-start'
                : 'content-start min-[860px]:grid-cols-[18.75rem_minmax(0,1fr)] min-[860px]:items-start min-[860px]:gap-6',
            ].join(' ')}
          >
          <aside className="grid content-start gap-3">
            {isMobileLayout ? (
              <header className="grid gap-1.5">
                <h2 className="m-0 text-[2.05rem] font-semibold leading-[0.96] tracking-[-0.03em] text-(--text-main) min-[860px]:text-[3.15rem]">
                  {card.name}
                </h2>
              </header>
            ) : null}

            <div className="grid content-start gap-3">
              <CardArt
                remoteUrl={card.imageUrl ?? card.imageUrlSmall}
                name={card.name}
                className="block h-auto w-full"
                limitCard={card}
                limitBadgeSize="lg"
              />

              {formatTags.length > 0 ? (
                <div className="flex flex-wrap justify-center gap-1.5">
                  {formatTags.map((tag) => (
                    <span
                      key={tag}
                      className="surface-card-success px-3 py-1 text-[0.66rem] font-semibold tracking-[0.01em] text-white"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

          </aside>

          <div className="grid content-start gap-5 min-w-0">
            {!isMobileLayout ? (
              <header className="grid gap-1.5">
                <h2 className="m-0 text-[2.05rem] font-semibold leading-[0.96] tracking-[-0.03em] text-(--text-main) min-[860px]:text-[3.15rem]">
                  {card.name}
                </h2>
              </header>
            ) : null}

            {cardFacts.length > 0 ? (
              <section className="grid gap-2 min-[640px]:grid-cols-2 min-[860px]:grid-cols-3">
                {cardFacts.map((fact) => (
                  <article
                    key={fact.label}
                    className="surface-card px-4 py-3"
                  >
                    <small className="app-muted block text-[0.8rem] leading-none">
                      {fact.label}
                    </small>
                    <strong className="mt-2 flex items-center gap-2 break-words text-[0.98rem] font-semibold leading-[1.15] text-(--text-main) min-[860px]:text-[1.02rem]">
                      <span className="flex h-[1.1rem] w-[1.1rem] shrink-0 items-center justify-center text-(--text-main)">
                        <FactIconGlyph kind={fact.icon} />
                      </span>
                      <span>{fact.value}</span>
                    </strong>
                  </article>
                ))}
              </section>
            ) : null}

            <section className="grid gap-2.5">
              <h3 className="m-0 text-[1.55rem] font-semibold leading-none tracking-[-0.02em] text-(--text-main) min-[860px]:text-[2rem]">
                Card Text
              </h3>
              <p className="m-0 whitespace-pre-wrap break-words text-[1.02rem] leading-[1.42] text-(--text-main)">
                {card.description?.trim().length ? card.description : 'No card text available.'}
              </p>
            </section>
          </div>
        </div>
        </div>
      </div>

      {actionEntries.length > 0 ? (
        <footer className="border-t border-(--border-subtle) bg-[linear-gradient(180deg,rgb(var(--secondary-rgb)/0.95),rgb(var(--background-rgb)/0.98))] px-4 py-3 min-[860px]:px-6">
          <div
            className={[
              'grid gap-2.5',
              isMobileLayout && actionEntries.length > 1 ? 'grid-cols-2' : '',
            ].join(' ')}
            style={{
              gridTemplateColumns: isMobileLayout
                ? undefined
                : `repeat(${actionEntries.length}, minmax(0, 1fr))`,
            }}
          >
            {actionEntries.map((entry, index) => (
              <Button
                key={entry.zone}
                variant={entry.variant}
                size="sm"
                fullWidth
                className={
                  isMobileLayout && actionEntries.length % 2 === 1 && index === actionEntries.length - 1
                    ? 'col-span-2'
                    : ''
                }
                onClick={() => handleAddToZone(entry.zone)}
              >
                {entry.label}
              </Button>
            ))}
          </div>
        </footer>
      ) : null}
    </section>
  )
}

interface CardDetailSkeletonProps {
  layoutMode: 'desktop' | 'mobile'
  showActions?: boolean
  onClose: () => void
}

export function CardDetailSkeleton({
  layoutMode,
  showActions = true,
  onClose,
}: CardDetailSkeletonProps) {
  const isMobileLayout = layoutMode === 'mobile'
  const factCount = isMobileLayout ? 4 : 6
  const actionCount = isMobileLayout ? 2 : 3

  return (
    <section className="flex min-h-0 flex-col bg-[var(--card-background)] text-(--text-main)">
      <div className="relative min-h-0 overflow-y-auto px-4 pb-4 pt-4 min-[860px]:px-6 min-[860px]:pb-5 min-[860px]:pt-5">
        <div className="absolute right-4 top-4 z-10 min-[860px]:right-6 min-[860px]:top-5">
          <CloseButton
            size="md"
            aria-label="Cerrar detalle"
            onClick={onClose}
          />
        </div>

        <div className="grid gap-4">
          <div
            className={[
              'grid gap-4',
              isMobileLayout
                ? 'content-start'
                : 'content-start min-[860px]:grid-cols-[18.75rem_minmax(0,1fr)] min-[860px]:items-start min-[860px]:gap-6',
            ].join(' ')}
          >
            <aside className="grid content-start gap-3">
              {isMobileLayout ? (
                <header className="grid gap-1.5">
                  <Skeleton radius="none" className="h-12 max-w-full w-[17rem]" />
                </header>
              ) : null}

              <div className="grid content-start gap-3">
                <Skeleton radius="none" className="aspect-[421/614] w-full" />

                <div className="flex flex-wrap justify-center gap-1.5">
                  <Skeleton radius="chip" className="h-7 w-16" />
                  <Skeleton radius="chip" className="h-7 w-16" />
                  <Skeleton radius="chip" className="h-7 w-20" />
                </div>
              </div>
            </aside>

            <div className="grid min-w-0 content-start gap-5">
              {!isMobileLayout ? (
                <header className="grid gap-1.5">
                  <Skeleton radius="none" className="h-14 max-w-full w-[26rem]" />
                </header>
              ) : null}

              <section className="grid gap-2 min-[640px]:grid-cols-2 min-[860px]:grid-cols-3">
                {Array.from({ length: factCount }).map((_, index) => (
                  <article
                    key={index}
                    className="surface-card grid gap-2 px-4 py-3"
                  >
                    <Skeleton radius="none" className="h-3 w-20" />
                    <Skeleton radius="none" className="h-6 w-full" />
                  </article>
                ))}
              </section>

              <section className="grid gap-2.5">
                <Skeleton radius="none" className="h-10 w-40" />
                <div className="grid gap-2">
                  <Skeleton radius="none" className="h-5 w-full" />
                  <Skeleton radius="none" className="h-5 w-full" />
                  <Skeleton radius="none" className="h-5 w-[92%]" />
                  <Skeleton radius="none" className="h-5 w-[88%]" />
                  <Skeleton radius="none" className="h-5 w-[84%]" />
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>

      {showActions ? (
        <footer className="border-t border-(--border-subtle) bg-[linear-gradient(180deg,rgb(var(--secondary-rgb)/0.95),rgb(var(--background-rgb)/0.98))] px-4 py-3 min-[860px]:px-6">
          <div
            className={[
              'grid gap-2.5',
              isMobileLayout && actionCount > 1 ? 'grid-cols-2' : '',
            ].join(' ')}
            style={{
              gridTemplateColumns: isMobileLayout
                ? undefined
                : `repeat(${actionCount}, minmax(0, 1fr))`,
            }}
          >
            {Array.from({ length: actionCount }).map((_, index) => (
              <Skeleton
                key={index}
                className={
                  isMobileLayout && actionCount % 2 === 1 && index === actionCount - 1
                    ? 'col-span-2 h-9'
                    : 'h-9'
                }
              />
            ))}
          </div>
        </footer>
      ) : null}
    </section>
  )
}

function buildActionEntries(card: ApiCardSearchResult): Array<{
  zone: DeckZone
  label: string
  variant: 'primary' | 'secondary' | 'tertiary'
}> {
  const entries: Array<{
    zone: DeckZone
    label: string
    variant: 'primary' | 'secondary' | 'tertiary'
  }> = []

  if (isCardAllowedInDeckZone(card, 'main')) {
    entries.push({
      zone: 'main',
      label: 'Agregar al Main Deck',
      variant: 'primary',
    })
  }

  if (isCardAllowedInDeckZone(card, 'extra')) {
    entries.push({
      zone: 'extra',
      label: 'Agregar al Extra Deck',
      variant: 'primary',
    })
  }

  entries.push({
    zone: 'side',
    label: 'Agregar al Side Deck',
    variant: entries.length > 0 ? 'tertiary' : 'secondary',
  })

  return entries
}

function buildCardFormatTags(card: ApiCardSearchResult, deckFormat: DeckFormat): string[] {
  const tags = ['TCG', 'OCG']

  if (deckFormat === 'genesys' || card.genesys.points !== null) {
    tags.push(`${card.genesys.points ?? 0} Genesys`)
  }

  return tags
}

function buildCardFacts(card: ApiCardSearchResult): CardFact[] {
  const facts: CardFact[] = [{ label: 'Type', value: card.cardType, icon: 'type' }]

  if (card.attribute) {
    facts.push({ label: 'Attribute', value: card.attribute, icon: 'attribute' })
  }

  if (card.race) {
    facts.push({ label: 'Typing', value: card.race, icon: 'typing' })
  }

  if (card.linkValue !== null) {
    facts.push({ label: 'Link', value: String(card.linkValue), icon: 'link' })
  } else if (card.level !== null) {
    facts.push({ label: 'Level/Rank', value: String(card.level), icon: 'level' })
  }

  if (card.atk) {
    facts.push({ label: 'ATK', value: card.atk, icon: 'atk' })
  }

  if (card.archetype) {
    facts.push({ label: 'Archetype', value: card.archetype, icon: 'archetype' })
  } else if (card.def) {
    facts.push({ label: 'DEF', value: card.def, icon: 'def' })
  }

  if (facts.length < 4 && card.frameType.trim().length > 0) {
    facts.push({ label: 'Frame', value: card.frameType, icon: 'frame' })
  }

  return facts.slice(0, 6)
}

function FactIconGlyph({ kind }: { kind: FactIcon }) {
  if (kind === 'type') {
    return (
      <svg viewBox="0 0 16 16" className="block h-full w-full" aria-hidden="true">
        <rect x="2" y="2" width="10" height="12" rx="1.8" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M5 6.2h4.5M5 9h4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    )
  }

  if (kind === 'attribute') {
    return (
      <svg viewBox="0 0 16 16" className="block h-full w-full text-[#d7c164]" aria-hidden="true">
        <circle cx="8" cy="8" r="6.1" fill="none" stroke="currentColor" strokeWidth="1.35" />
        <path d="M8 3.4v9.2M3.4 8h9.2M5 5l6 6M11 5 5 11" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
      </svg>
    )
  }

  if (kind === 'typing') {
    return (
      <svg viewBox="0 0 16 16" className="block h-full w-full text-[#d39c2a]" aria-hidden="true">
        <path d="M8 1.9 13.6 5v6L8 14.1 2.4 11V5Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M8 4.6 10.2 8 8 11.4 5.8 8Z" fill="currentColor" />
      </svg>
    )
  }

  if (kind === 'level') {
    return (
      <svg viewBox="0 0 16 16" className="block h-full w-full" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="#cf352f" />
        <path d="m8 2.8 1.45 3.1 3.4.28-2.58 2.24.78 3.34L8 10.1 4.95 11.76l.78-3.34L3.15 6.18l3.4-.28Z" fill="#ffdd55" />
      </svg>
    )
  }

  if (kind === 'atk') {
    return (
      <svg viewBox="0 0 16 16" className="block h-full w-full" aria-hidden="true">
        <path d="M4 3.2 6.1 5.3 3.7 7.7 1.9 5.9ZM12 3.2l2.1 2.7-1.8 1.8-2.4-2.4ZM4.8 12.1l5.7-5.7m-3.7 7.7 5.7-5.7" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }

  if (kind === 'def' || kind === 'link') {
    return (
      <svg viewBox="0 0 16 16" className="block h-full w-full" aria-hidden="true">
        <path d="M8 2.2 12.9 4v3.3c0 3.1-2.1 5.2-4.9 6.5-2.8-1.3-4.9-3.4-4.9-6.5V4Z" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinejoin="round" />
      </svg>
    )
  }

  if (kind === 'archetype') {
    return (
      <svg viewBox="0 0 16 16" className="block h-full w-full" aria-hidden="true">
        <path d="M6.1 2.4h3.8M7.1 2.4v3.2L3.8 11a2.1 2.1 0 0 0 1.8 3.1h4.8a2.1 2.1 0 0 0 1.8-3.1L8.9 5.6V2.4" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 9.2h4.1" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 16 16" className="block h-full w-full" aria-hidden="true">
      <rect x="2.3" y="2.3" width="11.4" height="11.4" rx="2" fill="none" stroke="currentColor" strokeWidth="1.35" />
      <path d="M5 5.2h6M5 8h6M5 10.8h4.2" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}
