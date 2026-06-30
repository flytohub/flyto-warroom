PYTHON ?= python3

.PHONY: lint test build verify

lint:
	$(PYTHON) -m compileall -q scripts

test:
	$(PYTHON) scripts/validate.py --strict
	$(PYTHON) scripts/coverage.py

build:
	$(PYTHON) scripts/build-dist.py

verify: lint test build
