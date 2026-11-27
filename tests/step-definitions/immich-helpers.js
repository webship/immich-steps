'use strict';

// Shared helpers for the step files of this pack.
//
// Not a step file: it registers no step definitions. It holds the plumbing the steps use and that a project can
// require for its own steps: the library's address and the accounts of worldParameters.users, signing in (a session
// in the browser, a token or an API key for the API), the photos as the library names them (by the date they were
// taken), its messages and its confirmations, the files a scenario uploads, and the test content a scenario makes
// and removes.
//
// The library (Immich) draws every page in the browser from its API: a photo is a link named by its image, "Image
// taken on May 1, 2024"; a change shows a toast, a <div> with no role and no live region, read by its text; a question
// is a dialog with no name of its own, found by its role and its text. Every page needs JavaScript, so a browser
// without it has only the API.
//
// Everything builds on webship-js's own helpers (`sendRequest`, `friendly`, `failure`) and on the headers of its API
// steps (`api.setHeader`), so the steps fail the way the core webship-js steps do and the built-in API steps send
// what this pack signs them with.

const fs = require('fs');
const path = require('path');
const webship = require('webship-js/tests/step-definitions/webship');
const api = require('webship-js/tests/step-definitions/api.steps');

const { friendly, failure, sendRequest } = webship;

// The budgets of the waits (milliseconds): each is a ceiling, not a pause.
const WAIT = {
  page: 20000,      // a page of the library to draw itself
  upload: 30000,    // an upload to be answered
  photo: 15000,     // a photo to show in the timeline, an album, a search, the trash or a shared page
  message: 10000,   // a message (a toast, a form's error) to show
  dialog: 10000,    // a dialog to ask, and to close once answered
  call: 15000,      // a call of the page to its API to be answered
};

// The text of a photo's image, as the library writes it: "Image taken on May 1, 2024".
const TAKEN_ON = 'Image taken on ';

// ---------------------------------------------------------------------------
// Settings, addresses and accounts
// ---------------------------------------------------------------------------

/**
 * The settings of the pack, `worldParameters.immich` in cucumber.js, with their defaults:
 * - `fixtures`: the folder, from the project, of the files a scenario uploads, `tests/fixtures` (a file not there is
 *   looked for in the pack's own: three test photos, webship-test-red.jpg, -blue.jpg and -green.jpg);
 * - `manager`: the account (of worldParameters.users) that makes and removes test accounts, `admin`.
 * The test content (what @removes-test-content removes) is what the steps name: files webship-test-*, albums, shared
 * links and API keys "Webship test …", accounts webship.test.…@example.com.
 */
function settings(world) {
  const own = (world.parameters && world.parameters.immich) || {};
  return {
    fixtures: own.fixtures || 'tests/fixtures',
    manager: own.manager || 'admin',
  };
}

/** The library's address, the launch URL of cucumber.js, without a trailing slash. */
function base(world) {
  const url = (world.parameters && world.parameters.launchUrl) || world.launchUrl || '';
  if (!url) {
    throw friendly({
      message: 'No launch URL is set, so the library has no address.',
      hint: 'Set worldParameters.launchUrl in cucumber.js, or LAUNCH_URL in the environment, to the library\'s address (http://127.0.0.1:2283).',
    });
  }
  return String(url).replace(/\/+$/, '');
}

/** A path of the library as a whole address; a whole address as written. */
function absolute(world, p) {
  const text = String(p || '');
  if (/^https?:\/\//i.test(text)) return text;
  return `${base(world)}/${text.replace(/^\/+/, '')}`;
}

/**
 * An account of the users registry in cucumber.js (`worldParameters.users`), or one a scenario made, by the handle
 * the scenario names it with. Its address is `email` (or `username`).
 *
 * @returns {{handle: string, email: string, password: string}}
 */
function user(world, handle) {
  const made = (world.immichAccounts || {})[handle];
  if (made) return made;
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The user "${handle}" is not in the users registry. Known users: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: `Add it to worldParameters.users in cucumber.js: users: { ${handle}: { email: process.env.IMMICH_${String(handle).toUpperCase()}_EMAIL, password: process.env.IMMICH_${String(handle).toUpperCase()}_PASSWORD } }.`,
    });
  }
  const email = entry.email || entry.username;
  if (!email || !entry.password) {
    throw friendly({
      message: `The user "${handle}" has no ${email ? 'password' : 'email address'} in the users registry.`,
      hint: `Set worldParameters.users.${handle}.email and .password in cucumber.js, from environment variables (IMMICH_${String(handle).toUpperCase()}_PASSWORD).`,
    });
  }
  return { handle, email: String(email), password: String(entry.password) };
}

