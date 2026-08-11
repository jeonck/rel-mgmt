# Release Board — DevOps Go / NoGo

**<https://rel-mgmt.metacog.co.kr>**

A release-management board for **55 DevOps products**. Every night it collects the latest releases,
end-of-life schedules and known CVEs, then scores each version into a rule-based verdict:
**GO / HOLD / NO-GO**.

- Collected daily at **02:00 CDT (07:00 UTC)** by a GitHub Actions cron
- Sources
  - [endoflife.date](https://endoflife.date) — EOL and support schedules, release trains, CPE identifiers
  - [GitHub Releases API](https://docs.github.com/rest/releases) — latest releases, release notes, pre-release detection
  - [NVD](https://nvd.nist.gov/developers/vulnerabilities) — per-version CVEs, matched by CPE
- Static SPA on GitHub Pages — no server, no running cost

---

## What the board answers

| Question | Where to look |
| --- | --- |
| Can I ship the latest version today? | **Verdict** column (GO / HOLD / NO-GO plus a score) |
| If not, what should I ship instead? | **Recommended** column — newest version that clears the bar |
| Why that verdict? | Expand the row for the **reasoning** (each rule and its point delta) |
| Are there known vulnerabilities? | **CVE** column, plus the CVE list in the detail panel |
| How long can I stay on it? | **Support left** meter and the per-train EOL timeline |
| What changed since yesterday? | **Changes since last run** feed at the top |

The headline verdict always describes the *latest* version. When the latest is not adoptable, the
question that actually matters is "then what do I ship?" — so the newest version that does clear the
bar is computed alongside it as **Recommended**.

---

## Scoring rules

Every version starts at 100 and loses points for risk: **80 or above is GO, 50 or above is HOLD,
below that is NO-GO**. All rules live in one file, [`scripts/verdict.ts`](scripts/verdict.ts).

**Automatic NO-GO, regardless of score**

- Pre-release — RC / beta / alpha / snapshot tags
- Past end-of-life, so no security patches remain
- A **critical-severity CVE** affecting the version

**Deductions**

| Rule | Points |
| --- | --- |
| High / medium / low severity CVE | −40 / −15 / −5 |
| New train (.0) less than 7 days old | −45 |
| New train below the soak target (30 days by default) | −25 |
| Patch release under 3 days / under 10 days | −25 / −12 |
| `.0` release | −20 |
| Below the patch-number target | −10 |
| Under 30 / 90 / 180 days of support left | −55 / −30 / −15 |
| Active support ended (security fixes only) | −20 |
| Unmaintained release train | −25 |
| Over a year of support left | **+5** |
| LTS train | **+8** |

A new minor train and a patch on an existing train carry different risk. The former ships feature
changes and concentrates early defects; the latter is usually a bug or security fix, where **delaying
is itself the risk**. The soak bar is split accordingly.

Thresholds can be overridden per product. PostgreSQL, MySQL and MongoDB carry a 90-day soak bar
because rolling them back is expensive — see `policy` in [`scripts/catalog.ts`](scripts/catalog.ts).

---

## How CVE collection works

The collector queries NVD by **CPE plus exact version**. Version-range matching is done by NVD
itself, so there is no chance of missing a vulnerability by misreading a CPE configuration tree.

CPEs resolve automatically from the `identifiers` field on endoflife.date (49 of 55 products); the
rest are filled in manually through the `cpe` field in [`scripts/catalog.ts`](scripts/catalog.ts).

### What has to be filtered out

Each of these produced real false positives during development, so the code defends against them.

- **`vulnerable: false` entries.** An NVD configuration tree also lists the platforms a vulnerability
  *runs on*. Without filtering, **Django CVEs attach to Python** and **Next.js CVEs attach to
  Node.js**. That actually happened on the first run and flipped verdicts.
- **One CPE shared by two versioning schemes.** Terraform CLI (`1.15.8`) and Terraform Enterprise
  (`202107-1`) share a CPE. Compared naively, `1.15.8 < 202107-1` is true, so Enterprise-only CVEs
  land on the CLI.
- **CPE 2.2 URI format.** endoflife.date mixes `cpe:2.3:…` with the older `cpe:/a:…`. Jenkins uses
  the latter, and without normalization the lookup fails outright.

### Limits (also stated on the site)

- NVD publishes CPE records **weeks after** a release ships. `none` means "nothing filed yet", not
  "safe".
- Products without a CPE mapping show `n/a` and are excluded from scoring — currently 5: OpenTofu,
  Thanos, Vector, Jaeger, OpenTelemetry Collector.
- A failed NVD lookup deducts nothing. Dropping a healthy version to NO-GO because of a transient
  outage would be worse; the run is flagged with ⚠ on the site instead.
- Only the latest version and the recommended candidates are queried, not every train. But a version
  is **never recommended unless its CVE lookup completed** — presenting an unverified version as the
  safe alternative is the worst possible failure mode.

### NVD API key (optional)

Without a key, NVD allows 5 requests per 30 seconds and a full collection takes 15–20 minutes.
Request a [free key](https://nvd.nist.gov/developers/request-an-api-key) and store it as the
`NVD_API_KEY` repository secret to get 50 requests per 30 seconds, which finishes in under 2 minutes.
Everything works without one.

---

## Adding or changing tracked products

Add one entry to the array in [`scripts/catalog.ts`](scripts/catalog.ts).

```ts
{
  id: 'nats',
  name: 'NATS',
  category: 'runtime',               // container | iac-cicd | observability | runtime
  vendor: 'CNCF',
  blurb: 'Lightweight messaging system',
  homepage: 'https://nats.io',
  icon: 'natsdotio',                 // simple-icons slug (optional)
  eol: 'nats-server',                // endoflife.date slug (optional)
  repo: 'nats-io/nats-server',       // GitHub owner/repo (optional)
  cpe: 'cpe:2.3:a:nats:nats_server', // only when endoflife.date has no CPE (optional)
  policy: { minSoakDays: 45 },       // override the default policy (optional)
}
```

- `eol` and `repo` are both optional — **either one alone is enough**.
- With both, EOL schedules come from endoflife.date while release notes and the newest patch come
  from GitHub.
- Available endoflife.date slugs: <https://endoflife.date/api/v1/products>
- Icons are downloaded to `public/icons/<id>.svg` on first collection and committed, so the site has
  no CDN dependency.
- `blurb` is rendered on the site, so write it in English.

---

## Running locally

```bash
npm install
```

```bash
GITHUB_TOKEN=$(gh auth token) npm run collect
```

> It runs without a token, but GitHub's anonymous rate limit of 60 requests/hour fails roughly half
> the products. Failed products keep their previous snapshot and show a ⚠ warning on the site.
> A full collection takes 15–20 minutes because of NVD throttling (about 2 minutes with `NVD_API_KEY`).

```bash
npm run dev
```

Then open <http://localhost:5173>.

Other scripts:

```bash
npm run collect:dry   # collect and print results without writing files
npm run typecheck     # type check
npm run build         # type check + production build
```

Collector debugging flags:

```bash
npx tsx scripts/collect.ts --dry-run --only=python,tomcat --skip-cve
```

`--only` restricts the run to specific products and `--skip-cve` skips NVD entirely, which makes
repeated runs fast.

---

## Deploying to GitHub Pages

1. Push the repository to GitHub (default branch `main`).
2. **Settings → Pages → Build and deployment → Source**: select **GitHub Actions**.
3. **Settings → Actions → General → Workflow permissions**: enable **Read and write permissions**,
   which the workflow needs to commit collected data back to the repository.
4. **Actions → Daily collect & deploy → Run workflow** to trigger the first run manually.

After that it runs every day at 07:00 UTC: collect → commit → build → deploy.

### Custom domain

[`public/CNAME`](public/CNAME) contains `rel-mgmt.metacog.co.kr`. DNS needs a `rel-mgmt` CNAME record
pointing at `jeonck.github.io`. Once GitHub finishes verifying the domain, **Enforce HTTPS** can be
enabled under Settings → Pages.

The workflow computes the build base path automatically: site root (`/`) when `public/CNAME` exists,
otherwise the project-page path (`/<repo>/`). To drop the custom domain, delete `public/CNAME`.

> GitHub Actions cron only accepts UTC. To pin the run to a fixed US Central wall-clock time, switch
> the cron in `.github/workflows/daily.yml` between `0 7` (CDT) and `0 8` (CST) at each daylight
> saving transition. If "some time overnight" is good enough, leave it alone.

---

## Layout

```
scripts/                Collector (Node + tsx, shares types with the browser code)
  catalog.ts            Tracked products — the only file to edit to add one
  verdict.ts            Go/NoGo rule engine
  collect.ts            Fetch → merge → score → write snapshot
  sources/              endoflife.date, GitHub Releases and NVD adapters
  lib/                  HTTP retry and concurrency limiting, version parsing
src/
  lib/types.ts          Data contract shared by the collector and the UI
  components/           Board UI
public/data/
  releases.json         Latest snapshot, refreshed by the workflow each night
  events.json           Rolling log of the last 400 changes
```

### Reliability design

- A failing product **keeps its previous snapshot** and the rest of the run continues.
- External APIs get 3 retries with exponential backoff; concurrency is capped at 6.
- Stable releases win over pre-releases within a train, so an RC never displaces a stable version.
- NVD requests go through a process-wide serial queue, so the rate limit holds regardless of how many
  collection workers are running.

---

## Notes on language

The site is in English, including the verdict reasoning — those strings are generated by the
collector and stored in `releases.json`, so changing the site language means changing
`scripts/verdict.ts` and re-running collection, not just editing the UI. Code comments are in Korean.
