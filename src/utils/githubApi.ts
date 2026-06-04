const GITHUB_API = 'https://api.github.com'

export interface GistFile {
  filename: string
  content: string
}

export async function updateGist(
  gistId: string,
  token: string,
  files: Record<string, { content: string }>
): Promise<boolean> {
  const res = await fetch(`${GITHUB_API}/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json',
      'Accept': 'application/vnd.github.v3+json'
    },
    body: JSON.stringify({ files })
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.message || 'Falha ao atualizar Gist')
  }

  return true
}

export async function getGist(gistId: string, token?: string): Promise<any> {
  const headers: Record<string, string> = {
    'Accept': 'application/vnd.github.v3+json'
  }
  if (token) {
    headers['Authorization'] = `token ${token}`
  }

  const res = await fetch(`${GITHUB_API}/gists/${gistId}`, { headers })

  if (!res.ok) {
    throw new Error('Falha ao buscar Gist')
  }

  return res.json()
}

export function extractGistId(url: string): string | null {
  // Handle various Gist URL formats
  // https://gist.github.com/username/gistid
  // https://gist.githubusercontent.com/username/gistid/raw/...
  const patterns = [
    /gist\.github\.com\/[^/]+\/([a-f0-9]+)/i,
    /gist\.githubusercontent\.com\/[^/]+\/([a-f0-9]+)/i,
  ]

  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }

  // Maybe it's just the ID
  if (/^[a-f0-9]+$/i.test(url)) {
    return url
  }

  return null
}
