import { formatInteger } from '../../app/utils'
import { cx } from './cx'
import { choiceChip } from './surfaces'

/** Un chip de filtro: su nombre y cuántos elementos tiene. */
export interface FilterChip {
  key: string
  name: string
  count: number
  active: boolean
  onToggle: () => void
  /** No se puede elegir (no tiene ninguno con lo demás que está filtrado) pero sigue en su lugar: la fila no cambia de forma al buscar. */
  disabled?: boolean
}

interface FilterChipsProps {
  /** El nombre del grupo para lectores de pantalla. */
  label: string
  /** El chip que apaga los filtros («Todas», «Todos»). Sin él (`all` no se pasa), la fila son sólo interruptores independientes. */
  all?: string
  allActive?: boolean
  onAll?: () => void
  chips: FilterChip[]
  /** wrap (por defecto): los chips se acomodan en los renglones que hagan falta en escritorio · scroll: una sola fila que no se parte, del tamaño de las pastillas de los replays (va dentro de un `ScrollRow`). */
  variant?: 'wrap' | 'scroll'
}

/**
 * La fila de chips para filtrar: uno que apaga los filtros y después un chip por cada valor, cada uno con su cuenta. Elegir uno lo enciende (`aria-pressed`: ámbar, como
 * todo lo elegido) y tocarlo de nuevo lo apaga; si se pueden elegir varios lo decide quien la usa. Lo usan Expansiones (rarezas y artes) y los decks de torneo (puestos).
 * En escritorio los chips se acomodan en los renglones que hagan falta; hasta 1100 px van en una sola fila que se desliza (con 44 px de alto, en tres renglones ocuparían media pantalla).
 */
export function FilterChips({ label, all, allActive, onAll, chips, variant = 'wrap' }: FilterChipsProps) {
  const scroll = variant === 'scroll'
  const chipClass = cx(choiceChip, 'shrink-0 gap-1.5 disabled:pointer-events-none disabled:opacity-40', scroll ? 'min-h-10 px-4 text-body pointer-coarse:min-h-11' : 'h-7 px-2.5 text-micro pointer-coarse:h-11')

  if (scroll) {
    return (
      <div role="group" aria-label={label} className="flex w-max shrink-0 gap-2">
        {all !== undefined && onAll ? (
          <button type="button" aria-pressed={allActive} className={chipClass} onClick={onAll}>
            {all}
          </button>
        ) : null}
        {chips.map((chip) => (
          <button key={chip.key} type="button" aria-pressed={chip.active} aria-label={`${chip.name} ${chip.count}`} disabled={chip.disabled} className={chipClass} onClick={chip.onToggle}>
            {chip.name}
            <span className="text-micro tabular-nums opacity-70">{formatInteger(chip.count)}</span>
          </button>
        ))}
      </div>
    )
  }

  // El `py-1` con `-my-1` deja lugar al anillo de foco, que el `overflow` de la fila deslizable recortaría.
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5 max-[1101px]:-my-1 max-[1101px]:flex-nowrap max-[1101px]:overflow-x-auto max-[1101px]:py-1 max-[1101px]:[scrollbar-width:none] max-[1101px]:[&::-webkit-scrollbar]:hidden">
      {all !== undefined && onAll ? (
        <button type="button" aria-pressed={allActive} className={chipClass} onClick={onAll}>
          {all}
        </button>
      ) : null}
      {chips.map((chip) => (
        <button key={chip.key} type="button" aria-pressed={chip.active} aria-label={`${chip.name} ${chip.count}`} disabled={chip.disabled} className={chipClass} onClick={chip.onToggle}>
          {chip.name}
          {/* La cuenta, un poco más tenue que el nombre: con la opacidad se lee sobre la lavanda (8,2:1) y sobre el magenta del elegido. */}
          <span className="tabular-nums opacity-70">{formatInteger(chip.count)}</span>
        </button>
      ))}
    </div>
  )
}
