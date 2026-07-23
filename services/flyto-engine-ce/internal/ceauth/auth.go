// Package ceauth provides the local-only Community Edition identity boundary.
// It has no Firebase, SaaS, billing, or hosted control-plane dependency.
package ceauth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"

	"golang.org/x/crypto/bcrypt"
)

type Claims struct {
	Subject     string `json:"sub"`
	Email       string `json:"email"`
	DisplayName string `json:"name"`
	Issuer      string `json:"iss"`
	IssuedAt    int64  `json:"iat"`
	ExpiresAt   int64  `json:"exp"`
}

type Manager struct {
	secret []byte
	ttl    time.Duration
	now    func() time.Time
}

func New(secret string, ttl time.Duration) (*Manager, error) {
	if len(secret) < 32 {
		return nil, errors.New("FLYTO_LOCAL_AUTH_JWT_SECRET must contain at least 32 characters")
	}
	if ttl <= 0 {
		ttl = 12 * time.Hour
	}
	return &Manager{secret: []byte(secret), ttl: ttl, now: time.Now}, nil
}

func ValidatePassword(password string) error {
	if len(password) < 12 {
		return errors.New("password must contain at least 12 characters")
	}
	var upper, lower, digit, symbol bool
	for _, r := range password {
		switch {
		case unicode.IsUpper(r):
			upper = true
		case unicode.IsLower(r):
			lower = true
		case unicode.IsDigit(r):
			digit = true
		case unicode.IsPunct(r) || unicode.IsSymbol(r):
			symbol = true
		}
	}
	if !upper || !lower || !digit || !symbol {
		return errors.New("password must include upper-case, lower-case, number, and symbol characters")
	}
	return nil
}

func HashPassword(password string) (string, error) {
	if err := ValidatePassword(password); err != nil {
		return "", err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return "", err
	}
	return "bcrypt:" + string(hash), nil
}

func CheckPassword(hash, password string) error {
	if !strings.HasPrefix(hash, "bcrypt:") {
		return errors.New("unsupported password hash")
	}
	return bcrypt.CompareHashAndPassword([]byte(strings.TrimPrefix(hash, "bcrypt:")), []byte(password))
}

func (m *Manager) Mint(subject, email, displayName string) (string, error) {
	now := m.now().UTC()
	claims := Claims{Subject: subject, Email: email, DisplayName: displayName, Issuer: "flyto-warroom-ce", IssuedAt: now.Unix(), ExpiresAt: now.Add(m.ttl).Unix()}
	header, err := encodePart(map[string]string{"alg": "HS256", "typ": "JWT"})
	if err != nil {
		return "", err
	}
	payload, err := encodePart(claims)
	if err != nil {
		return "", err
	}
	unsigned := header + "." + payload
	return unsigned + "." + m.signature(unsigned), nil
}

func (m *Manager) Verify(token string) (Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Claims{}, errors.New("invalid token")
	}
	if !hmac.Equal([]byte(parts[2]), []byte(m.signature(parts[0]+"."+parts[1]))) {
		return Claims{}, errors.New("invalid token signature")
	}
	var header struct {
		Alg string `json:"alg"`
		Typ string `json:"typ"`
	}
	if err := decodePart(parts[0], &header); err != nil || header.Alg != "HS256" || header.Typ != "JWT" {
		return Claims{}, errors.New("invalid token header")
	}
	var claims Claims
	if err := decodePart(parts[1], &claims); err != nil {
		return Claims{}, errors.New("invalid token claims")
	}
	if claims.Issuer != "flyto-warroom-ce" || claims.Subject == "" || claims.ExpiresAt <= m.now().Unix() {
		return Claims{}, errors.New("token expired or invalid")
	}
	return claims, nil
}

func (m *Manager) signature(unsigned string) string {
	mac := hmac.New(sha256.New, m.secret)
	_, _ = mac.Write([]byte(unsigned))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}
func encodePart(value any) (string, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}
func decodePart(part string, value any) error {
	raw, err := base64.RawURLEncoding.DecodeString(part)
	if err != nil {
		return fmt.Errorf("base64: %w", err)
	}
	return json.Unmarshal(raw, value)
}
