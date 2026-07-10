package llm

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const systemInstruction = "You help create, edit, translate, and review SillyTavern character cards. Be precise and preserve structured fields."

type Client struct {
	Provider string
	APIKey   string
	Model    string
	BaseURL  string
}

func (c Client) Complete(prompt string) (string, error) {
	if strings.TrimSpace(c.APIKey) == "" && c.Provider != "custom" {
		return "", fmt.Errorf("missing API key for %s", c.providerName())
	}
	switch c.Provider {
	case "anthropic":
		return c.completeAnthropic(prompt)
	case "gemini":
		return c.completeGemini(prompt)
	default:
		return c.completeOpenAICompatible(prompt)
	}
}

func (c Client) providerName() string {
	if c.Provider == "" {
		return "deepseek"
	}
	return c.Provider
}

func (c Client) completeOpenAICompatible(prompt string) (string, error) {
	endpoint := c.BaseURL
	if endpoint == "" {
		switch c.Provider {
		case "openai":
			endpoint = "https://api.openai.com/v1/chat/completions"
		case "openrouter":
			endpoint = "https://openrouter.ai/api/v1/chat/completions"
		default:
			endpoint = "https://api.deepseek.com/chat/completions"
		}
	}
	body := map[string]any{
		"model": c.Model,
		"messages": []map[string]string{
			{"role": "system", "content": systemInstruction},
			{"role": "user", "content": prompt},
		},
		"temperature": 0.6,
	}
	var decoded struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := c.postJSON(endpoint, body, func(req *http.Request) {
		if c.APIKey != "" {
			req.Header.Set("Authorization", "Bearer "+c.APIKey)
		}
		if c.Provider == "openrouter" {
			req.Header.Set("X-OpenRouter-Title", "SillyTavern Card Writer")
		}
	}, &decoded, len(prompt)); err != nil {
		return "", err
	}
	if len(decoded.Choices) == 0 || strings.TrimSpace(decoded.Choices[0].Message.Content) == "" {
		return "", errors.New(c.providerName() + " returned no text choices")
	}
	return decoded.Choices[0].Message.Content, nil
}

func (c Client) completeAnthropic(prompt string) (string, error) {
	endpoint := c.BaseURL
	if endpoint == "" {
		endpoint = "https://api.anthropic.com/v1/messages"
	}
	body := map[string]any{
		"model": c.Model, "max_tokens": 8192, "temperature": 0.6,
		"system":   systemInstruction,
		"messages": []map[string]string{{"role": "user", "content": prompt}},
	}
	var decoded struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := c.postJSON(endpoint, body, func(req *http.Request) {
		req.Header.Set("x-api-key", c.APIKey)
		req.Header.Set("anthropic-version", "2023-06-01")
	}, &decoded, len(prompt)); err != nil {
		return "", err
	}
	var parts []string
	for _, part := range decoded.Content {
		if part.Type == "text" && part.Text != "" {
			parts = append(parts, part.Text)
		}
	}
	if len(parts) == 0 {
		return "", errors.New("anthropic returned no text content")
	}
	return strings.Join(parts, "\n"), nil
}

func (c Client) completeGemini(prompt string) (string, error) {
	endpoint := c.BaseURL
	if endpoint == "" {
		endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + url.PathEscape(c.Model) + ":generateContent"
	}
	body := map[string]any{
		"systemInstruction": map[string]any{"parts": []map[string]string{{"text": systemInstruction}}},
		"contents":          []map[string]any{{"role": "user", "parts": []map[string]string{{"text": prompt}}}},
		"generationConfig":  map[string]any{"temperature": 0.6},
	}
	var decoded struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
	}
	if err := c.postJSON(endpoint, body, func(req *http.Request) {
		req.Header.Set("x-goog-api-key", c.APIKey)
	}, &decoded, len(prompt)); err != nil {
		return "", err
	}
	var parts []string
	for _, candidate := range decoded.Candidates {
		for _, part := range candidate.Content.Parts {
			if part.Text != "" {
				parts = append(parts, part.Text)
			}
		}
	}
	if len(parts) == 0 {
		return "", errors.New("gemini returned no text candidates")
	}
	return strings.Join(parts, "\n"), nil
}

func (c Client) postJSON(endpoint string, body any, headers func(*http.Request), output any, promptLength int) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	headers(req)
	res, err := (&http.Client{Timeout: 120 * time.Second}).Do(req)
	if err != nil {
		return fmt.Errorf("%s request failed: %w", c.providerName(), err)
	}
	defer res.Body.Close()
	payload, err := io.ReadAll(res.Body)
	if err != nil {
		return err
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("%s request failed (%d): %s", c.providerName(), res.StatusCode, string(payload))
	}
	if len(bytes.TrimSpace(payload)) == 0 {
		return fmt.Errorf("%s returned an empty response (prompt chars: %d)", c.providerName(), promptLength)
	}
	if err := json.Unmarshal(payload, output); err != nil {
		return fmt.Errorf("%s returned invalid JSON: %w; response prefix: %q", c.providerName(), err, string(payload[:prefixLen(len(payload), 500)]))
	}
	return nil
}
