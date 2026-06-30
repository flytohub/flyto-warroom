SHELL := /bin/sh
ENV_CE ?= install/.env
ENV_EE_SIM ?= install/.env.ee-sim
COMPOSE_CE = docker compose --env-file $(ENV_CE) -f install/docker-compose.ce.yml
COMPOSE_EE_SIM = docker compose --env-file $(ENV_EE_SIM) -f install/docker-compose.ce.yml -f install/docker-compose.ee-sim.yml

.PHONY: ce-up ce-down ce-logs ce-ps ce-reset-db ee-sim-up ee-sim-down ee-sim-logs audit build-local-images

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

build-local-images:
	sh install/scripts/build-local-images.sh /Users/chester/flytohub
