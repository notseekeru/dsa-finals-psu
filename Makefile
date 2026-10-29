DEV_CMD      = docker compose -p dsa-finals-psu-dev -f compose.yml -f compose.dev.yml
PROD_CMD     = docker compose -p dsa-finals-psu-prod -f compose.yml -f compose.prod.yml
DEV_PROJECT  = dsa-finals-psu-dev
PROD_PROJECT = dsa-finals-psu-prod
FRONTEND_DEV = dsa-finals-psu_frontend_dev
BACKEND_DEV  = dsa-finals-psu_backend_dev
PORTS        = 5373 4100 5433
PROD_PORTS   = 5373 4100

exec:
	@echo "checking frontend"
	docker exec -t $(FRONTEND_DEV) sh -c "(npm run lint && npm run typecheck && npm audit) && npm outdated || true && npm prune"
	@echo "checking backend"
	docker exec -t $(BACKEND_DEV) sh -c "(npm run lint && npm run typecheck && npm audit) && npm outdated || true && npm prune"

lint:
	docker exec -t $(FRONTEND_DEV) sh -c "npm run lint"
	docker exec -t $(BACKEND_DEV) sh -c "npm run lint"

check-ports:
	@scripts/port-claimer.sh --self $(DEV_PROJECT) $(PORTS)

up: check-ports
	$(DEV_CMD) up -d

build:
	$(DEV_CMD) build

buildcache:
	$(DEV_CMD) build --no-cache

down:
	$(DEV_CMD) down

clean:
	$(DEV_CMD) down -v

logs:
	$(DEV_CMD) logs -f --tail=100

ps:
	$(DEV_CMD) ps

shell:
	docker exec -it $(BACKEND_DEV) sh

psql:
	$(DEV_CMD) run --rm psql

migrate:
	docker exec -t $(BACKEND_DEV) npm run migrate:up

rollback:
	docker exec -t $(BACKEND_DEV) npm run migrate:down

new-migration:
	@test -n "$(name)" || (echo "usage: make new-migration name=<name>" && exit 1)
	docker exec -t $(BACKEND_DEV) npm run migrate:create -- $(name)

prod-build:
	$(PROD_CMD) build

prod-buildcache:
	$(PROD_CMD) build --no-cache

check-ports-prod:
	@scripts/port-claimer.sh --self $(PROD_PROJECT) $(PROD_PORTS)

prod-up: check-ports-prod
	$(PROD_CMD) up -d

prod-logs:
	$(PROD_CMD) logs -f

prod-down:
	$(PROD_CMD) down -v --rmi local

prod-scan: prod-build
	@fail=0; for img in frontend backend; do \
		echo "== scanning dsa-finals-psu-prod-$$img =="; \
		docker run --rm \
			-v /var/run/docker.sock:/var/run/docker.sock \
			-v "$(CURDIR)/$$img/.trivyignore.yaml:/.trivyignore.yaml" \
			aquasec/trivy:0.74.0 image \
			--severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 \
			--ignorefile /.trivyignore.yaml \
			dsa-finals-psu-prod-$$img || fail=1; \
	done; \
	exit $$fail
