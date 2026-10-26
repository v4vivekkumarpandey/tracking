package conv

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

// claim atomically reserves every key, or none if any is already taken.
var claim = redis.NewScript(`
for i = 1, #KEYS do
  if redis.call('EXISTS', KEYS[i]) == 1 then return 0 end
end
for i = 1, #KEYS do
  redis.call('SET', KEYS[i], '1', 'EX', ARGV[1])
end
return 1`)

// Dedup is the fast duplicate guard in front of Postgres. Advertisers often
// fire the same postback several times (retries, page reloads on a pixel);
// Redis turns those away without a database write. Unique indexes in
// Postgres remain the final guarantee.
type Dedup struct{ rdb *redis.Client }

func NewDedup(rdb *redis.Client) *Dedup { return &Dedup{rdb: rdb} }

// Keys returns the dedup keys for a conversion: one per click+goal, and one
// per advertiser transaction ID when the advertiser sends one.
func Keys(offerID, clickID, goal, txnID string) []string {
	keys := []string{"conv:c:" + clickID + ":" + goal}
	if txnID != "" {
		keys = append(keys, "conv:t:"+offerID+":"+txnID)
	}
	return keys
}

// Claim reports false if any key was already claimed.
func (d *Dedup) Claim(ctx context.Context, keys []string, ttl time.Duration) (bool, error) {
	n, err := claim.Run(ctx, d.rdb, keys, int(ttl.Seconds())).Int()
	return n == 1, err
}

// Release frees keys after a failed insert so the advertiser's retry works.
func (d *Dedup) Release(ctx context.Context, keys []string) {
	d.rdb.Del(ctx, keys...)
}
