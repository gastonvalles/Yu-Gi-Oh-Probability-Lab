import { useMemo, useState, type ReactNode } from 'react'

import {
  DECK_TIER_FLOORS,
  META_DECKS,
  MIN_RELIABLE_DECKS,
  MIN_TIER_DECKS,
  PROJECTION_WEEKS,
  TIER_FLOORS,
  TREND_THRESHOLD,
  buildDeckTierReport,
  buildMetaReport,
  buildTierListHash,
  buildTournamentsHash,
  readTierListHash,
  type MetaDeck,
  type MetaCardStat,
  type DeckTierStat,
  type MetaList,
  type MetaTier,
  type MetaZone,
} from '../../app/meta'
import { useAppSelector } from '../../app/store-hooks'
import { setMetaRegion, useMetaRegion } from '../../app/use-meta-region'
import { DESKTOP_DECK_BUILDER_MEDIA_QUERY, useMediaQuery } from '../../app/use-media-query'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { StepHero } from '../StepHero'
import { Button } from '../ui/Button'
import { Callout } from '../ui/Callout'
import { Card } from '../ui/Card'
import { cx } from '../ui/cx'
import { EmptyState } from '../ui/EmptyState'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { SectionHeader } from '../ui/SectionHeader'
import { Segmented } from '../ui/Segmented'
import { StepPage } from '../ui/StepPage'
import { overline } from '../ui/typography'
import { DeckTierModal } from './DeckTierModal'
import { MetaCardModal } from './MetaCardModal'
import { MetaDeckModal } from './MetaDeckModal'
import { MetaHeroSide } from './MetaHeroSide'
import { CardTile, DeckTile, TierBoard, groupByTier, type BoardView } from './TierBoard'
import { percent, tierLabel } from './meta-format'

type WindowWeeks = '2' | '4' | '8'

const ZONE_LABEL_KEY = { both: 'meta.screen.zoneBoth', main: 'meta.screen.zoneMain', side: 'meta.screen.zoneSide' } as const satisfies Record<MetaZone, string>
const WINDOW_WEEKS: readonly WindowWeeks[] = ['2', '4', '8']
const LISTS: readonly MetaList[] = ['handtrap', 'deck', 'boardbreaker']
const LIST_LABEL_KEY = { handtrap: 'meta.list.handtrap', deck: 'meta.list.deck', boardbreaker: 'meta.list.boardbreaker' } as const satisfies Record<MetaList, string>
const LIST_TITLE_KEY = { handtrap: 'meta.list.handtrapTitle', deck: 'meta.list.deckTitle', boardbreaker: 'meta.list.boardbreakerTitle' } as const satisfies Record<MetaList, string>
const LIST_THINGS_KEY = { handtrap: 'meta.list.handtrapThings', deck: 'meta.list.deckThings', boardbreaker: 'meta.list.boardbreakerThings' } as const satisfies Record<MetaList, string>
const LIST_ICON: Record<MetaList, IconName> = { handtrap: 'hand', deck: 'layers', boardbreaker: 'target' }

/** Pasa a otra pantalla por el hash: el armazón cambia de paso y "Atrás" vuelve al tier list. */
function goTo(hash: string): void {
  window.location.hash = hash
}

