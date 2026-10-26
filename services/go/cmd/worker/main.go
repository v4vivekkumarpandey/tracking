// Command worker sends publisher postbacks and re-sends spilled events.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"tracking/internal/config"
	"tracking/internal/store"
	"tracking/internal/worker"
)

func main() {
	cfg := config.Load()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pg, err := store.OpenPostgres(ctx, cfg)
	must(err)
	defer pg.Close()
	ch, err := store.OpenClickHouse(ctx, cfg)
	must(err)
	defer ch.Close()
	rdb, err := store.OpenRedis(ctx, cfg)
	must(err)
	defer rdb.Close()

	outbox := &worker.Outbox{PG: pg, CH: ch, Client: &http.Client{Timeout: 10 * time.Second}}
	spill := &worker.Spill{Redis: rdb, CH: ch}

	var wg sync.WaitGroup
	wg.Add(2)
	go func() { defer wg.Done(); outbox.Run(ctx) }()
	go func() { defer wg.Done(); spill.Run(ctx) }()
	slog.Info("worker started")
	wg.Wait()
}

func must(err error) {
	if err != nil {
		slog.Error("startup", "err", err)
		os.Exit(1)
	}
}
