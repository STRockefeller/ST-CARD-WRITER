import type { AppSettings, CardProject, CharacterCardV2, LLMMessage, TokenBudget } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(payload.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listProjects: () => request<CardProject[]>('/api/projects'),
  createProject: (title: string) =>
    request<CardProject>('/api/projects', { method: 'POST', body: JSON.stringify({ title }) }),
  saveProject: (project: CardProject) =>
    request<CardProject>(`/api/projects/${project.id}`, { method: 'PUT', body: JSON.stringify(project) }),
  exportCard: (projectId: string) =>
    request<CharacterCardV2>(`/api/projects/${projectId}/export`, { method: 'POST' }),
  tokens: (projectId: string) => request<TokenBudget>(`/api/projects/${projectId}/tokens`),
  getSettings: () => request<AppSettings>('/api/settings'),
  saveSettings: (settings: AppSettings) =>
    request<AppSettings>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),
  importCard: (title: string, card: CharacterCardV2) =>
    request<CardProject>('/api/import', { method: 'POST', body: JSON.stringify({ title, card }) }),
  runLLM: (projectId: string, conversationId: string, template: string, locale: string, input: string) =>
    request<LLMMessage>('/api/llm', {
      method: 'POST',
      body: JSON.stringify({ projectId, conversationId, template, locale, input }),
    }),
};

export async function downloadExport(projectId: string, filename: string) {
  const card = await api.exportCard(projectId);
  const blob = new Blob([JSON.stringify(card, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
