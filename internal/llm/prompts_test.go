package llm

import (
	"strings"
	"testing"

	"st-card-writer/internal/model"
)

func TestTranslatePromptUsesCompactContext(t *testing.T) {
	project := model.NewProject("MVU Test")
	project.Card.Data.Description = "简体描述"
	project.Card.Data.Extensions = map[string]any{"large_metadata": "should not appear"}
	project.Lorebook.Entries = []model.LorebookEntry{
		{
			ID:      7,
			Keys:    []string{"变量"},
			Content: "<% setvar('stat_data.{{user}}.变量', 1) %>\n需要翻译的自然语言。",
			Enabled: true,
			Extensions: map[string]any{
				"display_index": 99,
				"vectorized":    false,
			},
		},
	}

	prompt := BuildPrompt(TemplateRequest{
		Template: "translate",
		Locale:   "zh-TW",
		Input:    "目標語言：繁體中文",
		Project:  project,
	})

	if !strings.Contains(prompt, "需要翻译的自然语言") {
		t.Fatal("expected translatable lorebook content in prompt")
	}
	if !strings.Contains(prompt, "setvar('stat_data.{{user}}.变量', 1)") {
		t.Fatal("expected MVU code in prompt")
	}
	if strings.Contains(prompt, "large_metadata") || strings.Contains(prompt, "display_index") || strings.Contains(prompt, "vectorized") {
		t.Fatalf("expected compact prompt to omit extensions, got:\n%s", prompt)
	}
}
