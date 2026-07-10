package llm

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

type DeepSeekClient struct {
	APIKey string
	Model  string
}

func (c DeepSeekClient) Complete(prompt string) (string, error) {
	if c.APIKey == "" {
		return "", errors.New("missing DeepSeek API key")
	}
	model := c.Model
	if model == "" {
		model = "deepseek-v4-flash"
	}

	body := map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": "You help create, edit, translate, and review SillyTavern V2 character cards. Be precise and preserve structured fields."},
			{"role": "user", "content": prompt},
		},
		"temperature": 0.6,
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequest("POST", "https://api.deepseek.com/chat/completions", bytes.NewReader(raw))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("Content-Type", "application/json")

	httpClient := &http.Client{Timeout: 90 * time.Second}
	res, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	payload, _ := io.ReadAll(res.Body)
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return "", fmt.Errorf("deepseek request failed: %s", string(payload))
	}

	var decoded struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return "", err
	}
	if len(decoded.Choices) == 0 {
		return "", errors.New("deepseek returned no choices")
	}
	return decoded.Choices[0].Message.Content, nil
}
