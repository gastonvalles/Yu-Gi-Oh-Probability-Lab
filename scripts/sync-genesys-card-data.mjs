import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const GENESYS_SEARCH_ENDPOINT = 'https://registration.yugioh-card.com/genesys/CardListSearch/Search'
const RESULTS_PER_PAGE = 100
const SEARCH_TYPES = ['1', '2', '3', '4']
const OUTPUT_PATH = path.resolve(process.cwd(), 'src/data/genesys-card-data.json')

async function main() {
  const cards = new Map()

  for (const searchType of SEARCH_TYPES) {
    const firstPage = await requestGenesysSearchPage(searchType, 1)
    collectCards(cards, firstPage.Result.Results)

    const totalPages = firstPage.Result.TotalPages

    for (let currentPage = 2; currentPage <= totalPages; currentPage += 1) {
      const nextPage = await requestGenesysSearchPage(searchType, currentPage)
      collectCards(cards, nextPage.Result.Results)
    }
  }

  const sortedEntries = [...cards.entries()].sort((left, right) => left[0].localeCompare(right[0], 'en'))
  const payload = {
    updatedAt: new Date().toISOString(),
    source: GENESYS_SEARCH_ENDPOINT,
    pointCap: 100,
    cards: Object.fromEntries(sortedEntries),
  }

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  console.log(`Wrote ${sortedEntries.length} Genesys entries to ${OUTPUT_PATH}`)
}

async function requestGenesysSearchPage(searchType, currentPage) {
  const body = new URLSearchParams({
    currentPage: String(currentPage),
    resultsPerPage: String(RESULTS_PER_PAGE),
    searchTerm: '',
    searchType,
    searchPoints: '',
    attributes: '',
    icons: '',
    monsterTypes: '',
    cardTypes: '',
    excludedTypes: '',
    levels: '',
    minAtk: '',
    maxAtk: '',
    minDef: '',
    maxDef: '',
  })

  const response = await fetch(GENESYS_SEARCH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`Genesys search failed for type ${searchType}, page ${currentPage}: ${response.status}`)
  }

  const payload = await response.json()

  if (payload?.Success !== 'Success' || !payload?.Result?.Results) {
    throw new Error(`Genesys search returned an unexpected payload for type ${searchType}, page ${currentPage}.`)
  }

  return payload
}

function collectCards(cards, results) {
  for (const result of results) {
    if (typeof result?.Name !== 'string' || typeof result?.Points !== 'number') {
      continue
    }

    cards.set(normalizeGenesysCardName(result.Name), result.Points)
  }
}

function normalizeGenesysCardName(value) {
  return value
    .normalize('NFKD')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2010-\u2015]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
