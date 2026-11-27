'use strict';

// Signing in to the library: through its login form, through the API for speed (the session's cookies put in the
// browser), with a token or an API key for webship-js's API steps; getting past the first-run wizard an account
// meets on its first sign-in; and a new account a scenario makes and removes.
//
// The hooks of @removes-test-content are here too: before the scenario, what an earlier run left is removed and the
// counts of every account of the users registry are taken; after it, what the scenario made (files webship-test-*,
// albums, shared links and API keys "Webship test …", accounts webship.test.…@example.com) is removed and the counts
// must be back where they were.

const { When, Given, Before, After } = require('@cucumber/cucumber');
const h = require('./immich-helpers');

const { friendly, failure } = h;

/** Fill in the login form and send it; the sign-in's answer. */
async function sendLoginForm(world, email, password) {
  await h.open(world, '/auth/login');
  const page = world.page;
  const field = page.getByRole('textbox', { name: 'Email' });
  try {
    await field.waitFor({ state: 'visible', timeout: h.WAIT.page });
  } catch (e) {
    throw failure(page, `Expected the library's login form at ${h.absolute(world, '/auth/login')}, but the page has no "Email" field (it is at ${page.url()}).`, {
      hint: page.url().includes('/auth/login') ? 'Check that the launch URL of cucumber.js is the library\'s address.' : 'A session is open already: sign out first, or use a browser of its own.',
    });
  }
  await field.fill(email);
  await page.getByRole('textbox', { name: 'Password' }).fill(password);
  const answer = await h.callOf(page, 'POST', /^\/api\/auth\/login$/, () => page.getByRole('button', { name: 'Login', exact: true }).click());
  if (!answer) {
    throw failure(page, 'Expected the library to answer the login form, but it sent no sign-in within the wait.', {
      hint: 'Check that the library is up, and that the form\'s button is "Login".',
    });
  }
  return answer;
}

/**
 * Sign an account of the users registry in through the library's login form, as a person does: the email address,
 * the password, "Login"; then the library's first page after it (the timeline, or the first-run wizard of an account
 * that has not met it yet).
 *
 * Example #1: When I sign in to the library as "user"
 * Example #2: When we sign in to the library as "admin"
 * Example #3: And I sign in to the library as "newcomer"
 * Example #4: When I sign in to the library as "editor"
 * Example #5: Given I sign in to the library as "user"
 *
 */
When(/^(?:I|we) sign in to the library as "([^"]+)"$/, async function (handle) {
  const account = h.user(this, handle);
  const answer = await sendLoginForm(this, account.email, account.password);
  if (answer.status() !== 201) {
    let message = '';
    try { message = (await answer.json()).message || ''; } catch (e) { /* not JSON */ }
    throw failure(this.page, `Expected the library to sign "${handle}" (${account.email}) in, but it answered ${answer.status()}${message ? `: "${message}"` : ''}.`, {
      hint: answer.status() === 401 ? `Check the password of "${handle}" in the users registry (worldParameters.users.${handle}.password).` : 'Check the account in the library\'s User Management.',
    });
  }
  try {
    await this.page.waitForURL((url) => !url.pathname.startsWith('/auth/login'), { timeout: h.WAIT.page });
  } catch (e) {
    throw failure(this.page, `Expected the library to leave its login page once "${handle}" was signed in, but it stayed at ${this.page.url()}.`, {
      hint: 'Check the library\'s log: the sign-in was accepted, the page did not follow.',
    });
  }
  if (!this.immichSignedIn) this.immichSignedIn = new Set();
  this.immichSignedIn.add(handle);
});

/**
 * Send the login form of an account with a password that is not its own, to see what the library says. The step
 * passes when the library refuses it; read its message with: Then the library should say "Incorrect email or password".
 *
 * Example #1: When I sign in to the library as "user" with a wrong password
 * Example #2: When we sign in to the library as "admin" with a wrong password
 * Example #3: And I sign in to the library as "newcomer" with a wrong password
 * Example #4: When I sign in to the library as "editor" with a wrong password
 * Example #5: Given I sign in to the library as "user" with a wrong password
 *
 */
When(/^(?:I|we) sign in to the library as "([^"]+)" with a wrong password$/, async function (handle) {
  const account = h.user(this, handle);
  const answer = await sendLoginForm(this, account.email, `${account.password}-but-wrong`);
  if (answer.status() === 201) {
    throw failure(this.page, `Expected the library to refuse a wrong password for "${handle}" (${account.email}), but it signed the account in.`, {
      hint: 'The account must not take any password: check how the library signs its accounts in.',
    });
  }
});

