import { Mod, Modpack } from '../types'

export const DEFAULT_MODPACK_REPO = 'GlitnirBr/Glitnir-Modpack'
export const DEFAULT_MODPACK_BRANCH = 'main'

/** Monta a URL raw do modpack.json público no GitHub. */
export function buildModpackRawUrl(repo?: string, branch?: string): string {
  const r = repo || DEFAULT_MODPACK_REPO
  const b = branch || DEFAULT_MODPACK_BRANCH
  return `https://raw.githubusercontent.com/${r}/${b}/modpack.json`
}

/** Busca um modpack a partir de uma URL raw. */
export async function fetchModpackFromUrl(url: string): Promise<Modpack> {
  if (!url) throw new Error('URL do modpack não configurada')
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now())
  if (!res.ok) throw new Error('Falha ao buscar modpack')
  return normalizeModpack(await res.json())
}

/** Garante os campos esperados e defaults do manifesto. */
export function normalizeModpack(data: any): Modpack {
  return {
    version: data.version || '0.0.0',
    name: data.name || 'Modpack',
    description: data.description || '',
    updatedAt: data.updatedAt,
    mods: Array.isArray(data.mods) ? data.mods.map(normalizeMod) : [],
    configs: Array.isArray(data.configs) ? data.configs : [],
    battlemetricsId: data.battlemetricsId,
  }
}

function normalizeMod(m: any): Mod {
  const source = m.source === 'private' ? 'private' : 'thunderstore'
  return {
    name: m.name,
    source,
    namespace: m.namespace,
    version: m.version,
    filename: m.filename,
    downloadUrl: m.downloadUrl || '',
    description: m.description,
  }
}

export function compareVersions(a?: string, b?: string): number {
  const pa = (a || '0').split('.').map(Number)
  const pb = (b || '0').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** Marca cada mod como instalado/desatualizado comparando com os mods instalados. */
export function checkOutdated(
  installed: { name: string; version: string }[],
  modpack: Modpack,
): (Mod & { installed: boolean; outdated: boolean })[] {
  return modpack.mods.map(mod => {
    const inst = installed.find(m => m.name === mod.name)
    return {
      ...mod,
      installed: !!inst,
      outdated: inst ? compareVersions(inst.version, mod.version) < 0 : false,
    }
  })
}
