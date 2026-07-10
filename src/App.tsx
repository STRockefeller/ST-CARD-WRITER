import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Brain, CheckCircle2, Download, FileJson, Languages, Plus, Save, Settings, Sparkles, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, downloadExport } from './api';
import type { AppSettings, CardProject, CharacterBook, CharacterCardV2, LorebookEntry } from './types';
import i18n from './i18n';

const templates = ['brainstorm', 'generate_card', 'generate_lorebook', 'compress', 'review', 'translate', 'mvu'];

export function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string>('');
  const [tab, setTab] = useState('brainstorm');
  const [draft, setDraft] = useState<CardProject | null>(null);
  const [llmInput, setLlmInput] = useState('');
  const [llmTemplate, setLlmTemplate] = useState('brainstorm');
  const fileRef = useRef<HTMLInputElement>(null);

  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });
  const tokenQuery = useQuery({
    queryKey: ['tokens', draft?.id],
    queryFn: () => api.tokens(draft!.id),
    enabled: Boolean(draft?.id),
  });

  useEffect(() => {
    if (!activeId && projectsQuery.data?.length) {
      setActiveId(projectsQuery.data[0].id);
    }
  }, [activeId, projectsQuery.data]);

  useEffect(() => {
    const project = projectsQuery.data?.find((item) => item.id === activeId) ?? null;
    setDraft(project ? structuredClone(project) : null);
  }, [activeId, projectsQuery.data]);

  useEffect(() => {
    if (settingsQuery.data?.uiLocale) {
      i18n.changeLanguage(settingsQuery.data.uiLocale);
    }
  }, [settingsQuery.data?.uiLocale]);

  const createProject = useMutation({
    mutationFn: () => api.createProject('Untitled card'),
    onSuccess(project) {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setActiveId(project.id);
    },
  });

  const saveProject = useMutation({
    mutationFn: (project: CardProject) => api.saveProject(project),
    onSuccess(project) {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['tokens', project.id] });
    },
  });

  const saveSettings = useMutation({
    mutationFn: (settings: AppSettings) => api.saveSettings(settings),
    onSuccess(settings) {
      queryClient.setQueryData(['settings'], settings);
      i18n.changeLanguage(settings.uiLocale);
    },
  });

  const importCard = useMutation({
    mutationFn: async (file: File) => {
      const parsed = await readCardFile(file);
      return api.importCard(parsed?.data?.name ?? file.name.replace(/\.json$/i, ''), parsed);
    },
    onSuccess(project) {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setActiveId(project.id);
    },
  });

  const runLLM = useMutation({
    mutationFn: () =>
      api.runLLM(draft!.id, llmTemplate, settingsQuery.data?.promptLocale ?? 'zh-TW', llmInput),
    onSuccess() {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const updateDraft = (updater: (project: CardProject) => void) => {
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      updater(next);
      next.updatedAt = new Date().toISOString();
      return next;
    });
  };

  const settingsDraft = settingsQuery.data;
  const isDirty = useMemo(() => {
    const saved = projectsQuery.data?.find((item) => item.id === draft?.id);
    return Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));
  }, [draft, projectsQuery.data]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <BookOpen size={24} />
          <div>
            <h1>{t('appTitle')}</h1>
            <p>{t('subtitle')}</p>
          </div>
        </div>
        <button className="primary" onClick={() => createProject.mutate()}>
          <Plus size={16} /> {t('newProject')}
        </button>
        <button className="secondary" onClick={() => fileRef.current?.click()}>
          <FileJson size={16} /> {t('importJson')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json,image/png,.png"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importCard.mutate(file);
            event.target.value = '';
          }}
        />
        <div className="project-list">
          {projectsQuery.data?.map((project) => (
            <button
              className={project.id === activeId ? 'project active' : 'project'}
              key={project.id}
              onClick={() => setActiveId(project.id)}
            >
              <strong>{project.title}</strong>
              <span>{project.card.data.name || 'Unnamed'}</span>
            </button>
          ))}
        </div>
      </aside>

      <main className="workspace">
        {!draft ? (
          <div className="empty-state">{t('noProject')}</div>
        ) : (
          <>
            <header className="topbar">
              <input
                className="title-input"
                value={draft.title}
                onChange={(event) => updateDraft((project) => (project.title = event.target.value))}
              />
              <div className="topbar-actions">
                <button onClick={() => setTab('settings')} aria-label={t('settings')}>
                  <Settings size={16} /> {t('settings')}
                </button>
                <button onClick={() => saveProject.mutate(draft)} disabled={!isDirty}>
                  <Save size={16} /> {t('save')}
                </button>
                <button onClick={() => downloadExport(draft.id, draft.card.data.name || draft.title)}>
                  <Download size={16} /> {t('exportJson')}
                </button>
              </div>
            </header>

            <nav className="tabs">
              <Tab id="brainstorm" label={t('brainstorm')} icon={<Brain size={16} />} active={tab} onClick={setTab} />
              <Tab id="card" label={t('card')} icon={<Sparkles size={16} />} active={tab} onClick={setTab} />
              <Tab id="lorebook" label={t('lorebook')} icon={<BookOpen size={16} />} active={tab} onClick={setTab} />
              <Tab id="tokens" label={t('tokens')} icon={<CheckCircle2 size={16} />} active={tab} onClick={setTab} />
              <Tab id="review" label={t('review')} icon={<Languages size={16} />} active={tab} onClick={setTab} />
              <Tab id="settings" label={t('settings')} icon={<Settings size={16} />} active={tab} onClick={setTab} />
            </nav>

            {tab === 'brainstorm' && (
              <LLMPanel
                template={llmTemplate}
                setTemplate={setLlmTemplate}
                input={llmInput}
                setInput={setLlmInput}
                run={() => runLLM.mutate()}
                running={runLLM.isLoading}
                project={draft}
                updateDraft={updateDraft}
              />
            )}
            {tab === 'card' && <CardEditor project={draft} updateDraft={updateDraft} />}
            {tab === 'lorebook' && <LorebookEditor project={draft} updateDraft={updateDraft} />}
            {tab === 'tokens' && <TokenPanel project={draft} tokenData={tokenQuery.data} updateDraft={updateDraft} />}
            {tab === 'review' && (
              <LLMPanel
                template={llmTemplate}
                setTemplate={setLlmTemplate}
                input={llmInput}
                setInput={setLlmInput}
                run={() => runLLM.mutate()}
                running={runLLM.isLoading}
                project={draft}
                updateDraft={updateDraft}
              />
            )}
            {tab === 'settings' && settingsDraft && (
              <SettingsPanel settings={settingsDraft} save={(next) => saveSettings.mutate(next)} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Tab(props: { id: string; label: string; icon: JSX.Element; active: string; onClick: (id: string) => void }) {
  return (
    <button className={props.active === props.id ? 'tab active' : 'tab'} onClick={() => props.onClick(props.id)}>
      {props.icon}
      {props.label}
    </button>
  );
}

function TextField(props: { label: string; value: string; onChange: (value: string) => void; rows?: number }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      {props.rows ? (
        <textarea rows={props.rows} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      ) : (
        <input value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      )}
    </label>
  );
}

function CardEditor({ project, updateDraft }: { project: CardProject; updateDraft: (updater: (project: CardProject) => void) => void }) {
  const data = project.card.data;
  const setData = (key: keyof typeof data, value: unknown) => updateDraft((p) => ((p.card.data as any)[key] = value));
  return (
    <section className="stack">
      <VersionHistory project={project} updateDraft={updateDraft} />
      <div className="editor-grid">
        <TextField label="name" value={data.name} onChange={(value) => setData('name', value)} />
        <TextField label="creator" value={data.creator} onChange={(value) => setData('creator', value)} />
        <TextField label="character_version" value={data.character_version} onChange={(value) => setData('character_version', value)} />
        <TextField label="tags" value={data.tags.join(', ')} onChange={(value) => setData('tags', splitCommaList(value))} />
        <TextField label="description" value={data.description} rows={8} onChange={(value) => setData('description', value)} />
        <TextField label="personality" value={data.personality} rows={8} onChange={(value) => setData('personality', value)} />
        <TextField label="scenario" value={data.scenario} rows={7} onChange={(value) => setData('scenario', value)} />
        <TextField label="first_mes" value={data.first_mes} rows={7} onChange={(value) => setData('first_mes', value)} />
        <TextField label="mes_example" value={data.mes_example} rows={8} onChange={(value) => setData('mes_example', value)} />
        <TextField label="creator_notes" value={data.creator_notes} rows={6} onChange={(value) => setData('creator_notes', value)} />
        <TextField label="system_prompt" value={data.system_prompt} rows={6} onChange={(value) => setData('system_prompt', value)} />
        <TextField label="post_history_instructions" value={data.post_history_instructions} rows={6} onChange={(value) => setData('post_history_instructions', value)} />
        <TextField
          label="alternate_greetings"
          value={data.alternate_greetings.join('\n---\n')}
          rows={7}
          onChange={(value) => setData('alternate_greetings', value.split(/\n---\n/g).map((item) => item.trim()).filter(Boolean))}
        />
        <TextField label="data.extensions JSON" value={JSON.stringify(data.extensions ?? {}, null, 2)} rows={7} onChange={(value) => setData('extensions', parseJSON(value))} />
      </div>
    </section>
  );
}

function LorebookEditor({ project, updateDraft }: { project: CardProject; updateDraft: (updater: (project: CardProject) => void) => void }) {
  const book = project.lorebook;
  const updateBook = (updater: (book: CharacterBook) => void) => updateDraft((p) => updater(p.lorebook));
  const addEntry = () =>
    updateBook((draft) => {
      const nextId = Math.max(0, ...draft.entries.map((entry) => entry.id)) + 1;
      draft.entries.push({
        id: nextId,
        keys: [],
        secondary_keys: [],
        content: '',
        enabled: true,
        insertion_order: nextId,
        case_sensitive: false,
        selective: false,
        constant: false,
        position: 'before_char',
        priority: 100,
        comment: '',
        extensions: {},
      });
    });
  return (
    <section className="stack">
      <div className="compact-grid">
        <TextField label="name" value={book.name} onChange={(value) => updateBook((b) => (b.name = value))} />
        <TextField label="description" value={book.description} onChange={(value) => updateBook((b) => (b.description = value))} />
        <NumberField label="scan_depth" value={book.scan_depth} onChange={(value) => updateBook((b) => (b.scan_depth = value))} />
        <NumberField label="token_budget" value={book.token_budget} onChange={(value) => updateBook((b) => (b.token_budget = value))} />
      </div>
      <button className="primary inline" onClick={addEntry}><Plus size={16} /> Add Entry</button>
      <div className="entry-list">
        {book.entries.map((entry, index) => (
          <LoreEntry key={entry.id} entry={entry} index={index} updateBook={updateBook} />
        ))}
      </div>
    </section>
  );
}

function LoreEntry({ entry, index, updateBook }: { entry: LorebookEntry; index: number; updateBook: (updater: (book: CharacterBook) => void) => void }) {
  const { t } = useTranslation();
  const updateEntry = (updater: (entry: LorebookEntry) => void) =>
    updateBook((book) => {
      updater(book.entries[index]);
    });
  return (
    <article className="entry">
      <div className="entry-head">
        <strong>#{entry.id}</strong>
        <label><input type="checkbox" checked={entry.enabled} onChange={(event) => updateEntry((e) => (e.enabled = event.target.checked))} /> {t('enabled')}</label>
        <label><input type="checkbox" checked={entry.constant} onChange={(event) => updateEntry((e) => (e.constant = event.target.checked))} /> {t('constant')}</label>
        <label><input type="checkbox" checked={entry.selective} onChange={(event) => updateEntry((e) => (e.selective = event.target.checked))} /> {t('selective')}</label>
        <button className="danger" onClick={() => updateBook((book) => book.entries.splice(index, 1))}><Trash2 size={15} /> {t('deleteEntry')}</button>
      </div>
      <div className="compact-grid">
        <TextField label="keys" value={entry.keys.join(', ')} onChange={(value) => updateEntry((e) => (e.keys = splitCommaList(value)))} />
        <TextField label="secondary_keys" value={entry.secondary_keys.join(', ')} onChange={(value) => updateEntry((e) => (e.secondary_keys = splitCommaList(value)))} />
        <TextField label="position" value={entry.position} onChange={(value) => updateEntry((e) => (e.position = value))} />
        <NumberField label="priority" value={entry.priority} onChange={(value) => updateEntry((e) => (e.priority = value))} />
      </div>
      <TextField label="content" value={entry.content} rows={6} onChange={(value) => updateEntry((e) => (e.content = value))} />
      <TextField label="comment" value={entry.comment} onChange={(value) => updateEntry((e) => (e.comment = value))} />
    </article>
  );
}

function NumberField(props: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span>{props.label}</span>
      <input type="number" value={props.value} onChange={(event) => props.onChange(Number(event.target.value))} />
    </label>
  );
}

function VersionHistory({ project, updateDraft }: { project: CardProject; updateDraft: (updater: (project: CardProject) => void) => void }) {
  const { t } = useTranslation();
  const latest = project.snapshots[0];
  const diffs = latest ? diffSnapshot(project, latest) : [];
  return (
    <section className="version-panel">
      <div className="version-head">
        <div>
          <strong>{t('versionHistory')}</strong>
          <span>{project.snapshots.length ? `${project.snapshots.length} ${t('snapshots')}` : t('noSnapshots')}</span>
        </div>
        <button
          onClick={() => updateDraft((draft) => pushSnapshot(draft, t('manualSnapshot')))}
        >
          <Save size={16} /> {t('snapshot')}
        </button>
      </div>
      {latest && (
        <div className="snapshot-row">
          <div>
            <strong>{latest.label}</strong>
            <span>{new Date(latest.createdAt).toLocaleString()}</span>
          </div>
          <button
            onClick={() => updateDraft((draft) => {
              pushSnapshot(draft, 'Before restore');
              draft.card = structuredClone(latest.card);
              draft.lorebook = structuredClone(latest.lorebook);
            })}
          >
            {t('restoreLatest')}
          </button>
        </div>
      )}
      {diffs.length > 0 && (
        <details className="diff-box">
          <summary>{t('compareLatest')}</summary>
          <ul>
            {diffs.map((diff) => <li key={diff}>{diff}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}

function TokenPanel({ project, tokenData, updateDraft }: { project: CardProject; tokenData: any; updateDraft: (updater: (project: CardProject) => void) => void }) {
  const { t } = useTranslation();
  const rows = [
    ['tokenPermanent', tokenData?.permanent, project.settings.permanentBudget, tokenData?.permanentOver],
    ['tokenDynamic', tokenData?.dynamic, project.settings.dynamicBudget, tokenData?.dynamicOver],
    ['tokenLorebook', tokenData?.lorebook, project.settings.lorebookBudget, tokenData?.lorebookOver],
    ['tokenTotal', tokenData?.total, '', false],
  ];
  return (
    <section className="stack">
      <div className="budget-grid">
        {rows.map(([label, value, budget, over]) => (
          <div className={over ? 'metric over' : 'metric'} key={label as string}>
            <span>{t(label as string)}</span>
            <strong>{value ?? '-'}</strong>
            {budget !== '' && <small>/ {budget}</small>}
            {over && <em>{t('overBudget')}</em>}
          </div>
        ))}
      </div>
      <div className="compact-grid">
        <NumberField label="permanentBudget" value={project.settings.permanentBudget} onChange={(value) => updateDraft((p) => (p.settings.permanentBudget = value))} />
        <NumberField label="dynamicBudget" value={project.settings.dynamicBudget} onChange={(value) => updateDraft((p) => (p.settings.dynamicBudget = value))} />
        <NumberField label="lorebookBudget" value={project.settings.lorebookBudget} onChange={(value) => updateDraft((p) => (p.settings.lorebookBudget = value))} />
      </div>
      <label className="checkline"><input type="checkbox" checked={project.settings.embedLorebook} onChange={(event) => updateDraft((p) => (p.settings.embedLorebook = event.target.checked))} /> {t('embedLorebook')}</label>
      <label className="checkline"><input type="checkbox" checked={project.settings.includeSystemPromptTokens} onChange={(event) => updateDraft((p) => (p.settings.includeSystemPromptTokens = event.target.checked))} /> {t('includeSystem')}</label>
      <label className="checkline"><input type="checkbox" checked={project.settings.includePostHistoryTokens} onChange={(event) => updateDraft((p) => (p.settings.includePostHistoryTokens = event.target.checked))} /> {t('includePostHistory')}</label>
    </section>
  );
}

function LLMPanel(props: {
  template: string;
  setTemplate: (value: string) => void;
  input: string;
  setInput: (value: string) => void;
  run: () => void;
  running: boolean;
  project: CardProject;
  updateDraft: (updater: (project: CardProject) => void) => void;
}) {
  const { t } = useTranslation();
  const applyCodeBlock = (code: string) => {
    const parsed = JSON.parse(code);
    props.updateDraft((project) => {
      pushSnapshot(project, `Before applying ${props.template}`);
      applyCardPatch(project, parsed);
    });
  };
  return (
    <section className="llm-layout">
      <div className="stack">
        <label className="field">
          <span>template</span>
          <select value={props.template} onChange={(event) => props.setTemplate(event.target.value)}>
            {templates.map((template) => <option value={template} key={template}>{template}</option>)}
          </select>
        </label>
        <TextField label={t('input')} value={props.input} rows={10} onChange={props.setInput} />
        <button className="primary inline" onClick={props.run} disabled={props.running}>
          <Sparkles size={16} /> {props.running ? '...' : t('run')}
        </button>
        <p className="hint">{t('generatedPromptNote')}</p>
      </div>
      <div className="history">
        <h2>{t('history')}</h2>
        {props.project.llmHistory.map((message) => (
          <article className="history-item" key={message.id}>
            <div><strong>{message.template}</strong><span>{new Date(message.createdAt).toLocaleString()}</span></div>
            <RichResponse text={message.response} onApply={applyCodeBlock} />
          </article>
        ))}
      </div>
    </section>
  );
}

function RichResponse({ text, onApply }: { text: string; onApply: (code: string) => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState('');
  const parts = splitCodeBlocks(text);
  const copy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setStatus(t('copied'));
  };
  const apply = (code: string) => {
    try {
      onApply(code);
      setStatus(t('appliedToCard'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to apply JSON.');
    }
  };
  return (
    <div className="rich-response">
      {parts.map((part, index) => part.kind === 'code' ? (
        <div className="code-block" key={`${part.kind}-${index}`}>
          <div className="code-toolbar">
            <span>{part.lang || 'code'}</span>
            <div>
              <button onClick={() => copy(part.content)}>{t('copy')}</button>
              {isJsonLike(part.lang, part.content) && <button onClick={() => apply(part.content)}>{t('applyToCard')}</button>}
            </div>
          </div>
          <pre>{part.content}</pre>
        </div>
      ) : (
        <p key={`${part.kind}-${index}`}>{part.content}</p>
      ))}
      {status && <small className="response-status">{status}</small>}
    </div>
  );
}

function SettingsPanel({ settings, save }: { settings: AppSettings; save: (settings: AppSettings) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  return (
    <section className="stack settings-panel">
      <TextField label={t('apiKey')} value={draft.deepseekApiKey ?? ''} onChange={(value) => setDraft({ ...draft, deepseekApiKey: value })} />
      <label className="field">
        <span>{t('model')}</span>
        <select value={draft.deepseekModel} onChange={(event) => setDraft({ ...draft, deepseekModel: event.target.value })}>
          <option value="deepseek-v4-flash">deepseek-v4-flash</option>
          <option value="deepseek-v4-pro">deepseek-v4-pro</option>
        </select>
      </label>
      <label className="field">
        <span>{t('uiLanguage')}</span>
        <select value={draft.uiLocale} onChange={(event) => setDraft({ ...draft, uiLocale: event.target.value as any })}>
          <option value="zh-TW">繁體中文</option>
          <option value="en">English</option>
        </select>
      </label>
      <label className="field">
        <span>{t('promptLanguage')}</span>
        <select value={draft.promptLocale} onChange={(event) => setDraft({ ...draft, promptLocale: event.target.value as any })}>
          <option value="zh-TW">繁體中文</option>
          <option value="en">English</option>
        </select>
      </label>
      <button className="primary inline" onClick={() => save(draft)}><Save size={16} /> {t('save')}</button>
    </section>
  );
}

type ResponsePart = { kind: 'text' | 'code'; content: string; lang?: string };

function splitCodeBlocks(text: string): ResponsePart[] {
  const parts: ResponsePart[] = [];
  const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > cursor) {
      const content = text.slice(cursor, match.index).trim();
      if (content) parts.push({ kind: 'text', content });
    }
    parts.push({ kind: 'code', lang: match[1], content: match[2].trim() });
    cursor = regex.lastIndex;
  }
  const tail = text.slice(cursor).trim();
  if (tail) parts.push({ kind: 'text', content: tail });
  return parts.length ? parts : [{ kind: 'text' as const, content: text }];
}

function isJsonLike(lang: string | undefined, content: string) {
  const trimmed = content.trim();
  return lang?.toLowerCase() === 'json' || trimmed.startsWith('{') || trimmed.startsWith('[');
}

function pushSnapshot(project: CardProject, label: string) {
  project.snapshots.unshift({
    id: `snap_${Date.now()}`,
    label,
    card: structuredClone(project.card),
    lorebook: structuredClone(project.lorebook),
    createdAt: new Date().toISOString(),
  });
  project.snapshots = project.snapshots.slice(0, 20);
}

function applyCardPatch(project: CardProject, payload: any) {
  if (Array.isArray(payload)) {
    project.lorebook.entries = payload;
    return;
  }
  const source = payload.card ?? payload.character_card ?? payload;
  if (source.spec === 'chara_card_v2' && source.data) {
    project.card = normalizeCard(source);
    if (source.data.character_book) {
      project.lorebook = source.data.character_book;
    }
    return;
  }
  if (payload.lorebook || payload.character_book) {
    project.lorebook = payload.lorebook ?? payload.character_book;
  }
  const dataPatch = source.data ?? source;
  const cardKeys = [
    'name',
    'description',
    'personality',
    'scenario',
    'first_mes',
    'mes_example',
    'creator_notes',
    'system_prompt',
    'post_history_instructions',
    'alternate_greetings',
    'tags',
    'creator',
    'character_version',
    'extensions',
  ];
  for (const key of cardKeys) {
    if (Object.prototype.hasOwnProperty.call(dataPatch, key)) {
      (project.card.data as any)[key] = dataPatch[key];
    }
  }
}

function normalizeCard(card: any): CharacterCardV2 {
  return {
    spec: 'chara_card_v2' as const,
    spec_version: card.spec_version ?? '2.0',
    data: {
      alternate_greetings: [],
      tags: [],
      extensions: {},
      ...card.data,
    },
    extensions: card.extensions ?? {},
  };
}

function diffSnapshot(project: CardProject, snapshot: CardProject['snapshots'][number]) {
  const diffs: string[] = [];
  const currentData = project.card.data as any;
  const oldData = snapshot.card.data as any;
  for (const key of ['name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example', 'creator_notes', 'system_prompt', 'post_history_instructions', 'tags', 'alternate_greetings']) {
    if (JSON.stringify(currentData[key]) !== JSON.stringify(oldData[key])) {
      diffs.push(`card.data.${key} changed`);
    }
  }
  if (JSON.stringify(project.lorebook.entries) !== JSON.stringify(snapshot.lorebook.entries)) {
    diffs.push('lorebook.entries changed');
  }
  return diffs;
}

function splitCommaList(value: string) {
  return value.split(/[,\uFF0C\n]/g).map((item) => item.trim()).filter(Boolean);
}

function splitList(value: string) {
  return value.split(/[,，\n]/g).map((item) => item.trim()).filter(Boolean);
}

function parseJSON(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

async function readCardFile(file: File) {
  if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
    const chunks = parsePngTextChunks(await file.arrayBuffer());
    const chara = chunks.chara ?? chunks.Chara;
    if (!chara) {
      throw new Error('PNG metadata does not contain a SillyTavern chara chunk.');
    }
    const decoded = new TextDecoder().decode(base64ToBytes(chara));
    return JSON.parse(decoded);
  }
  return JSON.parse(await file.text());
}

function parsePngTextChunks(buffer: ArrayBuffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder();
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) {
    throw new Error('Not a PNG file.');
  }
  const chunks: Record<string, string> = {};
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = decoder.decode(bytes.slice(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const data = bytes.slice(dataStart, dataStart + length);
    if (type === 'tEXt') {
      const zero = data.indexOf(0);
      if (zero > -1) {
        chunks[decoder.decode(data.slice(0, zero))] = decoder.decode(data.slice(zero + 1));
      }
    }
    if (type === 'iTXt') {
      const zero = data.indexOf(0);
      if (zero > -1) {
        const keyword = decoder.decode(data.slice(0, zero));
        let cursor = zero + 1;
        const compressionFlag = data[cursor++];
        cursor++;
        for (let segment = 0; segment < 2; segment += 1) {
          while (cursor < data.length && data[cursor] !== 0) cursor += 1;
          cursor += 1;
        }
        if (compressionFlag === 0 && cursor < data.length) {
          chunks[keyword] = decoder.decode(data.slice(cursor));
        }
      }
    }
    offset = dataStart + length + 4;
  }
  return chunks;
}

function base64ToBytes(value: string) {
  const binary = atob(value.trim());
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
