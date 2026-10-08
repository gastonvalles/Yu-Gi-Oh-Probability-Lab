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
import { Icon } from '../ui/Icon'

const SHORTCUTS = [
  { keys: 'Doble clic o arrastrar', label: 'agregar' },
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
    <aside className="flex h-full max-h-full min-h-0 flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain border-r border-border-subtle bg-card-background/50 px-4 pb-4 pt-4 [scrollbar-gutter:stable] [scrollbar-width:thin] [&>*]:shrink-0">
      {card ? (
        <h3 className="m-0 text-center text-lead font-semibold leading-tight text-foreground [overflow-wrap:anywhere]">{card.name}</h3>
      ) : null}

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
            <div className="grid aspect-[0.72] w-full place-content-center justify-items-center gap-2 p-4 text-center text-body text-soft">
              <Icon name="image" size={24} />
              Sin carta seleccionada
            </div>
          )}
        </div>
      </div>

      {card && source === 'deck' && deckCopy ? (
        <DeckCopyControls deckCopy={deckCopy} />
      ) : null}

      {card && source === 'search' ? (
        <div className="grid gap-2">
          {buildZoneActionEntries(card).map((entry) => (
            <Button key={entry.zone} variant={entry.variant} size="sm" fullWidth onClick={() => onAddToZone(entry.zone)}>
              {entry.label}
            </Button>
          ))}
        </div>
      ) : null}

      {card ? (
        <article className="grid min-h-48 flex-[1_0_auto] content-start gap-2 border-t border-border-subtle pt-3 text-foreground">
          {detailHeader ? <p className="m-0 whitespace-pre-wrap text-body text-foreground">{detailHeader}</p> : null}
          {condensedStatLine ? <p className="m-0 whitespace-pre-wrap text-body text-foreground">{condensedStatLine}</p> : null}
          {card.description ? <p className="m-0 whitespace-pre-wrap text-body text-foreground">{card.description}</p> : null}
        </article>
      ) : (
        <ul className="m-0 grid list-none gap-1.5 p-0 text-micro text-muted" aria-label="Atajos">
          {SHORTCUTS.map((shortcut) => (
            <li key={shortcut.keys} className="flex items-center gap-2">
              <kbd className="inline-block rounded-tag border border-b-2 border-border bg-secondary px-1.5 py-0.5 text-center font-[inherit] text-micro font-semibold text-foreground">
                {shortcut.keys}
              </kbd>
              {shortcut.label}
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
