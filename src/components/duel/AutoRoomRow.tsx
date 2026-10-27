import { useEffect, useState } from 'react'

import { canRunAuto, setAutoPref, useAutoPrefs } from '../../app/auto-prefs'
import { t } from '../../i18n'
import { Switch } from '../ui/Switch'

/** Si una sala puede tener reglas automáticas: sí; no, porque el navegador no corre el núcleo (le falta WebAssembly o Worker); o no, porque el despliegue las apagó. */
export type AutoRooms = 'on' | 'unsupported' | 'off'

/**
 * El interruptor del despliegue (`AUTO_ONLINE=0` en el build: `features.online` del manifiesto de los datos del núcleo), con un import dinámico: nada de esto viaja en el arranque.
 * Apagado sólo si el manifiesto lo dice; sin red o sin datos no se sabe, y la sala lo resuelve sola (el anfitrión no puede arrancar el duelo y lo dice).
 */
const onlineOff = (): Promise<boolean> =>
  import('../../app/auto/auto-data').then(({ httpSource }) => httpSource().manifest()).then(
    (manifest) => manifest.features?.online === false,
    () => false,
  )

/** Si se pueden abrir salas con reglas automáticas. El interruptor del despliegue se mira recién con `active` (las reglas abiertas o el modo automático prendido). */
export function useAutoRooms(active: boolean): AutoRooms {
  const supported = canRunAuto()
  const [off, setOff] = useState(false)

  useEffect(() => {
    if (!active || !supported) return

    let alive = true

    void onlineOff().then((value) => {
      if (alive) setOff(value)
    })

    return () => {
      alive = false
    }
  }, [active, supported])

  return !supported ? 'unsupported' : off ? 'off' : 'on'
}

/**
 * «Reglas automáticas (beta)» en la hoja de las reglas del duelo (en Single y Match; en Solo no va): el mismo interruptor del modo automático que el del lobby (`auto-prefs.ts`), así
 * que los dos se ven igual. Prendido, la sala que se abre todavía no se puede mirar (lo dice su línea). Si el navegador no
 * puede correr el núcleo, o el despliegue lo apagó, va apagado y sin poder tocarlo, con el porqué.
 */
export function AutoRoomRow({ rooms }: { rooms: AutoRooms }) {
  const on = useAutoPrefs().duel && rooms === 'on'
  const line = rooms === 'unsupported' ? t('duel.auto.unsupported') : rooms === 'off' ? t('duel.auto.off') : on ? t('duel.auto.locked') : t('duel.auto.rulesHint')

  return (
    <div className="flex items-center justify-between gap-3 sm:col-span-2">
      <span className="grid min-w-0 gap-0.5">
        <span className="text-body font-semibold text-foreground">{t('duel.auto.rules')}</span>
        <span className="text-micro text-soft">{line}</span>
      </span>
      <Switch checked={on} disabled={rooms !== 'on'} onChange={(value) => setAutoPref('duel', value)} label={t('duel.auto.rules')} />
    </div>
  )
}
