import type { HandPattern, HandPatternCategory } from '../types'

export function normalizeHandPatternCategory(
  category: HandPatternCategory | null | undefined,
): HandPatternCategory {
  return category === 'bad' ? 'bad' : 'good'
}

export function normalizePatternName(name: string): string {
  return name
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .normalize('NFKC')
    .toLowerCase()
}

export function getPatternDedupKey(
  pattern: Pick<HandPattern, 'id' | 'name' | 'category'>,
): string {
  const normalizedName = normalizePatternName(pattern.name)

  return normalizedName.length > 0
    ? `${normalizeHandPatternCategory(pattern.category)}:${normalizedName}`
    : `${normalizeHandPatternCategory(pattern.category)}:${pattern.id}`
}

export function getPatternCategorySingular(
  category: HandPatternCategory | null | undefined,
): string {
  return normalizeHandPatternCategory(category) === 'bad' ? 'problema' : 'apertura'
}

export function getPatternCategoryPlural(
  category: HandPatternCategory | null | undefined,
): string {
  return normalizeHandPatternCategory(category) === 'bad' ? 'problemas' : 'aperturas'
}

export function getPatternCategoryShortLabel(
  category: HandPatternCategory | null | undefined,
): string {
  return normalizeHandPatternCategory(category) === 'bad' ? 'Problema' : 'Apertura'
}