export function TierListsScreen() {
  const deckFormat = useAppSelector((state) => state.settings.deckFormat)
  const isDesktop = useMediaQuery(DESKTOP_DECK_BUILDER_MEDIA_QUERY)
  const [adjustOpen, setAdjustOpen] = useState(false)
  // Arranca en la región del formato del builder; después se cambia desde el encabezado (y vale también para los decks de torneo).
  const region = useMetaRegion(deckFormat === 'ocg' ? 'ocg' : 'tcg')
  const [list, setList] = useState<MetaList>(() => readTierListHash(window.location.hash))
  const [zone, setZone] = useState<MetaZone>('both')
  const [weeks, setWeeks] = useState<WindowWeeks>('4')
  const [view, setView] = useState<BoardView>('now')
  const [selectedCard, setSelectedCard] = useState<MetaCardStat | null>(null)
  const [selectedDeckTier, setSelectedDeckTier] = useState<DeckTierStat | null>(null)
  // Un resultado del deck abierto: el deck entero se ve encima del detalle del tier list, y al cerrarlo se vuelve a él.
  const [selectedDeck, setSelectedDeck] = useState<MetaDeck | null>(null)

  const isDeckList = list === 'deck'
  const cardReport = useMemo(() => (isDeckList ? null : buildMetaReport(META_DECKS, region, zone, Number(weeks), list)), [isDeckList, region, zone, weeks, list])
  const deckReport = useMemo(() => (isDeckList ? buildDeckTierReport(META_DECKS, region, Number(weeks)) : null), [isDeckList, region, weeks])
  const deckCount = (cardReport ?? deckReport)?.deckCount ?? 0
  const cardRows = useMemo(() => groupByTier(cardReport?.cards ?? [], view), [cardReport, view])
  const deckRows = useMemo(() => groupByTier(deckReport?.decks ?? [], view), [deckReport, view])
  const isEmpty = (cardReport?.cards.length ?? deckReport?.decks.length ?? 0) === 0
  const floors = isDeckList ? DECK_TIER_FLOORS : TIER_FLOORS
  const ahead = formatInteger(PROJECTION_WEEKS)
  const totalWeeks = Math.ceil(META_DECKS.windowDays / 7)
  const zoneOptions = (Object.keys(ZONE_LABEL_KEY) as MetaZone[]).map((value) => ({ value, label: t(ZONE_LABEL_KEY[value]) }))
  const windowOptions = WINDOW_WEEKS.map((value) => ({ value, label: t('meta.screen.weeksOption', { count: value }) }))
  const viewOptions: ReadonlyArray<{ value: BoardView; label: string }> = [
    { value: 'now', label: t('meta.screen.viewNow') },
    { value: 'projected', label: t('meta.screen.viewProjected') },
  ]
  const listOptions = LISTS.map((value) => ({ value, label: t(LIST_LABEL_KEY[value]) }))
  const descriptionParams = { count: deckCount, n: formatInteger(deckCount), region: region.toUpperCase(), weeks, ahead }
  const description = isDeckList
    ? t(view === 'projected' ? 'meta.screen.deckProjected' : 'meta.screen.deckNow', descriptionParams)
    : t(view === 'projected' ? 'meta.screen.tierProjected' : 'meta.screen.tierNow', descriptionParams)

  const changeList = (next: MetaList) => {
    setList(next)
    window.history.replaceState(null, '', buildTierListHash(next))
  }

  const zoneControl = () => (
    <Segmented value={zone} onChange={setZone} options={zoneOptions} label={t('meta.screen.zoneLabel')} size="sm" fullWidth={!isDesktop} />
  )
  const weeksControl = () => (
    <Segmented value={weeks} onChange={setWeeks} options={windowOptions} label={t('meta.screen.weeksLabel')} size="sm" fullWidth={!isDesktop} />
  )
  const viewControl = () => (
    <Segmented value={view} onChange={setView} options={viewOptions} label={t('meta.screen.viewLabel', { ahead })} size="sm" fullWidth={!isDesktop} />
  )

  return (
    <StepPage as="article">
      <StepHero
        title={t('meta.screen.title')}
        icon="chart"
        subtitle={t('meta.screen.subtitle')}
        help={<TierListHelp list={list} floors={floors} totalWeeks={totalWeeks} />}
        side={<MetaHeroSide region={region} onRegionChange={setMetaRegion} />}
      />

      <Segmented value={list} onChange={changeList} options={listOptions} label={t('meta.screen.listLabel')} fullWidth={!isDesktop} className="min-[1101px]:min-w-[26rem]" />

      <Card>
        <SectionHeader
          icon={LIST_ICON[list]}
          title={t(LIST_TITLE_KEY[list])}
          description={description}
          actions={
            isDesktop ? (
              // Cada control lleva su rótulo: "2 sem." (cuántos decks se cuentan) y la proyección no se confunden.
              <div className="flex flex-wrap items-end gap-2">
                {isDeckList ? null : <ControlField label={t('meta.screen.fieldCount')}>{zoneControl()}</ControlField>}
                <ControlField label={t('meta.screen.fieldWeeks')}>{weeksControl()}</ControlField>
                <ControlField label={t('meta.screen.fieldView')}>{viewControl()}</ControlField>
              </div>
            ) : (
              // En celular se ve lo que más se usa (hoy o proyección) y el resto, que casi no se toca, va en un modal.
              <div className="flex w-full items-center gap-2">
                <div className="min-w-0 flex-1">{viewControl()}</div>
                <IconButton tone="raised" size="md" aria-label={t('meta.screen.adjust')} title={t('meta.screen.adjust')} onClick={() => setAdjustOpen(true)}>
                  <Icon name="sliders" size={20} />
                </IconButton>
              </div>
            )
          }
        />
        {deckCount > 0 && deckCount < MIN_RELIABLE_DECKS ? (
          // Con pocos decks cada uno pesa varios puntos y casi todo cae en S: se dice, en lugar de dejar que parezca un error.
          <Callout tone="warning" className="mt-3">
            {t('meta.screen.lowSample', { n: formatInteger(deckCount), region: region.toUpperCase() })}
          </Callout>
        ) : null}
        {isEmpty ? (
          <EmptyState icon={LIST_ICON[list]} title={t('meta.screen.emptyTitle', { things: t(LIST_THINGS_KEY[list]) })}>
            {t(isDeckList ? 'meta.screen.emptyDecksHint' : 'meta.screen.emptyHint')}
          </EmptyState>
        ) : deckReport ? (
          <TierBoard
            layout="decks"
            floors={floors}
            rows={deckRows.map(({ tier, items }) => ({
              tier,
              tiles: items.map((stat) => ({
                key: stat.name,
                tile: <DeckTile stat={stat} share={view === 'projected' ? stat.projectedShare : stat.share} onOpen={setSelectedDeckTier} />,
              })),
            }))}
          />
        ) : (
          <TierBoard
            layout="cards"
            floors={floors}
            rows={cardRows.map(({ tier, items }) => ({
              tier,
              tiles: items.map((stat) => ({
                key: String(stat.id),
                tile: <CardTile stat={stat} share={view === 'projected' ? stat.projectedShare : stat.share} onOpen={setSelectedCard} />,
              })),
            }))}
          />
        )}
      </Card>

      <Modal
        isOpen={adjustOpen && !isDesktop}
        onClose={() => setAdjustOpen(false)}
        size="sm"
        icon="sliders"
        title={t('meta.screen.adjust')}
        footer={
          <Button variant="primary" size="sm" onClick={() => setAdjustOpen(false)}>
            {t('meta.screen.adjustDone')}
          </Button>
        }
      >
        <div className="grid gap-4">
          {isDeckList ? null : <ControlField label={t('meta.screen.fieldCount')}>{zoneControl()}</ControlField>}
          <ControlField label={t('meta.screen.fieldWeeks')}>{weeksControl()}</ControlField>
        </div>
      </Modal>

      <MetaCardModal
        stat={selectedCard}
        onClose={() => setSelectedCard(null)}
        onPickArchetype={(name) => goTo(buildTournamentsHash({ archetype: name }))}
        onShowDecks={(cardId) => goTo(buildTournamentsHash({ card: cardId }))}
      />
      <DeckTierModal
        stat={selectedDeckTier}
        onClose={() => setSelectedDeckTier(null)}
        onOpenDeck={setSelectedDeck}
        onShowDecks={(name) => goTo(buildTournamentsHash({ archetype: name }))}
      />
      <MetaDeckModal deck={selectedDeck} onClose={() => setSelectedDeck(null)} onOpenDeck={setSelectedDeck} />
    </StepPage>
  )
}

