// Package conv records conversions reported by advertisers.
package conv

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"tracking/internal/clickid"
	"tracking/internal/events"
	"tracking/internal/track"
)

var (
	amountRe = regexp.MustCompile(`^\d{1,12}(\.\d{1,4})?$`)
	tokenRe  = regexp.MustCompile(`^[A-Za-z0-9_.:\-]{0,128}$`)

	// 1x1 transparent GIF for /px.
	pixelGIF = []byte("GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00,\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;")
)

type Handler struct {
	PG          *pgxpool.Pool
	Signer      *clickid.Signer
	Dedup       *Dedup
	Conversions *events.Batcher[events.Conversion]
	TrustProxy  bool
	Now         func() time.Time
}

type result struct {
	Status       string `json:"status"`
	ConversionID int64  `json:"conversion_id,omitempty"`
	Error        string `json:"error,omitempty"`
}

// ServePostback handles server-to-server postbacks from advertisers:
//
//	GET|POST /postback?click_id=..&secret=..&goal=..&amount=..&txn_id=..
func (h *Handler) ServePostback(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseForm(); err != nil {
		writeJSON(w, http.StatusBadRequest, result{Status: "rejected", Error: "bad request"})
		return
	}
	code, res := h.record(r.Context(), r.Form, "s2s", track.ClientIP(r, h.TrustProxy))
	writeJSON(w, code, res)
}

// ServePixel handles GET /px?click_id=..&goal=..&amount=..&txn_id=..
// It fires from the user's browser, so no secret is required (it would be
// public anyway); conversions from pixels are marked source=pixel so they can
// be reviewed before approval.
func (h *Handler) ServePixel(w http.ResponseWriter, r *http.Request) {
	h.record(r.Context(), r.URL.Query(), "pixel", track.ClientIP(r, h.TrustProxy))
	w.Header().Set("Content-Type", "image/gif")
	w.Header().Set("Cache-Control", "no-store")
	w.Write(pixelGIF)
}

type offerInfo struct {
	status          string
	attributionDays int
	secret          string
	goalKnown       bool
}

const offerQuery = `
SELECT o.status, o.attribution_days, adv.postback_secret, (g.id IS NOT NULL)
FROM offers o
JOIN advertisers adv ON adv.id = o.advertiser_id
LEFT JOIN offer_goals g ON g.offer_id = o.id AND g.code = $2
WHERE o.id = $1`

// insertQuery computes revenue and payout in SQL (numeric, never float):
// goal value > percentage of sale amount > offer default, and a per-publisher
// payout override beats everything.
const insertQuery = `
INSERT INTO conversions
  (click_id, click_time, offer_id, publisher_id, link_id, goal, txn_id,
   amount, revenue, payout, ip, source)
SELECT $1::text, $2::timestamptz, o.id, $3::bigint, $4::bigint, $5::text, $6::text, $7::text::numeric,
  round(COALESCE(g.revenue,
        CASE WHEN o.revenue_percent IS NOT NULL THEN $7::text::numeric * o.revenue_percent / 100
             ELSE o.default_revenue END), 2),
  round(COALESCE(a.payout_override, g.payout,
        CASE WHEN o.payout_percent IS NOT NULL THEN $7::text::numeric * o.payout_percent / 100
             ELSE o.default_payout END), 2),
  NULLIF($8::text, '')::inet, $9::text
FROM offers o
LEFT JOIN offer_goals g ON g.offer_id = o.id AND g.code = $5
LEFT JOIN publisher_offer_access a ON a.offer_id = o.id AND a.publisher_id = $3
WHERE o.id = $10
ON CONFLICT DO NOTHING
RETURNING id, revenue::float8, payout::float8`

