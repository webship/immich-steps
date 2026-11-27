<p align="center"><img src="https://raw.githubusercontent.com/webship/immich-steps/2.0.x/assets/logo.svg" alt="Immich logo" width="96"></p>

# immich-steps

Cucumber step definitions for Immich, the self-hosted photo and video library, for
[webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation harness built on Playwright and
Cucumber-js.

Immich keeps a library of photos and videos. It takes uploads, draws them in a timeline by the date each was taken,
gathers them into albums, shares them through links, keeps what is deleted in a trash with an Undo, and has an API
every client uses, signed in with a session, a token or an API key. The steps work on its pages and its API. They
wait on its uploads, its calls and its messages, never for a fixed time. No step phrase names the product: the app is
"the library".

```gherkin
Feature: Signing in
  Scenario: An account signs in through the form, and its timeline opens
    When I sign in to the library as "user"
    Then I should see "Click to upload your first photo"
```

## From nothing to a green run

With the [Webship Workspace](https://github.com/webship/workspace) and its Immich plugin
(`@webship.co/workspace-immich`), a library is a command away, with its two accounts made and this pack wired into
its testing setup:

```bash
cd ~/workspace/dev
bash cmd-immich-project.sh photos --install --add-users
bash cmd-tools-testing.sh photos --run
```

Without it, the demo of this repository is Immich as it ships, on Docker Compose (see [The demo](#the-demo)):

```bash
npm install
export IMMICH_ADMIN_PASSWORD='a password of yours' IMMICH_USER_PASSWORD='another one'
npm run demo:build          # Immich v3.4.2 at http://127.0.0.1:8502, machine learning off, its two accounts
npx playwright install chromium
npm test                    # the whole suite
npm run demo:remove
```

### What the suite tests

- **Signing in:** the login form, the message a wrong password gets, and the first-run wizard of a new account.
- **Photos:** an upload shown in the timeline by its date, its details in the viewer, a favorite marked and taken
  off, the trash with its Undo, Restore all and Empty trash.
- **Albums, links and search:** an album made with a photo, shared by a link that opens signed out, and a search by
  file name.
- **The API:** an upload signed with a token, an API key on its own, a key the library refuses.

## Requirements

- Node.js 24 or later (26 is tested too), and webship-js 2.0.19 or later: the pack signs webship-js's API steps
  with `api.setHeader`.
- An Immich library: v3.4.2 is the one the pack is proven on. Machine learning may be off: no step needs it.

## Install

```bash
npm install --save-dev webship-js @webship-js/immich-steps
```

Add the pack's steps to the `require` of `cucumber.js`, after webship-js's own:

```js
require: [
  'node_modules/webship-js/tests/step-definitions/**/*.js',
  'node_modules/@webship-js/immich-steps/tests/step-definitions/**/*.js',
  'tests/step-definitions/**/*.js',
],
```

## Quick start

Sign in first, the way a person does, then use the library:

```gherkin
Feature: The first photos
  @removes-test-content
  Scenario: An upload shows in the timeline by the date it was taken
    When I sign in to the library as "user"
    And I upload "webship-test-red.jpg" to the library
    Then the timeline should show the photo taken on "May 1, 2024"
    When I open the photo taken on "May 1, 2024"
    Then the photo's details should say "webship-test-red.jpg"
```

`Given I am signed in to the library as "user"` signs in through the API instead (faster), and opens the library
with the session it gets. The login form is for the scenarios about signing in.

## Test users

The scenarios name accounts by a handle, from `worldParameters.users` in `cucumber.js`. Their passwords come from the
environment, never from the repository:

```js
users: {
  admin: { email: process.env.IMMICH_ADMIN_EMAIL || 'admin@example.com', password: process.env.IMMICH_ADMIN_PASSWORD },
  user: { email: process.env.IMMICH_USER_EMAIL || 'user@example.com', password: process.env.IMMICH_USER_PASSWORD },
},
```

`admin` is the library's first admin. It is the managing account, which makes and removes the test accounts.

An account meets Immich's first-run wizard on its first sign-in (theme, language, privacy, storage, backups, the
mobile app). Immich keeps two flags for it: the account's own (`PUT /api/users/me/onboarding`) and, for an admin, the
library's own setup (`POST /api/system-metadata/admin-onboarding`). An admin meets the wizard until both are set. The
Webship Workspace's accounts have met it already, and so have the demo's. A library's own account may not have: `When I get
past the library's first-run wizard` gets it to its timeline. A scenario that needs an account of its own makes one
with `Given the library has a new account "newcomer"`.

## Settings

`worldParameters.immich` in `cucumber.js`. Each setting has a default:

| Setting | Default | What it is |
| --- | --- | --- |
| `fixtures` | `tests/fixtures` | The project's folder of files to upload. A file not there is looked for in the pack's own: `webship-test-red.jpg` (taken on May 1, 2024), `webship-test-blue.jpg` (August 15, 2023) and `webship-test-green.jpg` (December 24, 2022). These are three photos made for the pack, with no person in them. |
| `manager` | `admin` | The account that makes and removes the test accounts. |

### `@removes-test-content`

A scenario that makes something names it so the pack can find it. Uploads are files named `webship-test-*`.
Albums, shared links and API keys are named "Webship test …". Accounts get `webship.test.…@example.com`.

Tag such a scenario `@removes-test-content`:
- before it, what an earlier run left is removed, and the counts of each account of the users registry are taken
  (its assets, albums, shared links, keys, and the manager's accounts);
- after it, what it made is removed (files for good), and the counts must be back where they were.

## How the steps find things and wait

- **A photo is named by the date it was taken,** as the library writes it in the photo's name: "Image taken on May 1,
  2024". The steps take that date: `the photo taken on "May 1, 2024"`. It comes from the photo's EXIF.
- **The library's messages are toasts** with no role and no live region, so the steps read them by their text:
  `Then the library should say "Trashed 1 asset"`. A form's error ("Incorrect email or password") is read the same
  way. A message leaves after a few seconds: read it in the step after what it is about.
- **A question is a dialog with no name of its own.** It is found by its role and its text ("Are you sure…"), and
  answered with its Confirm: `When I confirm "Empty trash"`.
- **Every page needs JavaScript:** without it, the library shows "To use Immich, you must enable JavaScript".
  Scenarios of the pages carry `@needs-javascript`. The API's scenarios run in a browser without JavaScript too.
- **No step waits for a fixed time:** an upload waits for its answer, a photo for its image, a message for its
  text, a question for its dialog.

### Findings

Found on Immich v3.4.2 while writing the pack, and not filed:

- **The trash after Restore all:** the page says "Restored 1 asset" but keeps showing the photo until it is loaded
  again. `Then the trash should be empty` opens the trash again first.
- **An album's page title:** a new album's page stays titled "Web - Immich" after its name is set, until the page is
  loaded again.
- **Search without machine learning:** the default search type, "Context", reads what a photo shows, which needs
  machine learning. Without it, the words are not read and every photo comes back. `When I search the library for the
  file name "…"` chooses the "File name" type, which works without it.
- **The admin pages** have no `<main>` landmark (the other pages do). User Management logs two svelte-i18n warnings
  ("admin.user_restore_scheduled_removal" has syntax error: Invalid time value). They are warnings, not errors.

## Steps

### `immich-auth.steps.js` (7)

| Step | What it does |
| --- | --- |
| `When I sign in to the library as "<account>"` | The login form, as a person fills it; waits for the library's first page after it |
| `When I sign in to the library as "<account>" with a wrong password` | The form with a password that is not the account's; passes when the library refuses it |
| `Given I am signed in to the library as "<account>"` | The API's sign-in, its session put in the browser, then the timeline |
| `When I get past the library's first-run wizard` | An account's first sign-in, through every step of the wizard to the timeline |
| `Given I am signed in to the library's API as "<account>"` | Signs webship-js's API steps with the account's token |
| `Given the library's API uses a key of "<account>"` | A "Webship test key" made for the scenario, sent as `x-api-key` |
| `Given the library has a new account "<handle>"` | A "Webship test" account the manager makes, named by its handle |

### `immich-library.steps.js` (14)

| Step | What it does |
| --- | --- |
| `When I upload "<file>" to the library` | The page's Upload button and its file chooser; waits until the library has taken the file |
| `When I upload "<file>" to the library through the API` | A multipart upload, signed as the API steps are |
| `Then the library should hold "<file>"` / `should not hold` | The file, by its name, outside the trash, through the API |
| `Then the timeline should show the photo taken on "<date>"` / `should not show` | The page shows the photo |
| `When I open the photo taken on "<date>"` | The photo viewer |
| `Then the photo's details should say "<text>"` | The viewer's details (opened when closed) |
| `When I mark the photo as a favorite` / `unmark` | The viewer's Favorite, waited for |
| `Then the photo should be a favorite` / `should not be` | The viewer offers Unfavorite, or Favorite |
| `When I move the photo to the trash` | The viewer's Delete; waits for "Trashed 1 asset" |
| `Then the library should say "<text>"` | A message, read by its text |
| `When I press "<button>" in the library's message` | A message's button: Undo, View Album |
| `When I confirm "<button>"` | Presses it, and confirms the question it asks |
| `Then the trash should hold the photo taken on "<date>"` / `should be empty` | The trash, opened again |

### `immich-albums.steps.js` (8)

| Step | What it does |
| --- | --- |
| `When I create the album "<name>" with the photo taken on "<date>"` | Create album, its title, Select photos, the photo, Add assets |
| `Then the album "<name>" should hold <n> item(s)` | The count on the album's page |
| `When I share the album "<name>" by a link` | Share, Create link, the link's description "Webship test link" |
| `When I open the shared link signed out` | A browser context of its own, with no session |
| `Then the shared page should show the photo taken on "<date>"` | The shared page shows the photo |
| `When I search the library for the file name "<name>"` | The File name search |
| `Then the search should find the photo taken on "<date>"` / `find nothing` | What the search found |

Every step definition carries five examples in its JSDoc; `npm run test:examples` checks that each matches its own
definition and no other, and that every step of the features matches exactly one.

## Immich's own tests and this pack

Immich's repository has tests of its own, and the pack read them for their flows:
- its end-to-end suite (`e2e/`): the server's API, sign-in and database backups;
- its web app's tests (`web/test/medium/`), which name the page's parts by role and accessible name.

Immich is AGPL-3.0: nothing of its tests is copied here.

## Testing this package

```bash
npm ci
npm run test:examples       # the examples and the features' steps against the definitions
npm run test:paths          # a feature named on the command line runs alone
npm run demo:build && npm test && npm run test:must-fail
JAVASCRIPT=off CUCUMBER_TAGS='not @wip and not @must-fail and not @needs-javascript' npm test
```

`tests/must-fail/` holds a scenario for each step's failure: each must fail at its last step, with the message its
description announces and a hint. CI runs the suite twice and the must-fail run on the demo, with JavaScript and
without.

## The demo

`.github/demo/compose.yml` is Immich v3.4.2 as it ships, with machine learning off and no machine-learning container.
Its three images are pinned by digest:
- the server, `ghcr.io/immich-app/immich-server` (v3.4.2);
- its Postgres with the vector extensions, `ghcr.io/immich-app/postgres` (14, VectorChord 0.4.3, pgvecto.rs 0.2.0);
- `valkey/valkey` 9.

`.github/scripts/build-demo.sh` starts it at `http://127.0.0.1:8502`. Through Immich's API it makes the first admin
and a user, gets both past the first-run wizard, and turns the version check off. The passwords come from
`IMMICH_ADMIN_PASSWORD` and `IMMICH_USER_PASSWORD`. `remove-demo.sh` removes the containers, the volume and the
library.

## License

MIT (see `LICENSE`).

## Logo

The logo is the mark Immich ships, `design/immich-logo.svg` of github.com/immich-app/immich v3.4.2, unmodified.
Immich and its logo are Immich's: the logo names the software the pack tests. It is not covered by this package's
licence.
