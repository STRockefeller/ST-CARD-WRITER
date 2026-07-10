package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"st-card-writer/internal/model"
	"st-card-writer/internal/store"
)

func TestExportEmbedsCharacterBookAndPreservesExtensions(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	project := model.NewProject("Ada")
	project.Card.Data.Extensions = map[string]any{"vendor": "kept"}
	project.Lorebook.Entries = []model.LorebookEntry{{ID: 1, Keys: []string{"Ada"}, Content: "Ada lore.", Enabled: true}}
	if err := db.SaveProject(project); err != nil {
		t.Fatal(err)
	}

	server := NewServer(db)
	req := httptest.NewRequest(http.MethodPost, "/api/projects/"+project.ID+"/export", nil)
	res := httptest.NewRecorder()
	server.Routes().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", res.Code, res.Body.String())
	}

	var card model.Card
	if err := json.Unmarshal(res.Body.Bytes(), &card); err != nil {
		t.Fatal(err)
	}
	if card.Data.CharacterBook == nil || len(card.Data.CharacterBook.Entries) != 1 {
		t.Fatal("expected embedded character_book entry")
	}
	if card.Data.Extensions["vendor"] != "kept" {
		t.Fatalf("expected extension preservation, got %#v", card.Data.Extensions)
	}
}

func TestExportOmitsEmptyCharacterBook(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	project := model.NewProject("Empty lore")
	project.Card.Data.CharacterBook = &model.CharacterBook{Name: "stale embedded book"}
	if err := db.SaveProject(project); err != nil {
		t.Fatal(err)
	}

	server := NewServer(db)
	req := httptest.NewRequest(http.MethodPost, "/api/projects/"+project.ID+"/export", nil)
	res := httptest.NewRecorder()
	server.Routes().ServeHTTP(res, req)

	var card model.Card
	if err := json.Unmarshal(res.Body.Bytes(), &card); err != nil {
		t.Fatal(err)
	}
	if card.Data.CharacterBook != nil {
		t.Fatal("expected empty character_book to be omitted")
	}
}
