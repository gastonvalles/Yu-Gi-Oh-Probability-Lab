import type { novedades as es } from '../es/novedades'
import type { Translated } from '../types'

export const novedades: Translated<typeof es> = {
  'novedades.title': "What's new",
  'novedades.subtitle': 'What changed on the site, where it is and how to use it.',
  'novedades.linkUnseen': "What's new (unread updates)",
  'novedades.filter.label': 'Filter updates by tag',
  'novedades.filter.all': 'All',
  'novedades.tag.nuevo': 'New',
  'novedades.tag.mejora': 'Improvement',
  'novedades.tag.arreglo': 'Fix',
  'novedades.list.novedades': "What's new",
  'novedades.list.comoSeUsa': 'How to use it',
  'novedades.list.arreglos': 'Changes and fixes',
  'novedades.list.ojo': 'Heads-up',
  'novedades.empty.title': 'No updates with this tag',
  'novedades.empty.text': 'Try another one or see them all.',
  'novedades.empty.none': 'No updates yet',
  'novedades.empty.all': 'See all',
  'novedades.copyLink': 'Copy link to “{title}”',
  'novedades.linkCopied': 'Link copied.',
  'novedades.copyFailed': "Couldn't copy. The link is {url}",
}
