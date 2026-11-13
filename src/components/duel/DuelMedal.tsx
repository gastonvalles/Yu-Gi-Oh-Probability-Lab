import { cx } from '../ui/cx'

/**
 * La placa del cartel del comienzo (el turno que te toca): un cuadrado plano, de esquinas rectas como la mesa, con su aro del mismo color separado un poco. El color dice
 * quién empieza: violeta si vas primero, lavanda si vas segundo; el texto va en carbón sobre lavanda y en blanco sobre violeta (4,5:1). Entra una vez (crece y se endereza,
 * 700 ms) y se queda quieta: nada gira ni brilla sin fin. Con `prefers-reduced-motion` aparece ya en su lugar. Es decorado (`aria-hidden`): el cartel lo dice con su título.
 */
export type MedalTone = 'first' | 'second'

const LOOK: Record<MedalTone, string> = {
  first: 'bg-primary text-primary-foreground outline-primary',
  second: 'bg-accent text-accent-foreground outline-accent',
}

interface DuelMedalProps {
  tone: MedalTone
  /** El número del turno. */
  numeral?: string
  className?: string
}

export function DuelMedal({ tone, numeral, className }: DuelMedalProps) {
  return (
    <div
      aria-hidden="true"
      data-medal={tone}
      className={cx('grid size-20 shrink-0 animate-plate-in place-content-center justify-items-center gap-1 p-2 outline-4 outline-offset-4 motion-reduce:animate-none min-[1101px]:size-28', LOOK[tone], className)}
    >
      {numeral ? <span className="text-display font-extrabold leading-none">{numeral}</span> : null}
    </div>
  )
}
