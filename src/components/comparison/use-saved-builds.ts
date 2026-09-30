import { useState } from 'react'

import {
  classifyBuildCard,
  createSavedBuild,
  readSavedBuilds,
  uniqueBuildName,
  writeSavedBuilds,
  type BuildZones,
  type SavedBuild,
} from '../../app/saved-builds'
import type { CardOrigin, CardRole } from '../../types'

/** Builds guardadas del usuario (persisten en el navegador). */
export function useSavedBuilds() {
  const [builds, setBuilds] = useState<SavedBuild[]>(readSavedBuilds)

  const commit = (next: SavedBuild[]) => {
    setBuilds(next)
    writeSavedBuilds(next)
  }

  return {
    builds,
    save(name: string, zones: BuildZones): SavedBuild {
      const build = createSavedBuild(name, zones, builds)
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
