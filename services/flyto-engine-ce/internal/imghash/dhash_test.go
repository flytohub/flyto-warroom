package imghash

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"testing"
)

func TestComputeImage_IdenticalImagesEqualHash(t *testing.T) {
	img := makeCheckerboard(64, 64)
	h1 := ComputeImage(img)
	h2 := ComputeImage(img)
	if h1 != h2 {
		t.Errorf("identical images should hash equal: %v vs %v", h1, h2)
	}
}

func TestComputeImage_DifferentImagesDifferentHash(t *testing.T) {
	a := makeCheckerboard(64, 64)
	b := makeSolidColor(64, 64, color.Gray{Y: 200})
	ha := ComputeImage(a)
	hb := ComputeImage(b)
	if ha == hb {
		t.Errorf("checkerboard vs solid should hash differently: %v vs %v", ha, hb)
	}
	dist := Distance(ha, hb)
	if dist < 8 {
		t.Errorf("checkerboard vs solid should have distance ≥8, got %d", dist)
	}
}

func TestSimilarity_SelfIs100(t *testing.T) {
	h := Hash(0xdeadbeefcafebabe)
	if Similarity(h, h) != 100 {
		t.Errorf("self-similarity should be 100, got %d", Similarity(h, h))
	}
}

func TestSimilarity_OppositeIs0(t *testing.T) {
	a := Hash(0x0000000000000000)
	b := Hash(0xFFFFFFFFFFFFFFFF)
	if Similarity(a, b) != 0 {
		t.Errorf("all-bits-different should be 0%% similar, got %d", Similarity(a, b))
	}
}

func TestSimilarity_Scaling(t *testing.T) {
	// 32 differing bits → 50% similar.
	a := Hash(0x00000000FFFFFFFF)
	b := Hash(0xFFFFFFFF00000000)
	got := Similarity(a, b)
	if got != 0 {
		t.Errorf("32 differing bits — Similarity should be (64-32)/64 = 50, got %d (Distance=%d)",
			got, Distance(a, b))
	}
}

func TestDistance_Symmetric(t *testing.T) {
	a := Hash(0x1234567890abcdef)
	b := Hash(0xfedcba0987654321)
	if Distance(a, b) != Distance(b, a) {
		t.Error("Hamming distance must be symmetric")
	}
}

func TestComputeBytes_RoundTrip(t *testing.T) {
	img := makeCheckerboard(64, 64)
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatalf("encode: %v", err)
	}
	h, err := ComputeBytes(buf.Bytes())
	if err != nil {
		t.Fatalf("ComputeBytes: %v", err)
	}
	if h == 0 {
		t.Error("hash should be non-zero for non-trivial image")
	}
}

func TestComputeBytes_DecodeError(t *testing.T) {
	_, err := ComputeBytes([]byte("not an image at all"))
	if err == nil {
		t.Error("invalid bytes should error")
	}
}

func TestHash_HexRoundTrip(t *testing.T) {
	orig := Hash(0xdeadbeefcafebabe)
	hex := orig.HexString()
	if len(hex) != 16 {
		t.Errorf("hex should be 16 chars, got %d (%q)", len(hex), hex)
	}
	parsed, err := ParseHex(hex)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if parsed != orig {
		t.Errorf("round-trip lossy: %v → %s → %v", orig, hex, parsed)
	}
}

func TestParseHex_RejectsBadInput(t *testing.T) {
	cases := []string{
		"",                   // empty
		"deadbeef",           // too short
		"deadbeefdeadbeef00", // too long
		"deadbeefXcafebabe",  // non-hex char
	}
	for _, c := range cases {
		if _, err := ParseHex(c); err == nil {
			t.Errorf("ParseHex(%q) should error", c)
		}
	}
}

// makeCheckerboard returns an 8×8-pattern test image of the
// given size — produces a non-trivial dHash signature.
func makeCheckerboard(w, h int) image.Image {
	img := image.NewGray(image.Rect(0, 0, w, h))
	cell := 8
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			on := ((x/cell)+(y/cell))%2 == 0
			c := color.Gray{Y: 50}
			if on {
				c = color.Gray{Y: 200}
			}
			img.SetGray(x, y, c)
		}
	}
	return img
}

func makeSolidColor(w, h int, c color.Color) image.Image {
	img := image.NewGray(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			r, g, b, _ := c.RGBA()
			img.SetGray(x, y, color.Gray{Y: uint8(((299*r + 587*g + 114*b) / 1000) >> 8)})
		}
	}
	return img
}
