package model

import "unicode/utf8"

type TokenBudget struct {
	Permanent       int  `json:"permanent"`
	Dynamic         int  `json:"dynamic"`
	Lorebook        int  `json:"lorebook"`
	Total           int  `json:"total"`
	PermanentBudget int  `json:"permanentBudget"`
	DynamicBudget   int  `json:"dynamicBudget"`
	LorebookBudget  int  `json:"lorebookBudget"`
	PermanentOver   bool `json:"permanentOver"`
	DynamicOver     bool `json:"dynamicOver"`
	LorebookOver    bool `json:"lorebookOver"`
}

func EstimateTokens(text string) int {
	if text == "" {
		return 0
	}
	runes := utf8.RuneCountInString(text)
	cjk := 0
	for _, r := range text {
		if (r >= 0x4e00 && r <= 0x9fff) || (r >= 0x3040 && r <= 0x30ff) || (r >= 0xac00 && r <= 0xd7af) {
			cjk++
		}
	}
	latin := runes - cjk
	tokens := (cjk*10 + 16) / 17
	tokens += (latin + 3) / 4
	if tokens < 1 {
		return 1
	}
	return tokens
}

func CountBudget(project Project) TokenBudget {
	card := project.Card.Data
	permanent := EstimateTokens(card.Name + "\n" + card.Description + "\n" + card.Personality + "\n" + card.Scenario)
	if project.Settings.IncludeSystemPromptTokens {
		permanent += EstimateTokens(card.SystemPrompt)
	}
	if project.Settings.IncludePostHistoryTokens {
		permanent += EstimateTokens(card.PostHistoryInstructions)
	}

	dynamic := EstimateTokens(card.FirstMes + "\n" + card.MesExample)
	lorebook := 0
	for _, entry := range project.Lorebook.Entries {
		if entry.Enabled || entry.Constant {
			lorebook += EstimateTokens(entry.Content)
			for _, key := range entry.Keys {
				lorebook += EstimateTokens(key)
			}
			for _, key := range entry.SecondaryKeys {
				lorebook += EstimateTokens(key)
			}
		}
	}
	dynamic += lorebook

	return TokenBudget{
		Permanent:       permanent,
		Dynamic:         dynamic,
		Lorebook:        lorebook,
		Total:           permanent + dynamic,
		PermanentBudget: project.Settings.PermanentBudget,
		DynamicBudget:   project.Settings.DynamicBudget,
		LorebookBudget:  project.Settings.LorebookBudget,
		PermanentOver:   permanent > project.Settings.PermanentBudget,
		DynamicOver:     dynamic > project.Settings.DynamicBudget,
		LorebookOver:    lorebook > project.Settings.LorebookBudget,
	}
}
