import type { AskWhyView } from '../../app/auto/ask-why'
import { t } from '../../i18n'
import { CardArt } from '../CardArt'
import { cx } from '../ui/cx'
import { PLAYER_COLOR } from './player-color'

/**
 * Por qué se pregunta algo en el duelo automático (`ask-why.ts`): una línea chica con la miniatura de la carta, su eslabón (con dos o más, del color de quien lo activó) y «Costo de …»,
 * «Al activar …» o «Efecto de …». Lo mínimo para decidir: nunca el texto del efecto; el nombre se corta con «…» si no entra y queda entero para el lector de pantalla (`id`: el cartel
 * lo suma a su descripción). Va con el título de todo cartel de una pregunta del núcleo: el de la mesa al elegir cartas o una casilla, el visor de una pila, la banda y la hoja de
 * elegir cartas, las opciones, los contadores y el sí o no. Sin dato, no se dibuja (quien la usa no la pone).
 */
export function AskWhy({ why, id, className }: { why: AskWhyView; id?: string; className?: string }) {
  return (
    <span id={id} data-ask-why="" className={cx('flex min-w-0 items-center gap-1.5 text-micro font-semibold normal-case tracking-normal text-muted', className)}>
      <span aria-hidden="true" className="relative block aspect-[421/614] h-4 shrink-0 overflow-hidden bg-input">
        <CardArt remoteUrl={why.art} name={why.name} className="block h-full w-full object-cover" />
      </span>
      {why.link ? (
        <span className={cx('shrink-0 rounded-tag px-1 font-extrabold leading-tight tabular-nums', why.mine === undefined ? 'bg-surface-raised text-foreground' : PLAYER_COLOR[why.mine ? 'mine' : 'theirs'].fill)}>
          {t('auto.link.badge', { numbers: why.link })}
        </span>
      ) : null}
      {/* El espacio separa el eslabón del texto para el lector de pantalla (en la fila lo pone `gap`). */}{' '}
      <span className="min-w-0 truncate">{why.text}</span>
    </span>
  )
}
