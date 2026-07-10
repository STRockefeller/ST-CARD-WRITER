import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Brain, CheckCircle2, Clipboard, Download, FileJson, Languages, PanelLeftClose, PanelLeftOpen, Plus, Save, Settings, Sparkles, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import type { AppSettings, CardProject, CharacterBook, CharacterCardV2, LorebookEntry } from './types';
import i18n from './i18n';

const brainstormTemplates = ['brainstorm', 'revise_card', 'generate_card', 'generate_lorebook', 'field_rewrite'];
const reviewTemplates = ['review', 'translate', 'compress', 'mvu'];
const reviewFocusOptions = ['overall', 'llm_clarity', 'play_experience', 'token_budget', 'lorebook', 'mvu'];
const templateLabels: Record<string, string> = {
  brainstorm: 'templateBrainstorm',
  revise_card: 'templateReviseCard',
  field_rewrite: 'templateFieldRewrite',
  generate_card: 'templateGenerateCard',
  generate_lorebook: 'templateGenerateLorebook',
  review: 'templateReview',
  translate: 'templateTranslate',
  compress: 'templateCompress',
  mvu: 'templateMvu',
};

type LLMRunRequest = {
  template?: string;
  input?: string;
  conversationId?: string;
  autoApplyFieldTarget?: FieldTarget;
};

type FieldTarget =
  | { kind: 'card'; key: keyof CardProject['card']['data']; label: string }
  | { kind: 'lorebook'; key: keyof CharacterBook; label: string }
  | { kind: 'loreEntry'; index: number; key: keyof LorebookEntry; label: string };

