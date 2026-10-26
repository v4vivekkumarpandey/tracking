// Command migrate applies Postgres migrations and, with -seed, loads a SQL
// file afterwards (demo data for local development).
package main

import (
	"context"
	"database/sql"
	"flag"
	"log/slog"
	"os"

	"github.com/jackc/pgx/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"
)

func main() {
	dir := flag.String("dir", "/migrations", "migrations directory")
	seed := flag.String("seed", "", "SQL file to run after migrating")
	flag.Parse()

	url := os.Getenv("POSTGRES_URL")
	if url == "" {
		url = "postgres://tracking:tracking@localhost:5432/tracking?sslmode=disable"
	}

	db, err := sql.Open("pgx", url)
	must(err)
	defer db.Close()
	must(goose.SetDialect("postgres"))
	must(goose.Up(db, *dir))

	if *seed != "" {
		b, err := os.ReadFile(*seed)
		must(err)
		ctx := context.Background()
		conn, err := pgx.Connect(ctx, url)
		must(err)
		defer conn.Close(ctx)
		// No arguments: pgx uses the simple protocol, which allows a file
		// with many statements.
		_, err = conn.Exec(ctx, string(b))
		must(err)
		slog.Info("seed loaded", "file", *seed)
	}
}

func must(err error) {
	if err != nil {
		slog.Error("migrate", "err", err)
		os.Exit(1)
	}
}
