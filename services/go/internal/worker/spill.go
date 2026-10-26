package worker

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/redis/go-redis/v9"

	"tracking/internal/events"
)

func isNoRows(err error) bool { return errors.Is(err, sql.ErrNoRows) }

// Spill re-sends events that the tracker parked in Redis while ClickHouse
// was unavailable.
type Spill struct {
	Redis *redis.Client
	CH    driver.Conn
}

func (s *Spill) Run(ctx context.Context) {
	for {
		moved := drain(ctx, s.Redis, events.SpillClicks, func(ctx context.Context, rows []events.Click) error {
			return events.InsertClicks(ctx, s.CH, rows)
		}) + drain(ctx, s.Redis, events.SpillConversions, func(ctx context.Context, rows []events.Conversion) error {
			return events.InsertConversions(ctx, s.CH, rows)
		})
		if moved > 0 {
			continue
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(5 * time.Second):
		}
	}
}

func drain[T any](ctx context.Context, rdb *redis.Client, key string, insert func(context.Context, []T) error) int {
	raw, err := rdb.LPopCount(ctx, key, 5000).Result()
	if err != nil || len(raw) == 0 {
		return 0
	}
	rows := make([]T, 0, len(raw))
	for _, r := range raw {
		var ev T
		if err := json.Unmarshal([]byte(r), &ev); err == nil {
			rows = append(rows, ev)
		}
	}
	if len(rows) == 0 {
		return len(raw)
	}
	if err := insert(ctx, rows); err != nil {
		slog.Error("re-sending spilled events failed, putting them back", "key", key, "rows", len(raw), "err", err)
		vals := make([]any, len(raw))
		for i, r := range raw {
			vals[i] = r
		}
		rdb.RPush(context.Background(), key, vals...)
		return 0
	}
	slog.Info("re-sent spilled events", "key", key, "rows", len(rows))
	return len(rows)
}
