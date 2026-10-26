// Package track handles click redirects.
package track

import (
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"

	"tracking/internal/clickid"
	"tracking/internal/events"
)

var botUA = regexp.MustCompile(`(?i)bot|crawl|spider|slurp|curl|wget|python|go-http|java/|headless|phantom|scrapy|httpclient`)

type Handler struct {
	Links          *Links
	Signer         *clickid.Signer
	Clicks         *events.Batcher[events.Click]
	Redis          *redis.Client
	FallbackURL    string
	TrustProxy     bool
	DupClickWindow time.Duration
}

// ServeClick handles GET /c/{code}?sub1=..&sub5=
func (h *Handler) ServeClick(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	link, err := h.Links.Get(ctx, r.PathValue("code"))
	if err != nil {
		slog.Error("link lookup", "err", err)
		h.fallback(w, r)
		return
	}
	if link == nil || !link.Active {
		h.fallback(w, r)
		return
	}

	now := time.Now().UTC()
	id, _ := h.Signer.New(link.OfferID, link.PublisherID, link.ID, now)

	q := r.URL.Query()
	ip := ClientIP(r, h.TrustProxy)
	ua := r.UserAgent()

	ev := events.Click{
		TS:          now,
		ClickID:     id,
		OfferID:     uint64(link.OfferID),
		PublisherID: uint64(link.PublisherID),
		LinkID:      uint64(link.ID),
		IP:          ip,
		UA:          trunc(ua, 512),
		Referer:     trunc(r.Referer(), 512),
		Country:     r.Header.Get("CF-IPCountry"),
	}
	vals := map[string]string{
		"click_id":     id,
		"offer_id":     strconv.FormatInt(link.OfferID, 10),
		"pub_id":       strconv.FormatInt(link.PublisherID, 10),
		"publisher_id": strconv.FormatInt(link.PublisherID, 10),
	}
	for i := range ev.Sub {
		k := "sub" + strconv.Itoa(i+1)
		ev.Sub[i] = trunc(q.Get(k), 255)
		vals[k] = ev.Sub[i]
	}

	if ua == "" || botUA.MatchString(ua) {
		ev.IsBot = 1
	}
	// Same IP clicking the same offer again within the window: still
	// redirected, but flagged so it doesn't count as a unique, clean click.
	if h.DupClickWindow > 0 {
		key := "dc:" + vals["offer_id"] + ":" + ip
		if ok, err := h.Redis.SetNX(ctx, key, 1, h.DupClickWindow).Result(); err == nil && !ok {
			ev.IsDuplicate = 1
		}
	}

	h.Clicks.Add(ev)

	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Referrer-Policy", "no-referrer-when-downgrade")
	http.Redirect(w, r, Expand(link.Destination, vals), http.StatusFound)
}

func (h *Handler) fallback(w http.ResponseWriter, r *http.Request) {
	if h.FallbackURL == "" {
		http.NotFound(w, r)
		return
	}
	http.Redirect(w, r, h.FallbackURL, http.StatusFound)
}

// ClientIP returns the visitor's IP. Only trust forwarding headers when the
// service sits behind your own proxy / Cloudflare, or anyone can spoof them.
func ClientIP(r *http.Request, trustProxy bool) string {
	if trustProxy {
		if ip := r.Header.Get("CF-Connecting-IP"); ip != "" {
			return ip
		}
		if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
			first, _, _ := strings.Cut(xff, ",")
			return strings.TrimSpace(first)
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func trunc(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
