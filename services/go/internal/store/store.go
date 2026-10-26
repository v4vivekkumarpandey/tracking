// Package store opens connections to Postgres, ClickHouse and Redis.
package store

import (
	"context"
	"fmt"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"tracking/internal/config"
)

func OpenPostgres(ctx context.Context, cfg config.Config) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, cfg.PostgresURL)
	if err != nil {
		return nil, fmt.Errorf("postgres: %w", err)
	}
	if err := retry(ctx, func() error { return pool.Ping(ctx) }); err != nil {
		return nil, fmt.Errorf("postgres ping: %w", err)
	}
	return pool, nil
}

func OpenClickHouse(ctx context.Context, cfg config.Config) (driver.Conn, error) {
	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{cfg.ClickHouseAddr},
		Auth: clickhouse.Auth{
			Database: cfg.ClickHouseDB,
			Username: cfg.ClickHouseUser,
			Password: cfg.ClickHousePassword,
		},
		DialTimeout: 5 * time.Second,
	})
	if err != nil {
		return nil, fmt.Errorf("clickhouse: %w", err)
	}
	if err := retry(ctx, func() error { return conn.Ping(ctx) }); err != nil {
		return nil, fmt.Errorf("clickhouse ping: %w", err)
	}
	return conn, nil
}

func OpenRedis(ctx context.Context, cfg config.Config) (*redis.Client, error) {
	rdb := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr, Password: cfg.RedisPassword})
	if err := retry(ctx, func() error { return rdb.Ping(ctx).Err() }); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}
	return rdb, nil
}

// retry gives dependencies started by docker compose a few seconds to come up.
func retry(ctx context.Context, f func() error) error {
	var err error
	for i := 0; i < 15; i++ {
		if err = f(); err == nil {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(2 * time.Second):
		}
	}
	return err
}
