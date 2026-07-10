package llm

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestProviderResponseFormats(t *testing.T) {
	tests := []struct {
		provider string
		response string
	}{
		{"custom", `{"choices":[{"message":{"content":"openai compatible"}}]}`},
		{"anthropic", `{"content":[{"type":"text","text":"anthropic text"}]}`},
		{"gemini", `{"candidates":[{"content":{"parts":[{"text":"gemini text"}]}}]}`},
	}
	for _, test := range tests {
		t.Run(test.provider, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				fmt.Fprint(w, test.response)
			}))
			defer server.Close()
			text, err := (Client{Provider: test.provider, APIKey: "test", Model: "model", BaseURL: server.URL}).Complete("prompt")
			if err != nil {
				t.Fatal(err)
			}
			if text == "" {
				t.Fatal("expected response text")
			}
		})
	}
}
