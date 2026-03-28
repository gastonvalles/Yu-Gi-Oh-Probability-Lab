import type { CardEntry, HandPattern } from '../types'
import { AUTO_BASE_PRESET_IDS, buildPatternPresets } from './pattern-presets'

export function buildDefaultPatterns(cards: CardEntry[]): HandPattern[] {
  const autoPresetIds = new Set<string>(AUTO_BASE_PRESET_IDS)

  return buildPatternPresets(cards)
    .filter((preset) => autoPresetIds.has(preset.id))
    .map((preset) => preset.pattern)
}
