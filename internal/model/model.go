package model

import "time"

type Project struct {
	ID         string          `json:"id"`
	Title      string          `json:"title"`
	Card       Card            `json:"card"`
	Lorebook   CharacterBook   `json:"lorebook"`
	Settings   ProjectSettings `json:"settings"`
	LLMHistory []LLMMessage    `json:"llmHistory"`
	Reviews    []ReviewReport  `json:"reviews"`
	Snapshots  []Snapshot      `json:"snapshots"`
	CreatedAt  time.Time       `json:"createdAt"`
	UpdatedAt  time.Time       `json:"updatedAt"`
}

type ProjectSettings struct {
	EmbedLorebook             bool `json:"embedLorebook"`
	IncludeSystemPromptTokens bool `json:"includeSystemPromptTokens"`
	IncludePostHistoryTokens  bool `json:"includePostHistoryTokens"`
	PermanentBudget           int  `json:"permanentBudget"`
	DynamicBudget             int  `json:"dynamicBudget"`
	LorebookBudget            int  `json:"lorebookBudget"`
}

type Card struct {
	Spec        string         `json:"spec"`
	SpecVersion string         `json:"spec_version"`
	Data        CardData       `json:"data"`
	Extensions  map[string]any `json:"extensions,omitempty"`
}

type CardData struct {
	Name                    string         `json:"name"`
	Description             string         `json:"description"`
	Personality             string         `json:"personality"`
	Scenario                string         `json:"scenario"`
	FirstMes                string         `json:"first_mes"`
	MesExample              string         `json:"mes_example"`
	CreatorNotes            string         `json:"creator_notes"`
	SystemPrompt            string         `json:"system_prompt"`
	PostHistoryInstructions string         `json:"post_history_instructions"`
	AlternateGreetings      []string       `json:"alternate_greetings"`
	Tags                    []string       `json:"tags"`
	Creator                 string         `json:"creator"`
	CharacterVersion        string         `json:"character_version"`
	CharacterBook           *CharacterBook `json:"character_book,omitempty"`
	Extensions              map[string]any `json:"extensions,omitempty"`
}

type CharacterBook struct {
	Name        string          `json:"name"`
	Description string          `json:"description"`
	ScanDepth   int             `json:"scan_depth"`
	TokenBudget int             `json:"token_budget"`
	Recursive   bool            `json:"recursive_scanning"`
	Entries     []LorebookEntry `json:"entries"`
	Extensions  map[string]any  `json:"extensions,omitempty"`
}

type LorebookEntry struct {
	ID             int            `json:"id"`
	Keys           []string       `json:"keys"`
	SecondaryKeys  []string       `json:"secondary_keys"`
	Content        string         `json:"content"`
	Enabled        bool           `json:"enabled"`
	InsertionOrder int            `json:"insertion_order"`
	CaseSensitive  bool           `json:"case_sensitive"`
	Selective      bool           `json:"selective"`
	Constant       bool           `json:"constant"`
	Position       string         `json:"position"`
	Priority       int            `json:"priority"`
	Comment        string         `json:"comment"`
	Extensions     map[string]any `json:"extensions,omitempty"`
}

type LLMMessage struct {
	ID        string    `json:"id"`
	Template  string    `json:"template"`
	Locale    string    `json:"locale"`
	Prompt    string    `json:"prompt"`
	Response  string    `json:"response"`
	CreatedAt time.Time `json:"createdAt"`
}

type ReviewReport struct {
	ID        string       `json:"id"`
	Locale    string       `json:"locale"`
	Findings  []ReviewItem `json:"findings"`
	CreatedAt time.Time    `json:"createdAt"`
}

type ReviewItem struct {
	Type       string `json:"type"`
	Severity   string `json:"severity"`
	Location   string `json:"location"`
	Reason     string `json:"reason"`
	Suggestion string `json:"suggestion"`
	PatchDraft string `json:"patchDraft"`
}

type Snapshot struct {
	ID        string        `json:"id"`
	Label     string        `json:"label"`
	Card      Card          `json:"card"`
	Lorebook  CharacterBook `json:"lorebook"`
	CreatedAt time.Time     `json:"createdAt"`
}

type AppSettings struct {
	DeepSeekAPIKey string `json:"deepseekApiKey,omitempty"`
	DeepSeekModel  string `json:"deepseekModel"`
	UILocale       string `json:"uiLocale"`
	PromptLocale   string `json:"promptLocale"`
}

func NewProject(title string) Project {
	now := time.Now().UTC()
	id := "proj_" + now.Format("20060102150405")
	if title == "" {
		title = "Untitled card"
	}
	return Project{
		ID:    id,
		Title: title,
		Card:  NewBlankCard(title),
		Lorebook: CharacterBook{
			Name:        title + " Lorebook",
			Description: "",
			ScanDepth:   4,
			TokenBudget: 1024,
			Recursive:   false,
			Entries:     []LorebookEntry{},
			Extensions:  map[string]any{},
		},
		Settings: ProjectSettings{
			EmbedLorebook:             true,
			IncludeSystemPromptTokens: false,
			IncludePostHistoryTokens:  false,
			PermanentBudget:           1200,
			DynamicBudget:             1800,
			LorebookBudget:            1024,
		},
		LLMHistory: []LLMMessage{},
		Reviews:    []ReviewReport{},
		Snapshots:  []Snapshot{},
		CreatedAt:  now,
		UpdatedAt:  now,
	}
}

func NewBlankCard(name string) Card {
	return Card{
		Spec:        "chara_card_v2",
		SpecVersion: "2.0",
		Data: CardData{
			Name:               name,
			AlternateGreetings: []string{},
			Tags:               []string{},
			Extensions:         map[string]any{},
		},
		Extensions: map[string]any{},
	}
}