func (h *Handler) record(ctx context.Context, q url.Values, source, ip string) (int, result) {
	rawID := strings.ToLower(q.Get("click_id"))
	goal := q.Get("goal")
	txnID := q.Get("txn_id")
	amount := q.Get("amount")
	if amount == "" {
		amount = "0"
	}

	reject := func(code int, msg string) (int, result) {
		h.log(rawID, source, ip, q, "rejected", msg)
		return code, result{Status: "rejected", Error: msg}
	}

	if !tokenRe.MatchString(goal) || !tokenRe.MatchString(txnID) {
		return reject(http.StatusBadRequest, "goal and txn_id must be max 128 chars of [A-Za-z0-9_.:-]")
	}
	if !amountRe.MatchString(amount) {
		return reject(http.StatusBadRequest, "invalid amount")
	}
	click, err := h.Signer.Parse(rawID)
	if err != nil {
		return reject(http.StatusBadRequest, "invalid click_id")
	}

	var o offerInfo
	err = h.PG.QueryRow(ctx, offerQuery, click.OfferID, goal).
		Scan(&o.status, &o.attributionDays, &o.secret, &o.goalKnown)
	if errors.Is(err, pgx.ErrNoRows) {
		return reject(http.StatusNotFound, "unknown offer")
	}
	if err != nil {
		slog.Error("offer lookup", "err", err)
		return http.StatusInternalServerError, result{Status: "error"}
	}

	if source == "s2s" && subtle.ConstantTimeCompare([]byte(q.Get("secret")), []byte(o.secret)) != 1 {
		return reject(http.StatusForbidden, "bad secret")
	}
	if o.status != "active" {
		return reject(http.StatusConflict, "offer not active")
	}
	if goal != "" && !o.goalKnown {
		return reject(http.StatusBadRequest, "unknown goal")
	}
	window := time.Duration(o.attributionDays) * 24 * time.Hour
	now := h.now()
	if now.Sub(click.Time()) > window {
		return reject(http.StatusConflict, "click outside attribution window")
	}

	keys := Keys(strconv.FormatInt(click.OfferID, 10), rawID, goal, txnID)
	ok, err := h.Dedup.Claim(ctx, keys, window+7*24*time.Hour)
	if err != nil {
		// Redis down: carry on, Postgres unique indexes still catch dupes.
		slog.Warn("dedup unavailable", "err", err)
	} else if !ok {
		h.log(rawID, source, ip, q, "duplicate", "")
		return http.StatusOK, result{Status: "duplicate"}
	}

	id, rev, pay, err := h.insert(ctx, click, rawID, goal, txnID, amount, ip, source)
	if err != nil {
		h.Dedup.Release(ctx, keys)
		slog.Error("insert conversion", "err", err)
		return http.StatusInternalServerError, result{Status: "error"}
	}
	if id == 0 {
		h.log(rawID, source, ip, q, "duplicate", "")
		return http.StatusOK, result{Status: "duplicate"}
	}

	amt, _ := strconv.ParseFloat(amount, 64)
	h.Conversions.Add(events.Conversion{
		TS: now, ConversionID: uint64(id), ClickID: rawID,
		OfferID: uint64(click.OfferID), PublisherID: uint64(click.PublisherID),
		Goal: goal, TxnID: txnID, Amount: amt, Revenue: rev, Payout: pay, Source: source,
	})
	h.log(rawID, source, ip, q, "ok", "")
	return http.StatusOK, result{Status: "ok", ConversionID: id}
}

// insert writes the conversion and its outbox job in one transaction, so a
// publisher postback is queued if and only if the conversion exists.
// It returns id 0 when Postgres reports a duplicate.
func (h *Handler) insert(ctx context.Context, c clickid.Click, rawID, goal, txnID, amount, ip, source string) (int64, float64, float64, error) {
	tx, err := h.PG.Begin(ctx)
	if err != nil {
		return 0, 0, 0, err
	}
	defer tx.Rollback(ctx)

	var id int64
	var rev, pay float64
	err = tx.QueryRow(ctx, insertQuery,
		rawID, c.Time(), c.PublisherID, c.LinkID, goal, txnID, amount, ip, source, c.OfferID,
	).Scan(&id, &rev, &pay)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, 0, 0, nil
	}
	if err != nil {
		return 0, 0, 0, err
	}
	if _, err := tx.Exec(ctx,
		`INSERT INTO outbox (kind, ref_id) VALUES ('conversion', $1)`, id); err != nil {
		return 0, 0, 0, err
	}
	return id, rev, pay, tx.Commit(ctx)
}

// log keeps a record of every postback received, which is the first thing
// you need when an advertiser says "we sent 120 and you show 117".
func (h *Handler) log(clickID, source, ip string, q url.Values, status, msg string) {
	params := map[string]string{}
	for k := range q {
		if k != "secret" {
			params[k] = q.Get(k)
		}
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, err := h.PG.Exec(ctx,
			`INSERT INTO postback_log (click_id, source, ip, params, status, message)
			 VALUES ($1, $2, NULLIF($3, '')::inet, $4, $5, $6)`,
			clickID, source, ip, params, status, msg)
		if err != nil {
			slog.Warn("postback_log insert", "err", err)
		}
	}()
}

func (h *Handler) now() time.Time {
	if h.Now != nil {
		return h.Now()
	}
	return time.Now().UTC()
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(v)
}
