/// <reference lib="webworker" />
import { computeLabOdds, type LabOddsInput } from './lab-odds'

// El cálculo exacto es pesado: corre acá para no trabar la pantalla.
self.onmessage = (event: MessageEvent<{ id: number } & LabOddsInput>) => {
  const { id, ...input } = event.data
  const odds = computeLabOdds(input)

  self.postMessage({
    id,
    odds: odds && { first: odds.first, second: odds.second, clean: odds.clean, rules: { first: [...odds.rules.first], second: [...odds.rules.second] } },
  })
}
