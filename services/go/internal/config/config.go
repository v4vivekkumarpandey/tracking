// Package config reads service configuration from environment variables.
package config

import (
	"log"
	"os"
	"strconv"
	"time"
)

type Config struct {
	HTTPAddr string

	PostgresURL string

	ClickHouseAddr     string
	ClickHouseDB       string
	ClickHouseUser     string
	ClickHousePassword string

	RedisAddr     string
	RedisPassword string

	// ClickSecret signs click IDs. Changing it invalidates every click still
	// inside its attribution window, so treat it like a database password.
	ClickSecret []byte

	// FallbackURL receives traffic for unknown or paused links. Empty = 404.
	FallbackURL string
	// TrustProxy uses X-Forwarded-For / CF-Connecting-IP for the client IP.
	TrustProxy bool

	LinkCacheTTL   time.Duration
	DupClickWindow time.Duration
}

func Load() Config {
	c := Config{
		HTTPAddr:           env("HTTP_ADDR", ":8080"),
		PostgresURL:        env("POSTGRES_URL", "postgres://tracking:tracking@localhost:5432/tracking?sslmode=disable"),
		ClickHouseAddr:     env("CLICKHOUSE_ADDR", "localhost:9000"),
		ClickHouseDB:       env("CLICKHOUSE_DB", "tracking"),
		ClickHouseUser:     env("CLICKHOUSE_USER", "tracking"),
		ClickHousePassword: env("CLICKHOUSE_PASSWORD", "tracking"),
		RedisAddr:          env("REDIS_ADDR", "localhost:6379"),
		RedisPassword:      env("REDIS_PASSWORD", ""),
		ClickSecret:        []byte(env("CLICK_SECRET", "")),
		FallbackURL:        env("FALLBACK_URL", ""),
		TrustProxy:         envBool("TRUST_PROXY", false),
		LinkCacheTTL:       envDuration("LINK_CACHE_TTL", 60*time.Second),
		DupClickWindow:     envDuration("DUP_CLICK_WINDOW", 10*time.Second),
	}
	if len(c.ClickSecret) < 16 {
		log.Fatal("CLICK_SECRET must be set to at least 16 characters")
	}
	return c
}

func env(k, def string) string {
	if v, ok := os.LookupEnv(k); ok && v != "" {
		return v
	}
	return def
}

func envBool(k string, def bool) bool {
	b, err := strconv.ParseBool(env(k, strconv.FormatBool(def)))
	if err != nil {
		return def
	}
	return b
}

func envDuration(k string, def time.Duration) time.Duration {
	d, err := time.ParseDuration(env(k, def.String()))
	if err != nil {
		return def
	}
	return d
}
