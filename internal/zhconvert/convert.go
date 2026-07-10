package zhconvert

import (
	"errors"

	"github.com/liuzl/gocc"

	"st-card-writer/internal/model"
)

func ConvertProject(project *model.Project, mode string) error {
	if mode != "s2t" && mode != "t2s" {
		return errors.New("unsupported Chinese conversion mode")
	}
	converter, err := gocc.New(mode)
	if err != nil {
		return err
	}
	convert := func(value string) string {
		if value == "" {
			return value
		}
		next, err := converter.Convert(value)
		if err != nil {
			return value
		}
		return next
	}

	data := &project.Card.Data
	data.Name = convert(data.Name)
	data.Description = convert(data.Description)
	data.Personality = convert(data.Personality)
	data.Scenario = convert(data.Scenario)
	data.FirstMes = convert(data.FirstMes)
	data.MesExample = convert(data.MesExample)
	data.CreatorNotes = convert(data.CreatorNotes)
	data.SystemPrompt = convert(data.SystemPrompt)
	data.PostHistoryInstructions = convert(data.PostHistoryInstructions)
	data.Creator = convert(data.Creator)
	data.CharacterVersion = convert(data.CharacterVersion)
	data.AlternateGreetings = convertStrings(data.AlternateGreetings, convert)
	data.Tags = convertStrings(data.Tags, convert)
	if data.CharacterBook != nil {
		convertBook(data.CharacterBook, convert)
	}

	project.Title = convert(project.Title)
	convertBook(&project.Lorebook, convert)
	return nil
}

func convertBook(book *model.CharacterBook, convert func(string) string) {
	book.Name = convert(book.Name)
	book.Description = convert(book.Description)
	for index := range book.Entries {
		entry := &book.Entries[index]
		entry.Keys = convertStrings(entry.Keys, convert)
		entry.SecondaryKeys = convertStrings(entry.SecondaryKeys, convert)
		entry.Content = convert(entry.Content)
		entry.Comment = convert(entry.Comment)
	}
}

func convertStrings(values []string, convert func(string) string) []string {
	if values == nil {
		return nil
	}
	next := make([]string, len(values))
	for index, value := range values {
		next[index] = convert(value)
	}
	return next
}
