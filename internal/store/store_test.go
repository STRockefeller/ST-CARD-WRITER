package store

import (
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	"st-card-writer/internal/model"
)

func TestDeleteProjectAfterListDoesNotLock(t *testing.T) {
	dir := t.TempDir()
	db, err := Open(filepath.Join(dir, "test.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	project := model.NewProject("Disposable")
	if err := db.SaveProject(project); err != nil {
		t.Fatal(err)
	}
	if _, err := db.ListProjects(); err != nil {
		t.Fatal(err)
	}
	if err := db.DeleteProject(project.ID); err != nil {
		t.Fatal(err)
	}
	_, err = db.GetProject(project.ID)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Fatalf("expected deleted project to be gone, got %v", err)
	}
}