// ---------------------------------------------------------------------------
// The API: requests, tokens, keys
// ---------------------------------------------------------------------------

/**
 * A request of the pack's own (a sign-in, a count, a clean-up), through webship-js's transport. `token` signs it with
 * a bearer token, `key` with an API key; `json` goes out as JSON; `session` sends it with the browser's cookies (and
 * keeps the ones the answer sets).
 *
 * @returns {Promise<{status: number, data: *, headers: Object, config: {method: string, url: string}}>}
 */
async function request(world, method, p, options) {
  const { token, key, json, session } = options || {};
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['x-api-key'] = key;
  let data;
  if (json !== undefined) {
    data = JSON.stringify(json);
    headers['Content-Type'] = 'application/json';
  }
  const url = absolute(world, p);
  try {
    return await sendRequest(world, { method, url, headers, data, session: !!session });
  } catch (e) {
    throw friendly({
      message: `The library did not answer ${method} ${url}.`,
      cause: e,
      hint: 'Check that the library is up at the launch URL of cucumber.js (LAUNCH_URL).',
    });
  }
}

/** What an answer of the API says, as a person reads it: its `message`, else its text. */
function said(answer) {
  const data = answer && answer.data;
  if (data && typeof data === 'object') {
    if (Array.isArray(data.message)) return data.message.join('; ');
    if (data.message) return String(data.message);
    if (data.error) return String(data.error);
  }
  const text = typeof data === 'string' ? data : JSON.stringify(data);
  return String(text || '').slice(0, 300);
}

/**
 * Sign an account in through the API (POST /api/auth/login) and return its access token. With `session`, the answer's
 * cookies stay in the browser, so its pages open signed in.
 */
async function signIn(world, handle, options) {
  const account = user(world, handle);
  const answer = await request(world, 'POST', '/api/auth/login', { json: { email: account.email, password: account.password }, session: options && options.session });
  if (answer.status !== 201 || !answer.data || !answer.data.accessToken) {
    throw friendly({
      message: `The library refused the sign-in of "${handle}" (${account.email}): ${answer.status} ${said(answer)}.`,
      hint: answer.status === 401
        ? `Check the password of "${handle}" in the users registry (worldParameters.users.${handle}.password).`
        : 'Check that the launch URL of cucumber.js is the library\'s address.',
    });
  }
  if (!world.immichSignedIn) world.immichSignedIn = new Set();
  world.immichSignedIn.add(handle);
  return answer.data.accessToken;
}

/** The token of an account for the pack's own requests, signed in once a scenario. */
async function tokenOf(world, handle) {
  if (!world.immichTokens) world.immichTokens = {};
  if (!world.immichTokens[handle]) world.immichTokens[handle] = await signIn(world, handle);
  return world.immichTokens[handle];
}

/**
 * Sign webship-js's API steps (and this pack's API steps) with a header: `Authorization: Bearer …` or `x-api-key`.
 * The other one is taken off, so a request is signed one way.
 */
function signApi(world, name, value) {
  if (typeof api.setHeader !== 'function') {
    throw friendly({
      message: 'This webship-js cannot sign the requests of its API steps: it has no api.setHeader.',
      hint: 'Update webship-js to 2.0.19 or later (npm install webship-js@^2.0.19).',
    });
  }
  const other = name === 'x-api-key' ? 'Authorization' : 'x-api-key';
  api.setHeader(other, null);
  api.setHeader(name, value);
  world.immichApiAuth = { [name]: value };
}

