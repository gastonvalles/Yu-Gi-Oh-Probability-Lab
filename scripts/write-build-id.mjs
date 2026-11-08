// Escribe `public/build.json` antes de cada build: el commit que se está publicando. Lo leen el QA de producción (para esperar
// a que el sitio sirva el commit mergeado) y, más adelante, el formulario de bugs. Vercel pasa `VERCEL_GIT_COMMIT_SHA`;
// en local sale de git y, si no hay, queda «local».
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

function sha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'local'
  }
}

writeFileSync(new URL('../public/build.json', import.meta.url), `${JSON.stringify({ sha: sha(), builtAt: new Date().toISOString() })}\n`)
