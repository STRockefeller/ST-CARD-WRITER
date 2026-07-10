package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"st-card-writer/internal/model"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	store := &Store{db: db}
	if err := store.migrate(); err != nil {
		db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) migrate() error {
	_, err := s.db.Exec(`
CREATE TABLE IF NOT EXISTS projects (
	id TEXT PRIMARY KEY,
	title TEXT NOT NULL,
	payload TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	payload TEXT NOT NULL
);
`)
	return err
}

func (s *Store) ListProjects() ([]model.Project, error) {
	rows, err := s.db.Query(`SELECT payload FROM projects ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	projects := []model.Project{}
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		var project model.Project
		if err := json.Unmarshal([]byte(raw), &project); err != nil {
			return nil, err
		}
		projects = append(projects, project)
	}
	return projects, rows.Err()
}

func (s *Store) GetProject(id string) (model.Project, error) {
	var raw string
	err := s.db.QueryRow(`SELECT payload FROM projects WHERE id = ?`, id).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return model.Project{}, err
	}
	if err != nil {
		return model.Project{}, err
	}
	var project model.Project
	return project, json.Unmarshal([]byte(raw), &project)
}

func (s *Store) SaveProject(project model.Project) error {
	project.UpdatedAt = time.Now().UTC()
	if project.CreatedAt.IsZero() {
		project.CreatedAt = project.UpdatedAt
	}
	raw, err := json.Marshal(project)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`
INSERT INTO projects (id, title, payload, created_at, updated_at)
VALUES (?, ?, ?, ?, ?)
ON CONFLICT(id) DO UPDATE SET title = excluded.title, payload = excluded.payload, updated_at = excluded.updated_at
`, project.ID, project.Title, string(raw), project.CreatedAt.Format(time.RFC3339), project.UpdatedAt.Format(time.RFC3339))
	return err
}

func (s *Store) GetSettings() (model.AppSettings, error) {
	settings := model.AppSettings{
		DeepSeekModel: "deepseek-v4-flash",
		UILocale:      "zh-TW",
		PromptLocale:  "zh-TW",
	}
	var raw string
	err := s.db.QueryRow(`SELECT payload FROM settings WHERE id = 1`).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return settings, nil
	}
	if err != nil {
		return settings, err
	}
	if err := json.Unmarshal([]byte(raw), &settings); err != nil {
		return settings, err
	}
	if settings.DeepSeekModel == "" {
		settings.DeepSeekModel = "deepseek-v4-flash"
	}
	if settings.UILocale == "" {
		settings.UILocale = "zh-TW"
	}
	if settings.PromptLocale == "" {
		settings.PromptLocale = "zh-TW"
	}
	return settings, nil
}

func (s *Store) SaveSettings(settings model.AppSettings) error {
	if settings.DeepSeekModel == "" {
		settings.DeepSeekModel = "deepseek-v4-flash"
	}
	if settings.UILocale == "" {
		settings.UILocale = "zh-TW"
	}
	if settings.PromptLocale == "" {
		settings.PromptLocale = "zh-TW"
	}
	raw, err := json.Marshal(settings)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(`
INSERT INTO settings (id, payload) VALUES (1, ?)
ON CONFLICT(id) DO UPDATE SET payload = excluded.payload
`, string(raw))
	return err
}
