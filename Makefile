DEV_CMD      = docker compose -p dsa-finals-psu-dev -f compose.yml -f compose.dev.yml
DEV_PROJECT  = dsa-finals-psu-dev
FRONTEND_DEV = dsa-finals-psu_frontend_dev
BACKEND_DEV  = dsa-finals-psu_backend_dev
PORTS        = 5373 4100 5433

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
