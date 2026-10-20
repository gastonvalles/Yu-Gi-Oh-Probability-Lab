import { PHASES, type MatPhase } from '../../app/practice-mat'
import { t } from '../../i18n'
import { Button } from '../ui/Button'

/** Las cartas que pueden responder, por nombre y sin repetir: hasta dos y «y N más» (la mesa muestra cuáles brillan). */
export function respondersText(names: readonly string[]): string {
  const unique = [...new Set(names)]

  if (unique.length === 0) return ''
  if (unique.length === 1) return unique[0]!
  if (unique.length === 2) return t('practice.list.two', { head: unique[0]!, last: unique[1]! })

  return t('duel.pass.cardsMore', { list: unique.slice(0, 2).join(', '), count: unique.length - 2 })
}

interface PassPromptProps {
  /** Quien pregunta (el rival). */
  name: string
  /** La fase a la que quiere pasar. */
  phase: MatPhase
  /** Termina su turno (de la End Phase a la Draw Phase). */
  endsTurn: boolean
  /** Los nombres de mis cartas que pueden responder (`app/mat-responders.ts`); la mesa las muestra brillando. */
  responders: readonly string[]
  onAllow: () => void
  onDeny: () => void
}

/**
 * La pregunta del rival antes de pasar de fase («Ana quiere pasar a la Battle Phase. Podés responder con A y B.»), en el **medio de la pantalla** (Gastón, 2026-10-20: «esa notificación debe aparecer en el medio
 * de la pantalla, no arriba»; antes iba sobre la línea del registro, arriba, y en el celular se cortaba en «Ana quiere pasar a la Batt…»): es lo único que hay que contestar, así que se ve donde se mira y los dos botones
 * quedan al alcance. No es un diálogo: no tiene fondo que tape la mesa ni bloquea nada (las cartas que pueden responder siguen brillando abajo) y la mesa no se corre al aparecer (la pone `PracticeMat` encima, centrada
 * en su columna). Una principal (Dejar pasar) y lo que descarta sin caja (Jugar antes), a la izquierda.
 */
export function PassPrompt({ name, phase, endsTurn, responders, onAllow, onDeny }: PassPromptProps) {
  const phaseName = PHASES.find((entry) => entry.id === phase)?.name ?? phase
  const cards = respondersText(responders)
  const text = cards !== '' ? t(endsTurn ? 'duel.pass.askEndWith' : 'duel.pass.askWith', { name, phase: phaseName, cards }) : t(endsTurn ? 'duel.pass.askEnd' : 'duel.pass.ask', { name, phase: phaseName })

  return (
    <div role="status" data-prompt="passAsked" className="grid gap-3 rounded-card border border-info bg-card-background p-4 text-body text-foreground shadow-overlay motion-safe:animate-dialog-enter">
      <p className="m-0 font-semibold">{text}</p>
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onClick={onDeny}>
          {t('duel.pass.deny')}
        </Button>
        <Button variant="primary" onClick={onAllow}>
          {t('duel.pass.allow')}
        </Button>
      </div>
    </div>
  )
}
