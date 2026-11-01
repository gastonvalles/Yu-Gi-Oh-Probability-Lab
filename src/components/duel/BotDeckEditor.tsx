import { useState } from 'react'

import { banlistStatusLabel } from '../../app/banlists'
import { capOf, flexOptions, flexPairs, freeSlots, isValidFlex } from '../../app/bot-deck-edit'
import type { BotDeckList } from '../../app/bot-deck-lists'
import { botCopyLimit, botDeckMain, originalFlex, sameFlex } from '../../app/handtraps'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { cx } from '../ui/cx'
import { Heading } from '../ui/Heading'
import { Modal } from '../ui/Modal'
import { HandtrapPoolCard } from './HandtrapPool'

type Copies = Readonly<Record<number, number>>

const copiesOf = (pairs: readonly (readonly [number, number])[]): Copies => Object.fromEntries(pairs.map(([code, count]) => [code, count]))

interface BotDeckEditorProps {
  isOpen: boolean
  /** La lista original del bot (`bot-deck-lists.ts`). */
  list: BotDeckList
  /** Su cambio guardado (`HandtrapConfig.botFlex`); sin él, el original. */
  flex: readonly (readonly [number, number])[] | undefined
  onClose: () => void
  /** Lo elegido (la parte cambiable entera) o `null`: volvió al original. */
  onSave: (flex: [number, number][] | null) => void
}

/** El estado que se anota debajo de una carta, por lo que deja el banlist (3: ninguno). */
const STATUS_BY_LIMIT = ['forbidden', 'limited', 'semi-limited'] as const

/**
 * «Cambiar cartas» de un bot: sus ranuras libres (las copias de sus handtraps y staples, `BotDeckList.flex`) y las cartas que se pueden poner, cada una con su contador; el motor
 * no aparece (no se toca). Se cambia una por otra: bajar una deja una ranura libre y subir otra la ocupa, así el Main no cambia de tamaño; «Guardar» pide todas las ranuras llenas.
 * El contador de cada carta llega hasta lo que entra (`capOf`: el banlist de hoy por nombre, el del jugador). «Restaurar original» vuelve la hoja al mazo de la lista.
 */
export function BotDeckEditor({ isOpen, list, flex, onClose, onSave }: BotDeckEditorProps) {
  const saved = () => copiesOf(botDeckMain(list, flex) === list.main ? originalFlex(list) : flex!)
  const [draft, setDraft] = useState<Copies>(saved)
  const [wasOpen, setWasOpen] = useState(isOpen)

  // Cada vez que se abre arranca de lo guardado.
  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (isOpen) setDraft(saved())
  }

  const slots = originalFlex(list).reduce((sum, [, count]) => sum + count, 0)
  const free = freeSlots(list, draft)
  const pairs = flexPairs(draft)
  const original = sameFlex(pairs, originalFlex(list))
  const ready = free === 0 && isValidFlex(list, pairs)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={t('solo.edit.title')}
      subtitle={t('solo.edit.subtitle', { name: list.name })}
      footer={
        <div className="grid w-full gap-3">
          <p className={cx('m-0 text-micro', free > 0 ? 'text-warning' : 'text-soft')} role="status">
            {free > 0 ? t('solo.edit.missing', { count: free }) : t('solo.edit.full', { count: slots })}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {original ? null : (
              <Button variant="tertiary" icon="refresh" className="mr-auto" onClick={() => setDraft(copiesOf(originalFlex(list)))}>
                {t('solo.edit.restore')}
              </Button>
            )}
            <Button variant="tertiary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" disabled={!ready} onClick={() => onSave(original ? null : pairs)}>
              {t('solo.edit.save')}
            </Button>
          </div>
        </div>
      }
    >
      <section className="grid gap-3">
        <div className="grid gap-0.5">
          <Heading level="card" as="h3">
            {t('solo.edit.slots', { count: slots })}
          </Heading>
          <p className="m-0 text-micro text-soft">{t('solo.edit.hint')}</p>
        </div>
        <ul aria-label={t('solo.edit.list')} className="m-0 grid list-none gap-1 p-0 sm:grid-cols-2">
          {flexOptions(list).map((card) => {
            const status = STATUS_BY_LIMIT[botCopyLimit(list, card.id)]

            return (
              <HandtrapPoolCard
                key={card.id}
                card={card}
                copies={draft[card.id] ?? 0}
                max={capOf(list, draft, card.id)}
                onChange={(count) => setDraft((current) => ({ ...current, [card.id]: count }))}
                {...(status ? { note: t('solo.edit.banned', { status: banlistStatusLabel(status) }) } : {})}
              />
            )
          })}
        </ul>
      </section>
    </Modal>
  )
}