/**
 * Sign an account in through the API (faster than the form) and open the library in the browser with its session:
 * its cookies go to the browser, then its timeline opens. An account that has not met the first-run wizard lands on
 * it: When I get past the library's first-run wizard.
 *
 * Example #1: Given I am signed in to the library as "user"
 * Example #2: Given we are signed in to the library as "admin"
 * Example #3: And I am signed in to the library as "newcomer"
 * Example #4: Given I am signed in to the library as "editor"
 * Example #5: Given we are signed in to the library as "user"
 *
 */
Given(/^(?:I am|we are) signed in to the library as "([^"]+)"$/, async function (handle) {
  await h.signIn(this, handle, { session: true });
  await h.open(this, '/photos');
  if (this.page.url().includes('/auth/login')) {
    throw failure(this.page, `Expected the library to open signed in as "${handle}", but it showed its login page.`, {
      hint: 'The session\'s cookies did not reach the browser: check that the launch URL is the address the browser opens.',
    });
  }
});

/**
 * Get past the first-run wizard an account meets on its first sign-in (theme, language, privacy, storage, backups,
 * the mobile app), with what each step offers already chosen, to the timeline. The accounts the Webship Workspace
 * makes have met it already; a library's own may not have.
 *
 * Example #1: When I get past the library's first-run wizard
 * Example #2: And we get past the library's first-run wizard
 * Example #3: When I get past the library's first-run wizard
 * Example #4: Then I get past the library's first-run wizard
 * Example #5: Given we get past the library's first-run wizard
 *
 */
When(/^(?:I|we) get past the library's first-run wizard$/, async function () {
  const page = this.page;
  try {
    await page.waitForURL((url) => url.pathname.startsWith('/auth/onboarding'), { timeout: h.WAIT.page });
  } catch (e) {
    throw failure(page, `Expected the library's first-run wizard, but the page is ${page.url()}.`, {
      hint: 'The account has met it already: the step is for an account on its first sign-in.',
    });
  }
  const seen = [];
  for (let i = 0; i < 20 && new URL(page.url()).pathname.startsWith('/auth/onboarding'); i += 1) {
    const buttons = await page.getByRole('button').evaluateAll((list) => list.filter((b) => b.offsetParent !== null).map((b) => (b.getAttribute('aria-label') || b.innerText || '').trim()).filter(Boolean));
    const next = buttons.includes('Done') ? 'Done' : buttons[buttons.length - 1];
    if (!next) break;
    seen.push(next);
    await page.getByRole('button', { name: next, exact: true }).last().click();
    await page.waitForLoadState('networkidle').catch(() => {});
    await h.pause(300);
  }
  if (new URL(page.url()).pathname.startsWith('/auth/onboarding')) {
    throw failure(page, `Expected the first-run wizard to end, but it is still at ${page.url()} after: ${seen.join(' → ')}.`, {
      hint: 'A step of the wizard asks for something the step cannot choose: complete it by hand once, or onboard the account through the API.',
    });
  }
});

/**
 * Sign the requests of webship-js's API steps (and of this pack's API steps) as an account: its bearer token, from
 * the library's sign-in. Send them to the library with: Given the API base URL is "/".
 *
 * Example #1: Given I am signed in to the library's API as "user"
 * Example #2: Given we are signed in to the library's API as "admin"
 * Example #3: And I am signed in to the library's API as "newcomer"
 * Example #4: Given I am signed in to the library's API as "editor"
 * Example #5: Given we are signed in to the library's API as "user"
 *
 */
Given(/^(?:I am|we are) signed in to the library's API as "([^"]+)"$/, async function (handle) {
  const token = await h.signIn(this, handle);
  h.signApi(this, 'Authorization', `Bearer ${token}`);
});

/**
 * Sign the requests of the API steps with an API key of an account instead: a key named "Webship test key" with every
 * permission, made for the scenario through the API and sent as `x-api-key`. @removes-test-content removes it after.
 *
 * Example #1: Given the library's API uses a key of "user"
 * Example #2: Given the library's API uses a key of "admin"
 * Example #3: And the library's API uses a key of "newcomer"
 * Example #4: Given the library's API uses a key of "editor"
 * Example #5: When the library's API uses a key of "user"
 *
 */
Given(/^the library's API uses a key of "([^"]+)"$/, async function (handle) {
  const token = await h.tokenOf(this, handle);
  const answer = await h.request(this, 'POST', '/api/api-keys', { token, json: { name: 'Webship test key', permissions: ['all'] } });
  if (answer.status !== 201 || !answer.data || !answer.data.secret) {
    throw friendly({
      message: `Expected the library to make an API key for "${handle}", but it answered ${answer.status}: ${h.said(answer)}.`,
      hint: 'Check that the account may make API keys (Account Settings, API Keys).',
    });
  }
  h.signApi(this, 'x-api-key', answer.data.secret);
});

