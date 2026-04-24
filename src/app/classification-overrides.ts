import { loadClassificationOverrides } from './persistence'
import type { ClassificationSuggestion } from './classification-engine'

let cachedOverrides: Map<string, ClassificationSuggestion> | null = null

export function getClassificationOverrides(): ReadonlyMap<string, ClassificationSuggestion> {
  if (!cachedOverrides) {
    cachedOverrides = loadClassificationOverrides()
  }
  return cachedOverrides
}

export function invalidateClassificationOverridesCache(): void {
  cachedOverrides = null
}
