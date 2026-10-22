import type { BuildSource } from '../../app/comparison-selection'
import { formatInteger } from '../../app/utils'
import { t } from '../../i18n'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { OverflowMenu } from '../ui/OverflowMenu'
import { listItem, listItemSelected } from '../ui/surfaces'
import type { SourceKind, SourceOption } from './build-sources'
import type { Side } from './comparison-rows'
import { SideBadge } from './SideBadge'

const OTHER: Record<Side, Side> = { A: 'B', B: 'A' }

const cardsText = (option: SourceOption) => t('meta.compare.source.cards', { count: option.zones.main.length, n: formatInteger(option.zones.main.length) })
const pendingText = (option: SourceOption) => t('meta.compare.source.pending', { n: formatInteger(option.pending) })

interface BuildPairProps {
  a: SourceOption
  b: SourceOption | null
  /** `stacked`: el celular, las dos en una caja, una debajo de la otra (el ⇅ va en la barra de abajo) · `row`: escritorio, dos chips con el ⇅ en el medio. */
  layout: 'stacked' | 'row'
  onPick: (side: Side) => void
  onSwap?: () => void
}

/** El par A/B: cada build en su chip (la insignia, el nombre y de dónde sale); tocar uno abre «Mis builds» para cambiarla. */
export function BuildPair({ a, b, layout, onPick, onSwap }: BuildPairProps) {
  const chip = (side: Side, option: SourceOption | null) => (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={option ? t('meta.compare.pick', { side, name: option.name }) : t('meta.compare.pickEmpty', { side })}
      onClick={() => onPick(side)}
      className={cx(
        'flex min-h-14 w-full min-w-0 cursor-pointer items-center gap-2.5 border-0 bg-transparent px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-none focus-visible:shadow-focus motion-reduce:transition-none',
        layout === 'row' ? 'rounded-control' : side === 'A' ? 'rounded-t-control' : 'rounded-b-control',
      )}
    >
      <SideBadge side={side} />
      <span className={cx('min-w-0 flex-1', layout === 'row' ? 'grid' : 'flex items-baseline gap-2')}>
        <span className={cx('truncate text-body font-semibold', option ? 'text-foreground' : 'text-muted', layout === 'stacked' && 'min-w-0 flex-1')}>
          {option ? option.name : t('meta.compare.pickPlaceholder')}
        </span>
        {option ? <span className={cx('truncate text-micro', option.pending > 0 ? 'text-warning-soft' : 'text-muted', layout === 'stacked' && 'max-w-[45%] shrink-0')}>{option.pending > 0 ? pendingText(option) : option.meta}</span> : null}
      </span>
      <Icon name="chevron-down" size={16} className="shrink-0 text-soft" />
    </button>
  )

  if (layout === 'stacked') {
    return (
      <div role="group" aria-label={t('meta.compare.pair')} className="grid divide-y divide-border-subtle rounded-control border border-border bg-input">
        {chip('A', a)}
        {chip('B', b)}
      </div>
    )
  }

  return (
    <div role="group" aria-label={t('meta.compare.pair')} className="flex min-w-0 items-center gap-1">
      <div className="w-60 min-w-0 rounded-control border border-border bg-input">{chip('A', a)}</div>
      {onSwap ? (
        <IconButton tone="ghost" aria-label={t('meta.compare.swap')} onClick={onSwap}>
          <Icon name="swap" />
        </IconButton>
      ) : null}
      <div className="w-60 min-w-0 rounded-control border border-border bg-input">{chip('B', b)}</div>
    </div>
  )
}

const KIND_ICON: Record<SourceKind, IconName> = { current: 'cards', 'deck-before': 'timer', draft: 'flask', saved: 'save' }

interface SourceSheetProps {
  /** Qué build se está eligiendo (`null`: cerrado). */
  side: Side | null
  options: readonly SourceOption[]
  selection: { a: BuildSource; b: BuildSource | null }
  onChoose: (side: Side, source: BuildSource) => void
  onRename: (option: SourceOption) => void
  onDelete: (option: SourceOption) => void
  onImport: () => void
  onSaveCurrent: () => void
  onClose: () => void
}

/**
 * «Mis builds»: de dónde puede salir A o B (tu deck, «Tu deck de antes», el borrador del Lab y las builds guardadas, con su origen, su fecha y sus cartas),
 * una por fila; la elegida con el aro ámbar y la del otro lado apagada. Elegir es un toque. Las builds guardadas se renombran y se borran desde sus tres puntos.
 * Es una hoja de abajo en el celular y un diálogo chico en escritorio (`Modal keypad`).
 */
export function SourceSheet({ side, options, selection, onChoose, onRename, onDelete, onImport, onSaveCurrent, onClose }: SourceSheetProps) {
  const shown = side ?? 'B'
  const chosen = shown === 'A' ? selection.a : selection.b
  const taken = shown === 'A' ? selection.b : selection.a

  return (
    <Modal
      isOpen={side !== null}
      onClose={onClose}
      size="keypad"
      title={t('meta.compare.picker.title')}
      subtitle={t('meta.compare.picker.subtitle', { side: shown })}
      footer={
        <>
          <Button variant="secondary" icon="upload" className="flex-1 whitespace-nowrap" onClick={onImport}>
            {t('meta.compare.import')}
          </Button>
          <Button variant="secondary" icon="save" className="flex-1 whitespace-nowrap" onClick={onSaveCurrent}>
            {t('meta.compare.saveCurrent')}
          </Button>
        </>
      }
    >
      <ul className="m-0 grid list-none gap-1 p-0">
        {options.map((option) => {
          const selected = option.source === chosen
          const other = option.source === taken
          const facts = [option.kind === 'current' ? option.deckName : option.meta, cardsText(option), ...(other ? [t('meta.compare.source.otherSide', { side: OTHER[shown] })] : [])].filter(Boolean)

          return (
            <li key={option.source} className="flex min-w-0 items-center gap-1">
              <button
                type="button"
                disabled={other}
                aria-current={selected ? 'true' : undefined}
                onClick={() => onChoose(shown, option.source)}
                className={cx(
                  'flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 border-0 px-3 py-2 text-left focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent',
                  listItem,
                  selected ? listItemSelected : 'bg-transparent',
                )}
              >
                {selected || other ? <SideBadge side={selected ? shown : OTHER[shown]} /> : <Icon name={KIND_ICON[option.kind]} size={20} className="mx-1 shrink-0 text-foreground" />}
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-body font-semibold text-foreground">{option.name}</span>
                  <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-micro text-muted">
                    <span className="min-w-0">{facts.join(' · ')}</span>
                    {option.pending > 0 ? (
                      <Badge tone="warning" size="sm">
                        {pendingText(option)}
                      </Badge>
                    ) : null}
                  </span>
                </span>
              </button>
              {option.kind === 'saved' ? (
                <OverflowMenu
                  label={t('meta.compare.picker.more', { name: option.name })}
                  items={[
                    { label: t('meta.compare.rename'), icon: 'pencil', onSelect: () => onRename(option) },
                    { label: t('common.delete'), icon: 'trash', onSelect: () => onDelete(option) },
                  ]}
                />
              ) : null}
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