/**
 * A new account in the library, for a scenario that needs one of its own: "Webship test <handle>", with the address
 * webship.test.<handle>.<number>@example.com and a password of its own, made by the managing account
 * (worldParameters.immich.manager) through the admin API. The scenario names it by its handle, like an account of the
 * users registry; @removes-test-content removes it after.
 *
 * Example #1: Given the library has a new account "newcomer"
 * Example #2: Given the library has a new account "guest"
 * Example #3: And the library has a new account "reviewer"
 * Example #4: Given the library has a new account "visitor"
 * Example #5: Given the library has a new account "newcomer2"
 *
 */
Given(/^the library has a new account "([a-z0-9][a-z0-9-]*)"$/, async function (handle) {
  const manager = h.settings(this).manager;
  const token = await h.tokenOf(this, manager);
  const email = `webship.test.${handle}.${Date.now()}@example.com`;
  const password = `Webship-test-${Math.random().toString(36).slice(2, 12)}-${Date.now() % 100000}`;
  const answer = await h.request(this, 'POST', '/api/admin/users', { token, json: { email, password, name: `Webship test ${handle}`, shouldChangePassword: false } });
  if (answer.status !== 201) {
    throw friendly({
      message: `Expected the library to make the account "${handle}", but ${manager} was answered ${answer.status}: ${h.said(answer)}.`,
      hint: `The managing account (worldParameters.immich.manager, "${manager}") must be an admin of the library.`,
    });
  }
  if (!this.immichAccounts) this.immichAccounts = {};
  this.immichAccounts[handle] = { handle, email, password };
});

// ---------------------------------------------------------------------------
// @removes-test-content
// ---------------------------------------------------------------------------

/** The accounts of the users registry that can sign in (an email and a password). */
function registry(world) {
  const users = (world.parameters && world.parameters.users) || {};
  return Object.keys(users).filter((handle) => (users[handle].email || users[handle].username) && users[handle].password);
}

/** The counts of every account, read again until they match `expected` or the budget runs out (removals are jobs). */
async function settle(world, expected) {
  let now = {};
  for (let i = 0; i < 20; i += 1) {
    now = {};
    for (const handle of Object.keys(expected)) now[handle] = await h.counts(world, handle);
    if (JSON.stringify(now) === JSON.stringify(expected)) return now;
    await h.pause(750);
  }
  return now;
}

Before({ tags: '@removes-test-content' }, async function () {
  this.immichCounts = {};
  for (const handle of registry(this)) {
    await h.removeTestContent(this, handle);
  }
  for (const handle of registry(this)) {
    this.immichCounts[handle] = await h.counts(this, handle);
  }
  this.immichCounts = await settle(this, this.immichCounts);
});

After(async function () {
  if (this.immichSharedContext) {
    await this.immichSharedContext.close().catch(() => {});
    this.immichSharedContext = null;
    this.immichSharedPage = null;
  }
});

After({ tags: '@removes-test-content' }, async function (scenario) {
  if (!this.immichCounts) return;
  // A page still open on what is about to be removed asks the library for it again and logs the 400 it gets as a
  // console error: after a scenario that passed, the page leaves first. A failed one keeps its page, for the
  // screenshot of the failure.
  if (scenario.result && scenario.result.status === 'PASSED' && this.page) await this.page.goto('about:blank').catch(() => {});
  const removed = [];
  for (const handle of Object.keys(this.immichCounts)) {
    removed.push(...(await h.removeTestContent(this, handle)).map((r) => `${handle}: ${r}`));
  }
  const now = await settle(this, this.immichCounts);
  const differences = [];
  for (const [handle, before] of Object.entries(this.immichCounts)) {
    for (const [what, count] of Object.entries(before)) {
      if ((now[handle] || {})[what] !== count) differences.push(`${handle}'s ${what}: ${count} before, ${(now[handle] || {})[what]} after`);
    }
  }
  if (differences.length && scenario.result && scenario.result.status === 'PASSED') {
    throw friendly({
      message: `The scenario left the library changed after its test content was removed (${removed.join(', ') || 'nothing to remove'}): ${differences.join('; ')}.`,
      hint: 'Name what a scenario makes so the pack can find it: upload files named webship-test-*, and call albums, shared links and keys "Webship test …".',
    });
  }
});
