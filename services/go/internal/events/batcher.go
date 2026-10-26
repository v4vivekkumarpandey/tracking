package events

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/redis/go-redis/v9"
)

// Batcher collects events in memory and flushes them every interval or when
// max rows are waiting, whichever comes first. ClickHouse is built for few
// large inserts, not one insert per click.
//
// If a flush fails, or the buffer is full, events are pushed to a Redis list
// (spillKey) so the worker can re-send them later and no click is lost.
type Batcher[T any] struct {
	in       chan T
	flush    func(context.Context, []T) error
	rdb      *redis.Client
	spillKey string
	max      int
	interval time.Duration
	done     chan struct{}
}

func NewBatcher[T any](flush func(context.Context, []T) error, rdb *redis.Client, spillKey string) *Batcher[T] {
	return &Batcher[T]{
		in:       make(chan T, 50_000),
		flush:    flush,
		rdb:      rdb,
		spillKey: spillKey,
		max:      5_000,
		interval: time.Second,
		done:     make(chan struct{}),
	}
}

// Add never blocks the request: a full buffer spills straight to Redis.
func (b *Batcher[T]) Add(ev T) {
	select {
	case b.in <- ev:
	default:
		b.spill([]T{ev})
	}
}

// Run flushes until ctx is cancelled, then drains what is left.
func (b *Batcher[T]) Run(ctx context.Context) {
	defer close(b.done)
	buf := make([]T, 0, b.max)
	tick := time.NewTicker(b.interval)
	defer tick.Stop()

	send := func() {
		if len(buf) == 0 {
			return
		}
		fctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := b.flush(fctx, buf); err != nil {
			slog.Error("clickhouse flush failed, spilling to redis", "key", b.spillKey, "rows", len(buf), "err", err)
			b.spill(buf)
		}
		buf = buf[:0]
	}

	for {
		select {
		case ev := <-b.in:
			buf = append(buf, ev)
			if len(buf) >= b.max {
				send()
			}
		case <-tick.C:
			send()
		case <-ctx.Done():
			for {
				select {
				case ev := <-b.in:
					buf = append(buf, ev)
				default:
					send()
					return
				}
			}
		}
	}
}

// Wait blocks until Run has drained the buffer after shutdown.
func (b *Batcher[T]) Wait() { <-b.done }

func (b *Batcher[T]) spill(evs []T) {
	vals := make([]any, 0, len(evs))
	for _, ev := range evs {
		j, err := json.Marshal(ev)
		if err != nil {
			continue
		}
		vals = append(vals, j)
	}
	if len(vals) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := b.rdb.RPush(ctx, b.spillKey, vals...).Err(); err != nil {
		slog.Error("spill to redis failed, events lost", "key", b.spillKey, "rows", len(evs), "err", err)
	}
}
