SHELL := /bin/sh
ENV_CE ?= install/.env
ENV_EE_SIM ?= install/.env.ee-sim
DOCKER_COMPOSE ?= $(shell if docker compose version >/dev/null 2>&1; then printf 'docker compose'; elif command -v docker-compose >/dev/null 2>&1; then printf 'docker-compose'; else printf 'docker compose'; fi)
COMPOSE_CE = $(DOCKER_COMPOSE) --env-file $(ENV_CE) -f install/docker-compose.ce.yml
COMPOSE_EE_SIM = $(DOCKER_COMPOSE) --env-file $(ENV_EE_SIM) -f install/docker-compose.ce.yml -f install/docker-compose.ee-sim.yml

.PHONY: setup-ce preflight verify-images ce-up ce-down ce-logs ce-ps ce-reset-db ee-sim-up ee-sim-down ee-sim-logs audit build-local-images

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

ee-sim-up:
	$(COMPOSE_EE_SIM) up -d

ee-sim-down:
	$(COMPOSE_EE_SIM) down

ee-sim-logs:
	$(COMPOSE_EE_SIM) logs -f --tail=200

audit:
	python3 install/scripts/audit-release-tree.py .
	python3 scripts/audit-ce-boundary.py .
	python3 scripts/audit-github-protection.py .

preflight:
	python3 install/scripts/preflight.py --env $(ENV_CE)

verify-images:
	python3 install/scripts/verify-docker-images.py

build-local-images:
	sh install/scripts/build-local-images.sh /Users/chester/flytohub