export function App() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string>('');
  const [tab, setTab] = useState('brainstorm');
  const [draft, setDraft] = useState<CardProject | null>(null);
  const [llmInput, setLlmInput] = useState('');
  const [llmTemplate, setLlmTemplate] = useState('brainstorm');
  const [conversationId, setConversationId] = useState('default');
  const [exportStatus, setExportStatus] = useState('');
  const [fieldTarget, setFieldTarget] = useState<FieldTarget | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [appError, setAppError] = useState('');
  const [dismissedQueryError, setDismissedQueryError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const activeProjectRef = useRef('');

  const projectsQuery = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });

  useEffect(() => {
    if (!activeId && projectsQuery.data?.length) {
      setActiveId(projectsQuery.data[0].id);
    }
  }, [activeId, projectsQuery.data]);

  useEffect(() => {
    const project = projectsQuery.data?.find((item) => item.id === activeId) ?? null;
    const activeProjectChanged = activeProjectRef.current !== activeId;
    setDraft(project ? structuredClone(project) : null);
    if (activeProjectChanged) {
      activeProjectRef.current = activeId;
      setConversationId('default');
      setFieldTarget(null);
    }
  }, [activeId, projectsQuery.data]);

  useEffect(() => {
    if (settingsQuery.data?.uiLocale) {
      i18n.changeLanguage(settingsQuery.data.uiLocale);
    }
  }, [settingsQuery.data?.uiLocale]);

  useEffect(() => {
    if (tab === 'brainstorm' && !brainstormTemplates.includes(llmTemplate)) setLlmTemplate('brainstorm');
    if (tab === 'review' && !reviewTemplates.includes(llmTemplate)) setLlmTemplate('review');
  }, [llmTemplate, tab]);

  useEffect(() => {
    setDismissedQueryError('');
  }, [projectsQuery.error, settingsQuery.error]);

  const createProject = useMutation({
    mutationFn: () => api.createProject('Untitled card'),
    onSuccess(project) {
      setAppError('');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setActiveId(project.id);
    },
    onError(error) {
      setAppError(getErrorMessage(error));
    },
  });

  const saveProject = useMutation({
    mutationFn: (project: CardProject) => api.saveProject(project),
    onSuccess(project) {
      setAppError('');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['tokens', project.id] });
    },
    onError(error) {
      setAppError(getErrorMessage(error));
    },
  });

  const saveSettings = useMutation({
    mutationFn: (settings: AppSettings) => api.saveSettings(settings),
    onSuccess(settings) {
      setAppError('');
      queryClient.setQueryData(['settings'], settings);
      i18n.changeLanguage(settings.uiLocale);
    },
    onError(error) {
      setAppError(getErrorMessage(error));
    },
  });

  const importCard = useMutation({
    mutationFn: async (file: File) => {
      const parsed = await readCardFile(file);
      return api.importCard(parsed?.data?.name ?? file.name.replace(/\.json$/i, ''), parsed);
    },
    onSuccess(project) {
      setAppError('');
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setActiveId(project.id);
    },
    onError(error) {
      setAppError(getErrorMessage(error));
    },
  });

  const deleteProject = useMutation({
    mutationFn: (projectId: string) => api.deleteProject(projectId),
    onSuccess(_, projectId) {
      setAppError('');
      const remaining = projectsQuery.data?.filter((project) => project.id !== projectId) ?? [];
      if (activeId === projectId) {
        setActiveId(remaining[0]?.id ?? '');
        setDraft(null);
      }
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.removeQueries({ queryKey: ['tokens', projectId] });
    },
    onError(error) {
      setAppError(getErrorMessage(error));
    },
  });

  const convertChinese = useMutation({
    mutationFn: (mode: 's2t' | 't2s') => api.convertChinese(draft!.id, mode),
    onSuccess(project) {
      setAppError('');
      setDraft(structuredClone(project));
      queryClient.setQueryData<CardProject[]>(['projects'], (projects) =>
        projects?.map((item) => (item.id === project.id ? project : item)) ?? [project],
      );
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['tokens', project.id] });
    },
    onError(error) {
      setAppError(getErrorMessage(error));
    },
  });

  const runLLM = useMutation({
    mutationFn: (request?: LLMRunRequest) =>
      api.runLLM(
        draft!.id,
        request?.conversationId ?? conversationId,
        request?.template ?? llmTemplate,
        settingsQuery.data?.promptLocale ?? 'zh-TW',
        request?.input ?? llmInput,
      ),
    onSuccess(message, request) {
      setAppError('');
      if (request?.autoApplyFieldTarget) {
        const code = firstCodeBlock(message.response) ?? message.response;
        const saved = projectsQuery.data?.find((item) => item.id === draft?.id) ?? draft;
        if (saved) {
          const next = structuredClone(saved);
          if (!next.llmHistory.some((item) => item.id === message.id)) {
            next.llmHistory = [message, ...next.llmHistory];
          }
          pushSnapshot(next, `Before AI rewrite ${request.autoApplyFieldTarget.label}`);
          applyFieldTarget(next, request.autoApplyFieldTarget, code);
          setDraft(next);
          saveProject.mutate(next);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
    onError(error) {
      setAppError(getErrorMessage(error));
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

  const commitDraft = (updater: (project: CardProject) => void) => {
    if (!draft) return;
    const next = structuredClone(draft);
    updater(next);
    next.updatedAt = new Date().toISOString();
    setDraft(next);
    saveProject.mutate(next);
  };

  const settingsDraft = settingsQuery.data;
  const isDirty = useMemo(() => {
    const saved = projectsQuery.data?.find((item) => item.id === draft?.id);
    return Boolean(draft && saved && JSON.stringify(draft) !== JSON.stringify(saved));
  }, [draft, projectsQuery.data]);

  const exportCard = async (mode: 'download' | 'copy') => {
    if (!draft) return;
    try {
      const card = buildExportCard(draft);
      const json = JSON.stringify(card, null, 2);
      const filename = `${safeFilename(draft.card.data.name || draft.title)}.json`;
      if (mode === 'copy') {
        await navigator.clipboard.writeText(json);
        setExportStatus(t('exportCopied'));
        return;
      }
      const blob = new Blob([json], { type: 'application/json' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      setExportStatus(t('exportDownloaded', { filename }));
    } catch (error) {
      setExportStatus(t('exportFailed', { message: error instanceof Error ? error.message : String(error) }));
    }
  };

  const startFieldAI = (target: FieldTarget, value: unknown, mode: 'discuss' | 'revise') => {
    const currentValue = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    if (mode === 'revise') {
      const direction = window.prompt(t('fieldRewritePrompt', { field: target.label }));
      if (direction === null) return;
      setFieldTarget(target);
      setTab('brainstorm');
      setLlmTemplate('field_rewrite');
      const nextConversationId = `field_${target.kind}_${Date.now()}`;
      setConversationId(nextConversationId);
      setLlmInput(direction);
      runLLM.mutate({
        template: 'field_rewrite',
        conversationId: nextConversationId,
        input: buildFieldAIPrompt(target.label, currentValue, mode, direction),
        autoApplyFieldTarget: target,
      });
      return;
    }
    setFieldTarget(target);
    setTab('brainstorm');
    setLlmTemplate('brainstorm');
    setConversationId(`field_${target.kind}_${Date.now()}`);
    setLlmInput(buildFieldAIPrompt(target.label, currentValue, mode));
  };

  const requestDeleteProject = (project: CardProject) => {
    if (window.confirm(t('confirmDeleteProject', { title: project.title }))) {
      deleteProject.mutate(project.id);
    }
  };

  const queryError = projectsQuery.error ?? settingsQuery.error;
  const queryErrorMessage = getErrorMessage(queryError);
  const visibleError = appError || (queryErrorMessage !== dismissedQueryError ? queryErrorMessage : '');

  return (
    <div className={sidebarCollapsed ? 'app-shell sidebar-collapsed' : 'app-shell'}>
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
              <span className="project-text">
                <strong>{project.title}</strong>
                <span>{project.card.data.name || 'Unnamed'}</span>
              </span>
              <span
                role="button"
                tabIndex={0}
                className="project-delete"
                aria-label={t('deleteProject')}
                title={t('deleteProject')}
                onClick={(event) => {
                  event.stopPropagation();
                  requestDeleteProject(project);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    requestDeleteProject(project);
                  }
                }}
              >
                <Trash2 size={14} />
              </span>
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
                <button className="ghost" onClick={() => setSidebarCollapsed((value) => !value)}>
                  {sidebarCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
                  {sidebarCollapsed ? t('showProjects') : t('hideProjects')}
                </button>
                <button className="primary" onClick={() => saveProject.mutate(draft)} disabled={!isDirty}>
                  <Save size={16} /> {t('save')}
                </button>
                <button className="secondary strong" onClick={() => exportCard('download')}>
                  <Download size={16} /> {t('exportJson')}
                </button>
                <button className="ghost" onClick={() => exportCard('copy')}>
                  <Clipboard size={16} /> {t('copyJson')}
                </button>
              </div>
            </header>
            {exportStatus && <div className="export-status">{exportStatus}</div>}
            {visibleError && (
              <ErrorBanner
                message={visibleError}
                onDismiss={() => {
                  setAppError('');
                  if (queryErrorMessage) setDismissedQueryError(queryErrorMessage);
                }}
              />
            )}

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
                run={(request) => runLLM.mutate(request)}
                running={runLLM.isLoading}
                project={draft}
                updateDraft={updateDraft}
                commitDraft={commitDraft}
                conversationId={conversationId}
                setConversationId={setConversationId}
                templates={brainstormTemplates}
                mode="brainstorm"
                fieldTarget={fieldTarget}
                clearFieldTarget={() => setFieldTarget(null)}
              />
            )}
            {tab === 'card' && <CardEditor project={draft} updateDraft={updateDraft} startFieldAI={startFieldAI} />}
            {tab === 'lorebook' && <LorebookEditor project={draft} updateDraft={updateDraft} startFieldAI={startFieldAI} />}
            {tab === 'tokens' && <TokenPanel project={draft} tokenData={countDraftBudget(draft)} updateDraft={updateDraft} />}
            {tab === 'review' && (
              <LLMPanel
                template={llmTemplate}
                setTemplate={setLlmTemplate}
                input={llmInput}
                setInput={setLlmInput}
                run={(request) => runLLM.mutate(request)}
                running={runLLM.isLoading}
                project={draft}
                updateDraft={updateDraft}
                commitDraft={commitDraft}
                conversationId={conversationId}
                setConversationId={setConversationId}
                templates={reviewTemplates}
                mode="review"
                showChineseConversion={Boolean(settingsDraft?.promptLocale?.startsWith('zh'))}
                convertChinese={(mode) => convertChinese.mutate(mode)}
                convertingChinese={convertChinese.isLoading}
                fieldTarget={fieldTarget}
                clearFieldTarget={() => setFieldTarget(null)}
              />
            )}
            {tab === 'settings' && settingsDraft && (
              <ProjectSettingsPanel settings={settingsDraft} project={draft} updateDraft={updateDraft} save={(next) => saveSettings.mutate(next)} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function buildExportCard(project: CardProject): CharacterCardV2 {
  const card = structuredClone(project.card);
  card.spec = 'chara_card_v2';
  card.spec_version = card.spec_version || '2.0';
  if (project.settings.embedLorebook) {
    card.data.character_book = {
      ...structuredClone(project.lorebook),
      token_budget: project.settings.lorebookBudget,
    };
  } else {
    delete card.data.character_book;
  }
  return card;
}

function Tab(props: { id: string; label: string; icon: JSX.Element; active: string; onClick: (id: string) => void }) {
  return (
    <button className={props.active === props.id ? 'tab active' : 'tab'} onClick={() => props.onClick(props.id)}>
      {props.icon}
      {props.label}
    </button>
  );
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="error-banner">
      <div>
        <strong>{t('backendError')}</strong>
        <span>{message}</span>
      </div>
      <button onClick={onDismiss}>{t('dismiss')}</button>
    </div>
  );
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  onDiscuss?: () => void;
  onRevise?: () => void;
}) {
  return (
    <label className="field">
      <span className="field-title">
        {props.label}
        {(props.onDiscuss || props.onRevise) && (
          <span className="field-ai-actions">
            {props.onDiscuss && <button type="button" onClick={props.onDiscuss}>AI 討論</button>}
            {props.onRevise && <button type="button" onClick={props.onRevise}>AI 改寫</button>}
          </span>
        )}
      </span>
      {props.rows ? (
        <textarea rows={props.rows} value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      ) : (
        <input value={props.value} onChange={(event) => props.onChange(event.target.value)} />
      )}
    </label>
  );
}

function CardEditor({
  project,
  updateDraft,
  startFieldAI,
}: {
  project: CardProject;
  updateDraft: (updater: (project: CardProject) => void) => void;
  startFieldAI: (target: FieldTarget, value: unknown, mode: 'discuss' | 'revise') => void;
}) {
  const data = project.card.data;
  const setData = (key: keyof typeof data, value: unknown) => updateDraft((p) => ((p.card.data as any)[key] = value));
  const aiProps = (key: keyof typeof data, label: string, value: unknown) => ({
    onDiscuss: () => startFieldAI({ kind: 'card', key, label }, value, 'discuss' as const),
    onRevise: () => startFieldAI({ kind: 'card', key, label }, value, 'revise' as const),
  });
  return (
    <section className="stack">
      <VersionHistory project={project} updateDraft={updateDraft} />
      <div className="editor-grid">
        <TextField label="name" value={data.name} onChange={(value) => setData('name', value)} {...aiProps('name', 'card.data.name', data.name)} />
        <TextField label="creator" value={data.creator} onChange={(value) => setData('creator', value)} />
        <TextField label="character_version" value={data.character_version} onChange={(value) => setData('character_version', value)} />
        <TextField label="tags" value={data.tags.join(', ')} onChange={(value) => setData('tags', splitCommaList(value))} />
        <TextField label="description" value={data.description} rows={8} onChange={(value) => setData('description', value)} {...aiProps('description', 'card.data.description', data.description)} />
        <TextField label="personality" value={data.personality} rows={8} onChange={(value) => setData('personality', value)} {...aiProps('personality', 'card.data.personality', data.personality)} />
        <TextField label="scenario" value={data.scenario} rows={7} onChange={(value) => setData('scenario', value)} {...aiProps('scenario', 'card.data.scenario', data.scenario)} />
        <TextField label="first_mes" value={data.first_mes} rows={7} onChange={(value) => setData('first_mes', value)} {...aiProps('first_mes', 'card.data.first_mes', data.first_mes)} />
        <TextField label="mes_example" value={data.mes_example} rows={8} onChange={(value) => setData('mes_example', value)} {...aiProps('mes_example', 'card.data.mes_example', data.mes_example)} />
        <TextField label="creator_notes" value={data.creator_notes} rows={6} onChange={(value) => setData('creator_notes', value)} {...aiProps('creator_notes', 'card.data.creator_notes', data.creator_notes)} />
        <TextField label="system_prompt" value={data.system_prompt} rows={6} onChange={(value) => setData('system_prompt', value)} {...aiProps('system_prompt', 'card.data.system_prompt', data.system_prompt)} />
        <TextField label="post_history_instructions" value={data.post_history_instructions} rows={6} onChange={(value) => setData('post_history_instructions', value)} {...aiProps('post_history_instructions', 'card.data.post_history_instructions', data.post_history_instructions)} />
        <AlternativeGreetingsEditor
          greetings={data.alternate_greetings ?? []}
          onChange={(value) => setData('alternate_greetings', value)}
          startFieldAI={startFieldAI}
        />
        <TextField label="data.extensions JSON" value={JSON.stringify(data.extensions ?? {}, null, 2)} rows={7} onChange={(value) => setData('extensions', parseJSON(value))} />
      </div>
    </section>
  );
}

function AlternativeGreetingsEditor({
  greetings,
  onChange,
  startFieldAI,
}: {
  greetings: string[];
  onChange: (value: string[]) => void;
  startFieldAI: (target: FieldTarget, value: unknown, mode: 'discuss' | 'revise') => void;
}) {
  const { t } = useTranslation();
  const update = (index: number, value: string) => {
    const next = [...greetings];
    next[index] = value;
    onChange(next);
  };
  const remove = (index: number) => onChange(greetings.filter((_, itemIndex) => itemIndex !== index));
  return (
    <section className="alt-greetings">
      <div className="alt-head">
        <span>alternate_greetings</span>
        <button onClick={() => onChange([...greetings, ''])}>
          <Plus size={16} /> {t('addGreeting')}
        </button>
      </div>
      {greetings.length === 0 && <p>{t('noGreetings')}</p>}
      {greetings.map((greeting, index) => (
        <article className="alt-greeting" key={index}>
          <div>
            <strong>{t('greeting')} {index + 1}</strong>
            <span className="field-ai-actions">
              <button type="button" onClick={() => startFieldAI({ kind: 'card', key: 'alternate_greetings', label: `card.data.alternate_greetings[${index}]` }, greeting, 'discuss')}>AI 討論</button>
              <button type="button" onClick={() => startFieldAI({ kind: 'card', key: 'alternate_greetings', label: `card.data.alternate_greetings[${index}]` }, greeting, 'revise')}>AI 改寫</button>
              <button className="danger" onClick={() => remove(index)}>
                <Trash2 size={15} /> {t('deleteEntry')}
              </button>
            </span>
          </div>
          <textarea rows={6} value={greeting} onChange={(event) => update(index, event.target.value)} />
        </article>
      ))}
    </section>
  );
}

function LorebookEditor({
  project,
  updateDraft,
  startFieldAI,
}: {
  project: CardProject;
  updateDraft: (updater: (project: CardProject) => void) => void;
  startFieldAI: (target: FieldTarget, value: unknown, mode: 'discuss' | 'revise') => void;
}) {
  const book = project.lorebook;
  const updateBook = (updater: (book: CharacterBook) => void) => updateDraft((p) => updater(p.lorebook));
  const bookAI = (key: keyof CharacterBook, label: string, value: unknown) => ({
    onDiscuss: () => startFieldAI({ kind: 'lorebook', key, label }, value, 'discuss' as const),
    onRevise: () => startFieldAI({ kind: 'lorebook', key, label }, value, 'revise' as const),
  });
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
        <TextField label="name" value={book.name} onChange={(value) => updateBook((b) => (b.name = value))} {...bookAI('name', 'lorebook.name', book.name)} />
        <TextField label="description" value={book.description} onChange={(value) => updateBook((b) => (b.description = value))} {...bookAI('description', 'lorebook.description', book.description)} />
        <NumberField label="scan_depth" value={book.scan_depth} onChange={(value) => updateBook((b) => (b.scan_depth = value))} />
        <NumberField label="token_budget" value={book.token_budget} onChange={(value) => updateBook((b) => (b.token_budget = value))} />
      </div>
      <button className="primary inline" onClick={addEntry}><Plus size={16} /> Add Entry</button>
      <div className="entry-list">
        {book.entries.map((entry, index) => (
          <LoreEntry key={entry.id} entry={entry} index={index} updateBook={updateBook} startFieldAI={startFieldAI} />
        ))}
      </div>
    </section>
  );
}

function LoreEntry({
  entry,
  index,
  updateBook,
  startFieldAI,
}: {
  entry: LorebookEntry;
  index: number;
  updateBook: (updater: (book: CharacterBook) => void) => void;
  startFieldAI: (target: FieldTarget, value: unknown, mode: 'discuss' | 'revise') => void;
}) {
  const { t } = useTranslation();
  const updateEntry = (updater: (entry: LorebookEntry) => void) =>
    updateBook((book) => {
      updater(book.entries[index]);
    });
  const entryAI = (key: keyof LorebookEntry, label: string, value: unknown) => ({
    onDiscuss: () => startFieldAI({ kind: 'loreEntry', index, key, label }, value, 'discuss' as const),
    onRevise: () => startFieldAI({ kind: 'loreEntry', index, key, label }, value, 'revise' as const),
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
      <TextField label="content" value={entry.content} rows={6} onChange={(value) => updateEntry((e) => (e.content = value))} {...entryAI('content', `lorebook.entries[${index}].content`, entry.content)} />
      <TextField label="comment" value={entry.comment} onChange={(value) => updateEntry((e) => (e.comment = value))} {...entryAI('comment', `lorebook.entries[${index}].comment`, entry.comment)} />
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
  run: (request?: LLMRunRequest) => void;
  running: boolean;
  project: CardProject;
  updateDraft: (updater: (project: CardProject) => void) => void;
  commitDraft: (updater: (project: CardProject) => void) => void;
  conversationId: string;
  setConversationId: (value: string) => void;
  templates: string[];
  mode: 'brainstorm' | 'review';
  showChineseConversion?: boolean;
  convertChinese?: (mode: 's2t' | 't2s') => void;
  convertingChinese?: boolean;
  fieldTarget: FieldTarget | null;
  clearFieldTarget: () => void;
}) {
  const { t } = useTranslation();
  const [reviewFocus, setReviewFocus] = useState('overall');
  const [targetLanguage, setTargetLanguage] = useState('繁體中文');
  const [shortInstruction, setShortInstruction] = useState('');
  const conversations = conversationOptions(props.project.llmHistory, props.conversationId);
  const currentMessages = props.project.llmHistory.filter((message) => getConversationId(message) === props.conversationId);
  const applyCodeBlock = (code: string) => {
    const parsed = JSON.parse(code);
    props.updateDraft((project) => {
      pushSnapshot(project, `Before applying ${props.template}`);
      applyCardPatch(project, parsed);
    });
  };
  const applyFieldBlock = (code: string) => {
    if (!props.fieldTarget) return;
    props.updateDraft((project) => {
      pushSnapshot(project, `Before applying ${props.fieldTarget?.label}`);
      applyFieldTarget(project, props.fieldTarget!, code);
    });
  };
  const runTask = (template: string, input: string) => {
    props.setTemplate(template);
    props.run({ template, input });
  };
  const runReviewTask = () => {
    const label = t(`reviewFocus_${reviewFocus}`);
    runTask('review', `審核方向：${label}\n請依此方向審核目前角色卡與 lorebook，輸出結構化問題、原因與修改建議。`);
  };
  const runTranslateTask = () => {
    runTask('translate', `目標語言：${targetLanguage || '繁體中文'}\n${shortInstruction ? `翻譯注意事項：${shortInstruction}` : ''}`);
  };
  return (
    <section className="llm-layout">
      <div className="stack llm-control-panel">
        <div className="discussion-bar">
          <label className="field">
            <span>{t('discussion')}</span>
            <select value={props.conversationId} onChange={(event) => props.setConversationId(event.target.value)}>
              {conversations.map((conversation) => (
                <option value={conversation.id} key={conversation.id}>{conversation.label}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() => props.setConversationId(`conv_${Date.now()}`)}
          >
            <Plus size={16} /> {t('newDiscussion')}
          </button>
        </div>
        {props.mode === 'brainstorm' ? (
          <>
            <TextField label={t('discussionInput')} value={props.input} rows={10} onChange={props.setInput} />
            <div className="task-actions">
              <button className="primary" onClick={() => runTask('brainstorm', props.input)} disabled={props.running || !props.input.trim()}>
                <Sparkles size={16} /> {props.running ? '...' : t('sendDiscussion')}
              </button>
              <button onClick={() => runTask('generate_card', buildManualTaskPrompt('generate_card'))} disabled={props.running}>
                <Sparkles size={16} /> {t('templateGenerateCard')}
              </button>
              <button onClick={() => runTask('generate_lorebook', buildManualTaskPrompt('generate_lorebook'))} disabled={props.running}>
                <BookOpen size={16} /> {t('templateGenerateLorebook')}
              </button>
            </div>
            <label className="field">
              <span>{t('reviseDirection')}</span>
              <input value={shortInstruction} onChange={(event) => setShortInstruction(event.target.value)} placeholder={t('reviseDirectionPlaceholder')} />
            </label>
            <button className="secondary strong inline" onClick={() => runTask('revise_card', shortInstruction || t('reviseDefaultDirection'))} disabled={props.running}>
              <Sparkles size={16} /> {t('templateReviseCard')}
            </button>
          </>
        ) : (
          <>
            {props.showChineseConversion && (
              <section className="utility-panel">
                <div>
                  <strong>{t('chineseConversion')}</strong>
                  <span>{t('chineseConversionHint')}</span>
                </div>
                <div className="task-actions">
                  <button onClick={() => props.convertChinese?.('s2t')} disabled={props.convertingChinese}>
                    {props.convertingChinese ? '...' : t('simplifiedToTraditional')}
                  </button>
                  <button onClick={() => props.convertChinese?.('t2s')} disabled={props.convertingChinese}>
                    {props.convertingChinese ? '...' : t('traditionalToSimplified')}
                  </button>
                </div>
              </section>
            )}
            <label className="field">
              <span>{t('task')}</span>
              <select value={props.template} onChange={(event) => props.setTemplate(event.target.value)}>
                {props.templates.map((template) => <option value={template} key={template}>{t(templateLabels[template])}</option>)}
              </select>
            </label>
            {props.template === 'review' && (
              <>
                <label className="field">
                  <span>{t('reviewFocus')}</span>
                  <select value={reviewFocus} onChange={(event) => setReviewFocus(event.target.value)}>
                    {reviewFocusOptions.map((option) => <option value={option} key={option}>{t(`reviewFocus_${option}`)}</option>)}
                  </select>
                </label>
                <button className="primary inline" onClick={runReviewTask} disabled={props.running}>
                  <Sparkles size={16} /> {props.running ? '...' : t('runReview')}
                </button>
              </>
            )}
            {props.template === 'translate' && (
              <>
                <label className="field">
                  <span>{t('targetLanguage')}</span>
                  <input value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} placeholder="繁體中文 / English / 日本語" />
                </label>
                <TextField label={t('translationNotes')} value={shortInstruction} rows={3} onChange={setShortInstruction} />
                <button className="primary inline" onClick={runTranslateTask} disabled={props.running || !targetLanguage.trim()}>
                  <Languages size={16} /> {props.running ? '...' : t('runTranslate')}
                </button>
              </>
            )}
            {props.template === 'compress' && (
              <button className="primary inline" onClick={() => runTask('compress', '請直接壓縮目前角色卡與 lorebook，保留可玩性、角色核心、關鍵設定與觸發條件。')} disabled={props.running}>
                <Sparkles size={16} /> {props.running ? '...' : t('runCompress')}
              </button>
            )}
            {props.template === 'mvu' && (
              <button className="primary inline" onClick={() => runTask('mvu', '請直接檢查目前卡片的 MVU/狀態更新寫法，找出變數、規則、初始狀態與翻譯敏感問題。')} disabled={props.running}>
                <Sparkles size={16} /> {props.running ? '...' : t('runMvu')}
              </button>
            )}
          </>
        )}
        <p className="hint">{t('generatedPromptNote')}</p>
        {props.fieldTarget && (
          <div className="field-target-banner">
            <span>{t('activeFieldTarget')}: {props.fieldTarget.label}</span>
            <button onClick={props.clearFieldTarget}>{t('clearFieldTarget')}</button>
          </div>
        )}
      </div>
      <div className="history llm-history-panel">
        <div className="history-head">
          <div>
            <h2>{t('history')}</h2>
            <span>{t('currentDiscussion')}: {conversationLabel(props.conversationId)}</span>
          </div>
          <div>
            <button
              onClick={() => props.commitDraft((project) => {
                project.llmHistory = project.llmHistory.filter((message) => getConversationId(message) !== props.conversationId);
              })}
            >
              {t('clearCurrentDiscussion')}
            </button>
            <button
              className="danger"
              onClick={() => props.commitDraft((project) => {
                project.llmHistory = [];
              })}
            >
              {t('clearAllHistory')}
            </button>
          </div>
        </div>
        {currentMessages.map((message) => (
          <article className="history-item" key={message.id}>
            <div className="history-meta"><strong>{message.template}</strong><span>{new Date(message.createdAt).toLocaleString()}</span></div>
            {message.userInput && <blockquote>{message.userInput}</blockquote>}
            <RichResponse text={message.response} onApply={applyCodeBlock} onApplyField={props.fieldTarget ? applyFieldBlock : undefined} fieldLabel={props.fieldTarget?.label} />
          </article>
        ))}
      </div>
    </section>
  );
}

function RichResponse({
  text,
  onApply,
  onApplyField,
  fieldLabel,
}: {
  text: string;
  onApply: (code: string) => void;
  onApplyField?: (code: string) => void;
  fieldLabel?: string;
}) {
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
  const applyField = (code: string) => {
    try {
      onApplyField?.(code);
      setStatus(t('appliedToField', { field: fieldLabel }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Unable to apply field content.');
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
              {onApplyField && <button onClick={() => applyField(part.content)}>{t('applyToField')}</button>}
            </div>
          </div>
          <pre>{part.content}</pre>
        </div>
      ) : (
        <MarkdownText content={part.content} key={`${part.kind}-${index}`} />
      ))}
      {status && <small className="response-status">{status}</small>}
    </div>
  );
}

function MarkdownText({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content);
  return (
    <div className="markdown-response">
      {blocks.map((block, index) => {
        if (block.kind === 'table') {
          return (
            <div className="markdown-table-wrap" key={`table-${index}`}>
              <table>
                <thead>
                  <tr>{block.headers.map((cell, cellIndex) => <th key={cellIndex}>{renderInline(cell)}</th>)}</tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInline(cell)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.kind === 'heading') return <h3 key={`heading-${index}`}>{renderInline(block.text)}</h3>;
        if (block.kind === 'rule') return <hr key={`rule-${index}`} />;
        if (block.kind === 'list') {
          const items = block.items.map((item, itemIndex) => <li key={itemIndex}>{renderInline(item)}</li>);
          return block.ordered ? <ol key={`list-${index}`}>{items}</ol> : <ul key={`list-${index}`}>{items}</ul>;
        }
        return <p key={`paragraph-${index}`}>{renderInline(block.text)}</p>;
      })}
    </div>
  );
}

type MarkdownBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'rule' }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] };

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1;
      continue;
    }

    if (isTableStart(lines, index)) {
      const headers = splitTableRow(lines[index]);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ kind: 'table', headers, rows });
      continue;
    }

    const heading = lines[index].match(/^\s{0,3}#{1,4}\s+(.+)$/);
    if (heading) {
      blocks.push({ kind: 'heading', text: heading[1].trim() });
      index += 1;
      continue;
    }

    if (/^\s*-{3,}\s*$/.test(lines[index])) {
      blocks.push({ kind: 'rule' });
      index += 1;
      continue;
    }

    const listMatch = lines[index].match(/^\s*(?:[-*+]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const ordered = /^\s*\d+\./.test(lines[index]);
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*(?:[-*+]|\d+\.)\s+(.+)$/);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isTableStart(lines, index) &&
      !/^\s{0,3}#{1,4}\s+/.test(lines[index]) &&
      !/^\s*-{3,}\s*$/.test(lines[index]) &&
      !/^\s*(?:[-*+]|\d+\.)\s+/.test(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
  }

  return blocks;
}

function isTableStart(lines: string[], index: number) {
  return index + 1 < lines.length && isTableRow(lines[index]) && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1]);
}

function isTableRow(line: string) {
  return line.includes('|') && splitTableRow(line).length > 1;
}

function splitTableRow(line: string) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
}

function renderInline(text: string) {
  const nodes: Array<string | JSX.Element> = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(text.slice(cursor, match.index));
    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${match.index}-${token}`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<code key={`${match.index}-${token}`}>{token.slice(1, -1)}</code>);
    }
    cursor = regex.lastIndex;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

function getConversationId(message: { conversationId?: string }) {
  return message.conversationId || 'default';
}

function conversationOptions(messages: Array<{ conversationId?: string; createdAt: string }>, currentId: string) {
  const ids = new Set<string>(['default', currentId || 'default']);
  for (const message of messages) ids.add(getConversationId(message));
  return Array.from(ids).map((id) => ({ id, label: conversationLabel(id) }));
}

function conversationLabel(id: string) {
  if (id === 'default') return 'default';
  const compact = id.replace(/^conv_/, '');
  const timestamp = Number(compact);
  if (Number.isFinite(timestamp)) return new Date(timestamp).toLocaleString();
  return compact || 'default';
}

function safeFilename(value: string) {
  return (value || 'character-card').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'character-card';
}

function firstCodeBlock(text: string) {
  return splitCodeBlocks(text).find((part) => part.kind === 'code')?.content;
}

function buildManualTaskPrompt(template: string) {
  if (template === 'generate_card') {
    return '請根據目前討論串、現有角色卡內容、創作偏好與 token 預算，生成可套用的 SillyTavern V2 角色卡 JSON。保留有價值的既有內容，不要忽略本討論串已確認的方向。';
  }
  if (template === 'generate_lorebook') {
    return '請根據目前討論串、現有角色卡內容、創作偏好與 token 預算，生成可套用的 lorebook/character_book entries JSON。重點放在觸發鍵、世界資訊、秘密資訊與遊玩時機。';
  }
  return '';
}

function getErrorMessage(error: unknown) {
  if (!error) return '';
  if (error instanceof Error) return error.message;
  return String(error);
}

function buildFieldAIPrompt(label: string, currentValue: string, mode: 'discuss' | 'revise', direction = '') {
  if (mode === 'discuss') {
    return [
      `請針對欄位 ${label} 展開討論。`,
      '請先分析這個欄位目前是否足夠支援 SillyTavern 角色卡遊玩，指出缺口、風格問題、token 使用、和是否符合目前卡片整體方向。',
      '請不要輸出整份 JSON，也不要改其他欄位。若你提出修正版，請只把此欄位的新內容放在單一 fenced code block 中。',
      '',
      '目前欄位內容：',
      currentValue || '(empty)',
    ].join('\n');
  }
  return [
    `請只改寫欄位 ${label}。`,
    '你必須參考完整角色卡、lorebook、創作偏好、token 預算與寫卡技巧，但輸出不得包含整份 JSON。',
    '直接輸出單一 fenced code block，code block 內只放此欄位應替換的新內容。',
    '不要說明策略；不要改寫其他欄位；不要包 JSON；不要加入欄位名稱。',
    direction ? `使用者改寫方向：${direction}` : '使用者改寫方向：請在不改變角色核心的前提下改善此欄位。',
    '',
    '目前欄位內容：',
    currentValue || '(empty)',
  ].join('\n');
}

function applyFieldTarget(project: CardProject, target: FieldTarget, value: string) {
  const clean = stripFieldFence(value);
  if (target.kind === 'card') {
    if (target.key === 'alternate_greetings') {
      const match = target.label.match(/\[(\d+)\]/);
      const index = match ? Number(match[1]) : -1;
      if (index >= 0) {
        const greetings = [...(project.card.data.alternate_greetings ?? [])];
        greetings[index] = clean;
        project.card.data.alternate_greetings = greetings;
        return;
      }
    }
    (project.card.data as any)[target.key] = clean;
    return;
  }
  if (target.kind === 'lorebook') {
    (project.lorebook as any)[target.key] = clean;
    return;
  }
  if (target.kind === 'loreEntry') {
    const entry = project.lorebook.entries[target.index];
    if (entry) (entry as any)[target.key] = clean;
  }
}

function stripFieldFence(value: string) {
  return value.replace(/^```[a-zA-Z0-9_-]*\n?/, '').replace(/\n?```$/, '').trim();
}

function SettingsPanel({
  settings,
  project,
  updateDraft,
  save,
}: {
  settings: AppSettings;
  project: CardProject;
  updateDraft: (updater: (project: CardProject) => void) => void;
  save: (settings: AppSettings) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  return (
    <section className="stack settings-panel">
      <section className="settings-group">
        <h2>{t('creativePreferences')}</h2>
        <label className="field">
          <span>{t('writingStyle')}</span>
          <select value={project.settings.writingStyle ?? ''} onChange={(event) => updateDraft((p) => (p.settings.writingStyle = event.target.value))}>
            <option value="">{t('unset')}</option>
            <option value="light_novel">{t('styleLightNovel')}</option>
            <option value="prose">{t('styleProse')}</option>
            <option value="wuxia">{t('styleWuxia')}</option>
            <option value="noir">{t('styleNoir')}</option>
            <option value="comedy">{t('styleComedy')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('narrativePerson')}</span>
          <select value={project.settings.narrativePerson ?? ''} onChange={(event) => updateDraft((p) => (p.settings.narrativePerson = event.target.value))}>
            <option value="">{t('unset')}</option>
            <option value="first">{t('personFirst')}</option>
            <option value="second">{t('personSecond')}</option>
            <option value="third">{t('personThird')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('worldview')}</span>
          <select value={project.settings.worldview ?? ''} onChange={(event) => updateDraft((p) => (p.settings.worldview = event.target.value))}>
            <option value="">{t('unset')}</option>
            <option value="modern">{t('worldModern')}</option>
            <option value="future">{t('worldFuture')}</option>
            <option value="fantasy">{t('worldFantasy')}</option>
            <option value="sci_fi">{t('worldSciFi')}</option>
            <option value="historical">{t('worldHistorical')}</option>
            <option value="parallel_world">{t('worldParallel')}</option>
          </select>
        </label>
      </section>
      <section className="settings-group">
        <h2>{t('llmSettings')}</h2>
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
    </section>
  );
}

function ProjectSettingsPanel({
  settings,
  project,
  updateDraft,
  save,
}: {
  settings: AppSettings;
  project: CardProject;
  updateDraft: (updater: (project: CardProject) => void) => void;
  save: (settings: AppSettings) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(settings);
  useEffect(() => setDraft(settings), [settings]);
  return (
    <section className="stack settings-panel">
      <section className="settings-group">
        <h2>{t('creativePreferences')}</h2>
        <label className="field">
          <span>{t('writingStyle')}</span>
          <select value={project.settings.writingStyle ?? ''} onChange={(event) => updateDraft((p) => (p.settings.writingStyle = event.target.value))}>
            <option value="">{t('unset')}</option>
            <option value="light_novel">{t('styleLightNovel')}</option>
            <option value="prose">{t('styleProse')}</option>
            <option value="wuxia">{t('styleWuxia')}</option>
            <option value="noir">{t('styleNoir')}</option>
            <option value="comedy">{t('styleComedy')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('narrativePerson')}</span>
          <select value={project.settings.narrativePerson ?? ''} onChange={(event) => updateDraft((p) => (p.settings.narrativePerson = event.target.value))}>
            <option value="">{t('unset')}</option>
            <option value="first">{t('personFirst')}</option>
            <option value="second">{t('personSecond')}</option>
            <option value="third">{t('personThird')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('worldview')}</span>
          <select value={project.settings.worldview ?? ''} onChange={(event) => updateDraft((p) => (p.settings.worldview = event.target.value))}>
            <option value="">{t('unset')}</option>
            <option value="modern">{t('worldModern')}</option>
            <option value="future">{t('worldFuture')}</option>
            <option value="fantasy">{t('worldFantasy')}</option>
            <option value="sci_fi">{t('worldSciFi')}</option>
            <option value="historical">{t('worldHistorical')}</option>
            <option value="parallel_world">{t('worldParallel')}</option>
          </select>
        </label>
      </section>
      <section className="settings-group">
        <h2>{t('llmSettings')}</h2>
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

function countDraftBudget(project: CardProject) {
  const card = project.card.data;
  let permanent = estimateTokens([card.name, card.description, card.personality, card.scenario].join('\n'));
  if (project.settings.includeSystemPromptTokens) permanent += estimateTokens(card.system_prompt);
  if (project.settings.includePostHistoryTokens) permanent += estimateTokens(card.post_history_instructions);

  let dynamic = estimateTokens([
    card.first_mes,
    card.mes_example,
    ...(card.alternate_greetings ?? []),
  ].join('\n'));

  let lorebook = 0;
  for (const entry of project.lorebook.entries) {
    if (entry.enabled || entry.constant) {
      lorebook += estimateTokens(entry.content);
      lorebook += estimateTokens(entry.keys.join('\n'));
      lorebook += estimateTokens(entry.secondary_keys.join('\n'));
    }
  }
  dynamic += lorebook;

  return {
    permanent,
    dynamic,
    lorebook,
    total: permanent + dynamic,
    permanentBudget: project.settings.permanentBudget,
    dynamicBudget: project.settings.dynamicBudget,
    lorebookBudget: project.settings.lorebookBudget,
    permanentOver: permanent > project.settings.permanentBudget,
    dynamicOver: dynamic > project.settings.dynamicBudget,
    lorebookOver: lorebook > project.settings.lorebookBudget,
  };
}

function estimateTokens(text: string) {
  if (!text) return 0;
  const chars = Array.from(text);
  const cjk = chars.filter((char) => /[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/u.test(char)).length;
  const latin = chars.length - cjk;
  return Math.max(1, Math.ceil((cjk * 10) / 17) + Math.ceil(latin / 4));
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
