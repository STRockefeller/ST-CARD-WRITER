package llm

import (
	"encoding/json"
	"strings"

	"st-card-writer/internal/model"
)

type TemplateRequest struct {
	Template string        `json:"template"`
	Locale   string        `json:"locale"`
	Input    string        `json:"input"`
	Project  model.Project `json:"project"`
}

func BuildPrompt(req TemplateRequest) string {
	card, _ := json.MarshalIndent(req.Project.Card.Data, "", "  ")
	lore, _ := json.MarshalIndent(req.Project.Lorebook, "", "  ")
	locale := req.Locale
	if locale == "" {
		locale = "zh-TW"
	}

	base := map[string]map[string]string{
		"brainstorm": {
			"zh-TW": strings.Join([]string{
				"你是 SillyTavern 角色卡創作夥伴，目前處於討論模式。",
				"不要急著輸出完整角色卡、完整 JSON、完整 lorebook，除非使用者明確要求生成。",
				"你的目標是先和使用者互相釐清：主題是否有張力、角色核心矛盾、可玩互動、關係動態、禁忌/雷點、敘事風格、需要補強的設定。",
				"每次回覆先給 2-4 個高品質觀察或方向，再問 1-3 個能推進創作的問題。",
				"如果有局部可用素材，可以用短段落或 bullet 提供，但避免一次填滿整張卡。",
			}, "\n"),
			"en": strings.Join([]string{
				"You are a SillyTavern character-card co-writer in discussion mode.",
				"Do not produce a full character card, full JSON, or full lorebook unless the user explicitly asks for generation.",
				"First clarify tension, core contradiction, playable interaction, relationship dynamics, boundaries, tone, and missing setting details.",
				"Each reply should provide 2-4 useful observations or directions, then ask 1-3 questions that move the concept forward.",
				"You may offer small reusable snippets, but avoid filling the whole card in one pass.",
			}, "\n"),
		},
		"generate_card": {
			"zh-TW": "請產生 SillyTavern V2 角色卡草稿。這是手動觸發的生成模式，可以輸出可套用的 JSON code block。保留 {{char}} 與 {{user}} macro，不要破壞 extensions。",
			"en":    "Draft a SillyTavern V2 character card. This is a manually triggered generation mode, so you may output an applicable JSON code block. Preserve {{char}}, {{user}}, and extensions.",
		},
		"generate_lorebook": {
			"zh-TW": "請為目前角色卡建立 lorebook entries。這是手動觸發的生成模式，可以輸出可套用的 JSON code block。每筆要有 keys、content、啟用條件與插入目的。",
			"en":    "Create lorebook entries for this card. This is a manually triggered generation mode, so you may output an applicable JSON code block. Include keys, content, trigger intent, and insertion purpose.",
		},
		"review": {
			"zh-TW": "請進入找碴模式，檢查冗長贅字、不利 LLM 理解的寫法、遊玩體驗問題、缺少的關鍵敘述、token 浪費與 lorebook 觸發風險。優先給結構化建議，不要直接重寫整張卡，除非使用者要求。",
			"en":    "Enter critique mode. Find verbosity, LLM-unfriendly phrasing, play-experience problems, missing key details, token waste, and lorebook trigger risks. Prefer structured advice; do not rewrite the whole card unless asked.",
		},
		"translate": {
			"zh-TW": "請翻譯卡片內容。保護 {{char}}、{{user}}、macro、URL、檔案路徑、JSON key、MVU 變數名、fenced code blocks，不要改壞連結或參數名稱。若輸出可套用內容，請放在 JSON code block。",
			"en":    "Translate card content. Protect {{char}}, {{user}}, macros, URLs, file paths, JSON keys, MVU variable names, and fenced code blocks. Put applicable output in a JSON code block.",
		},
		"mvu": {
			"zh-TW": "請檢查 MVU/狀態更新型角色卡內容，找出變數名稱不一致、狀態更新規則模糊、容易被翻譯破壞的參數、缺少初始化狀態與更新時機的地方。先給診斷與問題，不要直接生成完整卡。",
			"en":    "Inspect this MVU/state-update card. Find inconsistent variable names, vague update rules, translation-sensitive parameters, missing initial state, and unclear update timing. Diagnose first; do not generate a full card immediately.",
		},
		"compress": {
			"zh-TW": "請壓縮角色卡與 lorebook 文字，保留可玩性、角色辨識度、關鍵規則、秘密與觸發條件，刪除重複和空泛形容。若輸出可套用內容，請放在 JSON code block。",
			"en":    "Compress the card and lorebook while preserving playability, identity, key rules, secrets, and trigger conditions. Put applicable output in a JSON code block.",
		},
	}
	selected := base[req.Template][locale]
	if selected == "" {
		selected = base[req.Template]["en"]
	}
	if selected == "" {
		selected = base["brainstorm"][locale]
	}

	parts := []string{
		selected,
		"\nCurrent card data:\n" + string(card),
		"\nCurrent lorebook:\n" + string(lore),
	}
	if strings.TrimSpace(req.Input) != "" {
		parts = append(parts, "\nUser request:\n"+req.Input)
	}
	return strings.Join(parts, "\n")
}
