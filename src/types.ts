export type Locale = 'zh-TW' | 'en';

export interface CardProject {
  id: string;
  title: string;
  card: CharacterCardV2;
  lorebook: CharacterBook;
  settings: ProjectSettings;
  llmHistory: LLMMessage[];
  reviews: ReviewReport[];
  snapshots: Snapshot[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSettings {
  embedLorebook: boolean;
  includeSystemPromptTokens: boolean;
  includePostHistoryTokens: boolean;
  permanentBudget: number;
  dynamicBudget: number;
  lorebookBudget: number;
}

export interface CharacterCardV2 {
  spec: 'chara_card_v2';
  spec_version: string;
  data: CardData;
  extensions?: Record<string, unknown>;
}

export interface CardData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  tags: string[];
  creator: string;
  character_version: string;
  character_book?: CharacterBook;
  extensions?: Record<string, unknown>;
}

export interface CharacterBook {
  name: string;
  description: string;
  scan_depth: number;
  token_budget: number;
  recursive_scanning: boolean;
  entries: LorebookEntry[];
  extensions?: Record<string, unknown>;
}

export interface LorebookEntry {
  id: number;
  keys: string[];
  secondary_keys: string[];
  content: string;
  enabled: boolean;
  insertion_order: number;
  case_sensitive: boolean;
  selective: boolean;
  constant: boolean;
  position: string;
  priority: number;
  comment: string;
  extensions?: Record<string, unknown>;
}

export interface LLMMessage {
  id: string;
  template: string;
  locale: string;
  prompt: string;
  response: string;
  createdAt: string;
}

export interface ReviewReport {
  id: string;
  locale: string;
  findings: ReviewItem[];
  createdAt: string;
}

export interface ReviewItem {
  type: string;
  severity: string;
  location: string;
  reason: string;
  suggestion: string;
  patchDraft: string;
}

export interface Snapshot {
  id: string;
  label: string;
  card: CharacterCardV2;
  lorebook: CharacterBook;
  createdAt: string;
}

export interface AppSettings {
  deepseekApiKey: string;
  deepseekModel: string;
  uiLocale: Locale;
  promptLocale: Locale;
}

export interface TokenBudget {
  permanent: number;
  dynamic: number;
  lorebook: number;
  total: number;
  permanentBudget: number;
  dynamicBudget: number;
  lorebookBudget: number;
  permanentOver: boolean;
  dynamicOver: boolean;
  lorebookOver: boolean;
}
