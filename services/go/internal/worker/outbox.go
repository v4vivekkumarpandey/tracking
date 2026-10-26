// Package worker runs background jobs: publisher postbacks and re-sending
// events that ClickHouse refused.
package worker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/jackc/pgx/v5/pgxpool"

	"tracking/internal/track"
)

const maxAttempts = 8

// errRetrySoon asks for a quick retry instead of the usual backoff.
var errRetrySoon = errors.New("retry soon")

type Outbox struct {
	PG     *pgxpool.Pool
	CH     driver.Conn
	Client *http.Client
}

type job struct {
	id       int64
	kind     string
	refID    int64
	payload  []byte
	attempts int
}

// Run polls the outbox until ctx is cancelled.
func (o *Outbox) Run(ctx context.Context) {
	for {
		n, err := o.tick(ctx)
		if err != nil && ctx.Err() == nil {
			slog.Error("outbox tick", "err", err)
		}
		if n > 0 {
			continue
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Second):
		}
	}
}

// tick leases up to 50 due jobs. The lease (next_attempt_at pushed forward)
// means several workers can run side by side without double-sending.
func (o *Outbox) tick(ctx context.Context) (int, error) {
	rows, err := o.PG.Query(ctx, `
UPDATE outbox SET attempts = attempts + 1, next_attempt_at = now() + interval '2 minutes'
WHERE id IN (
  SELECT id FROM outbox
  WHERE status = 'pending' AND next_attempt_at <= now()
  ORDER BY id LIMIT 50
  FOR UPDATE SKIP LOCKED)
RETURNING id, kind, ref_id, payload, attempts`)
	if err != nil {
		return 0, err
	}
	var jobs []job
	for rows.Next() {
		var j job
		if err := rows.Scan(&j.id, &j.kind, &j.refID, &j.payload, &j.attempts); err != nil {
			rows.Close()
			return 0, err
		}
		jobs = append(jobs, j)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	for _, j := range jobs {
		var err error
		switch j.kind {
		case "conversion":
			err = o.fanOut(ctx, j)
		case "http_get":
			err = o.httpGet(ctx, j)
		default:
			err = fmt.Errorf("unknown job kind %q", j.kind)
		}
		o.finish(ctx, j, err)
	}
	return len(jobs), nil
}

func (o *Outbox) finish(ctx context.Context, j job, jobErr error) {
	var err error
	switch {
	case jobErr == nil:
		_, err = o.PG.Exec(ctx, `UPDATE outbox SET status = 'done', last_error = NULL WHERE id = $1`, j.id)
	case j.attempts >= maxAttempts:
		_, err = o.PG.Exec(ctx, `UPDATE outbox SET status = 'failed', last_error = $2 WHERE id = $1`, j.id, jobErr.Error())
	default:
		delay := time.Duration(1<<j.attempts) * 30 * time.Second // 1m, 2m, 4m ... ~1h
		if errors.Is(jobErr, errRetrySoon) {
			delay = 5 * time.Second
		}
		_, err = o.PG.Exec(ctx,
			`UPDATE outbox SET last_error = $2, next_attempt_at = now() + $3 * interval '1 second' WHERE id = $1`,
			j.id, jobErr.Error(), delay.Seconds())
	}
	if err != nil {
		slog.Error("outbox finish", "id", j.id, "err", err)
	}
}

type conversion struct {
	id             int64
	clickID        string
	clickTime      time.Time
	offerID, pubID int64
	goal, txnID    string
	amount, payout string
	status         string
	subs           [5]string
	enriched       bool
}

// fanOut fills the conversion's sub IDs from the click in ClickHouse, then
// queues one http_get job per matching publisher postback URL so each URL
// retries on its own.
func (o *Outbox) fanOut(ctx context.Context, j job) error {
	var c conversion
	err := o.PG.QueryRow(ctx, `
SELECT id, click_id, click_time, offer_id, publisher_id, goal, txn_id,
       amount::text, payout::text, status,
       sub1, sub2, sub3, sub4, sub5, enriched
FROM conversions WHERE id = $1`, j.refID).Scan(
		&c.id, &c.clickID, &c.clickTime, &c.offerID, &c.pubID, &c.goal, &c.txnID,
		&c.amount, &c.payout, &c.status,
		&c.subs[0], &c.subs[1], &c.subs[2], &c.subs[3], &c.subs[4], &c.enriched)
	if err != nil {
		return err
	}

	if !c.enriched {
		found, err := o.enrich(ctx, &c)
		if err != nil {
			return err
		}
		// Clicks reach ClickHouse in ~1s batches; a very fast conversion can
		// beat its click. Wait a little before sending without sub IDs.
		if !found && j.attempts < 4 {
			return errRetrySoon
		}
	}

	rows, err := o.PG.Query(ctx, `
SELECT url FROM publisher_postbacks
WHERE publisher_id = $1 AND active
  AND (offer_id IS NULL OR offer_id = $2)
  AND (goal IS NULL OR goal = $3)`, c.pubID, c.offerID, c.goal)
	if err != nil {
		return err
	}
	var urls []string
	for rows.Next() {
		var u string
		if err := rows.Scan(&u); err != nil {
			rows.Close()
			return err
		}
		urls = append(urls, u)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	vals := map[string]string{
		"click_id":      c.clickID,
		"conversion_id": strconv.FormatInt(c.id, 10),
		"offer_id":      strconv.FormatInt(c.offerID, 10),
		"pub_id":        strconv.FormatInt(c.pubID, 10),
		"goal":          c.goal,
		"txn_id":        c.txnID,
		"amount":        c.amount,
		"payout":        c.payout,
		"status":        c.status,
	}
	for i, s := range c.subs {
		vals["sub"+strconv.Itoa(i+1)] = s
	}
	for _, u := range urls {
		payload, _ := json.Marshal(map[string]string{"url": track.Expand(u, vals)})
		if _, err := o.PG.Exec(ctx,
			`INSERT INTO outbox (kind, ref_id, payload) VALUES ('http_get', $1, $2)`,
			c.id, payload); err != nil {
			return err
		}
	}
	return nil
}

// enrich looks the click up by its primary key prefix (offer, publisher, ts),
// which ClickHouse answers from a handful of granules.
func (o *Outbox) enrich(ctx context.Context, c *conversion) (bool, error) {
	var subs [5]string
	err := o.CH.QueryRow(ctx, `
SELECT sub1, sub2, sub3, sub4, sub5 FROM clicks
WHERE offer_id = ? AND publisher_id = ?
  AND ts BETWEEN ? AND ?
  AND click_id = ?
LIMIT 1`,
		uint64(c.offerID), uint64(c.pubID),
		c.clickTime.Add(-time.Second), c.clickTime.Add(time.Second),
		c.clickID,
	).Scan(&subs[0], &subs[1], &subs[2], &subs[3], &subs[4])
	if err != nil {
		if isNoRows(err) {
			return false, nil
		}
		return false, err
	}
	c.subs = subs
	c.enriched = true
	_, err = o.PG.Exec(ctx, `
UPDATE conversions SET sub1 = $2, sub2 = $3, sub3 = $4, sub4 = $5, sub5 = $6, enriched = true
WHERE id = $1`, c.id, subs[0], subs[1], subs[2], subs[3], subs[4])
	return true, err
}

func (o *Outbox) httpGet(ctx context.Context, j job) error {
	var p struct {
		URL string `json:"url"`
	}
	if err := json.Unmarshal(j.payload, &p); err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.URL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "tracking-postback/1.0")
	resp, err := o.Client.Do(req)
	code, body := 0, ""
	if err == nil {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		resp.Body.Close()
		code, body = resp.StatusCode, string(b)
	}

	errText := ""
	if err != nil {
		errText = err.Error()
	}
	if _, logErr := o.PG.Exec(ctx, `
INSERT INTO postback_deliveries (conversion_id, url, status_code, response, error)
VALUES ($1, $2, NULLIF($3, 0), $4, NULLIF($5, ''))`,
		j.refID, p.URL, code, body, errText); logErr != nil {
		slog.Warn("postback_deliveries insert", "err", logErr)
	}

	if err != nil {
		return err
	}
	if code < 200 || code > 299 {
		return fmt.Errorf("publisher postback returned %d", code)
	}
	return nil
}
