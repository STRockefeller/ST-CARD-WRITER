package llm

import (
	"encoding/json"
	"strings"

	"st-card-writer/internal/model"
)

type TemplateRequest struct {
	Template       string             `json:"template"`
	Locale         string             `json:"locale"`
	Input          string             `json:"input"`
	Project        model.Project      `json:"project"`
	PriorMessages  []model.LLMMessage `json:"priorMessages"`
	ConversationID string             `json:"conversationId"`
}

func BuildPrompt(req TemplateRequest) string {
	card, _ := json.MarshalIndent(req.Project.Card.Data, "", "  ")
	lore, _ := json.MarshalIndent(req.Project.Lorebook, "", "  ")
	locale := req.Locale
	if locale == "" {
		locale = "zh-TW"
	}

	selected := templateInstruction(req.Template)
	parts := []string{
		"Respond in this locale: " + locale + ". For zh-TW, use natural Traditional Chinese.",
		cardWritingRules(),
		selected,
		formatPriorMessages(req.PriorMessages),
		"\nCurrent card data:\n" + string(card),
		"\nCurrent lorebook:\n" + string(lore),
	}
	if strings.TrimSpace(req.Input) != "" {
		parts = append(parts, "\nUser request:\n"+req.Input)
	}
	return strings.Join(parts, "\n\n")
}

func formatPriorMessages(messages []model.LLMMessage) string {
	if len(messages) == 0 {
		return "Conversation so far: none."
	}
	if len(messages) > 8 {
		messages = messages[len(messages)-8:]
	}
	var builder strings.Builder
	builder.WriteString("Conversation so far. Use this as context and continue naturally; do not restart unless the user starts a new discussion:\n")
	for _, message := range messages {
		if strings.TrimSpace(message.UserInput) != "" {
			builder.WriteString("\nUser: ")
			builder.WriteString(message.UserInput)
		}
		if strings.TrimSpace(message.Response) != "" {
			builder.WriteString("\nAssistant: ")
			builder.WriteString(message.Response)
		}
		builder.WriteString("\n")
	}
	return builder.String()
}

func templateInstruction(template string) string {
	switch template {
	case "generate_card":
		return strings.Join([]string{
			"MODE: manual full-card generation.",
			"Generate a SillyTavern V2 character card only because the user chose this template.",
			"Output one valid JSON code block that can be applied to the current card.",
			"Preserve useful existing fields and unknown extension-like information unless the user asks to replace them.",
		}, "\n")
	case "generate_lorebook":
		return strings.Join([]string{
			"MODE: manual lorebook generation.",
			"Create lorebook entries with keys, content, trigger intent, and insertion purpose.",
			"Output applicable lorebook JSON in a fenced json code block.",
		}, "\n")
	case "review":
		return strings.Join([]string{
			"MODE: critique.",
			"Find verbosity, weak LLM guidance, play-experience problems, missing key details, token waste, lorebook trigger risks, inconsistent voice, and unsafe assumptions.",
			"Prefer structured advice. Do not rewrite the whole card unless the user asks.",
		}, "\n")
	case "translate":
		return strings.Join([]string{
			"MODE: translation.",
			"Protect {{char}}, {{user}}, macros, URLs, file paths, JSON keys, MVU variable names, and fenced code blocks.",
			"If you output applicable translated card data, put it in a fenced json code block.",
		}, "\n")
	case "mvu":
		return strings.Join([]string{
			"MODE: MVU/state-card inspection.",
			"Find inconsistent variable names, vague update rules, translation-sensitive parameters, missing initial state, and unclear update timing.",
			"Diagnose first; do not generate a full card immediately.",
		}, "\n")
	case "compress":
		return strings.Join([]string{
			"MODE: compression.",
			"Compress card and lorebook text while preserving playability, character identity, key rules, secrets, trigger conditions, and distinct voice.",
			"If you output applicable data, put it in a fenced json code block.",
		}, "\n")
	default:
		return strings.Join([]string{
			"MODE: discussion and brainstorming.",
			"Do not produce a full character card, full JSON, or full lorebook unless the user explicitly asks for generation.",
			"First clarify tension, core contradiction, playable interaction, relationship dynamics, boundaries, tone, and missing setting details.",
			"Ask 2-3 concrete clarifying questions when the concept is underspecified.",
			"Summarize your understanding and invite confirmation before moving to full generation.",
			"You may offer small reusable snippets, but avoid filling the whole card in one pass.",
		}, "\n")
	}
}

func cardWritingRules() string {
	return strings.Join([]string{
		"CARD QUALITY RULES:",
		"- Prefer multi-turn concept development: gather information, confirm understanding, then generate only on manual request.",
		"- Permanent fields should be concise. Target roughly 600-1000 permanent tokens total: description 60-70%, personality 10-15%, scenario 15-25%.",
		"- description should include physical details, core traits, formative background, motivations/goals, and minimal world context. Use lorebooks for heavy worldbuilding.",
		"- In meta-instruction fields, use {{char}} and {{user}}. Avoid pronouns for {{char}} in instructional prose when clarity matters.",
		"- personality should be compact: comma list, short sentences, or a clear psychological framework.",
		"- scenario must be instructional state, not a novel excerpt. Include relationship to {{user}}, current situation, routine/behavior patterns, mood/goals, and open-ended hooks.",
		"- mes_example should start with <START>, use a consistent dialogue format, show {{char}} voice, and never write {{user}} dialogue or actions.",
		"- first_mes should be 2-3 paragraphs, set the scene, show {{char}} in action, and leave an opening for {{user}}. Do not describe {{user}}'s inner state or force {{user}} actions.",
		"- Use straight quotes only in JSON-oriented output. Escape newlines in JSON string values. Avoid trailing commas.",
		"- creator and character_version should not be empty in generated full-card JSON.",
	}, "\n")
}
