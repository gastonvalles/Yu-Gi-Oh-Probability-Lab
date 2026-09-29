import { describe, expect, it } from 'vitest'

import { MAX_RECENT_SEARCHES, pushRecentSearch } from '../components/search/recent-searches'

describe('pushRecentSearch', () => {
  it('pone la última búsqueda primero sin duplicar (ignora mayúsculas)', () => {
    expect(pushRecentSearch(['Ash', 'Nibiru'], ' ash blossom ')).toEqual(['ash blossom', 'Ash', 'Nibiru'])
    expect(pushRecentSearch(['Ash', 'Nibiru'], 'NIBIRU')).toEqual(['NIBIRU', 'Ash'])
  })

  it('ignora búsquedas vacías y respeta el tope', () => {
    expect(pushRecentSearch(['Ash'], '   ')).toEqual(['Ash'])
    const full = Array.from({ length: MAX_RECENT_SEARCHES }, (_, index) => `q${index}`)
    expect(pushRecentSearch(full, 'nueva')).toHaveLength(MAX_RECENT_SEARCHES)
    expect(pushRecentSearch(full, 'nueva')[0]).toBe('nueva')
  })
})
