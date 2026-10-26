// Package events defines the click and conversion rows written to ClickHouse
// and the batching writer that sends them.
package events

import (
	"context"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

// Redis lists that hold events ClickHouse refused; the worker re-sends them.
const (
	SpillClicks      = "spill:clicks"
	SpillConversions = "spill:conversions"
)

type Click struct {
	TS          time.Time `json:"ts"`
	ClickID     string    `json:"click_id"`
	OfferID     uint64    `json:"offer_id"`
	PublisherID uint64    `json:"publisher_id"`
	LinkID      uint64    `json:"link_id"`
	IP          string    `json:"ip"`
	UA          string    `json:"ua"`
	Referer     string    `json:"referer"`
	Country     string    `json:"country"`
	Sub         [5]string `json:"sub"`
	IsBot       uint8     `json:"is_bot"`
	IsDuplicate uint8     `json:"is_duplicate"`
}

type Conversion struct {
	TS           time.Time `json:"ts"`
	ConversionID uint64    `json:"conversion_id"`
	ClickID      string    `json:"click_id"`
	OfferID      uint64    `json:"offer_id"`
	PublisherID  uint64    `json:"publisher_id"`
	Goal         string    `json:"goal"`
	TxnID        string    `json:"txn_id"`
	Amount       float64   `json:"amount"`
	Revenue      float64   `json:"revenue"`
	Payout       float64   `json:"payout"`
	Source       string    `json:"source"`
}

func InsertClicks(ctx context.Context, ch driver.Conn, rows []Click) error {
	b, err := ch.PrepareBatch(ctx, "INSERT INTO clicks")
	if err != nil {
		return err
	}
	for _, r := range rows {
		if err := b.Append(r.TS, r.ClickID, r.OfferID, r.PublisherID, r.LinkID,
			r.IP, r.UA, r.Referer, r.Country,
			r.Sub[0], r.Sub[1], r.Sub[2], r.Sub[3], r.Sub[4],
			r.IsBot, r.IsDuplicate); err != nil {
			return err
		}
	}
	return b.Send()
}

func InsertConversions(ctx context.Context, ch driver.Conn, rows []Conversion) error {
	b, err := ch.PrepareBatch(ctx, "INSERT INTO conversions")
	if err != nil {
		return err
	}
	for _, r := range rows {
		if err := b.Append(r.TS, r.ConversionID, r.ClickID, r.OfferID, r.PublisherID,
			r.Goal, r.TxnID, r.Amount, r.Revenue, r.Payout, r.Source); err != nil {
			return err
		}
	}
	return b.Send()
}
