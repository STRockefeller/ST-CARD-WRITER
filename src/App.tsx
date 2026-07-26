import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Brain, CheckCircle2, ChevronDown, Clipboard, Database, Download, FileJson, Image, ImageUp, Languages, PanelLeftClose, PanelLeftOpen, Plus, Save, Settings, Sparkles, Trash2, UserRound, WandSparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from './api';
import type { AppSettings, CardProject, CharacterBook, CharacterCardV2, LorebookEntry } from './types';
import i18n from './i18n';

const brainstormTemplates = ['brainstorm', 'revise_card', 'generate_card', 'generate_lorebook', 'generate_mvu', 'field_rewrite'];
const reviewTemplates = ['review', 'translate', 'compress', 'mvu'];
const reviewFocusOptions = ['overall', 'llm_clarity', 'play_experience', 'token_budget', 'lorebook', 'mvu'];
const providerDefaults: Record<AppSettings['llmProvider'], string> = {
  deepseek: 'deepseek-v4-flash',
  openai: 'gpt-4.1-mini',
  openrouter: 'openai/gpt-4.1-mini',
  anthropic: 'claude-sonnet-4-20250514',
  gemini: 'gemini-2.5-flash',
  custom: '',
};
const templateLabels: Record<string, string> = {
  brainstorm: 'templateBrainstorm',
  revise_card: 'templateReviseCard',
  field_rewrite: 'templateFieldRewrite',
  generate_card: 'templateGenerateCard',
  generate_lorebook: 'templateGenerateLorebook',
  generate_mvu: 'templateGenerateMvu',
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
  | { kind: 'loreEntry'; index: number; entryId?: number; key: keyof LorebookEntry; label: string };

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
  const [quickResult, setQuickResult] = useState<{ tool: 'user_persona' | 'cover_prompt'; response: string } | null>(null);
  const [quickCopied, setQuickCopied] = useState('');
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
    if (activeProjectChanged) {
      activeProjectRef.current = activeId;
      setDraft(project ? structuredClone(project) : null);
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
      return api.importCard(parsed.card?.data?.name ?? file.name.replace(/\.(json|png)$/i, ''), parsed.card, parsed.imageDataUrl);
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
        draft!,
        request?.conversationId ?? conversationId,
        request?.template ?? llmTemplate,
        settingsQuery.data?.promptLocale ?? 'zh-TW',
        request?.input ?? llmInput,
      ),
    onSuccess(message, request) {
      setAppError('');
      queryClient.setQueryData<CardProject[]>(['projects'], (projects) => projects?.map((project) => {
        if (project.id !== draft?.id || project.llmHistory.some((item) => item.id === message.id)) return project;
        return { ...project, llmHistory: [message, ...project.llmHistory] };
      }));
      setDraft((current) => {
        if (!current) return current;
        const next = structuredClone(current);
        if (!next.llmHistory.some((item) => item.id === message.id)) {
          next.llmHistory = [message, ...next.llmHistory];
        }
        if (request?.autoApplyFieldTarget) {
          const code = firstCodeBlock(message.response) ?? message.response;
          pushSnapshot(next, `Before AI rewrite ${request.autoApplyFieldTarget.label}`);
          applyFieldTarget(next, request.autoApplyFieldTarget, code);
          saveProject.mutate(next);
        }
        return next;
      });
    },
    onError(error) {
      setAppError(getErrorMessage(error));
    },
  });

  const runQuickTool = useMutation({
    mutationFn: (tool: 'user_persona' | 'cover_prompt') =>
      api.runQuickTool(tool, settingsQuery.data?.promptLocale ?? 'zh-TW', draft!),
    onSuccess(result) {
      setAppError('');
      setQuickCopied('');
      setQuickResult({ tool: result.tool as 'user_persona' | 'cover_prompt', response: result.response });
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

  const exportCard = async (mode: 'download' | 'copy' | 'png') => {
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
      if (mode === 'png') {
        if (!draft.imageDataUrl) throw new Error(t('pngImageRequired'));
        const png = await buildPngCard(draft.imageDataUrl, draft.imageCrop, card);
        downloadBlob(new Blob([png], { type: 'image/png' }), filename.replace(/\.json$/i, '.png'));
        setExportStatus(t('pngExported'));
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
                <details className="quick-tools-menu">
                  <summary>
                    <WandSparkles size={16} /> {t('quickTools')} <ChevronDown size={14} />
                  </summary>
                  <div className="quick-tools-popover">
                    <button onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); runQuickTool.mutate('user_persona'); }} disabled={runQuickTool.isLoading}>
                      <UserRound size={16} />
                      <span><strong>{t('generateUserPersona')}</strong><small>{t('generateUserPersonaHint')}</small></span>
                    </button>
                    <button onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); runQuickTool.mutate('cover_prompt'); }} disabled={runQuickTool.isLoading}>
                      <Image size={16} />
                      <span><strong>{t('generateCoverPrompt')}</strong><small>{t('generateCoverPromptHint')}</small></span>
                    </button>
                  </div>
                </details>
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
                <button className="secondary strong" onClick={() => exportCard('png')} disabled={!draft.imageDataUrl} title={!draft.imageDataUrl ? t('pngImageRequired') : t('exportPng')}>
                  <Image size={16} /> {t('exportPng')}
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
              <Tab id="mvu" label={t('mvuDesigner')} icon={<Database size={16} />} active={tab} onClick={setTab} />
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
            {tab === 'mvu' && <MvuEditor project={draft} updateDraft={updateDraft} startFieldAI={startFieldAI} />}
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
            {quickResult && (
              <QuickResultModal
                result={quickResult}
                copied={quickCopied}
                onCopy={async (label, content) => {
                  await navigator.clipboard.writeText(content);
                  setQuickCopied(label);
                }}
                onClose={() => setQuickResult(null)}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function QuickResultModal(props: {
  result: { tool: 'user_persona' | 'cover_prompt'; response: string };
  copied: string;
  onCopy: (label: string, content: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const sections = props.result.tool === 'cover_prompt' ? parseCoverPrompt(props.result.response) : [];
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && props.onClose()}>
      <section className="result-modal" role="dialog" aria-modal="true" aria-label={t(props.result.tool === 'cover_prompt' ? 'coverPromptResult' : 'userPersonaResult')}>
        <header>
          <div>
            {props.result.tool === 'cover_prompt' ? <Image size={20} /> : <UserRound size={20} />}
            <h2>{t(props.result.tool === 'cover_prompt' ? 'coverPromptResult' : 'userPersonaResult')}</h2>
          </div>
          <button className="icon-button" onClick={props.onClose} aria-label={t('dismiss')} title={t('dismiss')}><X size={18} /></button>
        </header>
        {sections.length ? sections.map((section) => (
          <article className="result-section" key={section.label}>
            <div className="result-section-heading">
              <strong>{t(section.label)}</strong>
              <button onClick={() => props.onCopy(section.label, section.content)}>
                <Clipboard size={15} /> {props.copied === section.label ? t('copied') : t('copy')}
              </button>
            </div>
            <pre>{section.content}</pre>
          </article>
        )) : (
          <article className="result-section">
            <div className="result-section-heading">
              <strong>{t('result')}</strong>
              <button onClick={() => props.onCopy('all', props.result.response)}>
                <Clipboard size={15} /> {props.copied === 'all' ? t('copied') : t('copy')}
              </button>
            </div>
            <pre>{props.result.response}</pre>
          </article>
        )}
        <p className="hint">{t('quickResultNotSaved')}</p>
      </section>
    </div>
  );
}

function parseCoverPrompt(response: string) {
  const natural = response.match(/NATURAL_LANGUAGE:\s*([\s\S]*?)(?=\n\s*BOORU_TAGS:|$)/i)?.[1]?.trim();
  const booru = response.match(/BOORU_TAGS:\s*([\s\S]*)$/i)?.[1]?.trim();
  if (!natural || !booru) return [];
  return [
    { label: 'naturalLanguagePrompt', content: natural },
    { label: 'booruTags', content: booru },
  ];
}

function buildExportCard(project: CardProject): CharacterCardV2 {
  const card = structuredClone(project.card);
  card.spec = 'chara_card_v2';
  card.spec_version = card.spec_version || '2.0';
  if (project.settings.embedLorebook && project.lorebook.entries.length > 0) {
    card.data.character_book = {
      ...structuredClone(project.lorebook),
      token_budget: project.settings.lorebookBudget,
    };
  } else {
    delete card.data.character_book;
  }
  prepareMvuCardForExport(card);
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
  const { t } = useTranslation();
  const imageRef = useRef<HTMLInputElement>(null);
  const data = project.card.data;
  const crop = {
    zoom: project.imageCrop?.zoom && project.imageCrop.zoom >= 1 ? project.imageCrop.zoom : 1,
    x: project.imageCrop?.x ?? 0,
    y: project.imageCrop?.y ?? 0,
  };
  const setData = (key: keyof typeof data, value: unknown) => updateDraft((p) => ((p.card.data as any)[key] = value));
  const aiProps = (key: keyof typeof data, label: string, value: unknown) => ({
    onDiscuss: () => startFieldAI({ kind: 'card', key, label }, value, 'discuss' as const),
    onRevise: () => startFieldAI({ kind: 'card', key, label }, value, 'revise' as const),
  });
  return (
    <section className="stack">
      <section className="card-image-panel">
        {project.imageDataUrl ? (
          <div className="card-image-preview">
            <img
              src={project.imageDataUrl}
              alt={data.name || t('cardImage')}
              style={{
                objectPosition: `${50 + crop.x * 50}% ${50 + crop.y * 50}%`,
                transform: `scale(${crop.zoom})`,
              }}
            />
          </div>
        ) : (
          <div className="card-image-placeholder"><Image size={28} /><span>{t('noCardImage')}</span></div>
        )}
        <div>
          <strong>{t('cardImage')}</strong>
          <p className="hint">{t('cardImageHint')}</p>
          <div className="row-actions">
            <button onClick={() => imageRef.current?.click()}><ImageUp size={16} /> {t(project.imageDataUrl ? 'replaceImage' : 'chooseImage')}</button>
            {project.imageDataUrl && <button className="danger" onClick={() => updateDraft((p) => { delete p.imageDataUrl; p.imageCrop = { zoom: 1, x: 0, y: 0 }; })}><Trash2 size={15} /> {t('removeImage')}</button>}
          </div>
          {project.imageDataUrl && (
            <div className="crop-controls">
              <label><span>{t('imageZoom')}</span><input type="range" min="1" max="3" step="0.01" value={crop.zoom} onChange={(event) => updateDraft((p) => { p.imageCrop = { ...(p.imageCrop ?? { zoom: 1, x: 0, y: 0 }), zoom: Number(event.target.value) }; })} /></label>
              <label><span>{t('imageHorizontal')}</span><input type="range" min="-1" max="1" step="0.01" value={crop.x} onChange={(event) => updateDraft((p) => { p.imageCrop = { ...(p.imageCrop ?? { zoom: 1, x: 0, y: 0 }), x: Number(event.target.value) }; })} /></label>
              <label><span>{t('imageVertical')}</span><input type="range" min="-1" max="1" step="0.01" value={crop.y} onChange={(event) => updateDraft((p) => { p.imageCrop = { ...(p.imageCrop ?? { zoom: 1, x: 0, y: 0 }), y: Number(event.target.value) }; })} /></label>
              <button className="ghost inline" onClick={() => updateDraft((p) => { p.imageCrop = { zoom: 1, x: 0, y: 0 }; })}>{t('resetCrop')}</button>
            </div>
          )}
          <input
            ref={imageRef}
            hidden
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/bmp,.png,.jpg,.jpeg,.webp,.gif,.bmp"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) {
                const imageDataUrl = await fileToDataURL(file);
                updateDraft((p) => { p.imageDataUrl = imageDataUrl; p.imageCrop = { zoom: 1, x: 0, y: 0 }; });
              }
              event.target.value = '';
            }}
          />
        </div>
      </section>
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

const MVU_INITIAL_COMMENT = '[initvar] Initial Variables (keep disabled)';
const MVU_LEGACY_INITIAL_COMMENT = '[InitialVariables]';
const MVU_RULES_COMMENT = '[mvu_update] Variable Update Rules';
const MVU_RUNTIME_ID = '9d6f8c0a-5e21-4ab7-9f12-6c734ddf3e81';
const MVU_LEGACY_RUNTIME_ID = 'st-card-writer-mvu-runtime';
const MVU_RUNTIME_IMPORT = "import 'https://testingcf.jsdelivr.net/gh/MagicalAstrogy/MagVarUpdate@master/artifact/bundle.js';";

function MvuEditor({
  project,
  updateDraft,
  startFieldAI,
}: {
  project: CardProject;
  updateDraft: (updater: (project: CardProject) => void) => void;
  startFieldAI: (target: FieldTarget, value: unknown, mode: 'discuss' | 'revise') => void;
}) {
  const { t } = useTranslation();
  const initialIndex = project.lorebook.entries.findIndex(isMvuInitialEntry);
  const rulesIndex = project.lorebook.entries.findIndex(isMvuRulesEntry);
  const initialEntry = project.lorebook.entries[initialIndex];
  const rulesEntry = project.lorebook.entries[rulesIndex];
  const enabled = Boolean(initialEntry && ((initialEntry.extensions as any)?.st_card_writer?.active ?? rulesEntry?.enabled ?? initialEntry.enabled));
  const parsed = parseMvuVariables(initialEntry?.content ?? '{}');
  const variables = parsed.value ? flattenMvuVariables(parsed.value) : [];

  const updateEntry = (index: number, updater: (entry: LorebookEntry) => void) =>
    updateDraft((draft) => updater(draft.lorebook.entries[index]));

  const setEnabled = (nextEnabled: boolean) => updateDraft((draft) => {
    let nextInitial = draft.lorebook.entries.find(isMvuInitialEntry);
    if (!nextInitial) {
      nextInitial = createMvuEntry(draft.lorebook, 'initial');
      draft.lorebook.entries.push(nextInitial);
    }
    nextInitial.comment = MVU_INITIAL_COMMENT;
    nextInitial.enabled = false;
    nextInitial.constant = true;
    nextInitial.position = 'before_char';
    nextInitial.extensions = {
      ...(nextInitial.extensions ?? {}),
      position: 0,
      exclude_recursion: true,
      st_card_writer: { kind: 'mvu_initial_variables', version: 2, active: nextEnabled },
    };

    let nextRules = draft.lorebook.entries.find(isMvuRulesEntry);
    if (!nextRules) {
      nextRules = createMvuEntry(draft.lorebook, 'rules');
      draft.lorebook.entries.push(nextRules);
    }
    nextRules.comment = MVU_RULES_COMMENT;
    nextRules.enabled = nextEnabled;
    nextRules.constant = true;
    nextRules.position = 'after_char';
    if (!nextRules.content.includes('<JSONPatch>')) nextRules.content = buildMvuUpdatePrompt(nextRules.content);
    nextRules.content = syncMvuTypeContract(nextRules.content, nextInitial.content);
    nextRules.extensions = {
      ...(nextRules.extensions ?? {}),
      position: 4,
      role: 2,
      exclude_recursion: true,
      st_card_writer: { kind: 'mvu_update_rules', version: 2 },
    };
    setBundledMvuRuntime(draft, nextEnabled);
  });

  const writeVariables = (value: Record<string, unknown>) => updateDraft((draft) => {
    const content = JSON.stringify(value, null, 2);
    draft.lorebook.entries[initialIndex].content = content;
    const nextRules = draft.lorebook.entries.find(isMvuRulesEntry);
    if (nextRules) nextRules.content = syncMvuTypeContract(nextRules.content, content);
  });

  const changeVariable = (oldPath: string, nextPath: string, type: string, rawValue: string) => {
    if (!parsed.value || !nextPath.trim()) return;
    const next = structuredClone(parsed.value);
    deleteMvuPath(next, oldPath);
    setMvuPath(next, nextPath.trim(), parseMvuValue(type, rawValue));
    writeVariables(next);
  };

  const removeVariable = (path: string) => {
    if (!parsed.value) return;
    const next = structuredClone(parsed.value);
    deleteMvuPath(next, path);
    writeVariables(next);
  };

  const addVariable = () => {
    if (!parsed.value) return;
    const next = structuredClone(parsed.value);
    let suffix = 1;
    let path = t('newVariablePath');
    while (hasMvuPath(next, path)) path = `${t('newVariablePath')}_${suffix++}`;
    setMvuPath(next, path, 0);
    writeVariables(next);
  };

  return (
    <section className="stack mvu-editor">
      <section className="utility-panel">
        <div>
          <strong>{t('mvuDesigner')}</strong>
          <span>{t('mvuDesignerHint')}</span>
        </div>
        <label className="checkline">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          {t('enableMvu')}
        </label>
      </section>

      {!enabled ? (
        <div className="empty-mvu"><p>{initialEntry ? t('mvuDisabledHint') : t('mvuNotConfigured')}</p></div>
      ) : initialEntry && (
        <>
          <section className="entry">
            <div className="entry-head">
              <strong>{t('variableOverview')}</strong><span>{variables.length}</span>
              <span className="field-ai-actions">
                <button type="button" onClick={() => startFieldAI({ kind: 'loreEntry', index: initialIndex, entryId: initialEntry.id, key: 'content', label: 'MVU initial variables JSON' }, initialEntry.content, 'discuss')}>{t('aiDiscuss')}</button>
                <button type="button" onClick={() => startFieldAI({ kind: 'loreEntry', index: initialIndex, entryId: initialEntry.id, key: 'content', label: 'MVU initial variables JSON' }, initialEntry.content, 'revise')}>{t('aiRevise')}</button>
                <button className="primary" onClick={addVariable} disabled={!parsed.value}><Plus size={15} /> {t('addVariable')}</button>
              </span>
            </div>
            <p className="hint">{t('variableTableHint')}</p>
            {parsed.value ? (
              <>
              {variables.length === 0 ? <p className="hint">{t('noVariables')}</p> : (
                <div className="variable-table-wrap">
                  <table className="variable-table">
                    <thead><tr><th>{t('variablePath')}</th><th>{t('variableType')}</th><th>{t('initialValue')}</th><th /></tr></thead>
                    <tbody>{variables.map((variable) => (
                      <MvuVariableRow key={`${variable.path}:${variable.type}:${variable.editValue}`} variable={variable} onChange={changeVariable} onRemove={removeVariable} />
                    ))}</tbody>
                  </table>
                </div>
              )}
              </>
            ) : <p className="validation-error">{parsed.error}</p>}
          </section>

          <details className="entry mvu-json-details">
            <summary>{t('advancedJsonEditor')}</summary>
            <div className="entry-head">
              <span className="compat-badge">MagVarUpdate · [initvar]</span>
              <button onClick={() => parsed.value && writeVariables(parsed.value)} disabled={!parsed.value}>{t('formatJson')}</button>
            </div>
            <p className="hint">{t('initialVariablesHint')}</p>
            <textarea className={parsed.error ? 'json-editor invalid' : 'json-editor'} rows={16} value={initialEntry.content} spellCheck={false} onChange={(event) => {
              const content = event.target.value;
              updateDraft((draft) => {
                const entry = draft.lorebook.entries.find((candidate) => candidate.id === initialEntry.id && isMvuInitialEntry(candidate));
                if (entry) entry.content = content;
                const nextRules = draft.lorebook.entries.find(isMvuRulesEntry);
                if (nextRules) nextRules.content = syncMvuTypeContract(nextRules.content, content);
              });
            }} />
            {parsed.error ? <p className="validation-error">{parsed.error}</p> : <p className="validation-ok">{t('validVariableTree', { count: variables.length })}</p>}
          </details>

          {rulesEntry && (
            <section className="entry">
              <div className="entry-head">
                <strong>{t('variableUpdateRules')}</strong><span className="compat-badge">MagVarUpdate · JSON Patch</span>
                <span className="field-ai-actions">
                  <button type="button" onClick={() => startFieldAI({ kind: 'loreEntry', index: rulesIndex, entryId: rulesEntry.id, key: 'content', label: 'MVU variable update rules' }, rulesEntry.content, 'discuss')}>{t('aiDiscuss')}</button>
                  <button type="button" onClick={() => startFieldAI({ kind: 'loreEntry', index: rulesIndex, entryId: rulesEntry.id, key: 'content', label: 'MVU variable update rules' }, rulesEntry.content, 'revise')}>{t('aiRevise')}</button>
                </span>
              </div>
              <p className="hint">{t('variableUpdateRulesHint')}</p>
              <textarea rows={14} value={rulesEntry.content} onChange={(event) => updateEntry(rulesIndex, (entry) => { entry.content = event.target.value; })} />
            </section>
          )}

          <p className="mvu-requirements">{t('mvuRequirements')}</p>
        </>
      )}
    </section>
  );
}

function MvuVariableRow({
  variable,
  onChange,
  onRemove,
}: {
  variable: { path: string; type: string; preview: string; editValue: string };
  onChange: (oldPath: string, nextPath: string, type: string, rawValue: string) => void;
  onRemove: (path: string) => void;
}) {
  const { t } = useTranslation();
  const [path, setPath] = useState(variable.path);
  const [type, setType] = useState(variable.type);
  const [value, setValue] = useState(variable.editValue);
  const commit = (nextType = type, nextValue = value) => onChange(variable.path, path, nextType, nextValue);
  return (
    <tr>
      <td><input aria-label={t('variablePath')} value={path} onChange={(event) => setPath(event.target.value)} onBlur={() => commit()} /></td>
      <td>
        <select aria-label={t('variableType')} value={type} onChange={(event) => { const next = event.target.value; setType(next); commit(next); }}>
          <option value="number">{t('typeNumber')}</option>
          <option value="string">{t('typeString')}</option>
          <option value="boolean">{t('typeBoolean')}</option>
          <option value="array">{t('typeArray')}</option>
          <option value="null">null</option>
          <option value="object">object</option>
        </select>
      </td>
      <td>{type === 'boolean' ? (
        <select aria-label={t('initialValue')} value={value} onChange={(event) => { setValue(event.target.value); commit(type, event.target.value); }}><option value="true">true</option><option value="false">false</option></select>
      ) : type === 'null' ? <code>null</code> : (
        <input aria-label={t('initialValue')} type={type === 'number' ? 'number' : 'text'} value={value} onChange={(event) => setValue(event.target.value)} onBlur={() => commit()} />
      )}</td>
      <td><button className="danger icon-button" aria-label={t('deleteEntry')} onClick={() => onRemove(variable.path)}><Trash2 size={15} /></button></td>
    </tr>
  );
}

function isMvuInitialEntry(entry: LorebookEntry) {
  const comment = entry.comment.trim().toLowerCase();
  return comment.includes('[initvar]')
    || comment === MVU_LEGACY_INITIAL_COMMENT.toLowerCase()
    || (entry.extensions as any)?.st_card_writer?.kind === 'mvu_initial_variables';
}

function isManagedMvuInitialEntry(entry: LorebookEntry) {
  const comment = entry.comment.trim().toLowerCase();
  return comment === MVU_INITIAL_COMMENT.toLowerCase()
    || comment === MVU_LEGACY_INITIAL_COMMENT.toLowerCase()
    || (entry.extensions as any)?.st_card_writer?.kind === 'mvu_initial_variables';
}

function isMvuRulesEntry(entry: LorebookEntry) {
  return entry.comment.trim().toLowerCase() === MVU_RULES_COMMENT.toLowerCase()
    || (entry.extensions as any)?.st_card_writer?.kind === 'mvu_update_rules';
}

function createMvuEntry(book: CharacterBook, kind: 'initial' | 'rules'): LorebookEntry {
  const nextId = Math.max(0, ...book.entries.map((entry) => entry.id)) + 1;
  const initial = kind === 'initial';
  return {
    id: nextId,
    keys: [],
    secondary_keys: [],
    content: initial ? '{\n  "角色": {\n    "好感度": 0\n  },\n  "世界": {\n    "回合": 0\n  }\n}' : buildMvuUpdatePrompt(''),
    enabled: !initial,
    insertion_order: initial ? 0 : 1,
    case_sensitive: false,
    selective: false,
    constant: true,
    position: initial ? 'before_char' : 'after_char',
    priority: initial ? 1000 : 999,
    comment: initial ? MVU_INITIAL_COMMENT : MVU_RULES_COMMENT,
    extensions: initial
      ? { position: 0, exclude_recursion: true, st_card_writer: { kind: 'mvu_initial_variables', version: 2, active: true } }
      : { position: 4, role: 2, exclude_recursion: true, st_card_writer: { kind: 'mvu_update_rules', version: 2 } },
  };
}

function buildMvuUpdatePrompt(existingRules: string) {
  const preservedRules = existingRules.split('<UpdateVariable>')[0].trim();
  const policies = preservedRules || 'Update only variables affected by events that actually occurred. Keep value types stable and do not invent undeclared paths.';
  return [
    '<status_current_variable>',
    '{{format_message_variable::stat_data}}',
    '</status_current_variable>',
    '',
    'Variable-specific update policies:',
    policies,
    '',
    'At the end of every reply, output update analysis and commands together.',
    'Use a valid JSON Patch array. Supported operations are replace, delta, insert, and remove.',
    'The initial-variable type contract is authoritative. replace must keep the declared type; delta is allowed only for numbers; insert is allowed only for arrays or extensible objects.',
    'Never write display_data strings such as "1->2 (Json_patch)" back into stat_data. Never create an undeclared path.',
    'Use JSON Pointer paths beginning with /. Output an empty array when nothing changed.',
    '<UpdateVariable>',
    '<Analysis>Briefly identify only the variables that changed and why.</Analysis>',
    '<JSONPatch>',
    '[',
    '  { "op": "replace", "path": "/角色/好感度", "value": 1 }',
    ']',
    '</JSONPatch>',
    '</UpdateVariable>',
  ].join('\n');
}

const MVU_TYPE_CONTRACT_START = '<!-- ST_CARD_WRITER_MVU_TYPES_START -->';
const MVU_TYPE_CONTRACT_END = '<!-- ST_CARD_WRITER_MVU_TYPES_END -->';

function syncMvuTypeContract(prompt: string, initialContent: string) {
  const parsed = parseMvuVariables(initialContent);
  if (!parsed.value) return prompt;
  const rows = flattenMvuVariables(parsed.value);
  const contract = [
    MVU_TYPE_CONTRACT_START,
    'Authoritative variable type contract (generated from [initvar]; do not change these types):',
    ...rows.map((row) => {
      const pointer = `/${mvuPathParts(row.path).map((part) => part.replace(/~/g, '~0').replace(/\//g, '~1')).join('/')}`;
      const operations = row.type === 'number' ? 'replace, delta' : row.type === 'array' ? 'replace, insert, remove' : 'replace';
      return `- ${pointer}: type=${row.type}; initial=${row.preview}; allowed_ops=${operations}`;
    }),
    'Validation rules:',
    '- A patch value must have exactly the declared type. Do not stringify numbers or booleans.',
    '- delta is numeric arithmetic, never string concatenation.',
    '- Do not copy display_data diff text into stat_data.',
    '- Do not update or create paths absent from this contract.',
    MVU_TYPE_CONTRACT_END,
  ].join('\n');
  const withoutOldContract = prompt.replace(new RegExp(`${MVU_TYPE_CONTRACT_START}[\\s\\S]*?${MVU_TYPE_CONTRACT_END}\\n*`, 'g'), '');
  const marker = '</status_current_variable>';
  return withoutOldContract.includes(marker)
    ? withoutOldContract.replace(marker, `${marker}\n\n${contract}`)
    : `${contract}\n\n${withoutOldContract}`;
}

function setBundledMvuRuntime(project: CardProject, enabled: boolean) {
  setBundledMvuRuntimeOnData(project.card.data, enabled);
}

function setBundledMvuRuntimeOnData(data: CharacterCardV2['data'], enabled: boolean) {
  const extensions = (data.extensions ??= {});
  const tavernHelper = ((extensions as any).tavern_helper ??= {});
  const scripts = Array.isArray(tavernHelper.scripts) ? tavernHelper.scripts : (tavernHelper.scripts = []);
  let runtime = scripts.find((script: any) => script?.id === MVU_RUNTIME_ID || script?.id === MVU_LEGACY_RUNTIME_ID);
  if (!runtime && scripts.some((script: any) => typeof script?.content === 'string' && script.content.includes('MagicalAstrogy/MagVarUpdate'))) return;
  if (!runtime) {
    runtime = {
      type: 'script',
      enabled,
      name: 'MVU',
      id: MVU_RUNTIME_ID,
      content: MVU_RUNTIME_IMPORT,
      info: 'Bundled by SillyTavern Card Writer',
      button: { enabled: true, buttons: [] },
      data: {},
      export_with: { data: true, button: true },
    };
    scripts.push(runtime);
  } else {
    runtime.id = MVU_RUNTIME_ID;
    runtime.name = 'MVU';
    runtime.enabled = enabled;
    runtime.content = MVU_RUNTIME_IMPORT;
    runtime.button = { ...(runtime.button ?? {}), enabled: true, buttons: Array.isArray(runtime.button?.buttons) ? runtime.button.buttons : [] };
    runtime.export_with = { data: true, button: true };
  }
}

function prepareMvuCardForExport(card: CharacterCardV2) {
  const book = card.data.character_book;
  if (!book) return;
  const initial = book.entries.find(isManagedMvuInitialEntry);
  if (!initial) return;
  let rules = book.entries.find(isMvuRulesEntry);
  const active = Boolean((initial.extensions as any)?.st_card_writer?.active ?? rules?.enabled ?? initial.enabled);
  initial.comment = MVU_INITIAL_COMMENT;
  initial.enabled = false;
  initial.constant = true;
  initial.position = 'before_char';
  initial.extensions = {
    ...(initial.extensions ?? {}),
    position: 0,
    exclude_recursion: true,
    st_card_writer: { kind: 'mvu_initial_variables', version: 2, active },
  };
  if (!rules) {
    rules = createMvuEntry(book, 'rules');
    book.entries.push(rules);
  }
  rules.comment = MVU_RULES_COMMENT;
  rules.enabled = active;
  rules.constant = true;
  rules.position = 'after_char';
  if (!rules.content.includes('<JSONPatch>')) rules.content = buildMvuUpdatePrompt(rules.content);
  rules.content = syncMvuTypeContract(rules.content, initial.content);
  rules.extensions = {
    ...(rules.extensions ?? {}),
    position: 4,
    role: 2,
    exclude_recursion: true,
    st_card_writer: { kind: 'mvu_update_rules', version: 2 },
  };
  setBundledMvuRuntimeOnData(card.data, active);
}

function parseMvuVariables(content: string): { value?: Record<string, unknown>; error?: string } {
  try {
    const value = JSON.parse(content);
    if (!value || Array.isArray(value) || typeof value !== 'object') return { error: 'Initial variables must be a JSON object.' };
    return { value };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid JSON.' };
  }
}

function flattenMvuVariables(value: Record<string, unknown>) {
  const rows: Array<{ path: string; type: string; preview: string; editValue: string }> = [];
  const visit = (current: unknown, path: string) => {
    if (current && typeof current === 'object' && !Array.isArray(current)) {
      const entries = Object.entries(current as Record<string, unknown>);
      if (entries.length === 0 && path) rows.push({ path, type: 'object', preview: '{}', editValue: '{}' });
      entries.forEach(([key, child]) => visit(child, path ? `${path}.${key}` : key));
      return;
    }
    const type = Array.isArray(current) ? 'array' : current === null ? 'null' : typeof current;
    const serialized = JSON.stringify(current);
    const editValue = type === 'string' ? String(current) : serialized ?? String(current);
    rows.push({ path, type, editValue, preview: serialized && serialized.length > 80 ? `${serialized.slice(0, 77)}...` : serialized ?? String(current) });
  };
  visit(value, '');
  return rows;
}

function parseMvuValue(type: string, rawValue: string): unknown {
  if (type === 'number') return Number.isFinite(Number(rawValue)) ? Number(rawValue) : 0;
  if (type === 'boolean') return rawValue === 'true';
  if (type === 'null') return null;
  if (type === 'array') {
    try { const parsed = JSON.parse(rawValue); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  if (type === 'object') {
    try { const parsed = JSON.parse(rawValue); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { return {}; }
  }
  return rawValue;
}

function mvuPathParts(path: string) {
  return path.split('.').map((part) => part.trim()).filter(Boolean);
}

function setMvuPath(root: Record<string, unknown>, path: string, value: unknown) {
  const parts = mvuPathParts(path);
  if (!parts.length) return;
  let current = root;
  parts.slice(0, -1).forEach((part) => {
    if (!current[part] || typeof current[part] !== 'object' || Array.isArray(current[part])) current[part] = {};
    current = current[part] as Record<string, unknown>;
  });
  current[parts[parts.length - 1]] = value;
}

function deleteMvuPath(root: Record<string, unknown>, path: string) {
  const parts = mvuPathParts(path);
  const walk = (current: Record<string, unknown>, depth: number): boolean => {
    const key = parts[depth];
    if (!key) return false;
    if (depth === parts.length - 1) delete current[key];
    else if (current[key] && typeof current[key] === 'object' && !Array.isArray(current[key])) {
      if (walk(current[key] as Record<string, unknown>, depth + 1)) delete current[key];
    }
    return Object.keys(current).length === 0;
  };
  walk(root, 0);
}

function hasMvuPath(root: Record<string, unknown>, path: string) {
  let current: unknown = root;
  for (const part of mvuPathParts(path)) {
    if (!current || typeof current !== 'object' || !(part in current)) return false;
    current = (current as Record<string, unknown>)[part];
  }
  return true;
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
    onDiscuss: () => startFieldAI({ kind: 'loreEntry', index, entryId: entry.id, key, label }, value, 'discuss' as const),
    onRevise: () => startFieldAI({ kind: 'loreEntry', index, entryId: entry.id, key, label }, value, 'revise' as const),
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
  const applyCodeBlock = (code: string, sourceTemplate: string) => {
    const parsed = JSON.parse(code);
    props.updateDraft((project) => {
      pushSnapshot(project, `Before applying ${sourceTemplate}`);
      applyTemplatePatch(project, sourceTemplate, parsed);
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
              <button onClick={() => runTask('generate_card', buildGuidedTaskPrompt('generate_card', props.input))} disabled={props.running}>
                <Sparkles size={16} /> {t('templateGenerateCard')}
              </button>
              <button onClick={() => runTask('generate_lorebook', buildGuidedTaskPrompt('generate_lorebook', props.input))} disabled={props.running}>
                <BookOpen size={16} /> {t('templateGenerateLorebook')}
              </button>
              <button onClick={() => runTask('generate_mvu', buildGuidedTaskPrompt('generate_mvu', props.input))} disabled={props.running}>
                <Database size={16} /> {t('templateGenerateMvu')}
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
            <RichResponse text={message.response} onApply={(code) => applyCodeBlock(code, message.template)} onApplyField={props.fieldTarget ? applyFieldBlock : undefined} fieldLabel={props.fieldTarget?.label} />
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
  if (template === 'generate_mvu') {
    return '請根據目前討論串、完整角色卡、Lorebook 與既有 MVU 設計，生成或調整可直接套用的 MVU 初始變數與變動規則。嚴格遵守 MagVarUpdate、型別契約、JSON Pointer 與 JSON Patch 規則。';
  }
  return '';
}

function buildGuidedTaskPrompt(template: string, guidance: string) {
  const base = buildManualTaskPrompt(template);
  const trimmedGuidance = guidance.trim();
  return trimmedGuidance ? `${base}\n\n使用者補充的生成方向：\n${trimmedGuidance}` : base;
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
    const entry = target.entryId === undefined
      ? project.lorebook.entries[target.index]
      : project.lorebook.entries.find((candidate) => candidate.id === target.entryId);
    if (entry) {
      (entry as any)[target.key] = clean;
      if (target.key === 'content' && isMvuInitialEntry(entry)) {
        const rules = project.lorebook.entries.find(isMvuRulesEntry);
        if (rules) rules.content = syncMvuTypeContract(rules.content, clean);
      }
    }
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
        <label className="field">
          <span>{t('llmProvider')}</span>
          <select
            value={draft.llmProvider ?? 'deepseek'}
            onChange={(event) => {
              const provider = event.target.value as AppSettings['llmProvider'];
              setDraft({ ...draft, llmProvider: provider, llmModel: providerDefaults[provider], llmBaseUrl: provider === 'custom' ? draft.llmBaseUrl : '' });
            }}
          >
            <option value="deepseek">DeepSeek</option>
            <option value="openai">OpenAI</option>
            <option value="openrouter">OpenRouter</option>
            <option value="anthropic">Anthropic</option>
            <option value="gemini">Google Gemini</option>
            <option value="custom">{t('customCompatible')}</option>
          </select>
        </label>
        <TextField label={t('apiKey')} value={draft.llmApiKey ?? ''} onChange={(value) => setDraft({ ...draft, llmApiKey: value })} />
        <label className="field">
          <span>{t('model')}</span>
          <input value={draft.llmModel ?? ''} onChange={(event) => setDraft({ ...draft, llmModel: event.target.value })} placeholder={t('modelPlaceholder')} />
        </label>
        {draft.llmProvider === 'custom' && <TextField label={t('baseUrl')} value={draft.llmBaseUrl ?? ''} onChange={(value) => setDraft({ ...draft, llmBaseUrl: value })} />}
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
    project.lorebook.entries = mergeLorebookEntries(payload, project.lorebook.entries);
    return;
  }
  const source = payload.card ?? payload.character_card ?? payload;
  if (source.spec === 'chara_card_v2' && source.data) {
    project.card = normalizeCard(source);
    if (source.data.character_book) {
      project.lorebook = normalizeLorebook(source.data.character_book, project.lorebook);
    }
    return;
  }
  if (payload.lorebook || payload.character_book) {
    project.lorebook = normalizeLorebook(payload.lorebook ?? payload.character_book, project.lorebook);
    return;
  }
  if (isStandaloneLorebook(payload)) {
    project.lorebook = normalizeLorebook(payload, project.lorebook);
    return;
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
  let applied = false;
  for (const key of cardKeys) {
    if (Object.prototype.hasOwnProperty.call(dataPatch, key)) {
      (project.card.data as any)[key] = dataPatch[key];
      applied = true;
    }
  }
  if (!applied) throw new Error('JSON does not contain supported card or lorebook fields.');
}

function applyTemplatePatch(project: CardProject, template: string, payload: any) {
  if (template === 'generate_card') {
    applyGeneratedCardPatch(project, payload);
    return;
  }
  if (template === 'generate_lorebook') {
    applyGeneratedLorebookPatch(project, payload);
    return;
  }
  if (template === 'generate_mvu') {
    applyGeneratedMvuPatch(project, payload);
    return;
  }
  applyCardPatch(project, payload);
}

function applyGeneratedCardPatch(project: CardProject, payload: any) {
  const source = payload.card ?? payload.character_card ?? payload;
  const dataPatch = source.data ?? source;
  const cardOnlyKeys = [
    'name', 'description', 'personality', 'scenario', 'first_mes', 'mes_example',
    'creator_notes', 'system_prompt', 'post_history_instructions', 'alternate_greetings',
    'tags', 'creator', 'character_version',
  ];
  let applied = false;
  for (const key of cardOnlyKeys) {
    if (Object.prototype.hasOwnProperty.call(dataPatch, key)) {
      (project.card.data as any)[key] = dataPatch[key];
      applied = true;
    }
  }
  if (!applied) throw new Error('Generated card JSON does not contain supported card fields.');
}

function applyGeneratedLorebookPatch(project: CardProject, payload: any) {
  if (Array.isArray(payload)) {
    project.lorebook.entries = mergeLorebookEntries(payload, project.lorebook.entries);
    return;
  }
  const book = payload.lorebook ?? payload.character_book ?? payload;
  if (!isStandaloneLorebook(book)) throw new Error('Generated lorebook JSON must contain an entries array.');
  project.lorebook = normalizeLorebook(book, project.lorebook);
}

function applyGeneratedMvuPatch(project: CardProject, payload: any) {
  const mvu = payload?.mvu ?? payload;
  const initialValue = mvu?.initial_variables ?? mvu?.initialVariables ?? mvu?.stat_data ?? mvu?.initial;
  const updateRules = mvu?.update_rules ?? mvu?.updateRules ?? mvu?.rules;
  if (initialValue === undefined && typeof updateRules !== 'string') {
    throw new Error('MVU JSON must contain initial_variables and/or update_rules.');
  }

  let initial = project.lorebook.entries.find(isMvuInitialEntry);
  const wasConfigured = Boolean(initial);
  if (!initial) {
    initial = createMvuEntry(project.lorebook, 'initial');
    project.lorebook.entries.push(initial);
  }
  if (initialValue !== undefined) {
    const content = typeof initialValue === 'string' ? initialValue : JSON.stringify(initialValue, null, 2);
    const parsed = parseMvuVariables(content);
    if (!parsed.value) throw new Error(`Invalid MVU initial_variables: ${parsed.error}`);
    initial.content = JSON.stringify(parsed.value, null, 2);
  }
  const active = Boolean(
    (initial.extensions as any)?.st_card_writer?.active
      ?? project.lorebook.entries.find(isMvuRulesEntry)?.enabled
      ?? (wasConfigured ? initial.enabled : true),
  );
  initial.comment = MVU_INITIAL_COMMENT;
  initial.enabled = false;
  initial.constant = true;
  initial.position = 'before_char';
  initial.extensions = {
    ...(initial.extensions ?? {}),
    position: 0,
    exclude_recursion: true,
    st_card_writer: { kind: 'mvu_initial_variables', version: 2, active },
  };

  let rules = project.lorebook.entries.find(isMvuRulesEntry);
  if (!rules) {
    rules = createMvuEntry(project.lorebook, 'rules');
    project.lorebook.entries.push(rules);
  }
  if (typeof updateRules === 'string') rules.content = updateRules;
  if (!rules.content.includes('<JSONPatch>')) rules.content = buildMvuUpdatePrompt(rules.content);
  rules.content = syncMvuTypeContract(rules.content, initial.content);
  rules.comment = MVU_RULES_COMMENT;
  rules.enabled = active;
  rules.constant = true;
  rules.position = 'after_char';
  rules.extensions = {
    ...(rules.extensions ?? {}),
    position: 4,
    role: 2,
    exclude_recursion: true,
    st_card_writer: { kind: 'mvu_update_rules', version: 2 },
  };
  setBundledMvuRuntime(project, active);
}

function isStandaloneLorebook(value: any) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.entries));
}

function normalizeLorebook(value: any, current: CharacterBook): CharacterBook {
  return {
    name: typeof value.name === 'string' ? value.name : current.name,
    description: typeof value.description === 'string' ? value.description : current.description,
    scan_depth: numberOr(value.scan_depth, current.scan_depth),
    token_budget: numberOr(value.token_budget, current.token_budget),
    recursive_scanning: typeof value.recursive_scanning === 'boolean' ? value.recursive_scanning : current.recursive_scanning,
    entries: Array.isArray(value.entries) ? mergeLorebookEntries(value.entries, current.entries) : current.entries,
    extensions: value.extensions && typeof value.extensions === 'object' ? value.extensions : (current.extensions ?? {}),
  };
}

function mergeLorebookEntries(incoming: any[], current: LorebookEntry[]): LorebookEntry[] {
  const normalized = normalizeLorebookEntries(incoming);
  const protectedEntries = current.filter((entry) => isManagedMvuInitialEntry(entry) || isMvuRulesEntry(entry));
  if (protectedEntries.length === 0) return normalized;

  // MVU entries are edited through the MVU designer and remain its source of truth.
  // Lorebook/card generation may replace ordinary entries, but must not silently replace them.
  const hasProtectedInitial = protectedEntries.some(isManagedMvuInitialEntry);
  const hasProtectedRules = protectedEntries.some(isMvuRulesEntry);
  const ordinaryIncoming = normalized.filter((entry) =>
    !(hasProtectedInitial && isMvuInitialEntry(entry)) && !(hasProtectedRules && isMvuRulesEntry(entry)),
  );
  const usedIds = new Set(protectedEntries.map((entry) => entry.id));
  let nextId = Math.max(0, ...normalized.map((entry) => entry.id), ...protectedEntries.map((entry) => entry.id)) + 1;
  for (const entry of ordinaryIncoming) {
    if (usedIds.has(entry.id)) {
      while (usedIds.has(nextId)) nextId += 1;
      entry.id = nextId++;
    }
    usedIds.add(entry.id);
  }
  return [...ordinaryIncoming, ...protectedEntries.map((entry) => structuredClone(entry))];
}

function normalizeLorebookEntries(entries: any[]): LorebookEntry[] {
  return entries.map((entry, index) => {
    const id = numberOr(entry?.id, index + 1);
    return {
      id,
      keys: stringList(entry?.keys ?? entry?.key),
      secondary_keys: stringList(entry?.secondary_keys),
      content: typeof entry?.content === 'string' ? entry.content : '',
      enabled: typeof entry?.enabled === 'boolean' ? entry.enabled : true,
      insertion_order: numberOr(entry?.insertion_order, id),
      case_sensitive: Boolean(entry?.case_sensitive),
      selective: Boolean(entry?.selective),
      constant: Boolean(entry?.constant),
      position: typeof entry?.position === 'string' ? entry.position : 'before_char',
      priority: numberOr(entry?.priority, 100),
      comment: typeof entry?.comment === 'string' ? entry.comment : (typeof entry?.name === 'string' ? entry.name : ''),
      extensions: entry?.extensions && typeof entry.extensions === 'object' ? entry.extensions : {},
    };
  });
}

function numberOr(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  return [];
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
    const buffer = await file.arrayBuffer();
    const chunks = parsePngTextChunks(buffer);
    const chara = chunks.chara ?? chunks.Chara;
    if (!chara) {
      throw new Error('PNG metadata does not contain a SillyTavern chara chunk.');
    }
    const decoded = new TextDecoder().decode(base64ToBytes(chara));
    return { card: JSON.parse(decoded) as CharacterCardV2, imageDataUrl: await fileToDataURL(file) };
  }
  return { card: JSON.parse(await file.text()) as CharacterCardV2, imageDataUrl: undefined };
}

function fileToDataURL(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image.'));
    reader.readAsDataURL(file);
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

async function buildPngCard(imageDataUrl: string, crop: CardProject['imageCrop'], card: CharacterCardV2) {
  const source = await renderImageAsPng(imageDataUrl, crop ?? { zoom: 1, x: 0, y: 0 });
  const signature = source.slice(0, 8);
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => signature[index] === value)) {
    throw new Error('Card image must be a PNG file.');
  }
  const output: Uint8Array[] = [signature];
  let offset = 8;
  while (offset + 12 <= source.length) {
    const length = readUint32(source, offset);
    const type = new TextDecoder().decode(source.slice(offset + 4, offset + 8));
    const data = source.slice(offset + 8, offset + 8 + length);
    const chunkEnd = offset + 12 + length;
    const keywordEnd = data.indexOf(0);
    const keyword = keywordEnd >= 0 ? new TextDecoder().decode(data.slice(0, keywordEnd)).toLowerCase() : '';
    if (type === 'IEND') {
      const encoded = new TextEncoder().encode(JSON.stringify(card));
      const metadata = concatBytes(new TextEncoder().encode('chara\0'), new TextEncoder().encode(bytesToBase64(encoded)));
      output.push(createPngChunk('tEXt', metadata));
      output.push(source.slice(offset, chunkEnd));
      break;
    }
    if (!((type === 'tEXt' || type === 'iTXt') && keyword === 'chara')) {
      output.push(source.slice(offset, chunkEnd));
    }
    offset = chunkEnd;
  }
  return concatBytes(...output);
}

async function renderImageAsPng(imageDataUrl: string, crop: { zoom: number; x: number; y: number }) {
  const image = await loadImage(imageDataUrl);
  const outputHeight = Math.max(2, Math.min(1536, image.naturalHeight));
  const outputWidth = Math.max(2, Math.round(outputHeight * 2 / 3));
  const canvas = document.createElement('canvas');
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is unavailable.');

  const baseScale = Math.max(outputWidth / image.naturalWidth, outputHeight / image.naturalHeight);
  const scale = baseScale * Math.max(1, crop.zoom || 1);
  const drawnWidth = image.naturalWidth * scale;
  const drawnHeight = image.naturalHeight * scale;
  const overflowX = Math.max(0, drawnWidth - outputWidth);
  const overflowY = Math.max(0, drawnHeight - outputHeight);
  const x = -overflowX * ((Math.max(-1, Math.min(1, crop.x || 0)) + 1) / 2);
  const y = -overflowY * ((Math.max(-1, Math.min(1, crop.y || 0)) + 1) / 2);
  context.drawImage(image, x, y, drawnWidth, drawnHeight);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Unable to convert image to PNG.')), 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Unable to decode the selected image.'));
    image.src = source;
  });
}

function createPngChunk(type: string, data: Uint8Array) {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  new DataView(chunk.buffer).setUint32(0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  new DataView(chunk.buffer).setUint32(8 + data.length, crc32(concatBytes(typeBytes, data)));
  return chunk;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function readUint32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

function dataUrlToBytes(value: string) {
  const encoded = value.split(',', 2)[1];
  if (!encoded) throw new Error('Invalid image data.');
  return base64ToBytes(encoded);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const batch = 0x8000;
  for (let index = 0; index < bytes.length; index += batch) {
    binary += String.fromCharCode(...bytes.subarray(index, index + batch));
  }
  return btoa(binary);
}

function concatBytes(...parts: Uint8Array[]) {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
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
