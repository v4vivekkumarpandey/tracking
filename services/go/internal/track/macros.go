package track

import (
	"net/url"
	"strings"
)

// Expand replaces {name} placeholders in tmpl with URL-escaped values.
// Placeholders without a value are replaced with an empty string so that
// advertisers never receive a literal "{sub3}".
func Expand(tmpl string, vals map[string]string) string {
	if !strings.Contains(tmpl, "{") {
		return tmpl
	}
	var b strings.Builder
	b.Grow(len(tmpl) + 64)
	for {
		i := strings.IndexByte(tmpl, '{')
		if i < 0 {
			b.WriteString(tmpl)
			break
		}
		j := strings.IndexByte(tmpl[i:], '}')
		if j < 0 {
			b.WriteString(tmpl)
			break
		}
		name := tmpl[i+1 : i+j]
		b.WriteString(tmpl[:i])
		if isMacroName(name) {
			b.WriteString(url.QueryEscape(vals[name]))
		} else {
			b.WriteString(tmpl[i : i+j+1])
		}
		tmpl = tmpl[i+j+1:]
	}
	return b.String()
}

func isMacroName(s string) bool {
	if s == "" || len(s) > 32 {
		return false
	}
	for _, r := range s {
		if !(r == '_' || r >= 'a' && r <= 'z' || r >= '0' && r <= '9') {
			return false
		}
	}
	return true
}
