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

func TestQuickToolPromptsUseCurrentCardWithoutConversationInstructions(t *testing.T) {
	project := model.NewProject("Quick tools")
	project.Card.Data.Name = "Lin Yue"
	project.Card.Data.Description = "A reserved swordmaster protecting an old friend."
	project.Lorebook.Entries = append(project.Lorebook.Entries, model.LorebookEntry{ID: 1, Content: "The mountain sect values restraint."})

	persona := BuildQuickToolPrompt("user_persona", "en", project)
	if !strings.Contains(persona, "NAME:") || !strings.Contains(persona, "Lin Yue") {
		t.Fatalf("persona prompt is missing output format or card context: %s", persona)
	}
	if strings.Contains(persona, "Conversation so far") {
		t.Fatalf("quick tool prompt should not include conversation history")
	}
	for _, requirement := range []string{
		"concrete proper name",
		"Forbidden names include",
		"entirely in third person",
		"persona as {{user}}",
		"card character as {{char}}",
	} {
		if !strings.Contains(persona, requirement) {
			t.Fatalf("persona prompt is missing requirement %q", requirement)
		}
	}

	cover := BuildQuickToolPrompt("cover_prompt", "en", project)
	if !strings.Contains(cover, "NATURAL_LANGUAGE:") || !strings.Contains(cover, "BOORU_TAGS:") {
		t.Fatalf("cover prompt is missing stable section markers: %s", cover)
	}
	if !strings.Contains(cover, "mountain sect") {
		t.Fatalf("cover prompt should include lorebook context")
	}
}

func TestGenerateMVUPromptHasStrictSchemaAndCompleteContext(t *testing.T) {
	project := model.NewProject("MVU generator")
	project.Card.Data.Description = "A detective whose trust changes during play."
	project.Lorebook.Entries = []model.LorebookEntry{
		{ID: 1, Comment: "ordinary clue", Content: "The sealed archive contains the missing report.", Enabled: true},
		{ID: 2, Comment: "[initvar] Initial Variables (keep disabled)", Content: `{"trust": 10}`, Constant: true},
	}

	prompt := BuildPrompt(TemplateRequest{Template: "generate_mvu", Locale: "en", Project: project})
	for _, required := range []string{
		"direct MVU generation or adjustment",
		`{"mvu":{"initial_variables":{...},"update_rules":"..."}}`,
		"complete <status_current_variable>",
		"The sealed archive contains the missing report.",
		`trust`,
		"Do not output or modify ordinary lorebook entries",
	} {
		if !strings.Contains(prompt, required) {
			t.Fatalf("generate_mvu prompt is missing %q", required)
		}
	}
}
