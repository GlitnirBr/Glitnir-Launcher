export interface ThunderstoreMod {
  name: string
  full_name: string
  owner: string
  package_url: string
  date_created: string
  date_updated: string
  rating_score: number
  is_pinned: boolean
  is_deprecated: boolean
  total_downloads: number
  categories: string[]
  latest: {
    name: string
    full_name: string
    description: string
    icon: string
    version_number: string
    download_url: string
    downloads: number
    date_created: string
    website_url: string
    is_active: boolean
    file_size: number
  }
}

let cachedMods: ThunderstoreMod[] | null = null
let cacheTime: number = 0
const CACHE_DURATION = 5 * 60 * 1000

export async function fetchAllMods(): Promise<ThunderstoreMod[]> {
  const now = Date.now()
  if (cachedMods && now - cacheTime < CACHE_DURATION) {
    return cachedMods
  }

  // Use IPC when running inside Electron (avoids CORS/CSP restrictions)
  const w = window as any
  if (w?.glitnir?.thunderstore?.fetchAll) {
    cachedMods = await w.glitnir.thunderstore.fetchAll()
    cacheTime = now
    return cachedMods!
  }

  const res = await fetch('https://thunderstore.io/c/valheim/api/v1/package/')
  if (!res.ok) throw new Error(`Thunderstore HTTP ${res.status}`)
  cachedMods = await res.json()
  cacheTime = now
  return cachedMods!
}

export async function searchMods(query: string): Promise<ThunderstoreMod[]> {
  const allMods = await fetchAllMods()
  const q = query.toLowerCase()

  return allMods
    .filter(mod =>
      !mod.is_deprecated &&
      (mod.name.toLowerCase().includes(q) ||
       mod.owner.toLowerCase().includes(q) ||
       mod.latest.description.toLowerCase().includes(q))
    )
    .sort((a, b) => b.total_downloads - a.total_downloads)
    .slice(0, 50)
}

export function getThunderstoreId(mod: ThunderstoreMod): string {
  return `${mod.owner}-${mod.name}`
}

export function getDownloadUrl(owner: string, name: string, version: string): string {
  return `https://thunderstore.io/package/download/${owner}/${name}/${version}/`
}
