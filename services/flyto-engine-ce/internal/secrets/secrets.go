// Package secrets encrypts connector credentials (OAuth tokens, API keys,
// NAS passwords, …) before they hit the database.
//
// Design:
//
//   - Envelope encryption. Each payload is sealed with a per-message 256-bit
//     data key (DEK) using AES-GCM. The DEK is itself sealed with a master
//     key (KEK) loaded from the KMS at boot; the DB only stores the sealed
//     DEK + sealed payload + GCM nonce. Rotating the KEK re-seals the DEKs
//     without touching the payloads.
//
//   - KMS is an interface so we can swap backends. `kms.Local` (this file)
//     loads a static 32-byte key from env / file for dev; production will
//     swap in GCP KMS / AWS KMS by implementing the same interface.
//
//   - Payloads are opaque []byte. Callers typically JSON-encode a struct
//     before sealing, JSON-decode after opening.
//
// Rotation story: to rotate the KEK, load old + new, decrypt every sealed
// DEK with the old, re-seal with the new, update rows. Not implemented
// here — land with the first real rotation need.
package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
)

// SealedBundle is what the DB stores. All fields base64-encoded in JSON;
// this struct is the in-memory shape.
type SealedBundle struct {
	SealedDEK []byte // KEK-encrypted 32-byte DEK
	Nonce     []byte // 12-byte GCM nonce used for the payload
	Payload   []byte // DEK-encrypted payload
}

// KMS is the interface implementations must satisfy. Keep it small: a KMS
// just wraps/unwraps a DEK with its master key.
type KMS interface {
	// Wrap seals dek (must be 32 bytes for AES-256) with the master key.
	Wrap(ctx interface{}, dek []byte) ([]byte, error)
	// Unwrap reverses Wrap.
	Unwrap(ctx interface{}, sealed []byte) ([]byte, error)
	// KeyID identifies the master key for rotation bookkeeping; returned in
	// logs and optionally persisted alongside sealed bundles.
	KeyID() string
}

// Store wraps a KMS with the GCM-based envelope primitives. Construct with
// New and call Seal / Open.
type Store struct {
	kms KMS
}

// New builds a Store bound to the given KMS.
func New(kms KMS) *Store { return &Store{kms: kms} }

// KMS returns the underlying key service — occasionally useful for
// diagnostics (e.g. logging KeyID on decrypt failure).
func (s *Store) KMS() KMS { return s.kms }

// Seal encrypts plaintext and returns the bundle ready to persist.
func (s *Store) Seal(plaintext []byte) (*SealedBundle, error) {
	dek := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, dek); err != nil {
		return nil, fmt.Errorf("secrets: gen dek: %w", err)
	}
	block, err := aes.NewCipher(dek)
	if err != nil {
		return nil, fmt.Errorf("secrets: aes: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("secrets: gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, fmt.Errorf("secrets: nonce: %w", err)
	}
	ct := gcm.Seal(nil, nonce, plaintext, nil)

	sealedDEK, err := s.kms.Wrap(nil, dek)
	if err != nil {
		return nil, fmt.Errorf("secrets: wrap dek: %w", err)
	}
	return &SealedBundle{SealedDEK: sealedDEK, Nonce: nonce, Payload: ct}, nil
}

// Open reverses Seal.
func (s *Store) Open(b *SealedBundle) ([]byte, error) {
	if b == nil {
		return nil, errors.New("secrets: nil bundle")
	}
	dek, err := s.kms.Unwrap(nil, b.SealedDEK)
	if err != nil {
		return nil, fmt.Errorf("secrets: unwrap dek: %w", err)
	}
	defer zero(dek) // best-effort wipe once we're done
	block, err := aes.NewCipher(dek)
	if err != nil {
		return nil, fmt.Errorf("secrets: aes: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("secrets: gcm: %w", err)
	}
	pt, err := gcm.Open(nil, b.Nonce, b.Payload, nil)
	if err != nil {
		return nil, fmt.Errorf("secrets: open: %w", err)
	}
	return pt, nil
}

// zero overwrites a byte slice in place. Best-effort — the Go runtime may
// have already copied it elsewhere, but wiping at least removes the copy
// held by the Store during Open.
func zero(b []byte) {
	for i := range b {
		b[i] = 0
	}
}

// ----------------------------------------------------------------------------
// Local KMS (dev / single-instance default)
// ----------------------------------------------------------------------------

// LocalKMS wraps/unwraps DEKs with a static 32-byte master key via AES-GCM.
// Use NewLocalKMSFromEnv / NewLocalKMSFromFile in production single-node
// deployments; swap in a cloud KMS implementation for multi-instance.
type LocalKMS struct {
	masterKey []byte
	keyID     string
}

// NewLocalKMS builds a LocalKMS from a raw 32-byte key + human identifier.
func NewLocalKMS(masterKey []byte, keyID string) (*LocalKMS, error) {
	if len(masterKey) != 32 {
		return nil, fmt.Errorf("secrets: master key must be 32 bytes, got %d", len(masterKey))
	}
	if keyID == "" {
		keyID = "local"
	}
	return &LocalKMS{masterKey: append([]byte(nil), masterKey...), keyID: keyID}, nil
}

// NewLocalKMSFromEnv reads FLYTO_MASTER_KEY (base64-encoded 32 bytes) and
// FLYTO_MASTER_KEY_ID (optional). Fails if the env var is missing or not
// 32 bytes after decoding.
func NewLocalKMSFromEnv() (*LocalKMS, error) {
	raw := os.Getenv("FLYTO_MASTER_KEY")
	if raw == "" {
		return nil, errors.New("secrets: FLYTO_MASTER_KEY unset")
	}
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil {
		return nil, fmt.Errorf("secrets: decode master key: %w", err)
	}
	return NewLocalKMS(key, os.Getenv("FLYTO_MASTER_KEY_ID"))
}

// Wrap implements KMS.
func (k *LocalKMS) Wrap(_ interface{}, dek []byte) ([]byte, error) {
	block, err := aes.NewCipher(k.masterKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	ct := gcm.Seal(nil, nonce, dek, nil)
	// Prepend the nonce so Unwrap can extract it without a separate field.
	return append(nonce, ct...), nil
}

// Unwrap implements KMS.
func (k *LocalKMS) Unwrap(_ interface{}, sealed []byte) ([]byte, error) {
	block, err := aes.NewCipher(k.masterKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	ns := gcm.NonceSize()
	if len(sealed) < ns {
		return nil, errors.New("secrets: sealed data truncated")
	}
	nonce, ct := sealed[:ns], sealed[ns:]
	return gcm.Open(nil, nonce, ct, nil)
}

// KeyID implements KMS.
func (k *LocalKMS) KeyID() string { return k.keyID }
