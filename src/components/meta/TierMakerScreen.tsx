import { useEffect, useState } from 'react'

import { canvasToPngBlob, renderTierListImage } from '../../app/tierlist-image'
import {
  MAX_LABEL,
  MAX_TIERS,
  TIER_PALETTE,
  addCards,
  addTier,
  countCards,
  moveCard,
  moveTier,
  readStore,
  removeCard,
  removeTier,
  resetPlacements,
  updateTier,
  writeStore,
  type MakerCard,
  type MakerList,
  type MakerStore,
  type Place,
} from '../../app/tierlist-maker'
import { downloadBlob } from '../../app/deck-image-export-download'
import { showToastMessage } from '../../app/use-toast-message'
import { t } from '../../i18n'
import { StepHero } from '../StepHero'
import { Button } from '../ui/Button'
import { FieldBox, fieldInline } from '../ui/FieldBox'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { StepPage } from '../ui/StepPage'
import { TierMakerAddCards } from './TierMakerAddCards'
import { TierMakerBoard } from './TierMakerBoard'

/** El nombre de la imagen descargada: `downloadBlob` le pone la extensión, así que sale `tier-list.png`. */
const IMAGE_NAME = 'tier-list'

/**
 * El creador de tier lists propias (Gastón, 2026-10-19: «debe haber una herramienta para hacer nuestras propias tierlists»): una lista con filas de nombre y color (S a F de arranque), las cartas que se eligen
 * (buscador o meta) repartidas entre ellas arrastrando o tocando, guardada en el navegador, y salida como imagen (PNG). La pantalla muestra y edita sólo la lista activa. La lógica (filas, movimientos, lo guardado) es
 * de `app/tierlist-maker.ts`; esto es la pantalla.
 */
export function TierMakerScreen() {
  const [store, setStore] = useState<MakerStore>(() => readStore(t('meta.maker.defaultTitle')))
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editingTier, setEditingTier] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const list = store.lists.find((candidate) => candidate.id === store.activeId) ?? (store.lists[0] as MakerList)

  useEffect(() => writeStore(store), [store])

  const update = (change: (current: MakerList) => MakerList) =>
    setStore((current) => ({ ...current, lists: current.lists.map((candidate) => (candidate.id === list.id ? change(candidate) : candidate)) }))
  const add = (cards: MakerCard[]) => {
    const before = countCards(list)
    const next = addCards(list, cards)
    const added = countCards(next) - before

    update(() => next)
    showToastMessage(added > 0 ? t('meta.maker.added', { count: added }) : t('meta.maker.nothingNew'), added > 0 ? 'success' : 'info')
  }
  const move = (cardId: number, to: Place, before?: number) => {
    update((current) => moveCard(current, cardId, to, before))
    setSelectedId(null)
  }
  const drop = (cardId: number) => {
    update((current) => removeCard(current, cardId))
    setSelectedId(null)
  }

  const ranked = list.tiers.reduce((sum, tier) => sum + tier.cards.length, 0)

  const download = async () => {
    if (ranked === 0) {
      showToastMessage(t('meta.maker.downloadEmpty'), 'info')

      return
    }

    setBusy(true)

    try {
      const blob = await canvasToPngBlob(await renderTierListImage(list))

      downloadBlob(blob, IMAGE_NAME, 'png')
    } catch {
      showToastMessage(t('meta.maker.downloadFailed'), 'error')
    } finally {
      setBusy(false)
    }
  }

  const editing = list.tiers.find((tier) => tier.id === editingTier) ?? null
  const tierIndex = editing ? list.tiers.indexOf(editing) : -1

  return (
    <StepPage as="article" wide>
      <StepHero
        title={t('meta.maker.title')}
        icon="sort"
        subtitle={t('meta.maker.subtitle')}
        help={
          <div className="grid gap-1">
            <strong className="text-foreground">{t('meta.maker.how')}</strong>
            <ul className="m-0 grid list-disc gap-1 pl-4">
              <li>{t('meta.maker.help1')}</li>
              <li>{t('meta.maker.help2')}</li>
              <li>{t('meta.maker.help3')}</li>
            </ul>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="tertiary" size="sm" disabled={ranked === 0} onClick={() => update(resetPlacements)}>
          {t('meta.maker.resetTiers')}
        </Button>
        <Button variant="primary" size="sm" icon="download" className="ml-auto" aria-busy={busy} disabled={busy} onClick={() => void download()}>
          {t('meta.maker.download')}
        </Button>
      </div>

      <div>
        <TierMakerBoard list={list} selectedId={selectedId} onSelect={setSelectedId} onMove={move} onRemoveCard={drop} onEditTier={setEditingTier} />
        {countCards(list) === 0 ? <p className="m-0 mt-3 text-micro text-soft">{t('meta.maker.emptyBoard')}</p> : null}
        <Button variant="tertiary" size="sm" icon="plus" className="mt-3" disabled={list.tiers.length >= MAX_TIERS} onClick={() => update((current) => addTier(current, t('meta.maker.newTierLabel')))}>
          {t('meta.maker.addTier')}
        </Button>
      </div>

      <TierMakerAddCards list={list} onAdd={add} />

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditingTier(null)}
        size="sm"
        icon="sort"
        title={t('meta.maker.tierEditTitle')}
        footer={
          <Button variant="primary" size="md" onClick={() => setEditingTier(null)}>
            {t('meta.maker.tierDone')}
          </Button>
        }
      >
        {editing ? (
          <div className="grid gap-4">
            <FieldBox>
              <input
                data-initial-focus=""
                aria-label={t('meta.maker.tierName')}
                placeholder={t('meta.maker.tierName')}
                maxLength={MAX_LABEL}
                value={editing.label}
                className={fieldInline}
                onChange={(event) => update((current) => updateTier(current, editing.id, { label: event.target.value }))}
              />
            </FieldBox>

            <div role="group" aria-label={t('meta.maker.tierColor')} className="flex flex-wrap gap-2">
              {TIER_PALETTE.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-pressed={editing.color === color}
                  aria-label={t('meta.maker.tierColorOption', { color })}
                  className="grid size-10 cursor-pointer place-items-center rounded-control border-0 text-accent-foreground focus-visible:outline-none focus-visible:shadow-focus aria-pressed:shadow-focus"
                  style={{ backgroundColor: color }}
                  onClick={() => update((current) => updateTier(current, editing.id, { color }))}
                >
                  {editing.color === color ? <Icon name="check" size={18} /> : null}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <IconButton tone="ghost" aria-label={t('meta.maker.tierUp')} title={t('meta.maker.tierUp')} disabled={tierIndex <= 0} onClick={() => update((current) => moveTier(current, editing.id, -1))}>
                <Icon name="chevron-up" />
              </IconButton>
              <IconButton tone="ghost" aria-label={t('meta.maker.tierDown')} title={t('meta.maker.tierDown')} disabled={tierIndex >= list.tiers.length - 1} onClick={() => update((current) => moveTier(current, editing.id, 1))}>
                <Icon name="chevron-down" />
              </IconButton>
              <Button
                variant="tertiary"
                size="sm"
                color="danger"
                icon="trash"
                className="ml-auto"
                onClick={() => {
                  update((current) => removeTier(current, editing.id))
                  setEditingTier(null)
                }}
              >
                {t('meta.maker.tierRemove')}
              </Button>
            </div>
            <p className="m-0 text-micro text-soft">{t('meta.maker.tierRemoveHint')}</p>
          </div>
        ) : null}
      </Modal>
    </StepPage>
  )
}
