export const API_BASE: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000'

export interface Margins {
  top: number
  bottom: number
  left: number
  right: number
}

export const DEFAULT_MARGINS: Margins = { top: 0.25, bottom: 0.4, left: 0.5, right: 0.5 }

export interface JobResult {
  id: string
  title: string
  company: string
  location: string
  salary: string | null
  description: string
  apply_url: string
  source: string
  posted_at: string
  match_score: number
  match_reason: string
}

export interface VersionMeta {
  id: string
  name: string
  created_at: string
  updated_at: string
  is_active: boolean
}

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

  listVersions: () => request<VersionMeta[]>('/api/resume/versions'),

  createVersion: (name: string, content: string) =>
    request<VersionMeta>('/api/resume/versions', {
      method: 'POST',
      body: JSON.stringify({ name, content }),
    }),

  loadVersion: (id: string) =>
    request<{ content: string; version_id: string }>(`/api/resume/versions/${id}`),

  updateVersion: (id: string, body: { content?: string; name?: string }) =>
    request<VersionMeta>(`/api/resume/versions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteVersion: (id: string) =>
    request<{ ok: boolean }>(`/api/resume/versions/${id}`, { method: 'DELETE' }),

  exportPdf: async (html: string, margins?: Margins): Promise<Blob> => {
    const resp = await fetch(`${API_BASE}/api/export/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ html, margins }),
    })
    if (!resp.ok) throw new Error('PDF export failed')
    return resp.blob()
  },

  searchJobs: (params: {
    job_titles: string
    location: string
    remote_only: boolean
  }) => request<JobResult[]>('/api/jobs/search', {
    method: 'POST',
    body: JSON.stringify(params),
  }),

  optimizeStream: async (
    resume: string,
    jobDescription: string,
    onChunk: (text: string) => void,
    pageLimit: number = 1,
  ): Promise<void> => {
    const resp = await fetch(`${API_BASE}/api/llm/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ resume, job_description: jobDescription, page_limit: pageLimit }),
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
