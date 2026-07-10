package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"st-card-writer/internal/llm"
	"st-card-writer/internal/model"
	"st-card-writer/internal/store"
)

type Server struct {
	store *store.Store
}

func NewServer(store *store.Store) *Server {
	return &Server{store: store}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/api/health", s.health)
	mux.HandleFunc("/api/projects", s.projects)
	mux.HandleFunc("/api/projects/", s.projectByID)
	mux.HandleFunc("/api/settings", s.settings)
	mux.HandleFunc("/api/import", s.importCard)
	mux.HandleFunc("/api/llm", s.llm)
	return withCORS(mux)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "http://127.0.0.1:5173")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, map[string]string{"ok": "true"})
}

func (s *Server) projects(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		projects, err := s.store.ListProjects()
		if err != nil {
			writeError(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, projects)
	case http.MethodPost:
		var body struct {
			Title string `json:"title"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		project := model.NewProject(body.Title)
		if err := s.store.SaveProject(project); err != nil {
			writeError(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, project)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) projectByID(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/projects/")
	parts := strings.Split(strings.Trim(path, "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	id := parts[0]

	if len(parts) == 2 && parts[1] == "export" && r.Method == http.MethodPost {
		s.exportProject(w, id)
		return
	}
	if len(parts) == 2 && parts[1] == "tokens" && r.Method == http.MethodGet {
		project, err := s.store.GetProject(id)
		if err != nil {
			writeError(w, err, http.StatusNotFound)
			return
		}
		writeJSON(w, model.CountBudget(project))
		return
	}

	switch r.Method {
	case http.MethodGet:
		project, err := s.store.GetProject(id)
		if err != nil {
			writeError(w, err, http.StatusNotFound)
			return
		}
		writeJSON(w, project)
	case http.MethodPut:
		var project model.Project
		if err := json.NewDecoder(r.Body).Decode(&project); err != nil {
			writeError(w, err, http.StatusBadRequest)
			return
		}
		if project.ID != id {
			writeError(w, errors.New("project id mismatch"), http.StatusBadRequest)
			return
		}
		if err := s.store.SaveProject(project); err != nil {
			writeError(w, err, http.StatusInternalServerError)
			return
		}
		writeJSON(w, project)
	case http.MethodDelete:
		if err := s.store.DeleteProject(id); err != nil {
			writeError(w, err, http.StatusNotFound)
			return
		}
		writeJSON(w, map[string]string{"ok": "true"})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) exportProject(w http.ResponseWriter, id string) {
	project, err := s.store.GetProject(id)
	if err != nil {
		writeError(w, err, http.StatusNotFound)
		return
	}
	card := project.Card
	if card.Spec == "" {
		card.Spec = "chara_card_v2"
	}
	if card.SpecVersion == "" {
		card.SpecVersion = "2.0"
	}
	if project.Settings.EmbedLorebook {
		book := project.Lorebook
		book.TokenBudget = project.Settings.LorebookBudget
		card.Data.CharacterBook = &book
	} else {
		card.Data.CharacterBook = nil
	}
	writeJSON(w, card)
}

func (s *Server) settings(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		settings, err := s.store.GetSettings()
		if err != nil {
			writeError(w, err, http.StatusInternalServerError)
			return
		}
		settings.DeepSeekAPIKey = mask(settings.DeepSeekAPIKey)
		writeJSON(w, settings)
	case http.MethodPut:
		current, _ := s.store.GetSettings()
		var incoming model.AppSettings
		if err := json.NewDecoder(r.Body).Decode(&incoming); err != nil {
			writeError(w, err, http.StatusBadRequest)
			return
		}
		if incoming.DeepSeekAPIKey == "" || strings.Contains(incoming.DeepSeekAPIKey, "****") {
			incoming.DeepSeekAPIKey = current.DeepSeekAPIKey
		}
		if err := s.store.SaveSettings(incoming); err != nil {
			writeError(w, err, http.StatusInternalServerError)
			return
		}
		incoming.DeepSeekAPIKey = mask(incoming.DeepSeekAPIKey)
		writeJSON(w, incoming)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) importCard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		Title string          `json:"title"`
		Card  json.RawMessage `json:"card"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, err, http.StatusBadRequest)
		return
	}
	card, err := normalizeImportedCard(body.Card)
	if err != nil {
		writeError(w, err, http.StatusBadRequest)
		return
	}
	title := body.Title
	if title == "" {
		title = card.Data.Name
	}
	project := model.NewProject(title)
	project.Card = card
	if card.Data.CharacterBook != nil {
		project.Lorebook = *card.Data.CharacterBook
		project.Settings.EmbedLorebook = true
	}
	if err := s.store.SaveProject(project); err != nil {
		writeError(w, err, http.StatusInternalServerError)
		return
	}
	writeJSON(w, project)
}

