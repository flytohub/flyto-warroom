package main

import (
	"time"

	"github.com/flytohub/flyto-engine/internal/ceproductloop"
)

type ceProductLoopResponse = ceproductloop.Response

func buildCEProductLoop(now time.Time) ceProductLoopResponse {
	return ceproductloop.Build(now)
}
