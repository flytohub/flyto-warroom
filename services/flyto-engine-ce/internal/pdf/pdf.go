// Package pdf is a tiny, zero-dependency PDF generator for server-side report
// export (VA report, security report, compliance summary). It lays text out
// into paginated pages using the PDF core Helvetica fonts (no font embedding,
// no headless browser, no external module). It is intentionally minimal:
// headings + wrapped body text + page breaks — enough for an exec-ready
// document, not a full layout engine.
//
// Why this exists: report PDF used to be produced by the browser's print
// dialog, so there was no server-side PDF at all (an API consumer or a
// scheduled job could not get a PDF). This makes "exec-ready PDF export" a
// real server capability without taking on a chromedp/wkhtmltopdf dependency.
package pdf

import (
	"bytes"
	"fmt"
	"html"
	"regexp"
	"strings"
)

const (
	pageWidth   = 612 // US Letter, points
	pageHeight  = 792
	marginX     = 72
	topY        = 730
	bottomY     = 60
	bodySize    = 10
	headingSize = 15
	leading     = 16
	wrapCols    = 95 // approx chars/line for Helvetica 10pt across the text column
)

type lineKind int

const (
	kindBody lineKind = iota
	kindHeading
	kindBlank
)

type line struct {
	text string
	kind lineKind
}

// Builder accumulates content; call Build for the PDF bytes.
type Builder struct {
	title string
	lines []line
}

// New starts a document with a title (rendered as the first heading).
func New(title string) *Builder {
	b := &Builder{title: title}
	if title != "" {
		b.Heading(title)
		b.Blank()
	}
	return b
}

// Heading appends a heading line (larger font).
func (b *Builder) Heading(s string) *Builder {
	b.lines = append(b.lines, line{text: s, kind: kindHeading})
	return b
}

// Text appends body text, wrapped to the column width across multiple lines.
func (b *Builder) Text(s string) *Builder {
	for _, w := range wrap(s, wrapCols) {
		b.lines = append(b.lines, line{text: w, kind: kindBody})
	}
	return b
}

// Blank appends vertical space.
func (b *Builder) Blank() *Builder {
	b.lines = append(b.lines, line{kind: kindBlank})
	return b
}

// FromMarkdown is a convenience wrapper: lines starting with "#" become
// headings, "- " / "* " become bullet body lines, everything else is body
// text. It is deliberately simple — not a full Markdown renderer.
func FromMarkdown(title, md string) []byte {
	b := New(title)
	for _, raw := range strings.Split(md, "\n") {
		t := strings.TrimRight(raw, "\r")
		trimmed := strings.TrimSpace(t)
		switch {
		case trimmed == "":
			b.Blank()
		case strings.HasPrefix(trimmed, "#"):
			b.Heading(strings.TrimSpace(strings.TrimLeft(trimmed, "#")))
		case strings.HasPrefix(trimmed, "- "), strings.HasPrefix(trimmed, "* "):
			b.Text("• " + trimmed[2:])
		default:
			b.Text(trimmed)
		}
	}
	return b.Build()
}

var (
	// One regex per tag: Go's RE2 has no backreferences, so we cannot key the
	// closing tag off the captured opening tag (`\1`). Stripping each tag
	// independently is equivalent here — every match is dropped anyway.
	reHTMLDropScript = regexp.MustCompile(`(?is)<script[^>]*>.*?</\s*script\s*>`)
	reHTMLDropStyle  = regexp.MustCompile(`(?is)<style[^>]*>.*?</\s*style\s*>`)
	reHTMLDropHead   = regexp.MustCompile(`(?is)<head[^>]*>.*?</\s*head\s*>`)
	reHTMLHeading    = regexp.MustCompile(`(?is)<h[1-3][^>]*>(.*?)</\s*h[1-3]\s*>`)
	reHTMLBreak      = regexp.MustCompile(`(?i)<\s*(br|/p|/div|/li|/tr|/h[1-6])\s*/?>`)
	reHTMLTag        = regexp.MustCompile(`(?s)<[^>]+>`)
	reSpaces         = regexp.MustCompile(`[ \t]+`)
)

// FromHTML renders an HTML document to a basic text PDF. It is a dependency-
// free fallback for the external HTML→PDF service: tags are stripped, <h1-3>
// become headings, block-closing tags become line breaks. Fidelity is plain
// (no CSS/layout), but it turns a 503 "PDF service not configured" into a
// real, downloadable document.
func FromHTML(title, htmlDoc string) []byte {
	s := reHTMLDropScript.ReplaceAllString(htmlDoc, "")
	s = reHTMLDropStyle.ReplaceAllString(s, "")
	s = reHTMLDropHead.ReplaceAllString(s, "")
	s = reHTMLHeading.ReplaceAllString(s, "\n\x00$1\x00\n") // \x00 marks heading bounds
	s = reHTMLBreak.ReplaceAllString(s, "\n")
	s = reHTMLTag.ReplaceAllString(s, "")
	s = html.UnescapeString(s)

	b := New(title)
	for _, raw := range strings.Split(s, "\n") {
		seg := strings.TrimSpace(reSpaces.ReplaceAllString(raw, " "))
		if seg == "" {
			b.Blank()
			continue
		}
		if strings.HasPrefix(seg, "\x00") && strings.HasSuffix(seg, "\x00") {
			b.Heading(strings.Trim(seg, "\x00"))
			continue
		}
		b.Text(strings.ReplaceAll(seg, "\x00", ""))
	}
	return b.Build()
}

