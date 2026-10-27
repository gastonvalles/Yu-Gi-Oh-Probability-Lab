import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'

import type { CardEntry, CardOrigin, CardRole, CardType, Matcher } from '../../../types'
import { CARD_ORIGIN_DEFINITIONS, getCardRoleDefinition, getDeckGroupTheme } from '../../../app/deck-groups'
import {
  buildDerivedDeckAttributes,
  buildDerivedDeckAttackValues,
  buildDerivedDeckDefenseValues,
  buildDerivedDeckLevels,
  buildDerivedDeckMonsterTypes,
} from '../../../app/card-attributes'
import { buildDeckArchetypes } from '../../../app/card-archetypes'
import { getRemainingCopies } from '../../../app/pattern-card-usage'
import { createCardPoolMatcher } from '../../../app/patterns'
import { formatCopies, formatInteger } from '../../../app/utils'
import { t } from '../../../i18n'
import { renderRich } from '../../../i18n/rich'
import { CardArt } from '../../CardArt'
import { Button } from '../../ui/Button'
import { cx } from '../../ui/cx'
import { Heading } from '../../ui/Heading'
import { Icon } from '../../ui/Icon'
import { CloseButton, IconButton } from '../../ui/IconButton'
import { SearchField } from '../../ui/SearchField'
import { Segmented } from '../../ui/Segmented'
import { overline } from '../../ui/typography'
import { getCardTypeLabel } from './condition-labels'

export type PickerTab = 'roles' | 'cards' | 'more'

interface CategoryPickerProps {
  /** Número de la condición (1, 2…): va en el título. */
  index: number
  currentMatcher: Matcher | null
  derivedMainCards: CardEntry[]
  /** Copias que las otras condiciones de la regla ya se llevan (esas cartas no se vuelven a ofrecer). */
  usedCopies: ReadonlyMap<string, number>
  /** La pestaña con la que abre si la condición todavía no cuenta nada (un ejemplo que pide «tu carta» abre en Cartas). */
  initialTab?: PickerTab
  /** Vuelve a la regla sin cambiar nada (‹ y «Volver»). */
  onBack: () => void
  /** Cierra el editor entero (la X). */
  onClose: () => void
  onUse: (matcher: Matcher) => void
}

/** Lo elegido mientras el selector está abierto: un criterio (un rol o algo de «Más») o una o varias cartas. */
type Pick = { matcher: Matcher; label: string; copies: number } | { cards: string[] } | null

interface Option {
  key: string
  label: string
  copies: number
  matcher: Matcher
}

interface MoreGroup {
  key: string
  label: string
  options: Option[]
}

/** Los roles en el orden en que se piensan: los que arrancan, los que interactúan, los que ayudan y los que traban. */
const ROLE_ORDER: readonly CardRole[] = ['starter', 'extender', 'handtrap', 'disruption', 'boardbreaker', 'floodgate', 'searcher', 'draw', 'enabler', 'payoff', 'recovery', 'brick', 'garnet']

const CARD_TYPES: readonly CardType[] = ['monster', 'spell', 'trap']

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Chip de un rol o de un criterio de «Más»: elegido, el aro ámbar por dentro y el texto ámbar (no corre nada de lugar). */
const CHIP =
  'flex min-h-13 w-full items-center gap-2.5 rounded-control bg-input px-3 text-left text-body font-semibold text-foreground transition-[background-color,color,box-shadow] duration-150 hover:bg-input-hover focus-visible:outline-none focus-visible:shadow-focus aria-pressed:text-info-soft aria-pressed:inset-ring-2 aria-pressed:inset-ring-info disabled:pointer-events-none disabled:opacity-45'

function initialTabOf(matcher: Matcher | null, fallback: PickerTab): PickerTab {
  if (!matcher) return fallback
  if (matcher.type === 'role') return 'roles'
  if (matcher.type === 'card' || matcher.type === 'card_pool') return 'cards'
  return 'more'
}

function copiesText(copies: number): string {
  return t('builder.picker.copies', { count: copies, n: formatInteger(copies) })
}

/**
 * Qué cuenta una condición, en tres pestañas: **Roles** (los 13 con su color y sus copias; los que no tienen, apagados), **Cartas** (con su imagen; una o varias)
 * y **Más** (origen, tipo, arquetipo, atributo, nivel, tipo de monstruo, ATK/DEF). Se elige y se confirma abajo («Usar Handtrap»). Vive dentro del cajón del
 * editor: en el celular ocupa toda la pantalla, como una hoja; el buscador filtra las tres pestañas y cada una dice cuántas coincidencias tiene.
 */
