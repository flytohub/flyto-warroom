package ceauth

import (
	"strings"
	"testing"
	"time"
)

func TestPasswordAndJWTLifecycle(t *testing.T) {
	password := "Warroom!Secure123"
	hash, err := HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(hash, "bcrypt:") || strings.Contains(hash, password) {
		t.Fatalf("unsafe hash %q", hash)
	}
	if err = CheckPassword(hash, password); err != nil {
		t.Fatal(err)
	}
	if err = CheckPassword(hash, "wrong-password"); err == nil {
		t.Fatal("wrong password accepted")
	}
	mgr, err := New(strings.Repeat("s", 32), time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	token, err := mgr.Mint("usr_1", "admin@flyto2.com", "Admin")
	if err != nil {
		t.Fatal(err)
	}
	claims, err := mgr.Verify(token)
	if err != nil {
		t.Fatal(err)
	}
	if claims.Subject != "usr_1" || claims.Email != "admin@flyto2.com" {
		t.Fatalf("claims=%#v", claims)
	}
}

func TestPasswordPolicy(t *testing.T) {
	for _, password := range []string{"short", "alllowercase123!", "ALLUPPERCASE123!", "NoDigitsAllowed!", "NoSymbols12345"} {
		if ValidatePassword(password) == nil {
			t.Fatalf("accepted weak password %q", password)
		}
	}
}