func normalizeImportedCard(raw json.RawMessage) (model.Card, error) {
	var card model.Card
	if err := json.Unmarshal(raw, &card); err != nil {
		return model.Card{}, err
	}
	if strings.HasPrefix(card.Spec, "chara_card_v") && card.Data.Name != "" {
		return normalizeCardForProject(card), nil
	}

	var legacy legacyCard
	if err := json.Unmarshal(raw, &legacy); err != nil {
		return model.Card{}, err
	}
	if legacy.Name == "" {
		return model.Card{}, errors.New("unsupported character card JSON: expected chara_card_v2, chara_card_v3, or legacy SillyTavern fields")
	}
	card = model.Card{
		Spec:        "chara_card_v2",
		SpecVersion: "2.0",
		Data: model.CardData{
			Name:                    legacy.Name,
			Description:             legacy.Description,
			Personality:             legacy.Personality,
			Scenario:                legacy.Scenario,
			FirstMes:                legacy.FirstMes,
			MesExample:              legacy.MesExample,
			CreatorNotes:            firstNonEmpty(legacy.CreatorNotes, legacy.CreatorComment),
			SystemPrompt:            legacy.SystemPrompt,
			PostHistoryInstructions: legacy.PostHistoryInstructions,
			AlternateGreetings:      legacy.AlternateGreetings,
			Tags:                    legacy.Tags,
			Creator:                 legacy.Creator,
			CharacterVersion:        legacy.CharacterVersion,
			CharacterBook:           legacy.CharacterBook,
			Extensions:              legacy.Extensions,
		},
		Extensions: map[string]any{},
	}
	return normalizeCardForProject(card), nil
}

type legacyCard struct {
	Name                    string               `json:"name"`
	Description             string               `json:"description"`
	Personality             string               `json:"personality"`
	Scenario                string               `json:"scenario"`
	FirstMes                string               `json:"first_mes"`
	MesExample              string               `json:"mes_example"`
	CreatorNotes            string               `json:"creator_notes"`
	CreatorComment          string               `json:"creatorcomment"`
	SystemPrompt            string               `json:"system_prompt"`
	PostHistoryInstructions string               `json:"post_history_instructions"`
	AlternateGreetings      []string             `json:"alternate_greetings"`
	Tags                    []string             `json:"tags"`
	Creator                 string               `json:"creator"`
	CharacterVersion        string               `json:"character_version"`
	CharacterBook           *model.CharacterBook `json:"character_book"`
	Extensions              map[string]any       `json:"extensions"`
}

func normalizeCardForProject(card model.Card) model.Card {
	card.Spec = "chara_card_v2"
	card.SpecVersion = "2.0"
	if card.Extensions == nil {
		card.Extensions = map[string]any{}
	}
	if card.Data.AlternateGreetings == nil {
		card.Data.AlternateGreetings = []string{}
	}
	if card.Data.Tags == nil {
		card.Data.Tags = []string{}
	}
	if card.Data.Extensions == nil {
		card.Data.Extensions = map[string]any{}
	}
	if card.Data.CharacterBook != nil {
		normalizeCharacterBook(card.Data.CharacterBook)
	}
	return card
}

