export const API_BASE: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8000'

export interface Margins {
  top: number
  bottom: number
  left: number
  right: number
}

export const DEFAULT_MARGINS: Margins = { top: 0.25, bottom: 0.4, left: 0.5, right: 0.5 }

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ScoreCategoryDetail {
  score: number
  notes: string
}

export interface ScoreResult {
  overall: number
  categories: {
    keywords: ScoreCategoryDetail
    skills: ScoreCategoryDetail
    experience: ScoreCategoryDetail
    seniority: ScoreCategoryDetail
  }
  summary: string
}

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

export type ApplicationStatus = 'applied' | 'interview' | 'offer' | 'rejected' | 'withdrawn'

export interface Application {
  id: string
  job_title: string
  company: string
  location: string
  status: ApplicationStatus
  version_id: string | null
  version_name: string | null
  job_url: string
  notes: string
  applied_at: string
  updated_at: string
}

export interface ApplicationCreate {
  job_title: string
  company: string
  location?: string
  status?: ApplicationStatus
  version_id?: string | null
  version_name?: string | null
  job_url?: string
  notes?: string
}

export interface ApplicationUpdate {
  job_title?: string
  company?: string
  location?: string
  status?: ApplicationStatus
  version_id?: string | null
  version_name?: string | null
  job_url?: string
  notes?: string
}

export class RateLimitError extends Error {
  retryAfter: number | null
  constructor(message: string, retryAfter: number | null = null) {
    super(message)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

function getToken(): string | null {
  return localStorage.getItem('cv_pilot_token')
}

function authHeaders(): Record<string, string> {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function parseRetryAfter(resp: Response): number | null {
  const header = resp.headers.get('Retry-After')
  if (!header) return null
  const seconds = parseInt(header, 10)
  return isNaN(seconds) ? null : seconds
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
  if (resp.status === 429) {
    const retryAfter = parseRetryAfter(resp)
    const minutes = retryAfter != null ? Math.ceil(retryAfter / 60) : null
    const msg = minutes
      ? `Rate limit reached. Try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`
      : 'Rate limit reached. Please try again later.'
    throw new RateLimitError(msg, retryAfter)
  }
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

  importPdf: async (file: File): Promise<{ version: VersionMeta; content: string }> => {
    const formData = new FormData()
    formData.append('file', file)
    const resp = await fetch(`${API_BASE}/api/resume/import-pdf`, {
      method: 'POST',
      headers: { ...authHeaders() },
      body: formData,
    })
    if (resp.status === 429) {
      const retryAfter = parseRetryAfter(resp)
      const minutes = retryAfter != null ? Math.ceil(retryAfter / 60) : null
      const msg = minutes
        ? `Rate limit reached. Try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`
        : 'Rate limit reached. Please try again later.'
      throw new RateLimitError(msg, retryAfter)
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }))
      throw new Error((err as { detail?: string }).detail ?? 'PDF import failed')
    }
    return resp.json() as Promise<{ version: VersionMeta; content: string }>
  },

  exportPdf: async (html: string, margins?: Margins): Promise<Blob> => {
    const resp = await fetch(`${API_BASE}/api/export/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ html, margins }),
    })
    if (!resp.ok) throw new Error('PDF export failed')
    return resp.blob()
  },

  listApplications: () => request<Application[]>('/api/applications'),

  createApplication: (body: ApplicationCreate) =>
    request<Application>('/api/applications', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getApplication: (id: string) => request<Application>(`/api/applications/${id}`),

  updateApplication: (id: string, body: ApplicationUpdate) =>
    request<Application>(`/api/applications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),

  deleteApplication: (id: string) =>
    request<{ ok: boolean }>(`/api/applications/${id}`, { method: 'DELETE' }),

  searchJobs: (params: {
    job_titles: string[]
    location: string
    remote_only: boolean
    limit?: number
  }) => request<JobResult[]>('/api/jobs/search', {
    method: 'POST',
    body: JSON.stringify(params),
  }),

  chatStream: async (
    resume: string,
    messages: ChatMessage[],
    onChunk: (text: string) => void,
  ): Promise<void> => {
    const resp = await fetch(`${API_BASE}/api/llm/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ resume, messages }),
    })
    if (resp.status === 429) {
      const retryAfter = parseRetryAfter(resp)
      const minutes = retryAfter != null ? Math.ceil(retryAfter / 60) : null
      const msg = minutes
        ? `Rate limit reached. Try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`
        : 'Rate limit reached. Please try again later.'
      throw new RateLimitError(msg, retryAfter)
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: 'Chat request failed' }))
      throw new Error((err as { detail?: string }).detail ?? 'Chat request failed')
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

  scoreResume: (resume: string, jobDescription: string) =>
    request<ScoreResult>('/api/llm/score', {
      method: 'POST',
      body: JSON.stringify({ resume, job_description: jobDescription }),
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
    if (resp.status === 429) {
      const retryAfter = parseRetryAfter(resp)
      const minutes = retryAfter != null ? Math.ceil(retryAfter / 60) : null
      const msg = minutes
        ? `Rate limit reached. Try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`
        : 'Rate limit reached. Please try again later.'
      throw new RateLimitError(msg, retryAfter)
    }
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
