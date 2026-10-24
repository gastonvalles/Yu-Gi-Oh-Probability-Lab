import { getDeckFormatLabel } from '../../app/deck-format'
import type { DuelSettings } from '../../app/duel-protocol'
import { MAX_SPECTATORS } from '../../app/duel-relay-rules'
import { GENESYS_POINT_CAP } from '../../app/genesys-format'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Icon, type IconName } from '../ui/Icon'
import { TONE } from '../ui/tone'

interface RoomRulesProps {
  settings: DuelSettings
  /** Si la sala figura en la arena: sólo lo sabe el anfitrión (y sólo con la lista de salas); `null` si no se sabe. */
  isPublic: boolean | null
  /** Cuántas personas miran ahora (las dos que juegan lo ven); sin dato (quien mira no lo sabe), la fila no va. */
  watchers?: number
  /** Dentro de otra tarjeta (la columna de la sala, arriba del deck): sin caja propia y con el título sólo para el lector de pantalla. */
  bare?: boolean
}

/**
 * Las reglas de la sala en una ficha, en un solo lugar y a la vista de los dos jugadores: cómo se juega (tipo, formato, tiempo, y las vidas y la mano sólo si no son las de TCG y OCG), quién puede entrar y cuántos miran.
 * Reemplaza a las pastillas y a las frases sueltas de antes: cada dato se dice una sola vez. Dentro de la sala, ancha (columna de la izquierda), es una lista de renglones —el rótulo a la izquierda y el dato a la derecha, con una línea fina
 * entre uno y otro, como la lista de reglas de la sala de otro simulador—; angosta (celular), los datos se acomodan en renglones, cada uno al lado de su rótulo: la sala tiene que entrar en la pantalla sin scroll.
 */
export function RoomRules({ settings, isPublic, watchers, bare = false }: RoomRulesProps) {
  // Lo que tiene que ver con quien mira lleva un ojo (el tercer dato de la fila).
  const rows: ReadonlyArray<readonly [string, string, IconName?]> = [
    // Con reglas automáticas el núcleo aplica las reglas por los dos: va primero, es lo que más cambia el duelo.
    ...(settings.auto ? ([[t('duel.rules.title'), t('duel.auto.rulesRow')]] as const) : []),
    [t('duel.rules.type'), settings.match ? t('duel.rooms.match') : t('duel.rooms.single')],
    ...(settings.match && settings.siding ? ([[t('duel.rules.siding'), t('duel.rules.yes')]] as const) : []),
    [t('duel.rules.format'), getDeckFormatLabel(settings.format)],
    ...(settings.format === 'genesys' ? ([[t('duel.create.genesysCap'), t('duel.rooms.genesysCap', { points: settings.genesysCap ?? GENESYS_POINT_CAP })]] as const) : []),
    [t('duel.rules.time'), settings.limitMin > 0 ? t('duel.rooms.limit', { min: settings.limitMin }) : t('duel.rooms.noLimit')],
    [t('duel.rules.turn'), (settings.turnMin ?? 0) > 0 ? t('duel.rules.turnValue', { bank: settings.turnMin ?? 0, bonus: settings.turnBonusMin ?? 0 }) : t('duel.rules.turnNone')],
    // La vida y la mano inicial no hace falta decirlas en TCG y OCG (siempre son las mismas); en los otros formatos sí.
    ...(settings.format === 'tcg' || settings.format === 'ocg' ? [] : ([[t('duel.rules.life'), String(settings.lp)], [t('duel.rules.hand'), String(settings.hand)]] as const)),
    ...(isPublic === null ? [] : ([[t('duel.create.visibility'), isPublic ? t('duel.create.public') : t('duel.create.private')]] as const)),
    // Una sala con reglas automáticas todavía no se puede mirar.
    ...(settings.auto
      ? ([[t('duel.auto.watchLabel'), t('duel.auto.watchUnavailable'), 'eye']] as const)
      : watchers === undefined
        ? []
        : ([[t('duel.rules.watching'), t('duel.rules.watchingValue', { count: watchers, max: MAX_SPECTATORS }), 'eye']] as const)),
  ]

  return (
    <section aria-label={t('duel.rules.title')} data-testid="room-summary" className={bare ? 'grid gap-2' : cx('grid gap-2 rounded-card border p-3', TONE.neutral.wash)}>
      <h3 className={cx('m-0 text-micro font-semibold uppercase text-soft', bare && 'sr-only')}>{t('duel.rules.title')}</h3>
      <dl className="m-0 flex flex-wrap gap-x-5 gap-y-1 @[46rem]:grid @[46rem]:gap-0 @[46rem]:divide-y @[46rem]:divide-border-subtle">
        {rows.map(([label, value, icon]) => (
          <div key={label} className="flex items-baseline gap-1.5 @[46rem]:justify-between @[46rem]:gap-3 @[46rem]:py-2">
            <dt className="inline-flex items-center gap-1 text-micro text-muted @[46rem]:text-body">
              {icon ? <Icon name={icon} size={12} /> : null}
              {label}
            </dt>
            <dd className="m-0 text-body font-semibold text-foreground @[46rem]:text-right">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
