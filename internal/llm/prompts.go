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
	locale := req.Locale
	if locale == "" {
		locale = "zh-TW"
	}

	selected := templateInstruction(req.Template)
	projectContext := formatProjectContext(req)
	parts := []string{
		"Respond in this locale: " + locale + ". For zh-TW, use natural Traditional Chinese.",
		cardWritingRules(),
		formatTokenBudget(req.Project),
		formatCreativePreferences(req.Project.Settings),
		selected,
		formatPriorMessages(req.PriorMessages),
		projectContext,
	}
	if strings.TrimSpace(req.Input) != "" {
		parts = append(parts, "\nUser request:\n"+req.Input)
	}
	return strings.Join(parts, "\n\n")
}

func BuildQuickToolPrompt(tool string, locale string, project model.Project) string {
	if locale == "" {
		locale = "zh-TW"
	}
	card, _ := json.MarshalIndent(project.Card.Data, "", "  ")
	lore, _ := json.MarshalIndent(project.Lorebook, "", "  ")
	base := []string{
		"Respond in this locale: " + locale + ". For zh-TW, use natural Traditional Chinese.",
		"This is a one-shot utility. Return only the requested artifact, with no preamble, explanation, markdown fence, or follow-up question.",
		"Understand the complete character card and lorebook before answering. Do not rewrite the card.",
		formatCreativePreferences(project.Settings),
		"Current card data:\n" + string(card),
		"Current lorebook:\n" + string(lore),
	}
	if tool == "cover_prompt" {
		base = append(base, strings.Join([]string{
			"Create two text-to-image prompts for this card's cover.",
			"For a normal character card, prioritize a clear, attractive depiction of the character, recognizable appearance, personality, pose, expression, clothing, and strong composition. Add a fitting background or a small story moment only when it improves the image.",
			"For storyteller, scenario, ensemble, or world cards, depict the central premise, cast, location, mood, or narrative hook instead of forcing a single-character portrait.",
			"Do not include {{user}} unless the card concept specifically requires {{user}} to appear. Avoid artist names and copyrighted style imitation.",
			"Use exactly this plain-text format:",
			"NATURAL_LANGUAGE:",
			"<one polished natural-language image prompt>",
			"BOORU_TAGS:",
			"<comma-separated booru-style tags>",
		}, "\n"))
	} else {
		base = append(base, strings.Join([]string{
			"Create a concise persona description for the human user to roleplay opposite this card.",
			"Infer a useful role, relationship, and minimum context from the card, but leave the user's personality, decisions, feelings, and detailed history open for roleplay.",
			"Always provide a concrete proper name appropriate to the card's language, culture, time period, and setting. If the card explicitly defines the user's real name, use it; otherwise invent one.",
			"The NAME value must never be a placeholder or pronoun. Forbidden names include: 你, 妳, 您, You, User, Player, 玩家, 主角, {{user}}, and unnamed equivalents.",
			"Write DESCRIPTION entirely in third person. Refer to the generated persona as {{user}} and the card character as {{char}}. Do not address the reader as 'you', and do not use first-person narration.",
			"Keep DESCRIPTION concise: normally one short paragraph covering only {{user}}'s role, essential background, and relationship or starting connection with {{char}}.",
			"Leave {{user}}'s personality, thoughts, feelings, choices, and detailed history open unless the card requires a specific constraint.",
			"Use exactly this plain-text format:",
			"NAME: <concrete proper name only>",
			"DESCRIPTION: <one concise third-person paragraph using {{user}} and {{char}}>",
		}, "\n"))
	}
	return strings.Join(base, "\n\n")
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

func formatProjectContext(req TemplateRequest) string {
	switch req.Template {
	case "translate":
		return formatTranslationContext(req.Project)
	case "mvu":
		return formatMVUContext(req.Project)
	default:
		card, _ := json.MarshalIndent(req.Project.Card.Data, "", "  ")
		lore, _ := json.MarshalIndent(req.Project.Lorebook, "", "  ")
		return "\nCurrent card data:\n" + string(card) + "\n\nCurrent lorebook:\n" + string(lore)
	}
}

type translationCardData struct {
	Name                    string   `json:"name"`
	Description             string   `json:"description"`
	Personality             string   `json:"personality"`
	Scenario                string   `json:"scenario"`
	FirstMes                string   `json:"first_mes"`
	MesExample              string   `json:"mes_example"`
	CreatorNotes            string   `json:"creator_notes"`
	SystemPrompt            string   `json:"system_prompt"`
	PostHistoryInstructions string   `json:"post_history_instructions"`
	AlternateGreetings      []string `json:"alternate_greetings"`
	Tags                    []string `json:"tags"`
}

type translationLoreEntry struct {
	ID            int      `json:"id"`
	Keys          []string `json:"keys"`
	SecondaryKeys []string `json:"secondary_keys"`
	Comment       string   `json:"comment"`
	Content       string   `json:"content"`
	Enabled       bool     `json:"enabled"`
	Constant      bool     `json:"constant"`
	Selective     bool     `json:"selective"`
	Position      string   `json:"position"`
}

type translationContext struct {
	Card    translationCardData    `json:"card"`
	Entries []translationLoreEntry `json:"lorebook_entries"`
	Notice  string                 `json:"notice"`
}

func formatTranslationContext(project model.Project) string {
	entries := make([]translationLoreEntry, 0, len(project.Lorebook.Entries))
	for _, entry := range project.Lorebook.Entries {
		entries = append(entries, translationLoreEntry{
			ID:            entry.ID,
			Keys:          entry.Keys,
			SecondaryKeys: entry.SecondaryKeys,
			Comment:       entry.Comment,
			Content:       entry.Content,
			Enabled:       entry.Enabled,
			Constant:      entry.Constant,
			Selective:     entry.Selective,
			Position:      entry.Position,
		})
	}
	context := translationContext{
		Card: translationCardData{
			Name:                    project.Card.Data.Name,
			Description:             project.Card.Data.Description,
			Personality:             project.Card.Data.Personality,
			Scenario:                project.Card.Data.Scenario,
			FirstMes:                project.Card.Data.FirstMes,
			MesExample:              project.Card.Data.MesExample,
			CreatorNotes:            project.Card.Data.CreatorNotes,
			SystemPrompt:            project.Card.Data.SystemPrompt,
			PostHistoryInstructions: project.Card.Data.PostHistoryInstructions,
			AlternateGreetings:      project.Card.Data.AlternateGreetings,
			Tags:                    project.Card.Data.Tags,
		},
		Entries: entries,
		Notice:  "Extensions and non-text metadata are intentionally omitted from this prompt. Preserve IDs, keys, variable names, macros, MVU code, and entry structure in any patch output.",
	}
	raw, _ := json.MarshalIndent(context, "", "  ")
	text := string(raw)
	const limit = 85000
	if len(text) <= limit {
		return "\nTranslation context:\n" + text
	}
	return "\nTranslation context is very large, so this request includes the first safe batch only. Translate the included fields and explicitly tell the user that remaining lorebook entries need another pass.\n" + safeTruncateJSONText(text, limit)
}

func formatMVUContext(project model.Project) string {
	entries := make([]translationLoreEntry, 0, len(project.Lorebook.Entries))
	for _, entry := range project.Lorebook.Entries {
		if strings.Contains(entry.Content, "getvar(") ||
			strings.Contains(entry.Content, "setvar(") ||
			strings.Contains(entry.Content, "stat_data") ||
			strings.Contains(entry.Content, "<%") ||
			strings.Contains(entry.Comment, "MVU") {
			entries = append(entries, translationLoreEntry{
				ID:            entry.ID,
				Keys:          entry.Keys,
				SecondaryKeys: entry.SecondaryKeys,
				Comment:       entry.Comment,
				Content:       entry.Content,
				Enabled:       entry.Enabled,
				Constant:      entry.Constant,
				Selective:     entry.Selective,
				Position:      entry.Position,
			})
		}
	}
	context := map[string]any{
		"card_name":        project.Card.Data.Name,
		"system_prompt":    project.Card.Data.SystemPrompt,
		"creator_notes":    project.Card.Data.CreatorNotes,
		"mvu_like_entries": entries,
		"notice":           "Only MVU-like entries and related text are included. Preserve variable names, getvar/setvar calls, macros, and code delimiters.",
	}
	raw, _ := json.MarshalIndent(context, "", "  ")
	text := string(raw)
	const limit = 85000
	if len(text) <= limit {
		return "\nMVU inspection context:\n" + text
	}
	return "\nMVU inspection context is very large, so this request includes the first safe batch only. Inspect the included entries and tell the user another pass is needed for omitted entries.\n" + safeTruncateJSONText(text, limit)
}

func safeTruncateJSONText(text string, limit int) string {
	if len(text) <= limit {
		return text
	}
	cut := limit
	for cut > 0 && !strings.HasSuffix(text[:cut], "\n") {
		cut--
	}
	if cut < limit/2 {
		cut = limit
	}
	return text[:cut] + "\n\n...TRUNCATED_FOR_MODEL_LIMIT..."
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
			"Do not output or modify character_book, lorebook entries, [initvar], [mvu_update], MVU runtime scripts, or card extensions.",
			"Preserve useful existing card fields unless the user asks to replace them.",
		}, "\n")
	case "generate_lorebook":
		return strings.Join([]string{
			"MODE: manual lorebook generation.",
			"Create lorebook entries with keys, content, trigger intent, and insertion purpose.",
			"Do not output, replace, or modify [initvar], [mvu_update], MVU entries, or card fields.",
			"Output applicable lorebook JSON in a fenced json code block.",
		}, "\n")
	case "generate_mvu":
		return strings.Join([]string{
			"MODE: direct MVU generation or adjustment.",
			"Use the complete current card, lorebook, existing MVU entries, and prior discussion to design a coherent state model.",
			"Return exactly one fenced valid JSON object with this shape: {\"mvu\":{\"initial_variables\":{...},\"update_rules\":\"...\"}}.",
			"initial_variables must be a JSON object containing only stored stat_data values. Preserve useful existing paths unless the user's request requires changing them.",
			"update_rules must contain the human policy plus the complete <status_current_variable> and <UpdateVariable>/<JSONPatch> protocol expected by MagVarUpdate.",
			"Follow every MVU AUTHORING RULE below. Ensure every path referenced by update_rules exists in initial_variables and every operation preserves its declared type.",
			"Do not output or modify ordinary lorebook entries, character-card fields, character_book metadata, or card extensions.",
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
			"Translate natural-language prose into the requested target language while preserving all MVU code delimiters, getvar/setvar calls, variable names, entry IDs, keys, and JSON field names.",
			"Prefer an applicable JSON patch-like object in a fenced json code block, containing only translated fields and lorebook entry IDs/content that changed.",
			"If the context says it was truncated, translate only the included batch and clearly say another pass is needed for omitted entries.",
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
		"MVU AUTHORING RULES (apply whenever discussing or rewriting MVU initial variables or update rules):",
		"- Treat every leaf type in the [initvar] tree as authoritative. Explicitly state number, string, boolean, array, object, or null constraints and preserve them during updates.",
		"- For MVU JSON Patch, replace must preserve the declared type; delta is valid only for numbers; insert is valid only for arrays or explicitly extensible objects; remove should be used only for optional data.",
		"- Use JSON Pointer paths with leading slash and proper ~0/~1 escaping. Never create a path not declared by the initial tree unless the schema explicitly allows it.",
		"- stat_data contains stored values. display_data may contain human-readable diffs such as 1->2 (Json_patch); never write those display strings back into stat_data.",
		"- Update only for events that actually occurred in the latest reply. Do not repeat an update for an event already accounted for, and keep numeric values within their declared bounds.",
		"- When rewriting only the human-authored policy section, preserve generated type-contract markers and the <status_current_variable>/<UpdateVariable>/<JSONPatch> protocol blocks exactly.",
	}, "\n")
}
