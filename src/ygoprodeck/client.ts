import { readApiErrorMessage } from './parser'

const CARDINFO_ENDPOINT = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'

export async function requestCardInfo(params: URLSearchParams): Promise<unknown> {
  const response = await fetch(`${CARDINFO_ENDPOINT}?${params.toString()}`)
  const payload = (await response.json()) as unknown

  if (!response.ok) {
    throw new Error(readApiErrorMessage(payload) ?? 'No se pudo consultar YGOPRODeck.')
  }

  return payload
}
