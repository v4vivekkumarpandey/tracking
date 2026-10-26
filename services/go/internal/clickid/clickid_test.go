package clickid

import (
	"strings"
	"testing"
	"time"
)

func TestRoundTrip(t *testing.T) {
	s := NewSigner([]byte("test-secret-0123456789"))
	now := time.Date(2026, 10, 25, 10, 30, 0, 123_000_000, time.UTC)

	id, want := s.New(42, 7, 99_999, now)
	if id != strings.ToLower(id) {
		t.Fatalf("id should be lowercase: %s", id)
	}

	got, err := s.Parse(id)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got != want {
		t.Fatalf("got %+v want %+v", got, want)
	}
	if !got.Time().Equal(now) {
		t.Fatalf("time: got %v want %v", got.Time(), now)
	}
	if _, err := s.Parse(strings.ToUpper(id)); err != nil {
		t.Fatalf("uppercase should parse: %v", err)
	}
}

func TestRejectsTampering(t *testing.T) {
	s := NewSigner([]byte("test-secret-0123456789"))
	id, _ := s.New(1, 2, 3, time.Now())

	// Flip one character in the payload.
	b := []byte(id)
	if b[20] == 'a' {
		b[20] = 'b'
	} else {
		b[20] = 'a'
	}
	if _, err := s.Parse(string(b)); err == nil {
		t.Fatal("tampered id accepted")
	}

	other := NewSigner([]byte("another-secret-0123456"))
	if _, err := other.Parse(id); err != ErrSignature {
		t.Fatalf("want ErrSignature, got %v", err)
	}

	for _, bad := range []string{"", "abc", "!!!!", id[:10]} {
		if _, err := s.Parse(bad); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
}
