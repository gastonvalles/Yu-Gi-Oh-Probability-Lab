import { useState } from 'react'

import { setAutoPref, useAutoPrefs } from '../../app/auto-prefs'
import { BOT_DECK_MENU, poolCount, rivalKindOf, withRival, type BotDeckInfo, type HandtrapConfig, type RivalKind } from '../../app/handtraps'
import { t } from '../../i18n'
import { Button } from '../ui/Button'
import { Modal } from '../ui/Modal'
import { Segmented } from '../ui/Segmented'
import { Switch } from '../ui/Switch'

/** Lo elegido: el rival y, con el bot, su mazo (el id de `BOT_DECK_MENU`). */
export interface RivalDraft {
  kind: RivalKind
  deck: string
}

const draftOf = (config: HandtrapConfig, decks: readonly BotDeckInfo[]): RivalDraft => ({ kind: rivalKindOf(config, decks), deck: decks.find((deck) => deck.id === config.botDeck)?.id ?? decks[0]?.id ?? '' })

/** La principal de la hoja del duelo: verbo y objeto, según el rival elegido. */
const PLAY = { passive: 'auto.rival.playPassive', handtraps: 'handtraps.picker.use', bot: 'auto.rival.playBot' } as const

interface RivalChoiceProps {
  value: RivalDraft
  onChange: (next: RivalDraft) => void
  /** Lo guardado del simulador: el resumen de las handtraps («3 en mano · de 9 cartas»). */
  config: HandtrapConfig
  /** «Elegir…» las handtraps: la pantalla abre su hoja (`HandtrapPicker`). */
  onChooseHandtraps: () => void
  /** Los mazos listos del bot; con uno solo no hay menú (Hick), con dos o más, «Cambiar mazo» abre la hoja. Sin ninguno, no se ofrece «Bot». */
  decks: readonly BotDeckInfo[]
  /** El nombre del campo arriba, en mayúsculas chicas (en la hoja del duelo ya lo dice el título). */
  labelled?: boolean
}

/**
 * «Rival: Pasivo · Handtraps · Bot» (una elección por fila) y, debajo, lo de cada uno: el pasivo dice que no juega; el de handtraps, cuántas tiene y «Elegir…»; el bot, su mazo con lo que es,
 * sus límites siempre a la vista y «Mostrar la mano del bot» (de dorso de entrada: su privacidad no está en juego, la tuya sí). La usa la hoja «Cambiar rival» del duelo (`RivalSheet`); antes
 * de jugar, el rival se elige en Solo (`SoloScreen`).
 */
export function RivalChoice({ value, onChange, config, onChooseHandtraps, decks, labelled = true }: RivalChoiceProps) {
  const prefs = useAutoPrefs()
  const [picking, setPicking] = useState(false)
  const deck = decks.find((one) => one.id === value.deck) ?? decks[0]
  const kinds: RivalKind[] = decks.length > 0 ? ['passive', 'handtraps', 'bot'] : ['passive', 'handtraps']
  const count = poolCount(config.picks)

  return (
    <div className="grid content-start gap-1.5">
      {labelled ? <span className="text-micro font-semibold uppercase text-soft">{t('auto.rival.label')}</span> : null}
      <Segmented<RivalKind> label={t('auto.rival.label')} fullWidth value={value.kind} onChange={(kind) => onChange({ ...value, kind })} options={kinds.map((kind) => ({ value: kind, label: t(`auto.rival.kind.${kind}`) }))} />
      {value.kind === 'passive' ? <p className="m-0 text-micro text-soft">{t('auto.rival.passive')}</p> : null}
      {value.kind === 'handtraps' ? (
        <div className="flex items-center justify-between gap-3">
          {/* Con menos cartas que la mano, la mano sale con todas: se dice lo que sale. */}
          <span className="min-w-0 text-micro text-soft">{t('handtraps.row.summary', { hand: Math.min(config.hand, count), count })}</span>
          <Button variant="secondary" size="sm" aria-label={t('handtraps.row.chooseLabel')} aria-haspopup="dialog" onClick={onChooseHandtraps}>
            {t('handtraps.row.choose')}
          </Button>
        </div>
      ) : null}
      {value.kind === 'bot' && deck ? (
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="grid min-w-0 gap-0.5">
              <span className="text-body font-semibold text-foreground">{deck.name}</span>
              <span className="text-micro text-soft">{t(deck.line)}</span>
            </span>
            {decks.length > 1 ? (
              <Button variant="secondary" size="sm" aria-haspopup="dialog" onClick={() => setPicking(true)}>
                {t('auto.rival.deckChange')}
              </Button>
            ) : null}
          </div>
          <p className="m-0 text-micro text-soft">{t('auto.rival.botLimits')}</p>
          <div className="flex items-center justify-between gap-3">
            <span className="grid min-w-0 gap-0.5">
              <span className="text-body font-semibold text-foreground">{t('auto.rival.botHand')}</span>
              <span className="text-micro text-soft">{t('auto.rival.botHandHint')}</span>
            </span>
            <Switch checked={prefs.botHand} onChange={(on) => setAutoPref('botHand', on)} label={t('auto.rival.botHand')} />
          </div>
        </div>
      ) : null}
      {decks.length > 1 ? (
        <Modal isOpen={picking} onClose={() => setPicking(false)} size="sm" title={t('auto.rival.deckTitle')}>
          <Segmented<string>
            variant="list"
            label={t('auto.rival.deckTitle')}
            fullWidth
            value={deck?.id ?? ''}
            onChange={(id) => {
              onChange({ kind: 'bot', deck: id })
              setPicking(false)
            }}
            options={decks.map((one) => ({ value: one.id, label: one.name, detail: t(one.line) }))}
          />
        </Modal>
      ) : null}
    </div>
  )
}

interface RivalSheetProps {
  isOpen: boolean
  config: HandtrapConfig
  onClose: () => void
  /** El rival elegido, ya armado (`withRival`): la pantalla lo guarda y arma el duelo de nuevo. */
  onApply: (next: HandtrapConfig) => void
  /** «Elegir…» las handtraps: la pantalla cierra ésta y abre la de las handtraps (que aplica sola). */
  onChooseHandtraps: () => void
  decks?: readonly BotDeckInfo[]
}

/**
 * «Cambiar rival» de «Opciones del duelo»: la misma elección, en una hoja que avisa que aplicar reinicia el duelo (como la de las handtraps), con «Cancelar» sin caja y la principal con verbo y
 * objeto («Jugar contra el bot»). Cada vez que se abre arranca de lo guardado.
 */
export function RivalSheet({ isOpen, config, onClose, onApply, onChooseHandtraps, decks = BOT_DECK_MENU }: RivalSheetProps) {
  const [draft, setDraft] = useState<RivalDraft>(() => draftOf(config, decks))
  const [wasOpen, setWasOpen] = useState(isOpen)

  if (wasOpen !== isOpen) {
    setWasOpen(isOpen)
    if (isOpen) setDraft(draftOf(config, decks))
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      veil={false}
      title={t('auto.rival.label')}
      footer={
        <div className="grid w-full gap-3">
          <p className="m-0 text-micro text-soft">{t('handtraps.picker.restarts')}</p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="tertiary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" onClick={() => onApply(withRival(config, draft.kind, draft.deck))}>
              {t(PLAY[draft.kind])}
            </Button>
          </div>
        </div>
      }
    >
      <RivalChoice value={draft} onChange={setDraft} config={config} decks={decks} onChooseHandtraps={onChooseHandtraps} labelled={false} />
    </Modal>
  )
}
