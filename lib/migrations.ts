// Schema for MySQL 8 / MariaDB 10.6+. Applied automatically on first start
// (see lib/db.ts), so there is no separate setup step on shared hosting.
// Add new versions at the end; never edit one that has already run.

export const migrations: { version: number; statements: string[] }[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS advertisers (
        id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name            VARCHAR(200) NOT NULL,
        company         VARCHAR(200) NULL,
        email           VARCHAR(200) NULL,
        tax_id          VARCHAR(64)  NULL,
        postback_secret VARCHAR(64)  NOT NULL,
        status          VARCHAR(16)  NOT NULL DEFAULT 'active',
        created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS publishers (
        id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        name            VARCHAR(200) NOT NULL,
        company         VARCHAR(200) NULL,
        email           VARCHAR(200) NULL,
        country         CHAR(2)      NULL,
        tax_id          VARCHAR(64)  NULL,
        payout_method   VARCHAR(32)  NULL,
        payout_details  TEXT         NULL,
        kyc_status      VARCHAR(16)  NOT NULL DEFAULT 'pending',
        status          VARCHAR(16)  NOT NULL DEFAULT 'pending',
        created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS offers (
        id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        advertiser_id    BIGINT UNSIGNED NOT NULL,
        name             VARCHAR(200) NOT NULL,
        description      TEXT NULL,
        destination_url  TEXT NOT NULL,
        payout_model     VARCHAR(8)    NOT NULL DEFAULT 'CPA',
        default_revenue  DECIMAL(12,2) NOT NULL DEFAULT 0,
        default_payout   DECIMAL(12,2) NOT NULL DEFAULT 0,
        revenue_percent  DECIMAL(5,2)  NULL,
        payout_percent   DECIMAL(5,2)  NULL,
        attribution_days INT NOT NULL DEFAULT 30,
        status           VARCHAR(16) NOT NULL DEFAULT 'active',
        created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        CONSTRAINT fk_offer_adv FOREIGN KEY (advertiser_id) REFERENCES advertisers(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS offer_goals (
        id       BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        offer_id BIGINT UNSIGNED NOT NULL,
        code     VARCHAR(64)  NOT NULL,
        name     VARCHAR(200) NOT NULL,
        revenue  DECIMAL(12,2) NULL,
        payout   DECIMAL(12,2) NULL,
        UNIQUE KEY uq_goal (offer_id, code),
        CONSTRAINT fk_goal_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS publisher_offer_access (
        publisher_id    BIGINT UNSIGNED NOT NULL,
        offer_id        BIGINT UNSIGNED NOT NULL,
        status          VARCHAR(16) NOT NULL DEFAULT 'pending',
        payout_override DECIMAL(12,2) NULL,
        created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (publisher_id, offer_id),
        CONSTRAINT fk_access_pub FOREIGN KEY (publisher_id) REFERENCES publishers(id),
        CONSTRAINT fk_access_offer FOREIGN KEY (offer_id) REFERENCES offers(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS tracking_links (
        id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        code         VARCHAR(32) NOT NULL,
        offer_id     BIGINT UNSIGNED NOT NULL,
        publisher_id BIGINT UNSIGNED NOT NULL,
        status       VARCHAR(16) NOT NULL DEFAULT 'active',
        created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_link_code (code),
        KEY ix_link_offer_pub (offer_id, publisher_id),
        CONSTRAINT fk_link_offer FOREIGN KEY (offer_id) REFERENCES offers(id),
        CONSTRAINT fk_link_pub FOREIGN KEY (publisher_id) REFERENCES publishers(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS publisher_postbacks (
        id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        publisher_id BIGINT UNSIGNED NOT NULL,
        offer_id     BIGINT UNSIGNED NULL,
        goal         VARCHAR(64) NULL,
        url          TEXT NOT NULL,
        active       TINYINT(1) NOT NULL DEFAULT 1,
        created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY ix_pb_pub (publisher_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      // Primary key is the click ID: it starts with a timestamp, so rows are
      // appended in order, and a postback can read its click in one lookup.
      `CREATE TABLE IF NOT EXISTS clicks (
        click_id     VARCHAR(64) NOT NULL PRIMARY KEY,
        ts           DATETIME(3) NOT NULL,
        offer_id     BIGINT UNSIGNED NOT NULL,
        publisher_id BIGINT UNSIGNED NOT NULL,
        link_id      BIGINT UNSIGNED NOT NULL,
        ip           VARCHAR(45)  NOT NULL DEFAULT '',
        ua           VARCHAR(512) NOT NULL DEFAULT '',
        referer      VARCHAR(512) NOT NULL DEFAULT '',
        country      CHAR(2)      NOT NULL DEFAULT '',
        sub1 VARCHAR(255) NOT NULL DEFAULT '', sub2 VARCHAR(255) NOT NULL DEFAULT '',
        sub3 VARCHAR(255) NOT NULL DEFAULT '', sub4 VARCHAR(255) NOT NULL DEFAULT '',
        sub5 VARCHAR(255) NOT NULL DEFAULT '',
        is_bot       TINYINT(1) NOT NULL DEFAULT 0,
        is_duplicate TINYINT(1) NOT NULL DEFAULT 0,
        KEY ix_click_offer_ip (offer_id, ip, ts),
        KEY ix_click_ts (ts)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      // Hourly totals updated on every click; reports read only this.
      `CREATE TABLE IF NOT EXISTS stats_hourly (
        hour         DATETIME NOT NULL,
        offer_id     BIGINT UNSIGNED NOT NULL,
        publisher_id BIGINT UNSIGNED NOT NULL,
        clicks       INT UNSIGNED NOT NULL DEFAULT 0,
        uniques      INT UNSIGNED NOT NULL DEFAULT 0,
        flagged      INT UNSIGNED NOT NULL DEFAULT 0,
        PRIMARY KEY (hour, offer_id, publisher_id)
      ) ENGINE=InnoDB`,

      // txn_key is txn_id or NULL. MySQL has no partial unique index, but a
      // unique key allows many NULLs, so empty txn_ids don't collide.
      `CREATE TABLE IF NOT EXISTS conversions (
        id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        click_id      VARCHAR(64) NOT NULL,
        click_time    DATETIME(3) NOT NULL,
        offer_id      BIGINT UNSIGNED NOT NULL,
        publisher_id  BIGINT UNSIGNED NOT NULL,
        link_id       BIGINT UNSIGNED NOT NULL,
        goal          VARCHAR(64)  NOT NULL DEFAULT '',
        txn_id        VARCHAR(128) NOT NULL DEFAULT '',
        txn_key       VARCHAR(128) NULL,
        amount        DECIMAL(14,2) NOT NULL DEFAULT 0,
        revenue       DECIMAL(12,2) NOT NULL,
        payout        DECIMAL(12,2) NOT NULL,
        status        VARCHAR(16) NOT NULL DEFAULT 'pending',
        source        VARCHAR(16) NOT NULL,
        ip            VARCHAR(45) NOT NULL DEFAULT '',
        sub1 VARCHAR(255) NOT NULL DEFAULT '', sub2 VARCHAR(255) NOT NULL DEFAULT '',
        sub3 VARCHAR(255) NOT NULL DEFAULT '', sub4 VARCHAR(255) NOT NULL DEFAULT '',
        sub5 VARCHAR(255) NOT NULL DEFAULT '',
        reject_reason VARCHAR(255) NULL,
        created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_conv_click_goal (click_id, goal),
        UNIQUE KEY uq_conv_offer_txn (offer_id, txn_key),
        KEY ix_conv_created (created_at),
        KEY ix_conv_pub (publisher_id, created_at),
        KEY ix_conv_status (status, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS outbox (
        id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        kind            VARCHAR(32) NOT NULL,
        ref_id          BIGINT UNSIGNED NOT NULL,
        payload         TEXT NULL,
        status          VARCHAR(16) NOT NULL DEFAULT 'pending',
        attempts        INT NOT NULL DEFAULT 0,
        claim           VARCHAR(36) NULL,
        next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        last_error      TEXT NULL,
        created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY ix_outbox_due (status, next_attempt_at),
        KEY ix_outbox_claim (claim)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS postback_log (
        id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        click_id   VARCHAR(64) NULL,
        source     VARCHAR(16) NOT NULL,
        ip         VARCHAR(45) NOT NULL DEFAULT '',
        params     TEXT NOT NULL,
        status     VARCHAR(16) NOT NULL,
        message    VARCHAR(255) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY ix_pblog_created (created_at),
        KEY ix_pblog_click (click_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS postback_deliveries (
        id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        conversion_id BIGINT UNSIGNED NOT NULL,
        url           TEXT NOT NULL,
        status_code   INT NULL,
        response      TEXT NULL,
        error         VARCHAR(255) NULL,
        created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY ix_deliv_conv (conversion_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `CREATE TABLE IF NOT EXISTS audit_log (
        id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        actor      VARCHAR(200) NOT NULL,
        action     VARCHAR(64)  NOT NULL,
        entity     VARCHAR(64)  NOT NULL,
        entity_id  BIGINT UNSIGNED NULL,
        details    TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY ix_audit_entity (entity, entity_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ],
  },
  {
    // Advertiser & publisher logins, self sign-up, marketplace visibility,
    // manual publisher payments.
    version: 2,
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
        id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        email           VARCHAR(200) NOT NULL,
        password_hash   VARCHAR(255) NOT NULL,
        role            VARCHAR(16)  NOT NULL,
        advertiser_id   BIGINT UNSIGNED NULL,
        publisher_id    BIGINT UNSIGNED NULL,
        session_version INT NOT NULL DEFAULT 1,
        last_login_at   DATETIME(3) NULL,
        created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uq_user_email (email),
        KEY ix_user_adv (advertiser_id),
        KEY ix_user_pub (publisher_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,

      `ALTER TABLE advertisers ADD COLUMN website VARCHAR(255) NULL`,
      `ALTER TABLE publishers ADD COLUMN website VARCHAR(255) NULL, ADD COLUMN traffic_sources TEXT NULL`,
      `ALTER TABLE offers ADD COLUMN visibility VARCHAR(16) NOT NULL DEFAULT 'public'`,
      // Lets advertisers see the postbacks they sent, for debugging their integration.
      `ALTER TABLE postback_log ADD COLUMN offer_id BIGINT UNSIGNED NULL, ADD KEY ix_pblog_offer (offer_id, id)`,

      `CREATE TABLE IF NOT EXISTS payments (
        id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        publisher_id BIGINT UNSIGNED NOT NULL,
        amount       DECIMAL(14,2) NOT NULL,
        method       VARCHAR(32)  NOT NULL,
        reference    VARCHAR(200) NULL,
        period_from  DATE NULL,
        period_to    DATE NULL,
        note         VARCHAR(500) NULL,
        paid_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY ix_pay_pub (publisher_id, paid_at),
        CONSTRAINT fk_pay_pub FOREIGN KEY (publisher_id) REFERENCES publishers(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ],
  },
];
