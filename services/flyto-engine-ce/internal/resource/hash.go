package resource

import (
	"crypto/sha256"
	"encoding/hex"
	"io"
	"os"
)

// ComputeContentHash returns SHA-256[:16] hex of the given bytes
func ComputeContentHash(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])[:16]
}

// ComputeFileHash returns SHA-256[:16] hex of a file
func ComputeFileHash(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil))[:16], nil
}

// ComputeStringHash returns SHA-256[:16] hex of a string
func ComputeStringHash(s string) string {
	return ComputeContentHash([]byte(s))
}

// HashesMatch checks if two hashes are equal
func HashesMatch(a, b string) bool {
	return a == b
}
