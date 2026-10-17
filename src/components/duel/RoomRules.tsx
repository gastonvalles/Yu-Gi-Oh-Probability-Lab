import { getDeckFormatLabel } from '../../app/deck-format'
import type { DuelSettings } from '../../app/duel-protocol'
import { MAX_SPECTATORS } from '../../app/duel-relay-rules'
import { GENESYS_POINT_CAP } from '../../app/genesys-format'
import { t } from '../../i18n'

interface RoomRulesProps {
  settings: DuelSettings
  /** Si la sala figura en la arena: sólo lo sabe el anfitrión (y sólo con la lista de salas); `null` si no se sabe. */
  isPublic: boolean | null
  /** Cuántas personas miran ahora (las dos que juegan lo ven); sin dato (quien mira no lo sabe), la fila no va. */
  watchers?: number
}

/**
 * Las reglas de la sala en una ficha, en un solo lugar y a la vista de los dos jugadores: cómo se juega (tipo, formato, tiempo, vidas, mano), quién puede entrar y cuántos miran.
 * Reemplaza a las pastillas y a las frases sueltas de antes: cada dato se dice una sola vez.
 */
export function RoomRules({ settings, isPublic, watchers }: RoomRulesProps) {
  const rows: ReadonlyArray<readonly [string, string]> = [
    [t('duel.rules.type'), settings.match ? t('duel.rooms.match') : t('duel.rooms.single')],
    ...(settings.match && settings.siding ? ([[t('duel.rules.siding'), t('duel.rules.yes')]] as const) : []),
    [t('duel.rules.format'), getDeckFormatLabel(settings.format)],
    ...(settings.format === 'genesys' ? ([[t('duel.create.genesysCap'), t('duel.rooms.genesysCap', { points: settings.genesysCap ?? GENESYS_POINT_CAP })]] as const) : []),
    [t('duel.rules.time'), settings.limitMin > 0 ? t('duel.rooms.limit', { min: settings.limitMin }) : t('duel.rooms.noLimit')],
    [t('duel.rules.life'), String(settings.lp)],
    [t('duel.rules.hand'), String(settings.hand)],
    ...(isPublic === null ? [] : ([[t('duel.create.visibility'), isPublic ? t('duel.create.public') : t('duel.create.private')]] as const)),
    ...(watchers === undefined ? [] : ([[t('duel.rules.watching'), t('duel.rules.watchingValue', { count: watchers, max: MAX_SPECTATORS })]] as const)),
  ]

  return (
    <section aria-label={t('duel.rules.title')} data-testid="room-summary" className="grid gap-2 rounded-card border border-border-subtle bg-card-background p-3">
      <h3 className="m-0 text-micro font-semibold uppercase text-soft">{t('duel.rules.title')}</h3>
      <dl className="m-0 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3">
            <dt className="text-body text-muted">{label}</dt>
            <dd className="m-0 truncate text-right text-body font-semibold text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
