import { MIN_WEEK_DECKS, PROJECTION_WEEKS, type HandtrapStat } from '../../app/meta-handtraps'
import { formatInteger } from '../../app/utils'
import { CardArt } from '../CardArt'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Modal } from '../ui/Modal'
import { ProgressRing } from '../ui/ProgressRing'
import { choiceChip } from '../ui/surfaces'
import { overline } from '../ui/typography'
import { HANDTRAP_RGB, TREND_LOOK, percent, tierLabel, trendText, usageText } from './meta-format'

const MAX_ARCHETYPE_CHIPS = 16

interface HandtrapModalProps {
  stat: HandtrapStat | null
  onClose: () => void
  onPickArchetype: (name: string) => void
  onShowDecks: (cardId: number) => void
}

/** Detalle de una hand trap del tier list: uso por zona, tendencia y los decks que la juegan. */
export function HandtrapModal({ stat, onClose, onPickArchetype, onShowDecks }: HandtrapModalProps) {
  if (!stat) {
    return null
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="md"
      icon="hand"
      title={stat.name}
      subtitle={`${tierLabel(stat.tier)} · ${percent(stat.share)} de los decks (${formatInteger(stat.decks)})`}
      footer={
        <Button variant="primary" size="sm" icon="layers" onClick={() => onShowDecks(stat.id)}>
          Ver los decks que la juegan
        </Button>
      }
    >
      <div className="grid gap-5">
        <div className="flex flex-wrap items-center gap-5">
          <span className="aspect-[421/614] w-24 shrink-0 overflow-hidden rounded-tag bg-input">
            <CardArt remoteUrl={stat.image} name={stat.name} className="h-full w-full object-cover" />
          </span>
          <ProgressRing value={stat.share} color={HANDTRAP_RGB} size={76} label={`${percent(stat.share)} de los decks la juegan`} />
          <dl className="m-0 grid gap-2 text-body tabular-nums">
            <div className="grid gap-0.5">
              <dt className={overline}>Main</dt>
              <dd className="m-0 text-foreground">{usageText(stat.main.decks, stat.main.copies, stat.decks)}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className={overline}>Side</dt>
              <dd className="m-0 text-foreground">{usageText(stat.side.decks, stat.side.copies, stat.decks)}</dd>
            </div>
          </dl>
        </div>

        <div className="grid gap-1.5">
          <span className={overline}>Tendencia</span>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TREND_LOOK[stat.trend].tone}>{trendText(stat)}</Badge>
            <span className="text-micro text-muted">Proyección a {formatInteger(PROJECTION_WEEKS)} semanas.</span>
          </div>
          {/* Una semana con pocos decks se muestra vacía: tampoco pesa en la tendencia. */}
          <p className="m-0 text-micro text-muted tabular-nums" title="De la semana más vieja a la más nueva">
            Semana a semana: {stat.weekly.map((week) => (week.decks >= MIN_WEEK_DECKS ? percent(week.share) : '—')).join(' · ')}
          </p>
        </div>

        <div className="grid gap-1.5">
          <span className={overline}>Decks que la juegan</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {stat.archetypes.slice(0, MAX_ARCHETYPE_CHIPS).map((archetype) => (
              <button
                key={archetype.name}
                type="button"
                className={cx(choiceChip, 'h-8 gap-1.5 px-3 text-micro')}
                title={`Ver sólo los decks ${archetype.name}`}
                onClick={() => onPickArchetype(archetype.name)}
              >
                {archetype.name}
                <span className="font-medium text-soft tabular-nums">
                  {formatInteger(archetype.decks)}/{formatInteger(archetype.total)}
                </span>
              </button>
            ))}
            {stat.archetypes.length > MAX_ARCHETYPE_CHIPS ? (
              <span className="text-micro text-soft">+{formatInteger(stat.archetypes.length - MAX_ARCHETYPE_CHIPS)} más</span>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  )
}
