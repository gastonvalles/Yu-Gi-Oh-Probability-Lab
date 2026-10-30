import type { BotNote, SessionAnswer } from '../../app/auto/auto-session'
import { t, type MessageKey } from '../../i18n'
import { CardArt } from '../CardArt'
import { EmptyState } from '../ui/EmptyState'
import { ListGroup, ListRow } from '../ui/ListRow'
import { Modal } from '../ui/Modal'
import { overline } from '../ui/typography'

/** Los motivos del rival de un turno. `yours`: el turno era tuyo. */
export interface BotTurn {
  turn: number
  yours: boolean
  notes: BotNote[]
}

/**
 * Los motivos del rival automático por turno, en orden (`SessionAnswer.reason`). «Tenía y no la usé» va una vez por carta y por turno: el bot lo dice en cada ventana en que el núcleo
 * se la ofrece contra lo tuyo, y contarlo cada vez taparía lo que hizo. Lo que eligió seguido de su Extra Deck (los Sincros que revela Fydraulis Harmonia), en un solo renglón.
 */
const EXTRA = 'auto.bot.reason.cost.extra'

export function botTurns(answers: readonly SessionAnswer[]): BotTurn[] {
  const turns: BotTurn[] = []
  const told = new Set<string>()

  for (const { reason } of answers) {
    if (!reason) continue
    const hold = `${reason.turn}:${reason.cards?.[0] ?? 0}`

    if (reason.key.startsWith('auto.bot.reason.hold.')) {
      if (told.has(hold)) continue
      told.add(hold)
    }
    const last = turns.at(-1)
    const before = last?.turn === reason.turn ? last.notes.at(-1) : undefined

    if (before?.key === EXTRA && reason.key === EXTRA) last!.notes[last!.notes.length - 1] = { ...before, cards: [...(before.cards ?? []), ...(reason.cards ?? [])] }
    else if (last?.turn === reason.turn) last.notes.push(reason)
    else turns.push({ turn: reason.turn, yours: reason.yours, notes: [reason] })
  }
  return turns
}

/** La frase de un motivo, con las cartas por nombre: `{card}` es la primera y `{to}` la segunda (`BotReason`); `{count}`, cuántas nombra. */
export const botSentence = (note: BotNote, nameOf: (code: number) => string) =>
  t(note.key as MessageKey, { card: nameOf(note.cards?.[0] ?? 0), to: nameOf(note.cards?.[1] ?? 0), count: note.cards?.length ?? 0, ...note.params } as never)

interface BotLogProps {
  turns: readonly BotTurn[]
  /** El rival decide algo (el de handtraps); sin esto, el pasivo: no hay nada que contar. */
  deciding: boolean
  /** Rearmando el duelo (deshacer, reiniciar): la lista vuelve cuando termina. */
  loading?: boolean
  nameOf: (code: number) => string
  artOf: (code: number) => string | null
  /** Tocar un renglón: tu mesa en ese momento (el repaso de tus jugadas). Sin esto, los renglones no se tocan. */
  onPick?: (note: BotNote) => void
}

/**
 * «Qué hizo el bot y por qué», la lista (también la muestra de `/playground`): un bloque por turno («Turno 2 · bot») con un renglón por decisión, el arte de la carta y la frase entera,
 * y abajo el texto fijo de sus límites. Con el rival pasivo, y sin decisiones todavía, lo dice (`EmptyState`); rearmando, el esqueleto (`aria-busy`). Tocar un renglón (con `onPick`) lleva
 * tu mesa a ese momento: lo que sigue es del repaso («Volver al duelo»).
 */
export function BotLog({ turns, deciding, loading = false, nameOf, artOf, onPick }: BotLogProps) {
  const body = !deciding ? (
    <EmptyState icon="chat" title={t('auto.bot.log.passiveTitle')}>
      {t('auto.bot.log.passive')}
    </EmptyState>
  ) : loading ? (
    <ListGroup label={t('auto.bot.log.title')} loading />
  ) : turns.length === 0 ? (
    <EmptyState icon="chat" title={t('auto.bot.log.emptyTitle')}>
      {t('auto.bot.log.empty')}
    </EmptyState>
  ) : (
    <div className="grid gap-6">
      {turns.map((turn) => {
        const label = t(turn.yours ? 'auto.bot.log.turnYou' : 'auto.bot.log.turnBot', { turn: turn.turn })

        return (
          <section key={`${turn.turn}-${turn.notes[0]!.at}`} className="grid gap-2">
            <h3 className={overline}>{label}</h3>
            <ListGroup label={label}>
              {turn.notes.map((note, i) => {
                const code = note.cards?.[0] ?? 0
                const art = artOf(code)

                return (
                  <ListRow
                    key={i}
                    wrap
                    title={botSentence(note, nameOf)}
                    // Una carta: recta, como en las listas de decks. Su nombre ya va en la frase.
                    media={<span aria-hidden="true" className="block h-12 w-9 shrink-0 overflow-hidden bg-input">{art ? <CardArt remoteUrl={art} name={nameOf(code)} className="block size-full object-cover" /> : null}</span>}
                    {...(onPick ? { onClick: () => onPick(note) } : {})}
                  />
                )
              })}
            </ListGroup>
          </section>
        )
      })}
    </div>
  )

  return (
    <div className="grid gap-4">
      {deciding && !loading && turns.length > 0 && onPick ? <p className="m-0 text-body text-muted">{t('auto.bot.log.hint')}</p> : null}
      {body}
      <p className="m-0 text-micro text-soft">{t('auto.bot.log.limits')}</p>
    </div>
  )
}

/** La hoja de «Qué hizo el bot y por qué» (el final del duelo y «Opciones del duelo»): se lee después, sin tapar la mesa con carteles mientras se juega. */
export function BotLogSheet({ isOpen, onClose, ...props }: BotLogProps & { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="md" anchor="mat" title={t('auto.bot.log.title')}>
      <BotLog {...props} />
    </Modal>
  )
}
