import type { ApiCardReference } from '../types'

export interface ApiCardSearchResult extends ApiCardReference {
  name: string
}

/** Un arte de la carta: el original o uno alternativo (la API da uno por cada código de imagen). */
export interface CardArtOption {
  id: number
  imageUrl: string
  imageUrlSmall: string | null
}

export interface ApiSearchPage {
  results: ApiCardSearchResult[]
  hasMore: boolean
}
