package imghash

// Package imghash — perceptual image hashing without external
// deps. Used by the visual phishing similarity pipeline to
// compare a candidate phishing page's screenshot against the
// operator's known-good login page.
//
// We use dHash (difference hash) rather than aHash (average)
// or pHash (DCT). Trade-offs:
//
//   - dHash is simpler than pHash (no DCT) but more robust to
//     brightness / contrast changes than aHash.
//   - 64-bit hash fits in a uint64 for fast storage + compare.
//   - Hamming distance between hashes is the similarity metric:
//     0  → identical (or near-identical)
//     <8 → very similar (likely intentional copy)
//     <16 → similar
//     ≥30 → unrelated images
//
// Why this matters for Flyto2: the lookalike domain pipeline
// already screenshots candidate phishing pages. A typo-squat
// that looks 99% like your login page is a different kind of
// threat than a typo-squat that resolves to a parked-domain
// landing page. dHash gives operators that distinction.

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/color"
	_ "image/gif"  // register decoders
	_ "image/jpeg" //  ↑
	_ "image/png"  //  ↑
	"io"
	"math/bits"
)

// Hash is a 64-bit perceptual hash. Stored as uint64 (8 bytes)
// rather than 16-char hex so distance computation stays a
// single XOR + popcount.
type Hash uint64

// HexString renders the hash as 16-char lowercase hex for
// storage in JSON metadata. Inverse of ParseHex.
func (h Hash) HexString() string {
	return fmt.Sprintf("%016x", uint64(h))
}

// ParseHex reads back a hash previously serialized via HexString.
// Returns an error when the input isn't exactly 16 lowercase hex
// chars — the caller almost always already has a hash and should
// surface the corrupt case loudly rather than treat as zero.
func ParseHex(s string) (Hash, error) {
	if len(s) != 16 {
		return 0, fmt.Errorf("imghash: hex must be 16 chars, got %d", len(s))
	}
	var v uint64
	for i := 0; i < 16; i++ {
		c := s[i]
		var nib byte
		switch {
		case c >= '0' && c <= '9':
			nib = c - '0'
		case c >= 'a' && c <= 'f':
			nib = c - 'a' + 10
		case c >= 'A' && c <= 'F':
			nib = c - 'A' + 10
		default:
			return 0, fmt.Errorf("imghash: invalid hex char %q at position %d", c, i)
		}
		v = (v << 4) | uint64(nib)
	}
	return Hash(v), nil
}

// Compute returns the dHash for the image read from r. Supports
// PNG, JPEG, GIF (stdlib decoders). For other formats the caller
// should decode first and call ComputeImage.
func Compute(r io.Reader) (Hash, error) {
	img, _, err := image.Decode(r)
	if err != nil {
		return 0, fmt.Errorf("imghash: decode: %w", err)
	}
	return ComputeImage(img), nil
}

// ComputeBytes is the convenience form for callers that already
// have a byte slice (e.g. from CAS storage).
func ComputeBytes(b []byte) (Hash, error) {
	return Compute(bytes.NewReader(b))
}

// ComputeImage computes the dHash directly on a decoded image.
// The algorithm:
//
//  1. Resize to 9×8 grayscale (8 rows × 9 cols).
//  2. Compute 8×8 difference matrix: bit = 1 if left > right.
//  3. Pack the 64 bits into a uint64, MSB-first row-major.
//
// We resize with nearest-neighbor sampling — perceptual hashes
// don't need pretty downscaling, and bilinear/Lanczos would
// just add CPU + deps.
func ComputeImage(img image.Image) Hash {
	const cols, rows = 9, 8
	gray := resizeGrayNearest(img, cols, rows)

	var h uint64
	for y := 0; y < rows; y++ {
		for x := 0; x < cols-1; x++ {
			left := gray[y*cols+x]
			right := gray[y*cols+x+1]
			h <<= 1
			if left > right {
				h |= 1
			}
		}
	}
	return Hash(h)
}

// resizeGrayNearest downsamples an image to width×height
// grayscale via nearest-neighbor sampling. Returns the raw
// 8-bit grayscale matrix in row-major order. We do this by
// hand because pulling x/image/draw + a resampler just for
// downsampling-to-72-pixels is gross.
func resizeGrayNearest(img image.Image, width, height int) []uint8 {
	out := make([]uint8, width*height)
	b := img.Bounds()
	srcW, srcH := b.Dx(), b.Dy()
	if srcW <= 0 || srcH <= 0 {
		return out
	}
	for y := 0; y < height; y++ {
		// nearest-neighbor: map output row → input row
		sy := b.Min.Y + (y*srcH)/height
		for x := 0; x < width; x++ {
			sx := b.Min.X + (x*srcW)/width
			out[y*width+x] = grayAt(img, sx, sy)
		}
	}
	return out
}

// grayAt returns the ITU-R BT.601 luma of the pixel at (x,y).
// We do the conversion by hand rather than wrapping the
// `image.Image.At()` result in color.GrayModel.Convert because
// the latter goes through the alpha-premultiplied 16-bit path
// which is needlessly slow for a 72-pixel sample.
func grayAt(img image.Image, x, y int) uint8 {
	r, g, b, _ := img.At(x, y).RGBA()
	// At() returns values in [0, 0xffff]. Standard luma weights.
	luma := (299*r + 587*g + 114*b) / 1000
	return uint8(luma >> 8)
}

// Distance returns the Hamming distance between two hashes —
// the number of differing bits, in [0, 64].
func Distance(a, b Hash) int {
	return bits.OnesCount64(uint64(a) ^ uint64(b))
}

// Similarity converts Hamming distance to a 0-100 percentage,
// inverted so 100 = identical, 0 = maximally different. UI
// shows "92% visually similar to your login page" — that's
// this value.
func Similarity(a, b Hash) int {
	d := Distance(a, b)
	if d > 64 {
		d = 64
	}
	return 100 * (64 - d) / 64
}

// ErrEmptyImage signals the caller passed a zero-dimensional
// image. Returned when the screenshot pipeline catches a
// blank/missing capture.
var ErrEmptyImage = errors.New("imghash: empty image")

// Ensure color.Color isn't dropped by linters when we
// reorganize — used by grayAt indirectly via img.At().
var _ = color.GrayModel
