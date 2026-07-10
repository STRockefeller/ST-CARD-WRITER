package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"st-card-writer/internal/model"
	"st-card-writer/internal/store"
)

func TestLLMUsesRequestDraftWithoutOverwritingStoredCard(t *testing.T) {
	var providerRequest string
	provider := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		providerRequest = string(raw)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
	}))
	defer provider.Close()

	db, err := store.Open(filepath.Join(t.TempDir(), "test.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := db.SaveSettings(model.AppSettings{
		LLMProvider:  "custom",
		LLMModel:     "test-model",
		LLMBaseURL:   provider.URL,
		UILocale:     "zh-TW",
		PromptLocale: "zh-TW",
	}); err != nil {
		t.Fatal(err)
	}

	stored := model.NewProject("Draft test")
	stored.Card.Data.Description = "OLD_DATABASE_DESCRIPTION"
	if err := db.SaveProject(stored); err != nil {
		t.Fatal(err)
	}
	draft := stored
	draft.Card.Data.Description = "CURRENT_UNSAVED_DESCRIPTION"
	body, _ := json.Marshal(map[string]any{
		"projectId":      stored.ID,
		"project":        draft,
		"conversationId": "default",
		"template":       "brainstorm",
		"locale":         "zh-TW",
		"input":          "continue",
	})

	req := httptest.NewRequest(http.MethodPost, "/api/llm", bytes.NewReader(body))
	res := httptest.NewRecorder()
	NewServer(db).Routes().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", res.Code, res.Body.String())
	}
	if !strings.Contains(providerRequest, "CURRENT_UNSAVED_DESCRIPTION") {
		t.Fatal("provider prompt did not contain the current request draft")
	}
	if strings.Contains(providerRequest, "OLD_DATABASE_DESCRIPTION") {
		t.Fatal("provider prompt unexpectedly used the stale stored description")
	}

	after, err := db.GetProject(stored.ID)
	if err != nil {
		t.Fatal(err)
	}
	if after.Card.Data.Description != "OLD_DATABASE_DESCRIPTION" {
		t.Fatalf("LLM history save overwrote stored card: %q", after.Card.Data.Description)
	}
	if len(after.LLMHistory) != 1 || after.LLMHistory[0].Response != "ok" {
		t.Fatalf("expected one stored LLM message, got %#v", after.LLMHistory)
	}
}
