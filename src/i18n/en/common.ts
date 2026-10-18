import type { common as es } from '../es/common'
import type { Translated } from '../types'

export const common: Translated<typeof es> = {
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.delete': 'Delete',
  'common.save': 'Save',
  'common.language': 'Language',
  'common.selectAny': 'Any',
  'common.selectCount': { one: '{count} selected', other: '{count} selected' },
  'common.siteDescription': 'Deck builder and exact probability calculator for Yu-Gi-Oh!: build your deck, classify cards and measure its consistency.',
  'common.siteImageAlt': 'YGOUltraLab: deck builder and exact probability calculator for Yu-Gi-Oh!',
}
