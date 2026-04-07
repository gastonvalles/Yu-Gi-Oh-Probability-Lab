const IMAGE_CACHE_NAME = 'ygoprodeck-images-v1'
const inMemoryUrls = new Map<string, string>()
const pendingLoads = new Map<string, Promise<string | null>>()

export async function getCachedImageUrl(remoteUrl: string): Promise<string | null> {
  const cachedUrl = inMemoryUrls.get(remoteUrl)
  if (cachedUrl) {
    return cachedUrl
  }

  if (!shouldFetchForCache(remoteUrl)) {
    inMemoryUrls.set(remoteUrl, remoteUrl)
    return remoteUrl
  }

  const pendingLoad = pendingLoads.get(remoteUrl)
  if (pendingLoad) {
    return pendingLoad
  }

  const loadPromise = loadImage(remoteUrl)
  pendingLoads.set(remoteUrl, loadPromise)

  try {
    return await loadPromise
  } finally {
    pendingLoads.delete(remoteUrl)
  }
}

async function loadImage(remoteUrl: string): Promise<string | null> {
  try {
    const cache = await caches.open(IMAGE_CACHE_NAME)
    let response = await cache.match(remoteUrl)

    if (!response) {
      response = await fetch(remoteUrl)

      if (!response.ok) {
        return null
      }

      await cache.put(remoteUrl, response.clone())
    }

    const imageBlob = await response.blob()
    const localUrl = URL.createObjectURL(imageBlob)
    inMemoryUrls.set(remoteUrl, localUrl)
    return localUrl
  } catch {
    return null
  }
}

function shouldFetchForCache(remoteUrl: string): boolean {
  if (
    typeof window === 'undefined' ||
    typeof caches === 'undefined' ||
    remoteUrl.startsWith('blob:') ||
    remoteUrl.startsWith('data:')
  ) {
    return false
  }

  try {
    const url = new URL(remoteUrl, window.location.href)

    // YGOPRODeck images load fine in <img>, but their host rejects fetch() from production with CORS.
    return url.origin === window.location.origin
  } catch {
    return false
  }
}
