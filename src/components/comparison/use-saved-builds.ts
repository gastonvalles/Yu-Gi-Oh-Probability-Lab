import { useEffect, useState } from 'react'

import {
  classifyBuildCard,
  createSavedBuild,
  readSavedBuilds,
  SAVED_BUILDS_EVENT,
  SAVED_BUILDS_KEY,
  uniqueBuildName,
  writeSavedBuilds,
  type BuildZones,
  type SavedBuild,
  type SavedBuildFrom,
} from '../../app/saved-builds'
import type { CardOrigin, CardRole } from '../../types'

/**
 * Builds guardadas del usuario (persisten en el navegador). Se vuelven a leer si las cambió otra pantalla (el «Guardar B» del Lab) u otra pestaña; sin
 * almacenamiento (cuota llena) viven en esta sesión, como siempre.
 */
export function useSavedBuilds() {
  const [builds, setBuilds] = useState<SavedBuild[]>(readSavedBuilds)

  useEffect(() => {
    // La escritura propia también avisa: si es lo mismo que ya está, no se cambia la lista (no se vuelve a medir nada).
    const refresh = () =>
      setBuilds((current) => {
        const next = readSavedBuilds()

        return JSON.stringify(next) === JSON.stringify(current) ? current : next
      })
    const onStorage = (event: StorageEvent) => {
      if (event.key === SAVED_BUILDS_KEY || event.key === null) refresh()
    }

    window.addEventListener(SAVED_BUILDS_EVENT, refresh)
    window.addEventListener('storage', onStorage)

    return () => {
      window.removeEventListener(SAVED_BUILDS_EVENT, refresh)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const commit = (next: SavedBuild[]) => {
    setBuilds(next)
    writeSavedBuilds(next)
  }

  return {
    builds,
    save(name: string, zones: BuildZones, from?: SavedBuildFrom): SavedBuild {
      const build = createSavedBuild(name, zones, builds, new Date(), from)
      commit([build, ...builds])
      return build
    },
    rename(id: string, name: string) {
      const others = builds.filter((build) => build.id !== id)
      commit(builds.map((build) => (build.id === id ? { ...build, name: uniqueBuildName(name, others) } : build)))
    },
    remove(id: string) {
      commit(builds.filter((build) => build.id !== id))
    },
    classifyCard(id: string, ygoprodeckId: number, origin: CardOrigin, roles: CardRole[]) {
      commit(builds.map((build) => (build.id === id ? classifyBuildCard(build, ygoprodeckId, origin, roles) : build)))
    },
  }
}
