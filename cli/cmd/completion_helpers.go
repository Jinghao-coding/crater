package cmd

import (
	"strings"

	"github.com/raids-lab/crater/cli/internal/completion"
)

func staticValueCompleter(values []string, descriptions map[string]string) func(completion.Context) ([]completion.Candidate, error) {
	return func(ctx completion.Context) ([]completion.Candidate, error) {
		prefix := strings.ToLower(completion.CurrentWordPrefix(ctx))
		out := make([]completion.Candidate, 0, len(values))
		for _, value := range values {
			if prefix != "" && !strings.HasPrefix(strings.ToLower(value), prefix) {
				continue
			}
			out = append(out, completion.Candidate{Value: value, Description: descriptions[value]})
		}
		return out, nil
	}
}