/** The headers the API steps are signed with, for this pack's own API requests; a failure when there are none. */
function apiAuth(world) {
  if (!world.immichApiAuth) {
    throw friendly({
      message: 'The API is not signed in: this step sends its request as a signed-in account.',
      hint: 'Sign it in first: Given I am signed in to the library\'s API as "user", or Given the library\'s API uses a key of "user".',
    });
  }
  return world.immichApiAuth;
}

// ---------------------------------------------------------------------------
// Files to upload
// ---------------------------------------------------------------------------

/** A file a scenario uploads: from the project's fixtures folder, else from the pack's own. */
function fixture(world, file) {
  const own = path.resolve(process.cwd(), settings(world).fixtures, file);
  if (fs.existsSync(own)) return own;
  const packs = path.resolve(__dirname, '..', 'fixtures', file);
  if (fs.existsSync(packs)) return packs;
  const known = [path.resolve(process.cwd(), settings(world).fixtures), path.resolve(__dirname, '..', 'fixtures')]
    .filter((d) => fs.existsSync(d)).flatMap((d) => fs.readdirSync(d)).filter((f) => !f.startsWith('.'));
  throw friendly({
    message: `There is no file "${file}" to upload. Known files: ${[...new Set(known)].join(', ') || '(none)'}.`,
    hint: `Put it in ${settings(world).fixtures}/ (worldParameters.immich.fixtures), or upload one of the pack's: webship-test-red.jpg, webship-test-blue.jpg, webship-test-green.jpg.`,
  });
}

/** The MIME type of a file to upload, from its extension. */
function mimeOf(file) {
  const ext = path.extname(file).toLowerCase();
  return { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.heic': 'image/heic', '.mp4': 'video/mp4', '.mov': 'video/quicktime' }[ext] || 'application/octet-stream';
}

// ---------------------------------------------------------------------------
// The pages: photos, messages, dialogs
// ---------------------------------------------------------------------------

/** A photo of the page, by the date it was taken, as the library names it ("May 1, 2024"). */
function photo(scope, date) {
  return scope.getByRole('link', { name: `${TAKEN_ON}${date}`, exact: true });
}

/** The dates of the photos the page shows, for a failure message. */
async function photosShown(scope) {
  try {
    const names = await scope.getByRole('img').evaluateAll((imgs, prefix) => imgs.map((i) => i.getAttribute('alt') || '').filter((a) => a.startsWith(prefix)).map((a) => a.slice(prefix.length)), TAKEN_ON);
    return [...new Set(names)];
  } catch (e) {
    return [];
  }
}

/** Wait until the page shows a photo taken on the date; false after the budget. */
async function photoShows(scope, date, budget) {
  try {
    await photo(scope, date).first().waitFor({ state: 'visible', timeout: budget || WAIT.photo });
    return true;
  } catch (e) {
    return false;
  }
}

/** The messages the page shows now: its toasts (top-level <div>s of the body) and a form's error, by their text. */
async function messagesShown(page) {
  try {
    return await page.evaluate(() => {
      const out = [];
      for (const el of document.body.children) {
        if (el.tagName !== 'DIV' || el.querySelector('main, nav, header')) continue;
        const text = (el.innerText || '').trim();
        if (text && text.length < 400 && el.offsetParent !== null) out.push(text.replace(/\s*\n+\s*/g, ' · '));
      }
      for (const el of document.querySelectorAll('form p, form [role="alert"], [role="alert"]')) {
        const text = (el.innerText || '').trim();
        if (text && el.offsetParent !== null) out.push(text);
      }
      return [...new Set(out)];
    });
  } catch (e) {
    return [];
  }
}

/** Wait until the page shows the text (in a toast, a form's error or anywhere it can be seen); false after the budget. */
async function messageShown(page, text, budget) {
  try {
    await page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ state: 'visible', timeout: budget || WAIT.message });
    return true;
  } catch (e) {
    return false;
  }
}

/** The dialog the page asks with, found by its role and its own text; null when none shows within the budget. */
async function dialog(page, budget) {
  const d = page.getByRole('dialog').filter({ visible: true }).last();
  try {
    await d.waitFor({ state: 'visible', timeout: budget || WAIT.dialog });
    return d;
  } catch (e) {
    return null;
  }
}

