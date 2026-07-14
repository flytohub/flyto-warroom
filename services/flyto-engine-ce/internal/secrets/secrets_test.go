package secrets

import (
	"bytes"
	"crypto/rand"
	"testing"
)

func TestSealOpenRoundtrip(t *testing.T) {
	var key [32]byte
	if _, err := rand.Read(key[:]); err != nil {
		t.Fatal(err)
	}
	kms, err := NewLocalKMS(key[:], "test")
	if err != nil {
		t.Fatal(err)
	}
	s := New(kms)

	plain := []byte(`{"access_token":"abc","refresh_token":"xyz"}`)
	bundle, err := s.Seal(plain)
	if err != nil {
		t.Fatalf("seal: %v", err)
	}
	if bytes.Equal(bundle.Payload, plain) {
		t.Fatal("payload not actually encrypted")
	}
	got, err := s.Open(bundle)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	if !bytes.Equal(got, plain) {
		t.Fatalf("roundtrip mismatch: got %s want %s", got, plain)
	}
}

func TestOpen_WrongKeyFails(t *testing.T) {
	var k1, k2 [32]byte
	_, _ = rand.Read(k1[:])
	_, _ = rand.Read(k2[:])

	kms1, _ := NewLocalKMS(k1[:], "a")
	kms2, _ := NewLocalKMS(k2[:], "b")
	s1 := New(kms1)
	s2 := New(kms2)

	bundle, err := s1.Seal([]byte("hello"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s2.Open(bundle); err == nil {
		t.Fatal("open with wrong KEK should fail")
	}
}

func TestOpen_TamperedPayloadFails(t *testing.T) {
	var key [32]byte
	_, _ = rand.Read(key[:])
	kms, _ := NewLocalKMS(key[:], "t")
	s := New(kms)

	bundle, err := s.Seal([]byte("hello"))
	if err != nil {
		t.Fatal(err)
	}
	bundle.Payload[0] ^= 0xFF
	if _, err := s.Open(bundle); err == nil {
		t.Fatal("tampered payload should fail GCM auth")
	}
}

func TestLocalKMS_RejectsWrongKeySize(t *testing.T) {
	if _, err := NewLocalKMS(make([]byte, 16), ""); err == nil {
		t.Fatal("expected failure on 16-byte key")
	}
}
