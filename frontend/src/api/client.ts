export const API_BASE: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000'

function getToken(): string | null {
  return localStorage.getItem('cv_pilot_token')
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const resp = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init.headers as Record<string, string> | undefined),
    },
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }))
    throw new Error((err as { detail?: string }).detail ?? 'Request failed')
  }
  return resp.json() as Promise<T>
}

export const api = {
  getResume: () => request<{ content: string }>('/api/resume'),

  saveResume: (content: string) =>
    request<{ ok: boolean }>('/api/resume', {
      method: 'PUT',
      body: JSON.stringify({ content }),
    }),

  exportPdf: async (content: string): Promise<Blob> => {
    const resp = await fetch(`${API_BASE}/api/export/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ content }),
    })
    if (!resp.ok) throw new Error('PDF export failed')
    return resp.blob()
  },

  optimizeStream: async (
    resume: string,
    jobDescription: string,
    onChunk: (text: string) => void,
  ): Promise<void> => {
    const resp = await fetch(`${API_BASE}/api/llm/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ resume, job_description: jobDescription }),
    })
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: 'Optimize request failed' }))
      throw new Error((err as { detail?: string }).detail ?? 'Optimize request failed')
    }

    const reader = resp.body!.getReader()
    const decoder = new TextDecoder()

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunk = decoder.decode(value, { stream: true })
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') return
        try {
          const parsed = JSON.parse(data) as { text?: string }
          if (parsed.text) onChunk(parsed.text)
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }
  },
}
