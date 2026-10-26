-- +goose Up
-- Postgres is the source of truth for everything that involves money or
-- configuration. High-volume click logs live in ClickHouse instead.

-- +goose StatementBegin
CREATE OR REPLACE FUNCTION random_secret() RETURNS text
LANGUAGE sql VOLATILE AS $$ SELECT replace(gen_random_uuid()::text, '-', '') $$;
-- +goose StatementEnd

CREATE TABLE advertisers (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    company         TEXT,
    email           TEXT,
    gstin           TEXT,
    -- Sent by the advertiser with every S2S postback.
    postback_secret TEXT NOT NULL DEFAULT random_secret(),
    status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE publishers (
    id                  BIGSERIAL PRIMARY KEY,
    name                TEXT NOT NULL,
    company             TEXT,
    email               TEXT,
    -- KYC and payout details, used from the payouts phase onwards.
    pan                 TEXT,
    gstin               TEXT,
    bank_account_name   TEXT,
    bank_account_number TEXT,
    bank_ifsc           TEXT,
    upi_id              TEXT,
    kyc_status          TEXT NOT NULL DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'rejected')),
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'blocked')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Logins for the advertiser and publisher portals (Phase 2). Phase 1 uses a
-- single admin login from environment variables.
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin', 'advertiser', 'publisher')),
    advertiser_id BIGINT REFERENCES advertisers(id),
    publisher_id  BIGINT REFERENCES publishers(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE offers (
    id               BIGSERIAL PRIMARY KEY,
    advertiser_id    BIGINT NOT NULL REFERENCES advertisers(id),
    name             TEXT NOT NULL,
    description      TEXT,
    -- May contain macros: {click_id} {pub_id} {offer_id} {sub1}..{sub5}
    destination_url  TEXT NOT NULL,
    payout_model     TEXT NOT NULL DEFAULT 'CPA' CHECK (payout_model IN ('CPA', 'CPS', 'CPL', 'CPI')),
    currency         TEXT NOT NULL DEFAULT 'INR',
    -- Fixed amounts per conversion, used unless a percentage is set.
    default_revenue  NUMERIC(12,2) NOT NULL DEFAULT 0,
    default_payout   NUMERIC(12,2) NOT NULL DEFAULT 0,
    -- For CPS: percentage of the sale amount the advertiser reports.
    revenue_percent  NUMERIC(5,2),
    payout_percent   NUMERIC(5,2),
    attribution_days INT NOT NULL DEFAULT 30 CHECK (attribution_days BETWEEN 1 AND 365),
    status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Extra events on an offer (e.g. "lead", "sale", "install") with their own
-- revenue and payout. A postback without goal uses the offer defaults.
CREATE TABLE offer_goals (
    id       BIGSERIAL PRIMARY KEY,
    offer_id BIGINT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    code     TEXT NOT NULL,
    name     TEXT NOT NULL,
    revenue  NUMERIC(12,2),
    payout   NUMERIC(12,2),
    UNIQUE (offer_id, code)
);

CREATE TABLE publisher_offer_access (
    publisher_id    BIGINT NOT NULL REFERENCES publishers(id),
    offer_id        BIGINT NOT NULL REFERENCES offers(id),
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    payout_override NUMERIC(12,2),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (publisher_id, offer_id)
);

CREATE TABLE tracking_links (
    id           BIGSERIAL PRIMARY KEY,
    code         TEXT NOT NULL UNIQUE,
    offer_id     BIGINT NOT NULL REFERENCES offers(id),
    publisher_id BIGINT NOT NULL REFERENCES publishers(id),
    status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON tracking_links (offer_id, publisher_id);

-- Where to notify the publisher when they earn a conversion.
-- offer_id / goal NULL = all offers / all goals.
CREATE TABLE publisher_postbacks (
    id           BIGSERIAL PRIMARY KEY,
    publisher_id BIGINT NOT NULL REFERENCES publishers(id),
    offer_id     BIGINT REFERENCES offers(id),
    goal         TEXT,
    url          TEXT NOT NULL,
    active       BOOLEAN NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON publisher_postbacks (publisher_id);

CREATE TABLE conversions (
    id           BIGSERIAL PRIMARY KEY,
    click_id     TEXT NOT NULL,
    click_time   TIMESTAMPTZ NOT NULL,
    offer_id     BIGINT NOT NULL REFERENCES offers(id),
    publisher_id BIGINT NOT NULL REFERENCES publishers(id),
    link_id      BIGINT NOT NULL,
    goal         TEXT NOT NULL DEFAULT '',
    txn_id       TEXT NOT NULL DEFAULT '',
    amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
    revenue      NUMERIC(12,2) NOT NULL,
    payout       NUMERIC(12,2) NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    source       TEXT NOT NULL CHECK (source IN ('s2s', 'pixel', 'manual')),
    ip           INET,
    -- Copied from the click by the worker, for publisher postbacks.
    sub1 TEXT NOT NULL DEFAULT '', sub2 TEXT NOT NULL DEFAULT '', sub3 TEXT NOT NULL DEFAULT '',
    sub4 TEXT NOT NULL DEFAULT '', sub5 TEXT NOT NULL DEFAULT '',
    enriched     BOOLEAN NOT NULL DEFAULT false,
    reject_reason TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- The final duplicate guards (Redis catches most duplicates first).
CREATE UNIQUE INDEX conversions_click_goal ON conversions (click_id, goal);
CREATE UNIQUE INDEX conversions_offer_txn ON conversions (offer_id, txn_id) WHERE txn_id <> '';
CREATE INDEX ON conversions (created_at);
CREATE INDEX ON conversions (publisher_id, created_at);
CREATE INDEX ON conversions (offer_id, created_at);

-- Transactional outbox: jobs written in the same transaction as the data
-- they belong to, then processed by the worker.
CREATE TABLE outbox (
    id              BIGSERIAL PRIMARY KEY,
    kind            TEXT NOT NULL,
    ref_id          BIGINT NOT NULL,
    payload         JSONB,
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
    attempts        INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX outbox_due ON outbox (next_attempt_at, id) WHERE status = 'pending';

-- Every postback received from advertisers, accepted or not.
CREATE TABLE postback_log (
    id         BIGSERIAL PRIMARY KEY,
    click_id   TEXT,
    source     TEXT NOT NULL,
    ip         INET,
    params     JSONB NOT NULL,
    status     TEXT NOT NULL,
    message    TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON postback_log (created_at);
CREATE INDEX ON postback_log (click_id);

-- Every postback we sent to publishers.
CREATE TABLE postback_deliveries (
    id            BIGSERIAL PRIMARY KEY,
    conversion_id BIGINT NOT NULL REFERENCES conversions(id),
    url           TEXT NOT NULL,
    status_code   INT,
    response      TEXT,
    error         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON postback_deliveries (conversion_id);

-- Payouts (Phase 3): one batch per payment run, one item per publisher.
CREATE TABLE payout_batches (
    id           BIGSERIAL PRIMARY KEY,
    period_start DATE NOT NULL,
    period_end   DATE NOT NULL,
    provider     TEXT NOT NULL CHECK (provider IN ('razorpayx', 'cashfree', 'manual')),
    status       TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'processing', 'completed', 'failed')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payout_items (
    id               BIGSERIAL PRIMARY KEY,
    batch_id         BIGINT NOT NULL REFERENCES payout_batches(id),
    publisher_id     BIGINT NOT NULL REFERENCES publishers(id),
    gross_amount     NUMERIC(14,2) NOT NULL,
    tds_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
    gst_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
    net_amount       NUMERIC(14,2) NOT NULL,
    provider_ref     TEXT,
    status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'reversed')),
    failure_reason   TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (batch_id, publisher_id)
);

CREATE TABLE audit_log (
    id         BIGSERIAL PRIMARY KEY,
    actor      TEXT NOT NULL,
    action     TEXT NOT NULL,
    entity     TEXT NOT NULL,
    entity_id  BIGINT,
    details    JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log (entity, entity_id);

-- +goose Down
DROP TABLE audit_log, payout_items, payout_batches, postback_deliveries, postback_log,
    outbox, conversions, publisher_postbacks, tracking_links, publisher_offer_access,
    offer_goals, offers, users, publishers, advertisers;
DROP FUNCTION random_secret();
