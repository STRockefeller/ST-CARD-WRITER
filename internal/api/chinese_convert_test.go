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

func TestChineseConvertProjectSimplifiedToTraditional(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	project := model.NewProject("女仆之家")
	project.Card.Data.Description = "简体中文变量"
	project.Card.Data.Extensions = map[string]any{"vendor_note": "简体不转换"}
	project.Lorebook.Entries = []model.LorebookEntry{{
		ID:      1,
		Keys:    []string{"变量"},
		Content: "这是简体内容。",
		Enabled: true,
	}}
	if err := db.SaveProject(project); err != nil {
		t.Fatal(err)
	}

	body := bytes.NewBufferString(`{"mode":"s2t"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/projects/"+project.ID+"/chinese-convert", body)
	res := httptest.NewRecorder()
	NewServer(db).Routes().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", res.Code, res.Body.String())
	}

	var converted model.Project
	if err := json.Unmarshal(res.Body.Bytes(), &converted); err != nil {
		t.Fatal(err)
	}
	if converted.Card.Data.Description != "簡體中文變量" {
		t.Fatalf("unexpected converted description %q", converted.Card.Data.Description)
	}
	if converted.Lorebook.Entries[0].Content != "這是簡體內容。" {
		t.Fatalf("unexpected converted lore content %q", converted.Lorebook.Entries[0].Content)
	}
	if converted.Card.Data.Extensions["vendor_note"] != "简体不转换" {
		t.Fatalf("expected extensions to stay untouched, got %#v", converted.Card.Data.Extensions)
	}
	if len(converted.Snapshots) != 1 {
		t.Fatalf("expected snapshot before conversion, got %d", len(converted.Snapshots))
	}
}