/**
 * Wait for the page's call to its API that answers `match` (a method and a path pattern), started by `action`.
 *
 * @returns {Promise<import('playwright').Response|null>}
 */
async function callOf(page, method, pattern, action, budget) {
  const answered = page.waitForResponse((r) => {
    try {
      return r.request().method() === method && pattern.test(new URL(r.url()).pathname);
    } catch (e) {
      return false;
    }
  }, { timeout: budget || WAIT.call }).catch(() => null);
  await action();
  return answered;
}

/** The library's page of a path, loaded and drawn (its navigation or the photos' area). */
async function open(world, p) {
  const page = world.page;
  await page.goto(absolute(world, p), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: WAIT.page }).catch(() => {});
}

/** Pause; only to let a page settle between two polls, never as a wait for something. */
function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Test content
// ---------------------------------------------------------------------------

const TEST_FILE = /^webship-test-/i;
const TEST_NAME = /^Webship test/i;
const TEST_ACCOUNT = /^webship\.test\./i;

/** Every asset an account holds (in the timeline, archived or in the trash), through the metadata search. */
async function assetsOf(world, token) {
  const out = [];
  for (let page = 1; page && page < 50;) {
    const answer = await request(world, 'POST', '/api/search/metadata', { token, json: { page, size: 1000, withDeleted: true, withArchived: true } });
    const block = (answer.data && answer.data.assets) || {};
    out.push(...(block.items || []));
    page = block.nextPage ? Number(block.nextPage) : 0;
  }
  return out;
}

/** What an account holds that a scenario can make: assets, albums, shared links, API keys (and accounts, for the manager). */
async function counts(world, handle) {
  const token = await tokenOf(world, handle);
  const list = async (p) => {
    const answer = await request(world, 'GET', p, { token });
    return Array.isArray(answer.data) ? answer.data : [];
  };
  const out = {
    assets: (await assetsOf(world, token)).length,
    albums: (await list('/api/albums')).length,
    'shared links': (await list('/api/shared-links')).length,
    'API keys': (await list('/api/api-keys')).length,
  };
  if (handle === settings(world).manager) out.accounts = (await list('/api/admin/users')).length;
  return out;
}

/** Remove what a scenario made for an account: its webship-test-* files (for good) and its "Webship test …" things. */
async function removeTestContent(world, handle) {
  const token = await tokenOf(world, handle);
  const removed = [];
  const assets = (await assetsOf(world, token)).filter((a) => TEST_FILE.test(a.originalFileName || ''));
  if (assets.length) {
    await request(world, 'DELETE', '/api/assets', { token, json: { ids: assets.map((a) => a.id), force: true } });
    removed.push(`${assets.length} file(s)`);
  }
  for (const [p, field, label] of [['/api/albums', 'albumName', 'album'], ['/api/shared-links', 'description', 'shared link'], ['/api/api-keys', 'name', 'API key']]) {
    const answer = await request(world, 'GET', p, { token });
    for (const item of (Array.isArray(answer.data) ? answer.data : []).filter((x) => TEST_NAME.test(x[field] || ''))) {
      await request(world, 'DELETE', `${p}/${item.id}`, { token });
      removed.push(`${label} "${item[field]}"`);
    }
  }
  if (handle === settings(world).manager) {
    const answer = await request(world, 'GET', '/api/admin/users', { token });
    for (const account of (Array.isArray(answer.data) ? answer.data : []).filter((u) => TEST_ACCOUNT.test(u.email || ''))) {
      await request(world, 'DELETE', `/api/admin/users/${account.id}`, { token, json: { force: true } });
      removed.push(`account ${account.email}`);
    }
  }
  return removed;
}

module.exports = {
  WAIT, TAKEN_ON, TEST_FILE, TEST_NAME, TEST_ACCOUNT,
  settings, base, absolute, user, request, said, signIn, tokenOf, signApi, apiAuth,
  fixture, mimeOf, photo, photosShown, photoShows, messagesShown, messageShown, dialog, callOf, open, pause,
  assetsOf, counts, removeTestContent,
  friendly, failure,
};
