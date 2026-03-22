import type { ApiCardReference } from '../types'

export interface ApiCardSearchResult extends ApiCardReference {
  name: string
}

export interface ApiSearchPage {
  results: ApiCardSearchResult[]
  hasMore: boolean
}
