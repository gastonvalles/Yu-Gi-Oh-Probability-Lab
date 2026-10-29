import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { passcodeOf, type ReplayView } from '../../app/duel-replay'
import type { DuelSnapshot } from '../../app/duel-session'
import { canReplay, replayFromManual, theirCodes } from '../../app/manual-replay'
import { t } from '../../i18n'
import { fetchCardNamesByIds } from '../../ygoprodeck'
import type { MatCard } from '../probability/PracticeMat'
import { SaveReplayDialog } from '../replays/SaveReplayDialog'
import { Button } from '../ui/Button'
import { Setting } from './DuelBar'

/**
 * «Guardar replay» del duelo manual por enlace (`manual-replay.ts`), como el del automático: el botón del final (`onSave`), el ajuste de «Más opciones» (`setting`) y el diálogo.
 * Sin registro (un duelo que siguió del automático, o de un guardado de antes) no se ofrece; con un corte, el diálogo dice hasta dónde llega. Los nombres de lo que el rival
 * mostró no están en mi deck: se piden al abrir el diálogo (si no llegan, el replay dice «Carta» en el texto; el arte sale igual).
 */
export function useManualReplay(snapshot: DuelSnapshot, myName: string, cardsById: ReadonlyMap<string, MatCard>): { onSave?: () => void; setting: ((close: () => void) => ReactNode) | null; dialog: ReactNode } {
  const [saving, setSaving] = useState(false)
  const open = useCallback(() => setSaving(true), [])
  const [theirNames, setTheirNames] = useState<ReadonlyMap<number, string>>(new Map())
  const can = canReplay(snapshot)
  const codes = saving ? theirCodes(snapshot).join(',') : ''
  const myNames = useMemo(() => new Map([...cardsById].flatMap(([id, card]) => (passcodeOf(id) === null ? [] : [[passcodeOf(id)!, card.name] as const]))), [cardsById])

  useEffect(() => {
    if (codes === '') return
    let alive = true
    fetchCardNamesByIds(codes.split(',').map(Number))
      .then((names) => alive && setTheirNames(names))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [codes])

  const build = (view: ReplayView) => replayFromManual(snapshot, { view, players: [myName, snapshot.peerName ?? ''], nameOf: (code) => myNames.get(code) ?? theirNames.get(code) })!

  // Estables: la mesa los lleva en su vínculo con el duelo, que no se rearma por nada.
  const setting = useMemo(
    () =>
      can
        ? (close: () => void) => (
            <Setting title={t('meta.duels.save.title')} hint={t('auto.bar.saveReplayHint')}>
              <Button
                variant="secondary"
                icon="save"
                className="justify-self-start"
                aria-haspopup="dialog"
                onClick={() => {
                  close()
                  open()
                }}
              >
                {t('meta.duels.save.button')}
              </Button>
            </Setting>
          )
        : null,
    [can, open],
  )

  return {
    ...(can ? { onSave: open } : {}),
    setting,
    dialog: <SaveReplayDialog isOpen={saving && can} onClose={() => setSaving(false)} build={build} {...(snapshot.record?.cut ? { note: t('meta.duels.save.cut') } : {})} />,
  }
}
