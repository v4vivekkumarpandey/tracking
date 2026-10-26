// Command tracker serves click redirects and conversion postbacks.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"tracking/internal/clickid"
	"tracking/internal/config"
	"tracking/internal/conv"
	"tracking/internal/events"
	"tracking/internal/store"
	"tracking/internal/track"
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

	signer := clickid.NewSigner(cfg.ClickSecret)

	// Batchers outlive the HTTP server so in-flight requests can still
	// enqueue during shutdown; they drain once flushCtx is cancelled.
	flushCtx, stopFlush := context.WithCancel(context.Background())
	clicks := events.NewBatcher(func(ctx context.Context, rows []events.Click) error {
		return events.InsertClicks(ctx, ch, rows)
	}, rdb, events.SpillClicks)
	convs := events.NewBatcher(func(ctx context.Context, rows []events.Conversion) error {
		return events.InsertConversions(ctx, ch, rows)
	}, rdb, events.SpillConversions)
	go clicks.Run(flushCtx)
	go convs.Run(flushCtx)

	th := &track.Handler{
		Links:          track.NewLinks(pg, rdb, cfg.LinkCacheTTL),
		Signer:         signer,
		Clicks:         clicks,
		Redis:          rdb,
		FallbackURL:    cfg.FallbackURL,
		TrustProxy:     cfg.TrustProxy,
		DupClickWindow: cfg.DupClickWindow,
	}
	cv := &conv.Handler{
		PG:          pg,
		Signer:      signer,
		Dedup:       conv.NewDedup(rdb),
		Conversions: convs,
		TrustProxy:  cfg.TrustProxy,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /c/{code}", th.ServeClick)
	mux.HandleFunc("GET /postback", cv.ServePostback)
	mux.HandleFunc("POST /postback", cv.ServePostback)
	mux.HandleFunc("GET /px", cv.ServePixel)
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      10 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	go func() {
		slog.Info("tracker listening", "addr", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			slog.Error("http server", "err", err)
			stop()
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down")
	shutCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	srv.Shutdown(shutCtx)
	stopFlush()
	clicks.Wait()
	convs.Wait()
}

func must(err error) {
	if err != nil {
		slog.Error("startup", "err", err)
		os.Exit(1)
	}
}
