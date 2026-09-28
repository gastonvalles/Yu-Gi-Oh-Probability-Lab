import { readApiErrorMessage } from './parser'

const CARDINFO_ENDPOINT = 'https://db.ygoprodeck.com/api/v7/cardinfo.php'
const NETWORK_ERROR_MESSAGE = 'No se pudo conectar con YGOPRODeck. Revisá tu conexión e intentá de nuevo.'
const GENERIC_ERROR_MESSAGE = 'No se pudo consultar YGOPRODeck.'

export async function requestCardInfo(params: URLSearchParams): Promise<unknown> {
  let response: Response

  try {
    response = await fetch(`${CARDINFO_ENDPOINT}?${params.toString()}`)
  } catch {
    throw new Error(NETWORK_ERROR_MESSAGE)
  }

  const payload = await readJsonPayload(response)

  if (!response.ok) {
    throw new Error(readApiErrorMessage(payload) ?? GENERIC_ERROR_MESSAGE)
  }

  return payload
}

// Un 5xx o una página de error del proxy puede no ser JSON: devolvemos null
// para que el llamador muestre un mensaje propio en vez de "Unexpected token <".
async function readJsonPayload(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown
  } catch {
    return null
  }
}
