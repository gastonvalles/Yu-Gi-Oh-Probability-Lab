import type { common as es } from '../es/common'
import type { Translated } from '../types'

export const common: Translated<typeof es> = {
  'common.scrollBack': 'Show previous',
  'common.scrollForward': 'Show next',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.sheet.lower': 'Lower the sheet',
  'common.sheet.raise': 'Raise the sheet: {title}',
  'common.delete': 'Delete',
  'common.save': 'Save',
  'common.language': 'Language',
  'common.selectPlaceholder': 'Select',
  'common.selectCount': { one: '{count} selected', other: '{count} selected' },
  'common.siteDescription': 'Deck builder and exact probability calculator for Yu-Gi-Oh!: build your deck, classify cards and measure its consistency.',
  'common.siteImageAlt': 'YGOUltraLab: deck builder and exact probability calculator for Yu-Gi-Oh!',
}
