# Release Board — DevOps Go / NoGo

**<https://rel-mgmt.metacog.co.kr>**

A release-management board for **99 products** across the DevOps, infrastructure and application stack.
Every night it collects the latest releases, end-of-life schedules and known CVEs, then scores each
version into a rule-based verdict: **GO / HOLD / NO-GO**.

- Collected daily at **02:00 CDT (07:00 UTC)** by a GitHub Actions cron
- Sources
  - [endoflife.date](https://endoflife.date) — EOL and support schedules, release trains, CPE identifiers
  - [GitHub Releases API](https://docs.github.com/rest/releases) — latest releases, release notes, pre-release detection
  - [NVD](https://nvd.nist.gov/developers/vulnerabilities) — per-version CVEs, matched by CPE
- Static SPA on GitHub Pages — no server, no running cost

---

## What it is for

Upgrade decisions are usually made with a browser full of tabs. Someone checks a release page, digs
for an end-of-life date on a different page, greps a CVE feed, and forms an opinion. Repeat per
product, forget half of them, and find out at audit time that a component went end-of-life eight
months ago.

This board does that sweep every night for 99 products and collapses it into one answer per product:
**can I ship the latest version today, and if not, what should I ship instead?**

Built for the people who own that call:

- **Platform and infrastructure engineers** planning upgrade windows
- **Release managers** running a literal Go/NoGo gate
- **Security and compliance** tracking end-of-life exposure and known vulnerabilities

It is a decision aid, not a scanner. It reads public release metadata; it does not connect to your
estate and has no idea which versions you actually run.

## What makes it useful

**It answers, rather than reporting.** Most version trackers hand you a table of numbers and leave
the judgement to you. This one applies an explicit risk model — soak time, patch maturity, remaining
support runway, known CVEs — and commits to GO, HOLD or NO-GO. When the latest version fails, it
computes the newest version that *does* pass, so you leave with a target rather than a warning.

**The reasoning is on the page.** Every verdict expands into the rules that produced it and the
points each one cost. Nothing is a black box, and the entire rule set lives in one readable file
([`scripts/verdict.ts`](scripts/verdict.ts)) that you can argue with and change. Thresholds are
per-product, because a 90-day soak bar makes sense for PostgreSQL and not for a CLI tool.

**Three sources, reconciled per version.** Release feeds, EOL calendars and vulnerability data
normally live in three different places with three different notions of what a "version" is.
Reconciling them is most of the work, and it is done here once, nightly, instead of by each person
who needs the answer.

**The accuracy work is the product.** Version data is full of traps that produce answers which look
right and are not. This board has been made to survive the ones we hit:

- NVD's `virtualMatchString` also matches platforms a vulnerability merely *runs on* — unfiltered,
  Django CVEs attach to Python and Next.js CVEs attach to Node.js. That happened on the first run and
  flipped verdicts, so `vulnerable: false` entries are now excluded.
- A release candidate sorts above the stable release it precedes, so `2.15.2-rc3` displaced `2.15.2`
  until stable builds were given priority within a train.
- Terraform CLI and Terraform Enterprise share a CPE with incompatible version schemes, which made
  `1.15.8 < 202107-1` true and pinned Enterprise-only CVEs onto the CLI.
- Flutter's newest GitHub release is a 2024 pre-release and its tags API returns 1.x tags from 2020;
  both would report a two-year-old version as current.
- Linux distributions always carry open component CVEs that are fixed by package updates, so scoring
  them pinned every distribution at HOLD or NO-GO forever. They now list CVEs without scoring them.

**It says what it does not know.** `n/a` (no CPE mapping exists, so the check is impossible) is kept
distinct from `none` (checked, nothing filed). NVD's weeks-long publication lag is stated on the page
rather than buried, a failed lookup never deducts points, and a version is never recommended unless
its own vulnerability check completed. The board is designed to be boring and trustworthy rather than
confidently wrong.

**Diffs first.** The top of the page is what changed since the previous run — new versions, verdict
moves, newly filed CVEs — because on most days that is the entire reason to open it.

**Nothing to operate.** A GitHub Actions cron, a JSON file and a static page. No server, no database,
no credentials beyond an optional free NVD API key. Adding a product is one entry in
[`scripts/catalog.ts`](scripts/catalog.ts).

### What it is not

- Not an inventory. It does not know your deployed versions, so it cannot tell you that *you* are
  exposed — only that a version is.
- Not a vulnerability scanner. CVEs come from NVD's published CPE matches, which lag releases and
  cover some products poorly; several are marked `n/a` for exactly that reason.
- Not authoritative. Verdicts are one opinionated risk model. Read the reasoning, then apply your own
  change-management rules.

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

## Categories

| Category | What it holds |
| --- | --- |
| Platform | Server OS, hypervisors, network, storage appliances and backup |
| Containers | Orchestration, runtimes, registries, service mesh, CNI, GitOps |
| Storage | Cloud-native persistent storage — Ceph, Rook, Longhorn, OpenEBS, MinIO |
| IaC · CI/CD | Provisioning, configuration management, pipelines, artifacts, secrets, identity |
| Observability | Metrics, logs, traces, SIEM |
| Runtime · DB | Language runtimes, application servers, databases, brokers, proxies |
| Frameworks | Cross-platform app and web frameworks — Electron, React Native, Flutter, Qt, … |
| Enterprise | Mail, collaboration and business applications run on-premises |

Platform products carry a 90-day soak bar and a one-year EOL warning window, because a hypervisor or
storage OS upgrade is the hardest thing on this board to walk back.

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

CPEs resolve automatically from the `identifiers` field on endoflife.date; the rest are filled in
manually through the `cpe` field in [`scripts/catalog.ts`](scripts/catalog.ts).

Some products are deliberately left **unmapped** rather than mapped to a best-guess CPE, because a
single-CPE query would return an incomplete count that the UI would render as authoritative:

| Product | Why |
| --- | --- |
| Windows Server | NVD uses a separate CPE per edition (`windows_server_2019`, `_2022`, …) |
| F5 BIG-IP | Split across a dozen module CPEs (`big-ip_apm`, `big-ip_asm`, …) |
| Veeam Backup & Replication | Two competing CPE names, each holding part of the history |
| NetApp ONTAP | Split between `clustered_data_ontap` and `ontap` |
| Oracle Database | NVD version scheme does not line up with the release numbering |
| OpenTofu, Thanos, Vector, Jaeger, OTel Collector | No CPE in the NVD dictionary |

`n/a` on the board means "cannot be checked", which is a different and more honest statement than
`none`.

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
- Products without a CPE mapping show `n/a` and are excluded from scoring (see the table above).
- A failed NVD lookup deducts nothing. Dropping a healthy version to NO-GO because of a transient
  outage would be worse; the run is flagged with ⚠ on the site instead.
- Only the latest version and the recommended candidates are queried, not every train. But a version
  is **never recommended unless its CVE lookup completed** — presenting an unverified version as the
  safe alternative is the worst possible failure mode.
- Linux distributions (RHEL, Ubuntu, Debian, Rocky, Oracle Linux) list their CVEs but do not score
  them. A distro CPE always carries open component CVEs, and they are fixed by `dnf`/`apt` updates
  rather than by moving to a new release — scoring them would pin every distribution at HOLD or
  NO-GO forever and make the verdict meaningless. Set `cveScoring: 'advisory'` in the catalog to opt
  a product into this.

### NVD API key (optional)

Without a key, NVD allows 5 requests per 30 seconds and a full collection takes 25–35 minutes.
Request a [free key](https://nvd.nist.gov/developers/request-an-api-key) and store it as the
`NVD_API_KEY` repository secret to get 50 requests per 30 seconds, which finishes in about 3 minutes.
Everything works without one.

---

## Adding or changing tracked products

Add one entry to the array in [`scripts/catalog.ts`](scripts/catalog.ts).

```ts
{
  id: 'nats',
  name: 'NATS',
  category: 'runtime',               // platform | container | storage | iac-cicd
                                     // | observability | runtime | framework | enterprise
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

### Reading versions from awkward release tags

Projects decorate their tags in incompatible ways, so `tagFilter` doubles as a version extractor —
if the regex has a capture group, group 1 becomes the version:

| Project | Tag | `tagFilter` |
| --- | --- | --- |
| Sonatype Nexus | `release-3.95.0-07` | `^release-(\d+\.\d+\.\d+)` |
| Apache Pinot | `release-1.5.1` | `^release-(\d+\.\d+\.\d+)$` |
| Tauri | `tauri-v2.11.5` | `^tauri-v(\d+\.\d+\.\d+)$` |
| Apache Cordova | `rel/15.1.0` | `^rel/(\d+\.\d+\.\d+)$` |
| MinIO | `RELEASE.2026-12-18T13-15-44Z` | `^RELEASE\.` (filter only, no group) |

Earlier the collector guessed prefixes globally, which silently mangled MinIO's date-based tags into
`12-18T13-15-44Z`. Declaring the shape per product is verbose but cannot misfire.

### When GitHub Releases are not the source of truth

- **No releases published** (Ceph, Qt): the collector falls back to the tags API automatically and
  resolves dates through one commit lookup per kept tag.
- **Releases abandoned** (Flutter): the newest GitHub release is a 2024 pre-release and the tags API
  returns 1.x tags from 2020, so either source would report a two-year-old version as current.
  Flutter uses its official release manifest instead — see `scripts/sources/flutter.ts`. Set
  `githubSource: 'tags'` or `customSource` in the catalog for cases like this.
- **Sibling artifacts crowd the feed** (Apache Superset): the first 15 releases are all
  `superset-helm-chart-*`. The default filter only accepts tags that start with a version, so the
  chart releases drop out on their own.
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
> A full collection takes 25–35 minutes because of NVD throttling (about 3 minutes with `NVD_API_KEY`).

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

> **`--only` writes a full snapshot, not a partial one.** Products outside the list are copied
> forward from your local `public/data/releases.json`. If that file is behind the branch — the
> nightly workflow commits a fresh one every day — the stale copies get written back and every
> product you did not collect silently reverts.
>
> This has already come close to landing: a one-product `--only` run against a snapshot that was two
> commits old produced 80 products instead of 99, which would have dropped 19 of them from the site
> with no error anywhere.
>
> ```bash
> git pull && npx tsx scripts/collect.ts --only=ceph
> ```
>
> Pull first, and check the product count in the output before committing. Adding `--dry-run` avoids
> the problem entirely when you only want to see what a product resolves to.

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
