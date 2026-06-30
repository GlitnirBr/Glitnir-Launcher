import { Modpack, PrivateModDownload } from '../types'

export const DEFAULT_BACKEND_URL = 'https://glitnir-launcher-backend.glitnir.workers.dev'

function base(backendUrl?: string): string {
  return (backendUrl || DEFAULT_BACKEND_URL).replace(/\/+$/, '')
}

/** Faz login no backend e retorna o token de sessão. */
export async function login(password: string, backendUrl?: string): Promise<string> {
  const res = await fetch(`${base(backendUrl)}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as any).error || 'Falha na autenticação')
  }
  const data = (await res.json()) as { token: string }
  return data.token
}

/** Busca o modpack público via backend (sem autenticação). */
export async function getPublicModpack(backendUrl?: string): Promise<Modpack> {
  const res = await fetch(`${base(backendUrl)}/modpacks/main`)
  if (!res.ok) throw new Error('Falha ao buscar modpack público')
  return res.json()
}

/** Busca o modpack secreto de admin (requer token válido). */
export async function getAdminModpack(token: string, backendUrl?: string): Promise<Modpack> {
  const res = await fetch(`${base(backendUrl)}/modpacks/admin`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as any).error || 'Falha ao buscar modpack admin')
  }
  return res.json()
}

/** Publica (commita) um modpack no GitHub via backend. */
export async function publishModpack(
  token: string,
  target: 'main' | 'admin',
  modpack: Modpack,
  message?: string,
  backendUrl?: string,
): Promise<void> {
  const res = await fetch(`${base(backendUrl)}/modpacks/publish`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ target, modpack, message }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as any).error || 'Falha ao publicar modpack')
  }
}

/**
 * Lista os mods privados disponíveis no repo.
 *
 * Endpoint esperado no Worker:
 *   GET /mods/private
 *   Authorization: Bearer <token>
 *   → 200 { mods: { filename: string, size: number, updatedAt: string }[] }
 */
export async function listPrivateMods(
  token: string,
  backendUrl?: string,
): Promise<{ filename: string; size: number; updatedAt: string }[]> {
  const res = await fetch(`${base(backendUrl)}/mods/private`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as any).error || 'Falha ao listar mods privados')
  }
  const data = await res.json() as { mods: { filename: string; size: number; updatedAt: string }[] }
  return data.mods || []
}

/**
 * Faz upload de um arquivo de mod privado para o backend.
 * O backend commita o arquivo no repo privado de mods.
 *
 * Endpoint esperado no Worker:
 *   POST /mods/private/upload
 *   Authorization: Bearer <token>
 *   Content-Type: application/json
 *   Body: { filename: string, content: string (base64) }
 *   → 200 { success: true }
 */
export async function uploadPrivateMod(
  token: string,
  filename: string,
  contentBase64: string,
  backendUrl?: string,
): Promise<void> {
  const res = await fetch(`${base(backendUrl)}/mods/private/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ filename, content: contentBase64 }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as any).error || 'Falha ao fazer upload do mod')
  }
}

/**
 * Faz upload de uma imagem (base64) para o backend, que commita em images/<filename> no repo.
 * Endpoint: POST /images/upload  →  { url: string } (URL raw do arquivo no GitHub)
 */
export async function uploadImage(
  token: string,
  filename: string,
  contentBase64: string,
  backendUrl?: string,
): Promise<{ url: string }> {
  const res = await fetch(`${base(backendUrl)}/images/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ filename, content: contentBase64 }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as any).error || 'Falha ao fazer upload da imagem')
  }
  return res.json() as Promise<{ url: string }>
}

/** Busca as notícias/home data do backend (sem autenticação). */
export async function getNews(backendUrl?: string): Promise<any> {
  const res = await fetch(`${base(backendUrl)}/news`)
  if (!res.ok) throw new Error('Falha ao buscar notícias')
  return res.json()
}

/** Publica as notícias/home data no backend (requer token válido). */
export async function publishNews(token: string, news: object, backendUrl?: string): Promise<void> {
  const res = await fetch(`${base(backendUrl)}/news`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(news),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as any).error || 'Falha ao publicar notícias')
  }
}

/**
 * Resolve a URL/headers de download de um mod privado.
 * O `downloadUrl` do manifesto é um caminho relativo (ex: /mods/private/Foo.zip)
 * que será resolvido contra o backend, com o header de autenticação.
 */
export function resolvePrivateMod(
  downloadUrl: string,
  token: string,
  backendUrl?: string,
): PrivateModDownload {
  const path = downloadUrl.startsWith('/') ? downloadUrl : `/${downloadUrl}`
  return {
    url: `${base(backendUrl)}${path}`,
    headers: { Authorization: `Bearer ${token}` },
  }
}
