package api

import (
	"database/sql"
	"errors"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"st-card-writer/internal/model"
	"st-card-writer/internal/store"
)

func TestDeleteProjectRemovesProject(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	project := model.NewProject("Done card")
	if err := db.SaveProject(project); err != nil {
		t.Fatal(err)
	}

	server := NewServer(db)
	req := httptest.NewRequest(http.MethodDelete, "/api/projects/"+project.ID, nil)
	res := httptest.NewRecorder()
	server.Routes().ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("unexpected status %d: %s", res.Code, res.Body.String())
	}

	_, err = db.GetProject(project.ID)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected deleted project to be gone, got %v", err)
	}
}
