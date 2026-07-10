package llm

import (
	"encoding/json"
	"fmt"
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
		formatTokenBudget(req.Project),
		formatCreativePreferences(req.Project.Settings),
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

func formatCreativePreferences(settings model.ProjectSettings) string {
	lines := []string{
		"CREATIVE PREFERENCES:",
		"- These preferences affect narrative prose, examples, first_mes, and alternate greetings.",
		"- Do not write these preferences into system_prompt or post_history_instructions unless the user explicitly asks.",
	}
	if style := writingStyleInstruction(settings.WritingStyle); style != "" {
		lines = append(lines, "- Writing style: "+style)
	} else {
		lines = append(lines, "- Writing style: unset; infer from the user's request and current card.")
	}
	if person := narrativePersonInstruction(settings.NarrativePerson); person != "" {
		lines = append(lines, "- Narrative person: "+person)
	} else {
		lines = append(lines, "- Narrative person: unset; choose what best serves the card unless the user specifies.")
	}
	if worldview := worldviewInstruction(settings.Worldview); worldview != "" {
		lines = append(lines, "- Worldview: "+worldview)
	} else {
		lines = append(lines, "- Worldview: unset; do not force a genre.")
	}
	return strings.Join(lines, "\n")
}

func writingStyleInstruction(value string) string {
	switch value {
	case "light_novel":
		return "light novel style; vivid, accessible, emotionally immediate, character reactions and scene beats are clear."
	case "prose":
		return "literary prose; sensory, reflective, precise, with restrained but evocative imagery."
	case "wuxia":
		return "wuxia novel style; honor, restraint, martial atmosphere, poetic tension, and period-appropriate diction."
	case "noir":
		return "noir style; terse, atmospheric, morally shaded, with sharp observations and subtext."
	case "comedy":
		return "comedic style; playful timing and wit while preserving character consistency."
	default:
		return ""
	}
}

func narrativePersonInstruction(value string) string {
	switch value {
	case "first":
		return "first person; first_mes and greetings may use I/me for {{char}} while never controlling {{user}}."
	case "second":
		return "second person; address {{user}} as you, but do not assert {{user}}'s feelings, thoughts, or forced actions."
	case "third":
		return "third person; describe {{char}} externally with clear scene direction and avoid omniscient claims about {{user}}."
	default:
		return ""
	}
}

func worldviewInstruction(value string) string {
	switch value {
	case "modern":
		return "modern setting; contemporary social norms, technology, and everyday texture."
	case "future":
		return "future setting; plausible future technology, institutions, and social changes."
	case "fantasy":
		return "fantasy setting; magic, mythic rules, cultures, and concrete limits rather than vague wonder."
	case "sci_fi":
		return "science fiction setting; speculative systems, technology constraints, and world logic."
	case "historical":
		return "historical setting; period texture and constraints, avoiding modern anachronisms unless intentional."
	case "parallel_world":
		return "parallel-world setting; familiar baseline with one or more concrete divergences that affect play."
	default:
		return ""
	}
}

func formatTokenBudget(project model.Project) string {
	budget := model.CountBudget(project)
	return fmt.Sprintf(
		"TOKEN BUDGET CONTEXT:\n- permanent tokens now: %d / %d\n- dynamic tokens now: %d / %d\n- lorebook tokens now: %d / %d\n- total estimated tokens now: %d\nUse the available budget intentionally. Do not be overly terse when there is room, but keep permanent fields focused and playable.",
		budget.Permanent,
		budget.PermanentBudget,
		budget.Dynamic,
		budget.DynamicBudget,
		budget.Lorebook,
		budget.LorebookBudget,
		budget.Total,
	)
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
	case "revise_card":
		return strings.Join([]string{
			"MODE: direct card revision.",
			"The user is asking for an immediate improvement pass, not discussion.",
			"Use the current card, lorebook, prior conversation, creative preferences, token budget, and the user's revision direction.",
			"Output one fenced json code block containing only the fields/data that should be applied. Do not include a full card unless the change genuinely requires it.",
			"Keep useful existing information and improve weak, vague, redundant, or play-hostile text.",
		}, "\n")
	case "field_rewrite":
		return strings.Join([]string{
			"MODE: direct single-field rewrite.",
			"The user chose an AI rewrite action for one field. Do not discuss, review, or ask questions.",
			"Use the current card, lorebook, prior conversation, creative preferences, token budget, and the user's rewrite direction.",
			"Output exactly one fenced code block. Inside the code block, put only the replacement content for that single field.",
			"Do not output JSON, a field name, explanations, bullets outside the field content, or changes to other fields.",
		}, "\n")
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
		"- The 600-1000 permanent token target is a quality range, not a hard ceiling. If the user budget is larger, use the extra room for clearer motivations, relationships, behavioral rules, and scenario hooks instead of padding.",
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
