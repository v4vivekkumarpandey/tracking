-- Demo data for local testing. Safe to run more than once.
-- docker compose run --rm migrate -seed /scripts/seed.sql

INSERT INTO advertisers (id, name, company, email, postback_secret)
VALUES (1, 'Demo Brand', 'Demo Brand Pvt Ltd', 'brand@example.com', 'demo-advertiser-secret')
ON CONFLICT (id) DO NOTHING;

INSERT INTO publishers (id, name, email, status)
VALUES (1, 'Demo Publisher', 'publisher@example.com', 'active')
ON CONFLICT (id) DO NOTHING;

-- CPS offer: 10% of the sale to us, 7% to the publisher.
INSERT INTO offers (id, advertiser_id, name, destination_url, payout_model,
                    revenue_percent, payout_percent, attribution_days)
VALUES (1, 1, 'Demo Brand - Sales',
        'https://example.com/landing?click_id={click_id}&aff={pub_id}&s1={sub1}',
        'CPS', 10, 7, 30)
ON CONFLICT (id) DO NOTHING;

-- A fixed-price goal on the same offer.
INSERT INTO offer_goals (offer_id, code, name, revenue, payout)
VALUES (1, 'lead', 'Signup', 100, 70)
ON CONFLICT (offer_id, code) DO NOTHING;

INSERT INTO publisher_offer_access (publisher_id, offer_id, status)
VALUES (1, 1, 'approved')
ON CONFLICT DO NOTHING;

INSERT INTO tracking_links (id, code, offer_id, publisher_id)
VALUES (1, 'demo123', 1, 1)
ON CONFLICT (id) DO NOTHING;

-- Goes to the httpbin container so you can watch publisher postbacks arrive.
INSERT INTO publisher_postbacks (id, publisher_id, url)
VALUES (1, 1, 'http://httpbin:8080/get?pub_click={sub1}&payout={payout}&goal={goal}&conv={conversion_id}')
ON CONFLICT (id) DO NOTHING;

-- Explicit ids above don't advance the sequences; move them past the seed rows.
SELECT setval('advertisers_id_seq',        GREATEST((SELECT max(id) FROM advertisers), 1));
SELECT setval('publishers_id_seq',          GREATEST((SELECT max(id) FROM publishers), 1));
SELECT setval('offers_id_seq',              GREATEST((SELECT max(id) FROM offers), 1));
SELECT setval('tracking_links_id_seq',      GREATEST((SELECT max(id) FROM tracking_links), 1));
SELECT setval('publisher_postbacks_id_seq', GREATEST((SELECT max(id) FROM publisher_postbacks), 1));