func normalizeCharacterBook(book *model.CharacterBook) {
	if book.Entries == nil {
		book.Entries = []model.LorebookEntry{}
	}
	if book.Extensions == nil {
		book.Extensions = map[string]any{}
	}
	for index := range book.Entries {
		entry := &book.Entries[index]
		if entry.Keys == nil {
			entry.Keys = []string{}
		}
		if entry.SecondaryKeys == nil {
			entry.SecondaryKeys = []string{}
		}
		if entry.Extensions == nil {
			entry.Extensions = map[string]any{}
		}
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func (s *Server) llm(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var body struct {
		ProjectID      string `json:"projectId"`
		ConversationID string `json:"conversationId"`
		Template       string `json:"template"`
		Locale         string `json:"locale"`
		Input          string `json:"input"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, err, http.StatusBadRequest)
		return
	}
	project, err := s.store.GetProject(body.ProjectID)
	if err != nil {
		writeError(w, err, http.StatusNotFound)
		return
	}
	settings, err := s.store.GetSettings()
	if err != nil {
		writeError(w, err, http.StatusInternalServerError)
		return
	}
	conversationID := body.ConversationID
	if conversationID == "" {
		conversationID = "default"
	}
	priorMessages := conversationMessages(project.LLMHistory, conversationID)
	prompt := llm.BuildPrompt(llm.TemplateRequest{
		Template:       body.Template,
		Locale:         body.Locale,
		Input:          body.Input,
		Project:        project,
		PriorMessages:  priorMessages,
		ConversationID: conversationID,
	})
	log.Printf("llm request project=%s conversation=%s template=%s model=%s prompt_chars=%d input_chars=%d", project.ID, conversationID, body.Template, settings.DeepSeekModel, len(prompt), len(body.Input))
	appendLLMLog("request", project.ID, conversationID, body.Template, settings.DeepSeekModel, body.Input, prompt, "")
	response, err := llm.DeepSeekClient{APIKey: settings.DeepSeekAPIKey, Model: settings.DeepSeekModel}.Complete(prompt)
	if err != nil {
		log.Printf("llm error project=%s conversation=%s template=%s error=%v", project.ID, conversationID, body.Template, err)
		appendLLMLog("error", project.ID, conversationID, body.Template, settings.DeepSeekModel, body.Input, prompt, err.Error())
		writeError(w, err, http.StatusBadGateway)
		return
	}
	log.Printf("llm response project=%s conversation=%s template=%s response_chars=%d", project.ID, conversationID, body.Template, len(response))
	appendLLMLog("response", project.ID, conversationID, body.Template, settings.DeepSeekModel, body.Input, prompt, response)
	message := model.LLMMessage{
		ID:             "msg_" + time.Now().UTC().Format("20060102150405.000000000"),
		ConversationID: conversationID,
		Template:       body.Template,
		Locale:         body.Locale,
		UserInput:      body.Input,
		Prompt:         prompt,
		Response:       response,
		CreatedAt:      time.Now().UTC(),
	}
	project.LLMHistory = append([]model.LLMMessage{message}, project.LLMHistory...)
	_ = s.store.SaveProject(project)
	writeJSON(w, message)
}

func appendLLMLog(kind string, projectID string, conversationID string, template string, modelName string, input string, prompt string, output string) {
	if err := os.MkdirAll("data", 0755); err != nil {
		log.Printf("llm log mkdir failed: %v", err)
		return
	}
	file, err := os.OpenFile(filepath.Join("data", "llm-interactions.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
	if err != nil {
		log.Printf("llm log open failed: %v", err)
		return
	}
	defer file.Close()

	_, err = fmt.Fprintf(
		file,
		"\n===== %s %s =====\nproject=%s conversation=%s template=%s model=%s\n--- user input ---\n%s\n--- prompt ---\n%s\n--- output ---\n%s\n",
		time.Now().Format(time.RFC3339),
		kind,
		projectID,
		conversationID,
		template,
		modelName,
		input,
		prompt,
		output,
	)
	if err != nil {
		log.Printf("llm log write failed: %v", err)
	}
}

func conversationMessages(history []model.LLMMessage, conversationID string) []model.LLMMessage {
	if conversationID == "" {
		conversationID = "default"
	}
	messages := []model.LLMMessage{}
	for i := len(history) - 1; i >= 0; i-- {
		message := history[i]
		id := message.ConversationID
		if id == "" {
			id = "default"
		}
		if id == conversationID {
			messages = append(messages, message)
		}
	}
	return messages
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}

func writeError(w http.ResponseWriter, err error, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}

func mask(value string) string {
	if value == "" {
		return ""
	}
	if len(value) <= 8 {
		return "****"
	}
	return value[:4] + "****" + value[len(value)-4:]
}
