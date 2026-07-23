SHELL := /bin/sh
ENV_CE ?= install/.env
ENV_EE_SIM ?= install/.env.ee-sim
DOCKER_COMPOSE ?= $(shell if docker compose version >/dev/null 2>&1; then printf 'docker compose'; elif command -v docker-compose >/dev/null 2>&1; then printf 'docker-compose'; else printf 'docker compose'; fi)
COMPOSE_CE = $(DOCKER_COMPOSE) --env-file $(ENV_CE) -f install/docker-compose.ce.yml
COMPOSE_EE_SIM = $(DOCKER_COMPOSE) --env-file $(ENV_EE_SIM) -f install/docker-compose.ce.yml -f install/docker-compose.ee-sim.yml
COMPOSE_SOURCE = $(DOCKER_COMPOSE) --env-file $(ENV_CE) -f install/docker-compose.source.yml

.PHONY: setup-ce preflight lint test backend-test frontend-test contracts-test docs docs-check verify verify-images ce-up ce-down ce-logs ce-ps ce-smoke ce-reset-db source-build source-up source-down source-logs source-smoke ee-sim-up ee-sim-down ee-sim-logs audit open-core-audit positioning-audit demo-seed-dry-run provider-readiness provider-readiness-strict public-release-check build-local-images

setup-ce:
	python3 install/scripts/setup-ce.py

ce-up:
	$(COMPOSE_CE) up -d

ce-down:
	$(COMPOSE_CE) down

ce-logs:
	$(COMPOSE_CE) logs -f --tail=200

ce-ps:
	$(COMPOSE_CE) ps

ce-reset-db:
	$(COMPOSE_CE) down
	docker volume rm flyto2-warroom-ce_pgdata || true

source-build:
	$(COMPOSE_SOURCE) build

source-up:
	$(COMPOSE_SOURCE) up -d --build

source-down:
	$(COMPOSE_SOURCE) down

source-logs:
	$(COMPOSE_SOURCE) logs -f --tail=200

source-smoke:
	python3 install/scripts/smoke-source-stack.py

ee-sim-up:
	$(COMPOSE_EE_SIM) up -d

ee-sim-down:
	$(COMPOSE_EE_SIM) down

ee-sim-logs:
	$(COMPOSE_EE_SIM) logs -f --tail=200

audit:
	python3 install/scripts/audit-release-tree.py .
	python3 scripts/audit-ce-boundary.py .
	python3 scripts/audit-provenance.py .
	python3 scripts/audit-open-core-overlay.py .
	python3 scripts/audit-github-protection.py .
	python3 scripts/audit-positioning.py .
	python3 install/scripts/seed-demo-workspace.py --dry-run
	python3 install/scripts/provider-readiness.py --scope public_release --allow-provider-blocked

open-core-audit:
	python3 scripts/audit-open-core-overlay.py .

positioning-audit:
	python3 scripts/audit-positioning.py .

demo-seed-dry-run:
	python3 install/scripts/seed-demo-workspace.py --dry-run

provider-readiness:
	python3 install/scripts/provider-readiness.py --scope public_release --allow-provider-blocked

provider-readiness-strict:
	python3 install/scripts/provider-readiness.py --scope public_release

docs:
	flyto-index verify . --full-scan --json >/dev/null
	python3 scripts/generate-documentation-reference.py

docs-check:
	python3 scripts/generate-documentation-reference.py --check

lint: audit

backend-test:
	go -C services/flyto-engine-ce test ./...

frontend-test:
	npm --prefix packages/flyto-code ci --legacy-peer-deps
	npm --prefix packages/flyto-code audit --audit-level=high
	npm --prefix packages/flyto-code run test
	npm --prefix packages/flyto-code run build

contracts-test:
	python3 packages/flyto-contracts/conformance/validate.py runner-callback packages/flyto-contracts/examples/runner-callback.json
	python3 packages/flyto-contracts/conformance/validate.py evidence-event packages/flyto-contracts/examples/evidence-event.json
	python3 packages/flyto-contracts/conformance/validate.py run-ledger-event packages/flyto-contracts/examples/run-ledger-event.json
	python3 packages/flyto-contracts/conformance/validate.py artifact-signature packages/flyto-contracts/examples/artifact-signature.json
	python3 packages/flyto-contracts/conformance/validate.py livefix-plan packages/flyto-contracts/examples/livefix-plan.json

test: backend-test frontend-test contracts-test

verify: lint test
	python3 install/scripts/verify-docker-images.py --dry-run

preflight:
	python3 install/scripts/preflight.py --env $(ENV_CE)

verify-images:
	python3 install/scripts/verify-docker-images.py

ce-smoke:
	python3 install/scripts/smoke-ce-stack.py --env $(ENV_CE)

public-release-check: verify provider-readiness-strict

build-local-images:
	sh install/scripts/build-local-images.sh /Users/chester/flytohub
