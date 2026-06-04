export interface Mod {
  name: string
  version: string
  thunderstoreId: string
  description?: string
  installed?: boolean
  outdated?: boolean
}

export interface Modpack {
  version: string
  updatedAt: string
  changelog: { version: string; date: string; changes: string[] }[]
  mods: Mod[]
}

export async function fetchModpack(
  _server: 'glitnir' | 'vanilla' = 'glitnir',
  url?: string
): Promise<Modpack> {
  const finalUrl = url || ''
  if (!finalUrl) throw new Error('URL do modpack não configurada')
  const res = await fetch(finalUrl + '?t=' + Date.now())
  if (!res.ok) throw new Error('Falha ao buscar modpack')
  return res.json()
}

export async function downloadMod(
  mod: Mod,
  onProgress?: (pct: number) => void
): Promise<ArrayBuffer> {
  const parts = mod.thunderstoreId.split('-')
  const namespace = parts[0]
  const name = parts[1]
  const url = `https://thunderstore.io/package/download/${namespace}/${name}/${mod.version}/`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Falha ao baixar ${mod.name}`)

  const total = Number(res.headers.get('content-length') || 0)
  const reader = res.body!.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    received += value.length
    if (total && onProgress) onProgress(Math.round((received / total) * 100))
  }

  const combined = new Uint8Array(received)
  let offset = 0
  for (const chunk of chunks) {
    combined.set(chunk, offset)
    offset += chunk.length
  }
  return combined.buffer
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function checkOutdated(
  installed: { name: string; version: string }[],
  modpack: Modpack
) {
  return modpack.mods.map(mod => {
    const inst = installed.find(m => m.name === mod.name)
    return {
      ...mod,
      installed: !!inst,
      outdated: inst ? compareVersions(inst.version, mod.version) < 0 : false,
    }
  })
}