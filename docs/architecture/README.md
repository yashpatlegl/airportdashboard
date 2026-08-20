# Architecture diagrams — Airport Operations Dashboard

Four presentation-ready diagrams for the demo walkthrough. Content is taken from the actual
source tree (class names, endpoints, query parameters, constraints, indexes, config keys), so
what is on screen matches what a reviewer would find in the code.

| # | File | Show it at | Purpose |
|---|------|-----------|---------|
| 1 | `01-system-architecture.png` | after Swagger, ~3:05 | The whole system in one frame: Angular → Spring Boot → PostgreSQL, with Redis beside the database and Flyway as the schema lifecycle |
| 2 | `02-backend-layers.png` | while showing IntelliJ, ~3:30 | The five backend layers and what each one owns — replaces opening individual classes |
| 3 | `03-flyway-migrations.png` | migration section, ~3:55 | Migration lifecycle, `flyway_schema_history`, and Hibernate `validate` vs Flyway owning DDL |
| 4 | `04-aws-deployment.png` | closing, ~6:00 | Target AWS deployment and the scaling path, clearly labelled as a proposal |

Each PNG is rendered at 2× (≈3240 px wide), so it stays sharp when full-screened in a recording.

## Regenerating

Sources are plain HTML + one stylesheet in `src/`. Edit the HTML, then re-render:

```bash
cd docs/architecture/src
node render.mjs                      # all diagrams
node render.mjs 02-backend-layers.html   # just one
```

`render.mjs` drives a headless Chrome over the DevTools protocol and writes the PNGs one level
up. Override the browser with `CHROME=/path/to/chrome` and the resolution with `SCALE=3`.

Notes for editing:
- The installed fonts have no arrow glyphs. Use `<span class="ar"></span>` instead of `→`.
- Vertical connectors are `.vgap` blocks: `side (r)` label, `arrow-d`, `side` label.

## Diagram accuracy vs the current repository

The diagrams describe the intended architecture. Three things differ in the working tree today
and are worth knowing before the recording, in case a reviewer asks:

1. **Migration scripts V1–V5 currently live in the frontend repository** at
   `frontend_gl_dashboard/src/main/resources/db/migration/`. The backend's own
   `V1__Create_Airport_Dashboard.sql` and `V2__Seed_Data.sql` are empty files, so a Flyway run
   from the backend applies nothing. The scripts belong in this repository under
   `src/main/resources/db/migration`.
2. **The summary endpoint is not actually cached yet.** `RedisConfig`, `CacheNames` and
   `DashboardCacheService` are wired, but `@Cacheable` on `getDashboardSummary()` is commented
   out — so Redis is configured infrastructure, not an active cache path.
3. **Datasource credentials are hard-coded** in `src/main/resources/application.yaml`. Diagram 4
   shows Secrets Manager as the target; locally these should move to environment variables.
