-- Runs once when the ClickHouse container is first created.
CREATE DATABASE IF NOT EXISTS tracking;

-- One row per click. Ordered by (offer, publisher, time) so both reports and
-- the worker's click lookup read only a few granules.
CREATE TABLE IF NOT EXISTS tracking.clicks
(
    ts           DateTime64(3, 'UTC'),
    click_id     String,
    offer_id     UInt64,
    publisher_id UInt64,
    link_id      UInt64,
    ip           String,
    ua           String,
    referer      String,
    country      LowCardinality(String),
    sub1         String,
    sub2         String,
    sub3         String,
    sub4         String,
    sub5         String,
    is_bot       UInt8,
    is_duplicate UInt8
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (offer_id, publisher_id, ts)
TTL toDateTime(ts) + INTERVAL 13 MONTH;

-- Copy of conversions for analytics. Money is reported from Postgres, which
-- knows about approvals and rejections.
CREATE TABLE IF NOT EXISTS tracking.conversions
(
    ts            DateTime64(3, 'UTC'),
    conversion_id UInt64,
    click_id      String,
    offer_id      UInt64,
    publisher_id  UInt64,
    goal          LowCardinality(String),
    txn_id        String,
    amount        Float64,
    revenue       Float64,
    payout        Float64,
    source        LowCardinality(String)
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(ts)
ORDER BY (offer_id, publisher_id, ts);

-- Hourly click totals, kept up to date by the materialized view below.
-- Dashboards read this instead of scanning raw clicks.
CREATE TABLE IF NOT EXISTS tracking.stats_hourly
(
    hour          DateTime('UTC'),
    offer_id      UInt64,
    publisher_id  UInt64,
    clicks        SimpleAggregateFunction(sum, UInt64),
    flagged       SimpleAggregateFunction(sum, UInt64),
    unique_clicks AggregateFunction(uniq, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(hour)
ORDER BY (hour, offer_id, publisher_id);

CREATE MATERIALIZED VIEW IF NOT EXISTS tracking.stats_hourly_mv TO tracking.stats_hourly AS
SELECT
    toDateTime(toStartOfHour(ts), 'UTC')     AS hour,
    offer_id,
    publisher_id,
    count()                                  AS clicks,
    countIf(is_bot = 1 OR is_duplicate = 1)  AS flagged,
    uniqState(cityHash64(ip))                AS unique_clicks
FROM tracking.clicks
GROUP BY hour, offer_id, publisher_id;
