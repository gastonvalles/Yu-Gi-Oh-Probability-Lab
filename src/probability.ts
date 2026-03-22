import type {
  CalculationOutput,
  CalculatorState,
} from './types'
import { buildCalculationSummary } from './probability-summary'
import { validateCalculationState } from './probability-validation'

export function calculateProbabilities(state: CalculatorState): CalculationOutput {
  const issues = validateCalculationState(state)
  const blockingIssues = issues.filter((issue) => issue.level === 'error')

  if (blockingIssues.length > 0) {
    return {
      issues,
      blockingIssues,
      summary: null,
    }
  }

  return {
    issues,
    blockingIssues: [],
    summary: buildCalculationSummary(state),
  }
}
