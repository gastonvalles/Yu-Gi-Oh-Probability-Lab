import { useEffect, useState } from 'react'

import { canvasToPngBlob, renderTierListImage } from '../../app/tierlist-image'
import {
  MAX_LABEL,
  MAX_TIERS,
  TIER_PALETTE,
  addCards,
  addTier,
  addTierAt,
  clearTier,
  countCards,
  moveCard,
  moveTierTo,
  prefersLightText,
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
import { cx } from '../ui/cx'
import { FieldBox, fieldInline } from '../ui/FieldBox'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Modal } from '../ui/Modal'
import { StepPage } from '../ui/StepPage'
import { TierMakerAddCards } from './TierMakerAddCards'
import { TierMakerBoard } from './TierMakerBoard'
import { labelInk } from './TierStrip'

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
  const full = list.tiers.length >= MAX_TIERS
  /** Lo que hacen los botones del menú de la fila: se ve en el tablero, así que el menú se cierra. */
  const editAndClose = (change: (current: MakerList) => MakerList) => {
    update(change)
    setEditingTier(null)
  }
  /** Al cerrar, el menú devuelve el foco al engranaje (o a la letra) que lo abrió; el de la fila quitada ya no está, así que pasa a la letra de la fila que quedó en su lugar (si no, se perdería en la página). */
  const removeEditing = (tierId: string) => {
    const next = list.tiers[tierIndex + 1] ?? list.tiers[tierIndex - 1]

    editAndClose((current) => removeTier(current, tierId))

    if (next) requestAnimationFrame(() => [...document.querySelectorAll<HTMLElement>('[data-tier-row]')].find((box) => box.dataset.tierRow === next.id)?.querySelector<HTMLElement>('button')?.focus())
  }

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

      {/* `justify-between` y no `ml-auto`: si en el celular no entran juntos, los dos quedan alineados a la izquierda, uno abajo del otro (con `ml-auto`, «Descargar imagen» bajaba sola a la derecha). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="tertiary" size="sm" disabled={ranked === 0} onClick={() => update(resetPlacements)}>
          {t('meta.maker.resetTiers')}
        </Button>
        <Button variant="primary" size="sm" icon="download" aria-busy={busy} disabled={busy} onClick={() => void download()}>
          {t('meta.maker.download')}
        </Button>
      </div>

      <div>
        <TierMakerBoard
          list={list}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onMove={move}
          onRemoveCard={drop}
          onEditTier={setEditingTier}
          onMoveTier={(tierId, index) => update((current) => moveTierTo(current, tierId, index))}
        >
          {/* Antes de «Sin clasificar», pegados a las filas (Gastón, 2026-10-21). Quitar saca la última: sus cartas vuelven a «Sin clasificar», así que no se pregunta. */}
          <div className="mt-1 flex flex-wrap items-center gap-1">
            <Button variant="tertiary" size="sm" icon="plus" disabled={list.tiers.length >= MAX_TIERS} onClick={() => update((current) => addTier(current, t('meta.maker.newTierLabel')))}>
              {t('meta.maker.addTier')}
            </Button>
            <Button variant="tertiary" size="sm" icon="minus" disabled={list.tiers.length === 0} onClick={() => update((current) => removeTier(current, current.tiers.at(-1)?.id ?? ''))}>
              {t('meta.maker.removeTier')}
            </Button>
          </div>
        </TierMakerBoard>
        {countCards(list) === 0 ? <p className="m-0 mt-3 text-micro text-soft">{t('meta.maker.emptyBoard')}</p> : null}
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

            {/* Dos renglones de siete círculos en todos los tamaños: a 390 px no entran catorce de 44 px en uno. El elegido, con el aro ámbar y la tilde. */}
            <div role="group" aria-label={t('meta.maker.tierColor')} className="grid grid-cols-7 justify-items-center gap-1">
              {TIER_PALETTE.map((color) => (
                <IconButton
                  key={color}
                  tone="swatch"
                  aria-pressed={editing.color === color}
                  aria-label={t('meta.maker.tierColorOption', { color })}
                  // El gris oscuro casi no se distingue del panel: lleva un filo lavanda, y su tilde va clara.
                  className={cx(labelInk(color), prefersLightText(color) && 'inset-ring inset-ring-tint/50')}
                  style={{ backgroundColor: color }}
                  onClick={() => update((current) => updateTier(current, editing.id, { color }))}
                >
                  {editing.color === color ? <Icon name="check" strokeWidth={2.5} /> : null}
                </IconButton>
              ))}
            </div>

            {/* Lo que se hace con la fila, de a dos: agregar (arriba o abajo) y sacar sus cartas o la fila entera. En el celular, uno abajo del otro. */}
            <div className="grid gap-2">
              <div className="grid gap-2 sm:grid-cols-2">
                <Button size="sm" icon="plus" disabled={full} onClick={() => editAndClose((current) => addTierAt(current, tierIndex, t('meta.maker.newTierLabel')))}>
                  {t('meta.maker.tierAddAbove')}
                </Button>
                <Button size="sm" icon="plus" disabled={full} onClick={() => editAndClose((current) => addTierAt(current, tierIndex + 1, t('meta.maker.newTierLabel')))}>
                  {t('meta.maker.tierAddBelow')}
                </Button>
                {/* El ícono de «Sin clasificar» (el de su recuadro en el celular): es a donde van las cartas. */}
                <Button size="sm" icon="cards" disabled={editing.cards.length === 0} onClick={() => editAndClose((current) => clearTier(current, editing.id))}>
                  {t('meta.maker.tierClear')}
                </Button>
                <Button size="sm" color="danger" icon="trash" onClick={() => removeEditing(editing.id)}>
                  {t('meta.maker.tierRemove')}
                </Button>
              </div>
              {/* Por qué no se puede agregar: los dos botones de arriba están apagados. */}
              {full ? <p className="m-0 text-micro text-warning-soft">{t('meta.maker.tierMax', { max: MAX_TIERS })}</p> : null}
              <p className="m-0 text-micro text-soft">{t('meta.maker.tierRemoveHint')}</p>
            </div>
          </div>
        ) : null}
      </Modal>
    </StepPage>
  )
}
