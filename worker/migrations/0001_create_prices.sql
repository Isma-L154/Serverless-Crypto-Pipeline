-- Rolling window of price observations.
--
-- The cron prunes anything older than the retention window on every run, so
-- this table holds roughly two days of data rather than growing without bound.
-- Long-term history is kept in the AWS archive tier instead.
CREATE TABLE IF NOT EXISTS prices (
    coin_id        TEXT    NOT NULL,
    ts             INTEGER NOT NULL,
    price_usd      REAL    NOT NULL,
    market_cap_usd REAL,
    volume_24h_usd REAL,
    change_24h_pct REAL,
    PRIMARY KEY (coin_id, ts)
);

-- Both the pruning delete and the dashboard's history query filter on ts alone,
-- which the primary key cannot serve because coin_id leads it.
CREATE INDEX IF NOT EXISTS idx_prices_ts ON prices (ts);
