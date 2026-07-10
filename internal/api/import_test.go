package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"st-card-writer/internal/model"
	"st-card-writer/internal/store"
)

func TestImportAcceptsCharacterCardV3(t *testing.T) {
	db := openTestStore(t)
	defer db.Close()

	payload := map[string]any{
		"title": "V3 card",
		"card": map[string]any{
			"spec":         "chara_card_v3",
			"spec_version": "3.0",
			"data": map[string]any{
				"name":                "V3 Hero",
				"description":         "Imported from V3.",
				"alternate_greetings": []string{"Hello."},
				"tags":                []string{"test"},
				"character_book": map[string]any{
					"name":    "Book",
					"entries": []map[string]any{{"id": 1, "keys": []string{"hero"}, "content": "Lore.", "enabled": true}},
				},
				"extensions": map[string]any{"vendor": "kept"},
			},
		},
	}

	res := postImport(t, db, payload)
	if res.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", res.Code, res.Body.String())
	}
	var project model.Project
	if err := json.Unmarshal(res.Body.Bytes(), &project); err != nil {
		t.Fatal(err)
	}
	if project.Card.Spec != "chara_card_v2" || project.Card.SpecVersion != "2.0" {
		t.Fatalf("expected imported card to normalize to v2, got %s %s", project.Card.Spec, project.Card.SpecVersion)
	}
	if project.Card.Data.Name != "V3 Hero" {
		t.Fatalf("unexpected name %q", project.Card.Data.Name)
	}
	if project.Card.Data.Extensions["vendor"] != "kept" {
		t.Fatalf("expected data extensions preservation, got %#v", project.Card.Data.Extensions)
	}
	if len(project.Lorebook.Entries) != 1 {
		t.Fatalf("expected embedded character book import, got %#v", project.Lorebook.Entries)
	}
}

func TestImportAcceptsLegacyCardFields(t *testing.T) {
	db := openTestStore(t)
	defer db.Close()

	payload := map[string]any{
		"title": "Legacy card",
		"card": map[string]any{
			"name":                "Legacy Hero",
			"description":         "Top-level description.",
			"first_mes":           "Hello from legacy.",
			"creatorcomment":      "Old notes.",
			"alternate_greetings": []string{"Alt."},
		},
	}

	res := postImport(t, db, payload)
	if res.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", res.Code, res.Body.String())
	}
	var project model.Project
	if err := json.Unmarshal(res.Body.Bytes(), &project); err != nil {
		t.Fatal(err)
	}
	if project.Card.Data.Name != "Legacy Hero" {
		t.Fatalf("unexpected name %q", project.Card.Data.Name)
	}
	if project.Card.Data.CreatorNotes != "Old notes." {
		t.Fatalf("expected creatorcomment to map to creator_notes, got %q", project.Card.Data.CreatorNotes)
	}
	if len(project.Card.Data.AlternateGreetings) != 1 {
		t.Fatalf("expected alternate greetings, got %#v", project.Card.Data.AlternateGreetings)
	}
}

func openTestStore(t *testing.T) *store.Store {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	return db
}

func postImport(t *testing.T, db *store.Store, payload any) *httptest.ResponseRecorder {
	t.Helper()
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	server := NewServer(db)
	req := httptest.NewRequest(http.MethodPost, "/api/import", bytes.NewReader(raw))
	res := httptest.NewRecorder()
	server.Routes().ServeHTTP(res, req)
	return res
}
