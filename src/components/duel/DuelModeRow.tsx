import { useEffect, useState } from 'react'

import { canRunAuto, setAutoPref, useAutoPrefs } from '../../app/auto-prefs'
import { t } from '../../i18n'
import { cx } from '../ui/cx'
import { Segmented } from '../ui/Segmented'

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
 * «Modo del duelo» en la hoja de las reglas (Single, Match y Solo): «Automático» o «Manual», la preferencia `duel` de `auto-prefs.ts` (automático de entrada). Con rival vale para la sala
 * que se abre; en Solo, para la mesa de «Entrenar solo». Si el navegador no puede correr el núcleo, o (con rival) el despliegue lo apagó, va en «Manual» y sin poder tocarlo, con el porqué.
 */
export function DuelModeRow({ rooms, solo, className }: { rooms: AutoRooms; solo: boolean; className?: string }) {
  const prefs = useAutoPrefs()
  const blocked = solo ? (canRunAuto() ? null : t('auto.entry.unsupported')) : rooms === 'unsupported' ? t('duel.auto.unsupported') : rooms === 'off' ? t('duel.auto.off') : null
  const auto = prefs.duel && !blocked
  const hint = blocked ?? (!auto ? t('auto.mode.manualHint') : solo ? t('auto.mode.soloHint') : t('duel.auto.rulesHint'))

  return (
    <div className={cx('grid content-start gap-1.5', className)}>
      <span className="text-micro font-semibold uppercase text-soft">{t('auto.mode.label')}</span>
      {/* Segmented no tiene «apagado»: el fieldset apaga sus botones (el porqué va en la línea de abajo). */}
      <fieldset disabled={Boolean(blocked)} className={cx('m-0 min-w-0 border-0 p-0', blocked && 'opacity-40')}>
        <Segmented<'auto' | 'manual'>
          label={t('auto.mode.label')}
          fullWidth
          value={auto ? 'auto' : 'manual'}
          onChange={(value) => setAutoPref('duel', value === 'auto')}
          options={[
            { value: 'auto', label: t('auto.mode.auto') },
            { value: 'manual', label: t('auto.mode.manual') },
          ]}
        />
      </fieldset>
      <p className="m-0 text-micro text-soft">{hint}</p>
    </div>
  )
}
