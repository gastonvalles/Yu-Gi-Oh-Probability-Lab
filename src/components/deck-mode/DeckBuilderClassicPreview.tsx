import {
  buildClassicCardDetailHeader,
  buildClassicCardLevelLine,
  buildClassicCardStatLine,
} from '../../app/deck-builder-classic'
import type { DeckZone } from '../../app/model'
import type { ApiCardSearchResult } from '../../ygoprodeck'
import { CardArt } from '../CardArt'
import { buildZoneActionEntries } from '../card-detail/card-zone-actions'
import { DeckCopyControls, type DeckCopyActions } from '../card-detail/DeckCopyControls'
import { Button } from '../ui/Button'

const EMPTY_PREVIEW_GUIDE = {
  title: 'Armá tu deck',
  description:
    'Buscá una carta y agregala con + o doble clic, o arrastrala a la zona que quieras. Hacé clic en una carta para ver el detalle y sumar o quitar copias.',
} as const

const ACTIONS = 'border border-border/94 bg-linear-to-b from-secondary/94 to-background/98 p-[0.65rem]'

const SHORTCUTS = [
  { keys: 'Doble clic', label: 'agregar' },
  { keys: 'Clic derecho', label: 'quitar del deck' },
] as const

interface DeckBuilderClassicPreviewProps {
  card: ApiCardSearchResult | null
  source: 'search' | 'deck' | null
  deckCopy: DeckCopyActions | null
  onAddToZone: (zone: DeckZone) => void
}

export function DeckBuilderClassicPreview({ card, source, deckCopy, onAddToZone }: DeckBuilderClassicPreviewProps) {
  const detailHeader = card ? buildClassicCardDetailHeader(card) : null
  const levelLine = card ? buildClassicCardLevelLine(card) : null
  const statLine = card ? buildClassicCardStatLine(card) : null
  const condensedStatLine = [levelLine, statLine].filter(Boolean).join(' ')

  return (
    <aside className="flex h-full max-h-full min-h-0 flex-col gap-[0.72rem] overflow-y-auto overflow-x-hidden overscroll-contain border-r border-border/94 bg-linear-to-b from-card-background/96 to-background/98 px-5 pb-4 pt-[0.85rem] [scrollbar-gutter:stable] [scrollbar-width:thin] [&>*]:shrink-0">
      {!card ? (
        <section
          className="relative grid content-start gap-[0.42rem] overflow-hidden rounded-[0.92rem] border border-primary/28 px-[0.95rem] pb-[0.95rem] pt-[0.9rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_0_0_1px_rgb(var(--primary-rgb)/0.06)] [background:radial-gradient(circle_at_top_left,rgb(var(--primary-rgb)/0.16),transparent_38%),linear-gradient(180deg,rgb(var(--primary-rgb)/0.08),rgb(var(--card-background-rgb)/0.98))] after:absolute after:inset-x-4 after:bottom-4 after:h-px after:opacity-72 after:[background:linear-gradient(90deg,rgb(var(--primary-rgb)/0.42),transparent_72%)]"
          aria-label="Guía inicial del deck builder">
          <h3 className="m-0 text-[0.98rem] font-bold leading-[1.12] text-foreground">{EMPTY_PREVIEW_GUIDE.title}</h3>
          <p className="m-0 text-[0.78rem] leading-[1.28] text-muted">{EMPTY_PREVIEW_GUIDE.description}</p>
          <ul className="m-0 mt-[0.55rem] grid list-none gap-[0.3rem] p-0 text-[0.74rem] text-muted" aria-label="Atajos">
            {SHORTCUTS.map((shortcut) => (
              <li key={shortcut.keys}>
                <kbd className="inline-block min-w-[1.3rem] rounded-[0.3rem] border border-b-2 border-border bg-secondary/95 px-[0.35rem] py-[0.05rem] text-center font-[inherit] text-[0.7rem] font-bold text-foreground">
                  {shortcut.keys}
                </kbd> {shortcut.label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="rounded-[0.72rem] border border-primary/24 bg-linear-to-b from-primary/10 to-card-background/98 px-[0.8rem] py-[0.38rem] text-center text-[0.9rem] font-bold leading-[1.05] text-foreground shadow-[0_0_0_1px_rgb(var(--primary-rgb)/0.05)]">{card ? card.name : 'Elegí una carta'}</div>

      <div className="grid min-h-0 justify-items-center overflow-hidden">
        <div className="w-[min(100%,max(9rem,calc((100dvh-var(--deck-mode-topbar-height)-29rem)*0.72)))] bg-transparent">
          {card ? (
            <CardArt
              remoteUrl={card.imageUrl}
              name={card.name}
              className="w-full bg-transparent shadow-none"
              limitCard={card}
              limitBadgeSize="lg"
            />
          ) : (
            <div className="grid aspect-[0.72] w-full place-items-center border border-border/94 bg-linear-to-b from-secondary/94 to-background/98 p-4 text-center text-muted">Sin carta seleccionada</div>
          )}
        </div>
      </div>

      {card && source === 'deck' && deckCopy ? (
        <div className={ACTIONS}>
          <DeckCopyControls deckCopy={deckCopy} />
        </div>
      ) : null}

      {card && source === 'search' ? (
        <div className={`${ACTIONS} grid gap-2`}>
          {buildZoneActionEntries(card).map((entry) => (
            <Button key={entry.zone} variant={entry.variant} size="sm" fullWidth onClick={() => onAddToZone(entry.zone)}>
              {entry.label}
            </Button>
          ))}
        </div>
      ) : null}

      <article className="grid min-h-48 flex-[1_0_auto] content-start gap-[0.52rem] border border-border/94 bg-linear-to-b from-secondary/94 to-background/98 px-[0.72rem] pb-3 pt-[0.62rem] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
        {card ? (
          <>
            {detailHeader ? <p className="m-0 whitespace-pre-wrap text-[0.92rem] leading-[1.24] text-foreground">{detailHeader}</p> : null}
            {condensedStatLine ? (
              <p className="m-0 whitespace-pre-wrap text-[0.92rem] leading-[1.24] text-foreground">{condensedStatLine}</p>
            ) : null}
            {card.description ? (
              <p className="m-0 whitespace-pre-wrap text-[0.92rem] leading-[1.38] text-foreground">{card.description}</p>
            ) : null}
          </>
        ) : (
          <p className="m-0 whitespace-pre-wrap text-[0.92rem] leading-[1.38] text-foreground">
            Hacé clic en una carta del deck o del buscador para ver su detalle acá.
          </p>
        )}
      </article>
    </aside>
  )
}
