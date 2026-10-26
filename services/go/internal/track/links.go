package track

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
)

type Link struct {
	ID          int64  `json:"id"`
	OfferID     int64  `json:"offer_id"`
	PublisherID int64  `json:"publisher_id"`
	Destination string `json:"destination"`
	// Active is false if the link, offer or publisher is paused, or the
	// publisher is no longer approved on the offer.
	Active bool `json:"active"`
}

// Links resolves link codes, caching results in Redis so the click path
// rarely touches Postgres.
type Links struct {
	pg  *pgxpool.Pool
	rdb *redis.Client
	ttl time.Duration
}

func NewLinks(pg *pgxpool.Pool, rdb *redis.Client, ttl time.Duration) *Links {
	return &Links{pg: pg, rdb: rdb, ttl: ttl}
}

const linkQuery = `
SELECT l.id, l.offer_id, l.publisher_id, o.destination_url,
       (l.status = 'active' AND o.status = 'active' AND p.status = 'active'
        AND COALESCE(a.status, '') = 'approved')
FROM tracking_links l
JOIN offers o     ON o.id = l.offer_id
JOIN publishers p ON p.id = l.publisher_id
LEFT JOIN publisher_offer_access a
       ON a.offer_id = l.offer_id AND a.publisher_id = l.publisher_id
WHERE l.code = $1`

// Get returns nil, nil for an unknown code.
func (l *Links) Get(ctx context.Context, code string) (*Link, error) {
	key := "link:" + code
	if b, err := l.rdb.Get(ctx, key).Bytes(); err == nil {
		if string(b) == "null" {
			return nil, nil
		}
		var lk Link
		if json.Unmarshal(b, &lk) == nil {
			return &lk, nil
		}
	}

	var lk Link
	err := l.pg.QueryRow(ctx, linkQuery, code).
		Scan(&lk.ID, &lk.OfferID, &lk.PublisherID, &lk.Destination, &lk.Active)
	if errors.Is(err, pgx.ErrNoRows) {
		// Cache misses briefly too, so junk codes can't hammer Postgres.
		l.rdb.Set(ctx, key, "null", 10*time.Second)
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if b, err := json.Marshal(lk); err == nil {
		l.rdb.Set(ctx, key, b, l.ttl)
	}
	return &lk, nil
}
