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
			"zh-TW": "你是 SillyTavern 角色卡創作夥伴。請根據使用者想法提出可遊玩的角色核心、衝突、秘密、語氣、開場，以及適合 lorebook 的世界資訊。避免空泛形容，輸出可直接放進卡片欄位的素材。",
			"en":    "You are a SillyTavern character-card co-writer. Turn the user's idea into playable character hooks, conflicts, secrets, voice, greetings, and lorebook-ready world details. Avoid vague adjectives and output material that can be pasted into card fields.",
		},
		"generate_card": {
			"zh-TW": "請產生 SillyTavern V2 角色卡內容。維持 {{char}} 與 {{user}} macro，不要輸出 PNG 或 markdown 說明，只輸出分段清楚的欄位草稿。",
			"en":    "Draft SillyTavern V2 character-card content. Preserve {{char}} and {{user}} macros. Do not output PNG metadata or markdown explanations; produce clear field drafts.",
		},
		"generate_lorebook": {
			"zh-TW": "請為目前角色卡建立 lorebook entries。每筆要有 keys、content、啟用條件與插入目的。內容應幫助 LLM 理解世界、關係、規則或秘密。",
			"en":    "Create lorebook entries for this card. Include keys, content, trigger intent, and why the entry should be inserted. Focus on world, relationships, rules, and secrets.",
		},
		"review": {
			"zh-TW": "請進入找碴模式，檢查冗長贅字、不利 LLM 理解的寫法、遊玩體驗問題、缺少的關鍵敘述、token 浪費與 lorebook 觸發風險。用 JSON array 輸出：type,severity,location,reason,suggestion,patchDraft。",
			"en":    "Enter critique mode. Find verbosity, LLM-unfriendly phrasing, play-experience problems, missing key details, token waste, and lorebook trigger risks. Output a JSON array with type,severity,location,reason,suggestion,patchDraft.",
		},
		"translate": {
			"zh-TW": "請翻譯卡片內容。保護 {{char}}、{{user}}、macro、URL、檔案路徑、JSON key、MVU 變數名、fenced code blocks，不要改壞連結或參數名稱。保留欄位結構。",
			"en":    "Translate the card content. Protect {{char}}, {{user}}, macros, URLs, file paths, JSON keys, MVU variable names, and fenced code blocks. Preserve field structure.",
		},
		"mvu": {
			"zh-TW": "請檢查 MVU/狀態更新型角色卡內容，找出變數名稱不一致、狀態更新規則模糊、容易被翻譯破壞的參數、缺少初始化狀態與更新時機的地方。",
			"en":    "Inspect this MVU/state-update card. Find inconsistent variable names, vague update rules, translation-sensitive parameters, missing initial state, and unclear update timing.",
		},
		"compress": {
			"zh-TW": "請壓縮角色卡與 lorebook 文字，保留可玩性、角色辨識度、關鍵規則、秘密與觸發條件，刪除重複和空泛形容。",
			"en":    "Compress the card and lorebook while preserving playability, character identity, key rules, secrets, and trigger conditions. Remove repetition and vague adjectives.",
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