export function CategoryPicker({ index, currentMatcher, derivedMainCards: allCards, usedCopies, initialTab = 'roles', onBack, onClose, onUse }: CategoryPickerProps) {
  // Sólo se eligen cartas del deck (las ausentes llegan con 0 copias, para mostrar su nombre).
  const cards = useMemo(() => allCards.filter((card) => card.copies > 0), [allCards])
  const [tab, setTab] = useState<PickerTab>(() => initialTabOf(currentMatcher, initialTab))
  const [query, setQuery] = useState('')
  const needle = fold(query.trim())
  const matches = (label: string) => !needle || fold(label).includes(needle)

  const roles = useMemo(() => buildRoleOptions(cards), [cards])
  const freeCards = useMemo(() => cards.filter((card) => getRemainingCopies(card, usedCopies) > 0), [cards, usedCopies])
  const usedUp = useMemo(() => cards.filter((card) => getRemainingCopies(card, usedCopies) === 0).map((card) => card.name), [cards, usedCopies])
  const more = useMemo(() => buildMoreGroups(cards), [cards])

  const [pick, setPick] = useState<Pick>(() => {
    if (currentMatcher?.type === 'card') return { cards: [currentMatcher.value] }
    if (currentMatcher?.type === 'card_pool') return { cards: [...currentMatcher.value] }
    if (!currentMatcher) return null
    const option = [...roles, ...more.flatMap((group) => group.options)].find((candidate) => JSON.stringify(candidate.matcher) === JSON.stringify(currentMatcher))
    return option ? { matcher: option.matcher, label: option.label, copies: option.copies } : null
  })
  const pickedCards = pick && 'cards' in pick ? new Set(pick.cards) : null
  const isPicked = (option: Option) => pick !== null && 'matcher' in pick && JSON.stringify(pick.matcher) === JSON.stringify(option.matcher)

  const visibleRoles = roles.filter((option) => matches(option.label))
  const visibleCards = freeCards.filter((card) => matches(card.name))
  const visibleMore = more.map((group) => ({ ...group, options: group.options.filter((option) => matches(option.label) || matches(group.label)) })).filter((group) => group.options.length > 0)
  const counts = { roles: visibleRoles.length, cards: visibleCards.length, more: visibleMore.reduce((total, group) => total + group.options.length, 0) }

  const chooseOption = (option: Option) => setPick({ matcher: option.matcher, label: option.label, copies: option.copies })
  const toggleCard = (cardId: string) => {
    const next = new Set(pickedCards ?? [])

    if (next.has(cardId)) {
      next.delete(cardId)
    } else {
      next.add(cardId)
    }

    setPick(next.size > 0 ? { cards: [...next] } : null)
  }

  const cardById = new Map(cards.map((card) => [card.id, card]))
  const summary = !pick
    ? t('builder.picker.nothing')
    : 'matcher' in pick
      ? t('builder.picker.selection', { label: pick.label, copies: copiesText(pick.copies) })
      : pick.cards.length === 1
        ? t('builder.picker.selection', { label: cardById.get(pick.cards[0]!)?.name ?? '', copies: copiesText(cardById.get(pick.cards[0]!)?.copies ?? 0) })
        : t('builder.picker.selectionCards', { count: pick.cards.length })
  const useLabel = !pick
    ? t('builder.picker.useEmpty')
    : 'matcher' in pick
      ? t('builder.picker.use', { label: pick.label })
      : pick.cards.length === 1
        ? t('builder.picker.use', { label: cardById.get(pick.cards[0]!)?.name ?? '' })
        : t('builder.picker.useCards', { count: pick.cards.length })

  const commit = () => {
    const matcher = !pick ? null : 'matcher' in pick ? pick.matcher : createCardPoolMatcher(pick.cards)

    if (matcher) {
      onUse(matcher)
    }
  }

  const empty = (text: string) => <p className="m-0 py-6 text-center text-body text-muted">{text}</p>

  return (
    <>
      <header className="flex min-h-11 items-center gap-2 border-b border-border-subtle px-4 py-2.5 md:px-6">
        <IconButton tone="raised" size="lg" aria-label={t('builder.picker.back')} onClick={onBack}>
          <Icon name="chevron-left" />
        </IconButton>
        <Heading level="section" as="h2" className="min-w-0 flex-1 truncate">
          {t('builder.picker.title', { index: formatInteger(index) })}
        </Heading>
        <CloseButton size="md" aria-label={t('builder.drawer.close')} onClick={onClose} />
      </header>

      <div className="grid min-h-0 content-start gap-4 overflow-y-auto overscroll-contain px-4 py-4 md:px-6 md:py-5">
        <SearchField label={t('builder.picker.search')} value={query} placeholder={t('builder.picker.placeholder')} inputClassName="h-12" onChange={setQuery} />
        <Segmented
          fullWidth
          label={t('builder.picker.tabs')}
          value={tab}
          options={[
            { value: 'roles', label: t('builder.picker.tab.roles'), count: needle ? counts.roles : undefined },
            { value: 'cards', label: t('builder.picker.tab.cards'), count: needle ? counts.cards : undefined },
            { value: 'more', label: t('builder.picker.tab.more'), count: needle ? counts.more : undefined },
          ]}
          onChange={setTab}
        />

        {/* Cada pestaña entra con un fundido corto (con movimiento reducido, de una). */}
        <div key={tab} className="grid content-start gap-4 animate-step-in motion-reduce:animate-none">
          {tab === 'roles' ? (
            <>
              <p className="m-0 text-body text-muted">{t('builder.picker.rolesHint')}</p>
              {visibleRoles.length === 0 ? (
                empty(t('builder.picker.noMatches'))
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {visibleRoles.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={CHIP}
                      aria-pressed={isPicked(option)}
                      disabled={option.copies === 0}
                      aria-label={t('builder.picker.option', { label: option.label, copies: copiesText(option.copies) })}
                      style={{ '--role-rgb': getDeckGroupTheme(option.matcher as Extract<Matcher, { type: 'role' }>).rgb } as CSSProperties}
                      onClick={() => chooseOption(option)}
                    >
                      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-[rgb(var(--role-rgb))]" />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      <span className="shrink-0 font-normal tabular-nums text-muted">{formatCopies(option.copies)}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="m-0 text-body text-muted">{renderRich(t('builder.picker.rolesFoot'), { b: (text) => <b className="font-semibold text-foreground">{text}</b> })}</p>
            </>
          ) : tab === 'cards' ? (
            <>
              <p className="m-0 text-body text-muted">{t('builder.picker.cardsHint')}</p>
              {cards.length === 0 ? (
                empty(t('builder.picker.noCards'))
              ) : visibleCards.length === 0 ? (
                empty(t('builder.picker.noMatches'))
              ) : (
                <ul className="m-0 grid list-none gap-1 p-0">
                  {visibleCards.map((card) => {
                    const selected = pickedCards?.has(card.id) ?? false

                    return (
                      <li key={card.id} className="[contain-intrinsic-size:auto_60px] [content-visibility:auto]">
                        <button
                          type="button"
                          aria-pressed={selected}
                          aria-label={t('builder.picker.option', { label: card.name, copies: copiesText(getRemainingCopies(card, usedCopies)) })}
                          className="flex min-h-15 w-full items-center gap-3 rounded-control px-2 py-1.5 text-left text-body font-semibold text-foreground transition-[background-color,color,box-shadow] duration-150 hover:bg-tint/7 focus-visible:outline-none focus-visible:shadow-focus aria-pressed:bg-tint/8 aria-pressed:text-info-soft aria-pressed:inset-ring-2 aria-pressed:inset-ring-info"
                          onClick={() => toggleCard(card.id)}
                        >
                          <span className="block aspect-[421/614] w-8 shrink-0 overflow-hidden bg-input">
                            <CardArt remoteUrl={card.apiCard?.imageUrlSmall ?? card.apiCard?.imageUrl ?? null} name={card.name} />
                          </span>
                          <span className="min-w-0 flex-1 truncate">{card.name}</span>
                          <span className="shrink-0 font-normal tabular-nums text-muted">{formatCopies(getRemainingCopies(card, usedCopies))}</span>
                          <span
                            aria-hidden="true"
                            className={cx('grid size-5 shrink-0 place-items-center rounded-full border-[1.5px]', selected ? 'border-info bg-magenta text-white' : 'border-border-strong')}
                          >
                            {selected ? <Icon name="check" size={12} strokeWidth={3} /> : null}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {usedUp.length > 0 ? <p className="m-0 text-body text-muted">{t('builder.picker.used', { names: usedUp.join(', ') })}</p> : null}
            </>
          ) : visibleMore.length === 0 ? (
            empty(t(cards.length === 0 ? 'builder.picker.noCards' : 'builder.picker.noMatches'))
          ) : (
            <>
              <p className="m-0 text-body text-muted">{t('builder.picker.moreHint')}</p>
              {visibleMore.map((group) => (
                <MoreSection key={group.key} title={group.label}>
                  {group.options.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={CHIP}
                      aria-pressed={isPicked(option)}
                      aria-label={t('builder.picker.option', { label: option.label, copies: copiesText(option.copies) })}
                      onClick={() => chooseOption(option)}
                    >
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      <span className="shrink-0 font-normal tabular-nums text-muted">{formatCopies(option.copies)}</span>
                    </button>
                  ))}
                </MoreSection>
              ))}
            </>
          )}
        </div>
      </div>

      <footer className="flex items-center gap-2 border-t border-border-subtle px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] pt-3 md:px-6">
        <span className="min-w-0 flex-1 text-body text-muted">{summary}</span>
        <Button variant="tertiary" size="md" onClick={onBack}>
          {t('builder.picker.cancel')}
        </Button>
        <Button variant="primary" size="md" className="min-w-0 max-w-3/5" disabled={!pick} onClick={commit}>
          <span className="truncate">{useLabel}</span>
        </Button>
      </footer>
    </>
  )
}

function MoreSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className={cx('m-0', overline)}>{title}</h3>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </section>
  )
}

function copiesOf(cards: CardEntry[], test: (card: CardEntry) => boolean): number {
  return cards.filter(test).reduce((total, card) => total + card.copies, 0)
}

function buildRoleOptions(cards: CardEntry[]): Option[] {
  return ROLE_ORDER.map((role) => ({
    key: `role:${role}`,
    label: getCardRoleDefinition(role).label,
    copies: copiesOf(cards, (card) => card.roles.includes(role)),
    matcher: { type: 'role', value: role },
  }))
}

function buildMoreGroups(cards: CardEntry[]): MoreGroup[] {
  const groups: MoreGroup[] = [
    {
      key: 'origin',
      label: t('builder.picker.group.origin'),
      options: CARD_ORIGIN_DEFINITIONS.map((definition) => ({
        key: `origin:${definition.key.value}`,
        label: definition.label,
        copies: copiesOf(cards, (card) => card.origin === definition.key.value),
        matcher: { type: 'origin', value: definition.key.value as CardOrigin } as Matcher,
      })),
    },
    {
      key: 'card_type',
      label: t('builder.picker.group.cardType'),
      options: CARD_TYPES.map((type) => ({
        key: `type:${type}`,
        label: getCardTypeLabel(type),
        copies: copiesOf(cards, (card) => (card.apiCard?.cardType.toLowerCase() ?? '').includes(type)),
        matcher: { type: 'card_type', value: type } as Matcher,
      })),
    },
    {
      key: 'archetype',
      label: t('builder.picker.group.archetype'),
      options: buildDeckArchetypes(cards).map((archetype) => ({
        key: `archetype:${archetype.name}`,
        label: archetype.name,
        copies: archetype.copies,
        matcher: { type: 'archetype', value: archetype.name } as Matcher,
      })),
    },
    {
      key: 'attribute',
      label: t('builder.picker.group.attribute'),
      options: buildDerivedDeckAttributes(cards).map((entry) => ({ key: `attribute:${entry.key}`, label: entry.label, copies: entry.copies, matcher: { type: 'attribute', value: entry.key } as Matcher })),
    },
    {
      key: 'level',
      label: t('builder.picker.group.level'),
      options: buildDerivedDeckLevels(cards).map((entry) => ({
        key: `level:${entry.key}`,
        label: t('builder.label.level', { value: entry.label }),
        copies: entry.copies,
        matcher: { type: 'level', value: entry.key } as Matcher,
      })),
    },
    {
      key: 'monster_type',
      label: t('builder.picker.group.monsterType'),
      options: buildDerivedDeckMonsterTypes(cards).map((entry) => ({ key: `monster:${entry.key}`, label: entry.label, copies: entry.copies, matcher: { type: 'monster_type', value: entry.key } as Matcher })),
    },
    {
      key: 'atk',
      label: t('builder.picker.group.atk'),
      options: buildDerivedDeckAttackValues(cards).map((entry) => ({
        key: `atk:${entry.key}`,
        label: t('builder.label.atk', { value: entry.label }),
        copies: entry.copies,
        matcher: { type: 'atk', value: entry.key } as Matcher,
      })),
    },
    {
      key: 'def',
      label: t('builder.picker.group.def'),
      options: buildDerivedDeckDefenseValues(cards).map((entry) => ({
        key: `def:${entry.key}`,
        label: t('builder.label.def', { value: entry.label }),
        copies: entry.copies,
        matcher: { type: 'def', value: entry.key } as Matcher,
      })),
    },
  ]

  // Lo que el deck no tiene no se ofrece en «Más» (en Roles sí se ve, apagado: es la lista completa de roles).
  return groups.map((group) => ({ ...group, options: group.options.filter((option) => option.copies > 0) })).filter((group) => group.options.length > 0)
}
