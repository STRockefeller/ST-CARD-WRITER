package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"st-card-writer/internal/api"
	"st-card-writer/internal/store"
)

func main() {
	dataDir := filepath.Join(".", "data")
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatal(err)
	}

	db, err := store.Open(filepath.Join(dataDir, "app.sqlite"))
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	server := api.NewServer(db)
	addr := "127.0.0.1:8787"
	log.Printf("SillyTavern Card Writer API listening on http://%s", addr)
	log.Fatal(http.ListenAndServe(addr, server.Routes()))
}
