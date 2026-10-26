package track

import "testing"

func TestExpand(t *testing.T) {
	vals := map[string]string{"click_id": "abc123", "sub1": "a b&c", "pub_id": "7"}
	cases := []struct{ in, want string }{
		{"https://x.com/", "https://x.com/"},
		{"https://x.com/?c={click_id}&p={pub_id}", "https://x.com/?c=abc123&p=7"},
		{"https://x.com/?s={sub1}", "https://x.com/?s=a+b%26c"},
		{"https://x.com/?s={sub2}", "https://x.com/?s="},
		{"https://x.com/?j={\"a\":1}", "https://x.com/?j={\"a\":1}"},
		{"https://x.com/?broken={click_id", "https://x.com/?broken={click_id"},
		{"{click_id}{click_id}", "abc123abc123"},
	}
	for _, c := range cases {
		if got := Expand(c.in, vals); got != c.want {
			t.Errorf("Expand(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}
