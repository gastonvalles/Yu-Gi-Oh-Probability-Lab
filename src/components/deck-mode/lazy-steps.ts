import { lazy } from 'react'

/**
 * Pasos y paneles pesados: se bajan recién cuando se usan (el builder es lo primero que se ve).
 * `preloadHeavySteps` los trae en un momento ocioso para que cambiar de paso sea instantáneo.
 */
const loaders = {
  roles: () => import('../DeckRolesPanel'),
  probability: () => import('../ProbabilityPanel'),
  exportDeck: () => import('../ExportDeckPanel'),
  comparison: () => import('../comparison/ComparisonScreen'),
  practice: () => import('../probability/PracticeSection'),
}

export const LazyDeckRolesPanel = lazy(() => loaders.roles().then((m) => ({ default: m.DeckRolesPanel })))
export const LazyProbabilityPanel = lazy(() => loaders.probability().then((m) => ({ default: m.ProbabilityPanel })))
export const LazyExportDeckPanel = lazy(() => loaders.exportDeck().then((m) => ({ default: m.ExportDeckPanel })))
export const LazyComparisonScreen = lazy(() => loaders.comparison().then((m) => ({ default: m.ComparisonScreen })))
export const LazyPracticeSection = lazy(() => loaders.practice().then((m) => ({ default: m.PracticeSection })))

export function preloadHeavySteps(): void {
  const run = () => Object.values(loaders).forEach((load) => void load())
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback

  if (idle) {
    idle(run)
  } else {
    window.setTimeout(run, 1500)
  }
}
