import { memo, useMemo } from 'react'

import { getCardOriginDefinition, getCardRoleDefinition } from '../../app/deck-groups'
import { t } from '../../i18n'
import type { CardEntry } from '../../types'
import { CardArt } from '../CardArt'
import { Heading } from '../ui/Heading'
import { CopiesBadge } from '../ui/CopiesBadge'
import { cx } from '../ui/cx'
import { queueArt, queueCard, statusChip } from '../classification-styles'
import {
  CARD_TYPE_LABEL,
  CARD_TYPE_ORDER,
  ROLE_FILTER_ORDER,
  getCardPrimaryStatus,
  getCardType,
  getClassificationStyle,
  type CardTypeKey,
} from './classification-model'

const MAX_VISIBLE_ROLES = 2

const MINI_CHIP = 'whitespace-nowrap rounded-full bg-[rgb(var(--role-rgb)/0.2)] px-2 py-0.5 text-micro font-semibold text-foreground'

interface ClassificationQueueProps {
  cards: CardEntry[]
  selectedId: string | null
  onSelect: (cardId: string) => void
}

/** Cartas agrupadas por tipo (Monstruos, Magias, Trampas) en una grilla que se adapta al ancho. */
export function ClassificationQueue({ cards, selectedId, onSelect }: ClassificationQueueProps) {
  const groups = useMemo(
    () =>
      CARD_TYPE_ORDER.map((type) => ({ type, cards: cards.filter((card) => getCardType(card) === type) })).filter(
        (group) => group.cards.length > 0,
      ),
    [cards],
  )

  return (
    <div className="grid content-start gap-4 min-[1101px]:min-h-0 min-[1101px]:overflow-y-auto min-[1101px]:pr-1 min-[1101px]:[scrollbar-gutter:stable] min-[1101px]:[scrollbar-width:thin]">
      {groups.map((group) => (
        <section key={group.type} className="grid content-start gap-2" aria-label={CARD_TYPE_LABEL[group.type].plural}>
          <GroupHeading type={group.type} cards={group.cards} />
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-1.5 p-0">
            {group.cards.map((card) => (
              <li key={card.id} className="min-w-0">
                <QueueTile card={card} active={card.id === selectedId} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function GroupHeading({ type, cards }: { type: CardTypeKey; cards: CardEntry[] }) {
  const copies = cards.reduce((total, card) => total + card.copies, 0)

  return (
    <Heading level="kicker" as="h2" className="flex items-center gap-2 leading-none">
      <span className="text-muted">{CARD_TYPE_LABEL[type].plural}</span>
      <span className="tabular-nums">{t('roles.queue.groupCount', { cards: cards.length, count: copies })}</span>
      <span className="h-px flex-1 bg-border-subtle" aria-hidden="true" />
    </Heading>
  )
}

const QueueTile = memo(function QueueTile({
  card,
  active,
  onSelect,
}: {
  card: CardEntry
  active: boolean
  onSelect: (cardId: string) => void
}) {
  const status = getCardPrimaryStatus(card)
  const roles = ROLE_FILTER_ORDER.filter((role) => card.roles.includes(role))
  const hiddenRoles = roles.length - MAX_VISIBLE_ROLES
  const missingBoth = card.origin === null && roles.length === 0

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect(card.id)}
      className={cx(
        queueCard(active),
        'grid h-full w-full min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3 rounded-card p-2 text-left',
      )}
    >
      <div className={cx(queueArt(active), 'aspect-[268/391] w-11 bg-input')}>
        <CardArt
          remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null}
          name={card.name}
          className="block h-full w-full object-cover"
          limitCard={card.apiCard}
          limitBadgeSize="sm"
        />
      </div>

      <div className="grid min-w-0 gap-1.5">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <strong className="truncate text-body font-semibold leading-tight text-foreground">{card.name}</strong>
          <CopiesBadge copies={card.copies} />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-1" aria-label={describe(card)}>
          {missingBoth ? <span className={cx(statusChip('warning', true))}>{t('roles.queue.unclassified')}</span> : null}
          {status ? <span className={statusChip(status.tone, true)}>{status.label}</span> : null}
          {card.origin ? (
            <span className={cx(MINI_CHIP, 'rounded-tag')} style={getClassificationStyle(getCardOriginDefinition(card.origin).key)}>
              {getCardOriginDefinition(card.origin).label}
            </span>
          ) : null}
          {roles.slice(0, MAX_VISIBLE_ROLES).map((role) => (
            <span key={role} className={MINI_CHIP} style={getClassificationStyle(getCardRoleDefinition(role).key)}>
              {getCardRoleDefinition(role).label}
            </span>
          ))}
          {hiddenRoles > 0 ? (
            <span
              className="rounded-full bg-tint/8 px-1.5 py-0.5 text-micro font-semibold text-muted"
              title={roles.slice(MAX_VISIBLE_ROLES).map((role) => getCardRoleDefinition(role).label).join(', ')}
            >
              +{hiddenRoles}
            </span>
          ) : null}
        </div>
      </div>
    </button>
  )
})

function describe(card: CardEntry): string {
  const origin = card.origin ? getCardOriginDefinition(card.origin).label : t('roles.queue.noOrigin')
  const roles = ROLE_FILTER_ORDER.filter((role) => card.roles.includes(role)).map((role) => getCardRoleDefinition(role).label)

  return [origin, roles.length > 0 ? roles.join(', ') : t('roles.queue.noRoles')].join(' | ')
}