// linesPerPage is how many leading-height rows fit in the text column.
func linesPerPage() int {
	n := (topY - bottomY) / leading
	if n < 1 {
		return 1
	}
	return n
}

// Build renders the PDF document bytes.
func (b *Builder) Build() []byte {
	// Paginate.
	per := linesPerPage()
	var pages [][]line
	for i := 0; i < len(b.lines); i += per {
		end := i + per
		if end > len(b.lines) {
			end = len(b.lines)
		}
		pages = append(pages, b.lines[i:end])
	}
	if len(pages) == 0 {
		pages = [][]line{{}}
	}

	// Object plan: 1 Catalog, 2 Pages, 3 Helvetica, 4 Helvetica-Bold,
	// then (page, content) pairs.
	const objCatalog, objPages, objFont, objFontBold = 1, 2, 3, 4
	firstPageObj := 5
	pageObjNums := make([]int, len(pages))
	for i := range pages {
		pageObjNums[i] = firstPageObj + i*2
	}
	totalObjs := 4 + len(pages)*2

	var buf bytes.Buffer
	offsets := make([]int, totalObjs+1) // 1-indexed
	writeObj := func(num int, body string) {
		offsets[num] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n%s\nendobj\n", num, body)
	}

	buf.WriteString("%PDF-1.4\n")

	// Catalog + Pages.
	writeObj(objCatalog, fmt.Sprintf("<< /Type /Catalog /Pages %d 0 R >>", objPages))
	kids := make([]string, len(pageObjNums))
	for i, n := range pageObjNums {
		kids[i] = fmt.Sprintf("%d 0 R", n)
	}
	writeObj(objPages, fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>",
		strings.Join(kids, " "), len(pages)))
	writeObj(objFont, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
	writeObj(objFontBold, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")

	// Page + content objects.
	for i, pg := range pages {
		pageObj := pageObjNums[i]
		contentObj := pageObj + 1
		stream := contentStream(pg)
		pageDict := fmt.Sprintf(
			"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 %d %d] "+
				"/Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> /Contents %d 0 R >>",
			objPages, pageWidth, pageHeight, objFont, objFontBold, contentObj)
		writeObj(pageObj, pageDict)

		offsets[contentObj] = buf.Len()
		fmt.Fprintf(&buf, "%d 0 obj\n<< /Length %d >>\nstream\n%s\nendstream\nendobj\n",
			contentObj, len(stream), stream)
	}

	// xref + trailer.
	xrefStart := buf.Len()
	fmt.Fprintf(&buf, "xref\n0 %d\n", totalObjs+1)
	buf.WriteString("0000000000 65535 f \n")
	for i := 1; i <= totalObjs; i++ {
		fmt.Fprintf(&buf, "%010d 00000 n \n", offsets[i])
	}
	fmt.Fprintf(&buf, "trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n",
		totalObjs+1, objCatalog, xrefStart)

	return buf.Bytes()
}

// contentStream renders one page's lines into a PDF text content stream.
func contentStream(lines []line) string {
	var b strings.Builder
	b.WriteString("BT\n")
	fmt.Fprintf(&b, "%d %d Td\n", marginX, topY)
	fmt.Fprintf(&b, "%d TL\n", leading)
	for _, ln := range lines {
		switch ln.kind {
		case kindBlank:
			b.WriteString("T*\n")
		case kindHeading:
			fmt.Fprintf(&b, "/F2 %d Tf\n(%s) Tj\nT*\n", headingSize, escapePDFText(ln.text))
		default:
			fmt.Fprintf(&b, "/F1 %d Tf\n(%s) Tj\nT*\n", bodySize, escapePDFText(ln.text))
		}
	}
	b.WriteString("ET")
	return b.String()
}

// escapePDFText escapes the three PDF string metacharacters and reduces
// non-WinAnsi bytes to '?' so the stream stays valid without font embedding.
func escapePDFText(s string) string {
	var b strings.Builder
	for _, r := range s {
		switch r {
		case '\\':
			b.WriteString(`\\`)
		case '(':
			b.WriteString(`\(`)
		case ')':
			b.WriteString(`\)`)
		default:
			if r >= 32 && r < 127 {
				b.WriteRune(r)
			} else {
				b.WriteByte('?')
			}
		}
	}
	return b.String()
}

// wrap breaks s into lines of at most cols characters on word boundaries.
func wrap(s string, cols int) []string {
	words := strings.Fields(s)
	if len(words) == 0 {
		return []string{""}
	}
	var out []string
	cur := ""
	for _, w := range words {
		switch {
		case cur == "":
			cur = w
		case len(cur)+1+len(w) <= cols:
			cur += " " + w
		default:
			out = append(out, cur)
			cur = w
		}
		// Hard-break a single oversized token.
		for len(cur) > cols {
			out = append(out, cur[:cols])
			cur = cur[cols:]
		}
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}