/** Un control con su rótulo chico arriba: dice qué elige cada selector sin que haya que adivinarlo. */
function ControlField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className={cx(overline, 'px-0.5')}>{label}</span>
      {children}
    </div>
  )
}

interface TierListHelpProps {
  list: MetaList
  floors: ReadonlyArray<readonly [MetaTier, number]>
  totalWeeks: number
}

/** Cómo se arma el tier list que se está viendo y cómo se predice (cada viñeta es un mensaje: los números van de parámetro). */
function TierListHelp({ list, floors, totalWeeks }: TierListHelpProps) {
  const ahead = formatInteger(PROJECTION_WEEKS)
  const rule =
    list === 'deck'
      ? t('meta.help.deck', { min: formatInteger(MIN_TIER_DECKS) })
      : t(list === 'handtrap' ? 'meta.help.handtrap' : 'meta.help.boardbreaker')

  return (
    <div className="grid gap-3">
      <div className="grid gap-1">
        <strong className="text-foreground">{t('meta.help.buildTitle')}</strong>
        <ul className="m-0 grid list-disc gap-1 pl-4">
          <li>{t('meta.help.build1')}</li>
          <li>{rule}</li>
          {list === 'deck' ? null : <li>{t('meta.help.cards')}</li>}
          <li>
            {[
              ...floors.map(([tier, floor]) => t('meta.help.tierAtLeast', { tier: tierLabel(tier), percent: percent(floor) })),
              t('meta.help.tierBelow', { tier: tierLabel('D'), percent: percent(floors.at(-1)?.[1] ?? 0) }),
            ].join(' · ')}
          </li>
        </ul>
      </div>
      <div className="grid gap-1">
        <strong className="text-foreground">{t('meta.help.predictTitle')}</strong>
        <ul className="m-0 grid list-disc gap-1 pl-4">
          <li>{t('meta.help.predict1', { weeks: formatInteger(totalWeeks), ahead })}</li>
          <li>{t('meta.help.predict2', { points: formatInteger(Math.round(TREND_THRESHOLD * 100)) })}</li>
          <li>{t('meta.help.predict3', { ahead })}</li>
        </ul>
      </div>
    </div>
  )
}
