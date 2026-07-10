package model

import "testing"

func TestCountBudgetSeparatesPermanentDynamicAndLorebook(t *testing.T) {
	project := NewProject("Ada")
	project.Card.Data.Description = "A precise engineer."
	project.Card.Data.Personality = "Curious and direct."
	project.Card.Data.Scenario = "A workshop."
	project.Card.Data.FirstMes = "Hello."
	project.Lorebook.Entries = []LorebookEntry{
		{Keys: []string{"workshop"}, Content: "The workshop is under the old station.", Enabled: true},
		{Keys: []string{"hidden"}, Content: "Disabled entries should not count.", Enabled: false},
	}

	budget := CountBudget(project)
	if budget.Permanent <= 0 {
		t.Fatalf("expected permanent tokens, got %d", budget.Permanent)
	}
	if budget.Dynamic <= 0 {
		t.Fatalf("expected dynamic tokens, got %d", budget.Dynamic)
	}
	if budget.Lorebook <= 0 {
		t.Fatalf("expected lorebook tokens, got %d", budget.Lorebook)
	}
}

func TestCountBudgetFlagsOverBudget(t *testing.T) {
	project := NewProject("Ada")
	project.Settings.PermanentBudget = 1
	project.Card.Data.Description = "This description is intentionally long enough to exceed a one token budget."

	budget := CountBudget(project)
	if !budget.PermanentOver {
		t.Fatal("expected permanent budget overage")
	}
}
