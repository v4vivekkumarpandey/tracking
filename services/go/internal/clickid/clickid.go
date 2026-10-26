// Package clickid creates and verifies signed click IDs.
//
// A click ID carries the offer, publisher, link and click time, plus an HMAC.
// The postback endpoint can therefore attribute a conversion without looking
// the click up first, and a forged or edited ID fails verification.
package clickid

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base32"
	"encoding/binary"
	"errors"
	"strings"
	"time"

	"github.com/oklog/ulid/v2"
)

const macLen = 8

var (
	enc = base32.StdEncoding.WithPadding(base32.NoPadding)

	ErrMalformed = errors.New("clickid: malformed")
	ErrSignature = errors.New("clickid: bad signature")
)

type Click struct {
	ID          ulid.ULID
	OfferID     int64
	PublisherID int64
	LinkID      int64
}

// Time is the click time (millisecond precision), taken from the ULID.
func (c Click) Time() time.Time { return ulid.Time(c.ID.Time()).UTC() }

type Signer struct{ key []byte }

func NewSigner(key []byte) *Signer { return &Signer{key: key} }

// New returns the encoded ID for a click happening at now.
func (s *Signer) New(offerID, publisherID, linkID int64, now time.Time) (string, Click) {
	c := Click{
		ID:          ulid.MustNew(ulid.Timestamp(now), rand.Reader),
		OfferID:     offerID,
		PublisherID: publisherID,
		LinkID:      linkID,
	}
	buf := make([]byte, 0, 16+3*binary.MaxVarintLen64+macLen)
	buf = append(buf, c.ID[:]...)
	buf = binary.AppendUvarint(buf, uint64(offerID))
	buf = binary.AppendUvarint(buf, uint64(publisherID))
	buf = binary.AppendUvarint(buf, uint64(linkID))
	buf = append(buf, s.mac(buf)...)
	return strings.ToLower(enc.EncodeToString(buf)), c
}

// Parse decodes id and checks its signature.
func (s *Signer) Parse(id string) (Click, error) {
	raw, err := enc.DecodeString(strings.ToUpper(id))
	if err != nil || len(raw) < 16+3+macLen {
		return Click{}, ErrMalformed
	}
	body, sig := raw[:len(raw)-macLen], raw[len(raw)-macLen:]
	if !hmac.Equal(sig, s.mac(body)) {
		return Click{}, ErrSignature
	}

	var c Click
	copy(c.ID[:], body[:16])
	rest := body[16:]
	for _, dst := range []*int64{&c.OfferID, &c.PublisherID, &c.LinkID} {
		v, n := binary.Uvarint(rest)
		if n <= 0 {
			return Click{}, ErrMalformed
		}
		*dst = int64(v)
		rest = rest[n:]
	}
	if len(rest) != 0 {
		return Click{}, ErrMalformed
	}
	return c, nil
}

func (s *Signer) mac(b []byte) []byte {
	m := hmac.New(sha256.New, s.key)
	m.Write(b)
	return m.Sum(nil)[:macLen]
}
