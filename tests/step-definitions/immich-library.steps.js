'use strict';

// The library's photos: uploading them (through the page's Upload button, or through the API), the timeline and the
// photo viewer (a photo is named by the date it was taken: "Image taken on May 1, 2024"), its details, favorites,
// the trash with its Undo, and the library's messages and confirmations, read by their text.

const fs = require('fs');
const path = require('path');
const { When, Then } = require('@cucumber/cucumber');
const h = require('./immich-helpers');

const { friendly, failure } = h;

/** The upload's answer read: its asset, or a failure that says what the library did with the file. */
async function uploaded(page, file, answer) {
  if (!answer) {
    throw failure(page, `Expected the library to take "${file}", but no upload was answered within the wait.`, {
      hint: 'Check that the page is the library\'s timeline (Given I am signed in to the library as "user") and that the file is a photo or a video.',
    });
  }
  let body = {};
  try { body = await answer.json(); } catch (e) { /* not JSON */ }
  if (answer.status() === 200 && body.status === 'duplicate') {
    throw failure(page, `Expected the library to take "${file}", but it holds that file already (a duplicate of asset ${body.id}).`, {
      hint: 'Tag the scenario @removes-test-content, so the files a scenario uploads are removed after it.',
    });
  }
  if (answer.status() !== 201) {
    throw failure(page, `Expected the library to take "${file}", but it answered ${answer.status()}: ${body.message || JSON.stringify(body).slice(0, 200)}.`, {
      hint: 'Check that the file is one the library takes (a photo or a video) and that the account may upload.',
    });
  }
  return body;
}

/**
 * Upload a file through the page's Upload button and its file chooser, as a person does; the step waits until the
 * library has taken it and finished with it (its details read, its thumbnail made). The file is from the project's fixtures folder (worldParameters.immich.fixtures), else from
 * the pack's own: webship-test-red.jpg (taken on May 1, 2024), webship-test-blue.jpg (August 15, 2023),
 * webship-test-green.jpg (December 24, 2022).
 *
 * Example #1: When I upload "webship-test-red.jpg" to the library
 * Example #2: When we upload "webship-test-blue.jpg" to the library
 * Example #3: And I upload "webship-test-green.jpg" to the library
 * Example #4: When I upload "holiday-2024.jpg" to the library
 * Example #5: Given I upload "webship-test-red.jpg" to the library
 *
 */
When(/^(?:I|we) upload "([^"]+)" to the library$/, async function (file) {
  const page = this.page;
  const filePath = h.fixture(this, file);
  const button = page.getByRole('button', { name: 'Upload', exact: true });
  try {
    await button.waitFor({ state: 'visible', timeout: h.WAIT.page });
  } catch (e) {
    throw failure(page, `Expected the library's Upload button, but the page (${page.url()}) has none.`, {
      hint: 'Open the library signed in first: Given I am signed in to the library as "user".',
    });
  }
  const chooser = page.waitForEvent('filechooser', { timeout: h.WAIT.page });
  const answer = await h.callOf(page, 'POST', /^\/api\/assets$/, async () => {
    await button.click();
    await (await chooser).setFiles(filePath);
  }, h.WAIT.upload);
  const asset = await uploaded(page, file, answer);
  await h.processed(this, asset.id, { session: true });
});

/**
 * Upload a file through the API, signed as the API steps are (a token or an API key): no browser, so it runs in the
 * lane without JavaScript too. The file is found as the page's upload finds it.
 *
 * Example #1: When I upload "webship-test-red.jpg" to the library through the API
 * Example #2: When we upload "webship-test-blue.jpg" to the library through the API
 * Example #3: And I upload "webship-test-green.jpg" to the library through the API
 * Example #4: When I upload "holiday-2024.jpg" to the library through the API
 * Example #5: Given I upload "webship-test-red.jpg" to the library through the API
 *
 */
When(/^(?:I|we) upload "([^"]+)" to the library through the API$/, async function (file) {
  const filePath = h.fixture(this, file);
  const headers = h.apiAuth(this);
  const stamp = fs.statSync(filePath).mtime.toISOString();
  const context = this.context || this.page.context();
  let answer;
  try {
    answer = await context.request.post(h.absolute(this, '/api/assets'), {
      headers: { Accept: 'application/json', ...headers },
      multipart: {
        assetData: { name: path.basename(filePath), mimeType: h.mimeOf(filePath), buffer: fs.readFileSync(filePath) },
        fileCreatedAt: stamp,
        fileModifiedAt: stamp,
        filename: path.basename(filePath),
      },
      failOnStatusCode: false,
      timeout: h.WAIT.upload,
    });
  } catch (e) {
    throw friendly({ message: `The library did not answer the upload of "${file}".`, cause: e, hint: 'Check that the library is up at the launch URL of cucumber.js (LAUNCH_URL).' });
  }
  let body = {};
  try { body = await answer.json(); } catch (e) { /* not JSON */ }
  if (answer.status() === 200 && body.status === 'duplicate') {
    throw friendly({ message: `Expected the library to take "${file}", but it holds that file already (a duplicate of asset ${body.id}).`, hint: 'Tag the scenario @removes-test-content, so the files a scenario uploads are removed after it.' });
  }
  if (answer.status() !== 201) {
    throw friendly({ message: `Expected the library to take "${file}" through the API, but it answered ${answer.status()}: ${body.message || JSON.stringify(body).slice(0, 200)}.`, hint: answer.status() === 401 ? 'Sign the API in first: Given I am signed in to the library\'s API as "user".' : 'Check that the account (or its key) may upload.' });
  }
  await h.processed(this, body.id, headers['x-api-key'] ? { key: headers['x-api-key'] } : { token: String(headers.Authorization || '').replace(/^Bearer /, '') });
});

/** The assets of the signed-in API whose original file name is the file's. */
async function holding(world, file) {
  const auth = h.apiAuth(world);
  const answer = await h.request(world, 'POST', '/api/search/metadata', { ...(auth['x-api-key'] ? { key: auth['x-api-key'] } : { token: String(auth.Authorization || '').replace(/^Bearer /, '') }), json: { originalFileName: file, size: 100 } });
  if (answer.status !== 200) {
    throw friendly({ message: `Expected the library's search to answer, but it answered ${answer.status}: ${h.said(answer)}.`, hint: 'Check that the API is signed in as an account of the library.' });
  }
  return ((answer.data && answer.data.assets && answer.data.assets.items) || []).filter((a) => a.originalFileName === file && !a.isTrashed);
}

/**
 * The library holds a file (in its timeline, not in the trash), as the signed-in API sees it: by its original name,
 * through the library's search. Waits a moment for an upload that has just been taken.
 *
 * Example #1: Then the library should hold "webship-test-red.jpg"
 * Example #2: And the library should hold "webship-test-blue.jpg"
 * Example #3: Then the library should hold "webship-test-green.jpg"
 * Example #4: Then the library should hold "holiday-2024.jpg"
 * Example #5: But the library should hold "webship-test-red.jpg"
 *
 */
Then(/^the library should hold "([^"]+)"$/, async function (file) {
  for (let i = 0; i < 20; i += 1) {
    if ((await holding(this, file)).length) return;
    await h.pause(500);
  }
  throw friendly({ message: `Expected the library to hold "${file}", but its search finds no such file outside the trash.`, hint: 'Upload it first in the scenario, as the account the API is signed in as.' });
});

/**
 * The library does not hold a file outside its trash, as the signed-in API sees it.
 *
 * Example #1: Then the library should not hold "webship-test-red.jpg"
 * Example #2: And the library should not hold "webship-test-blue.jpg"
 * Example #3: Then the library should not hold "webship-test-green.jpg"
 * Example #4: Then the library should not hold "holiday-2024.jpg"
 * Example #5: But the library should not hold "webship-test-red.jpg"
 *
 */
Then(/^the library should not hold "([^"]+)"$/, async function (file) {
  const found = await holding(this, file);
  if (found.length) {
    throw friendly({ message: `Expected the library not to hold "${file}", but it holds it (asset ${found[0].id}).`, hint: 'A file in the trash does not count: move it to the trash, or upload another.' });
  }
});

/**
 * The page shows a photo taken on a date, written as the library writes it in the photo's name ("May 1, 2024"): the
 * timeline, an album, a search or the trash. Waits for it.
 *
 * Example #1: Then the timeline should show the photo taken on "May 1, 2024"
 * Example #2: And the timeline should show the photo taken on "August 15, 2023"
 * Example #3: Then the timeline should show the photo taken on "December 24, 2022"
 * Example #4: Then the timeline should show the photo taken on "January 9, 2021"
 * Example #5: But the timeline should show the photo taken on "May 1, 2024"
 *
 */
Then(/^the timeline should show the photo taken on "([^"]+)"$/, async function (date) {
  if (!(await h.photoShows(this.page, date))) {
    const shown = await h.photosShown(this.page);
    throw failure(this.page, `Expected the timeline to show the photo taken on "${date}", but it shows ${shown.length ? shown.map((d) => `"${d}"`).join(', ') : 'no photo'}.`, {
      hint: 'Write the date as the library does ("May 1, 2024"): the date the photo was taken, from its EXIF.',
    });
  }
});

/**
 * The page does not show a photo taken on that date.
 *
 * Example #1: Then the timeline should not show the photo taken on "May 1, 2024"
 * Example #2: And the timeline should not show the photo taken on "August 15, 2023"
 * Example #3: Then the timeline should not show the photo taken on "December 24, 2022"
 * Example #4: Then the timeline should not show the photo taken on "January 9, 2021"
 * Example #5: But the timeline should not show the photo taken on "May 1, 2024"
 *
 */
Then(/^the timeline should not show the photo taken on "([^"]+)"$/, async function (date) {
  await this.page.waitForLoadState('networkidle').catch(() => {});
  if (await h.photoShows(this.page, date, 1000)) {
    throw failure(this.page, `Expected the timeline not to show the photo taken on "${date}", but it does.`, {
      hint: 'A photo in the trash leaves the timeline; check that the scenario moved this one.',
    });
  }
});

/**
 * Open a photo of the page in the library's photo viewer, by the date it was taken; the step waits for the viewer.
 *
 * Example #1: When I open the photo taken on "May 1, 2024"
 * Example #2: When we open the photo taken on "August 15, 2023"
 * Example #3: And I open the photo taken on "December 24, 2022"
 * Example #4: When I open the photo taken on "January 9, 2021"
 * Example #5: Given I open the photo taken on "May 1, 2024"
 *
 */
When(/^(?:I|we) open the photo taken on "([^"]+)"$/, async function (date) {
  const page = this.page;
  if (!(await h.photoShows(page, date))) {
    const shown = await h.photosShown(page);
    throw failure(page, `Expected a photo taken on "${date}" to open, but the page shows ${shown.length ? shown.map((d) => `"${d}"`).join(', ') : 'no photo'}.`, {
      hint: 'Open the page that shows it first (the timeline, an album), and write the date as the library does ("May 1, 2024").',
    });
  }
  await h.photo(page, date).first().click();
  try {
    await page.getByRole('button', { name: 'Info', exact: true }).waitFor({ state: 'visible', timeout: h.WAIT.page });
  } catch (e) {
    throw failure(page, `Expected the photo viewer for the photo taken on "${date}", but it did not open (the page is ${page.url()}).`, {
      hint: 'A photo in a picker is selected, not opened: close the picker first.',
    });
  }
});

/** The viewer's details panel, opened when it is closed. */
async function details(page) {
  const panel = page.getByText('Details', { exact: true }).filter({ visible: true });
  if (!(await panel.count())) {
    await page.getByRole('button', { name: 'Info', exact: true }).click();
    await panel.first().waitFor({ state: 'visible', timeout: h.WAIT.page }).catch(() => {});
  }
  return panel;
}

/**
 * The photo viewer's details say a text: the date, the file name, the size, the camera… The details panel is opened
 * when it is closed.
 *
 * Example #1: Then the photo's details should say "webship-test-red.jpg"
 * Example #2: And the photo's details should say "640 × 480"
 * Example #3: Then the photo's details should say "Webship test camera"
 * Example #4: Then the photo's details should say "May 1, 2024"
 * Example #5: But the photo's details should say "12.2 KiB"
 *
 */
Then(/^the photo's details should say "([^"]+)"$/, async function (text) {
  const page = this.page;
  await details(page);
  if (!(await h.messageShown(page, text, h.WAIT.message))) {
    const panel = await page.locator('section, aside').filter({ hasText: 'Details' }).last().innerText().catch(() => '');
    throw failure(page, `Expected the photo's details to say "${text}", but they say: ${panel.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 12).join(' · ') || '(nothing)'}.`, {
      hint: 'Open the photo first (When I open the photo taken on "…"), and write the text as the panel shows it.',
    });
  }
});

/**
 * Mark the photo open in the viewer as a favorite, or take the mark off; the step waits until the library has it.
 *
 * Example #1: When I mark the photo as a favorite
 * Example #2: When we mark the photo as a favorite
 * Example #3: And I mark the photo as a favorite
 * Example #4: When I unmark the photo as a favorite
 * Example #5: And we unmark the photo as a favorite
 *
 */
When(/^(?:I|we) (mark|unmark) the photo as a favorite$/, async function (how) {
  const page = this.page;
  const [press, then] = how === 'mark' ? ['Favorite', 'Unfavorite'] : ['Unfavorite', 'Favorite'];
  const button = page.getByRole('button', { name: press, exact: true });
  if (!(await button.count())) {
    throw failure(page, `Expected the viewer's "${press}" button, but there is none${how === 'mark' ? ': the photo is a favorite already, or no photo is open' : ': the photo is not a favorite, or no photo is open'}.`, {
      hint: 'Open the photo first: When I open the photo taken on "…".',
    });
  }
  const answer = await h.callOf(page, 'PUT', /^\/api\/assets$/, () => button.click());
  try {
    await page.getByRole('button', { name: then, exact: true }).waitFor({ state: 'visible', timeout: h.WAIT.message });
  } catch (e) {
    throw failure(page, `Expected the viewer to show "${then}" once the photo was ${how}ed, but it does not${answer ? ` (the library answered ${answer.status()})` : ''}.`, { hint: 'Check the library\'s log.' });
  }
});

/**
 * The photo open in the viewer is a favorite, or is not (the viewer offers "Unfavorite", or "Favorite").
 *
 * Example #1: Then the photo should be a favorite
 * Example #2: And the photo should be a favorite
 * Example #3: Then the photo should not be a favorite
 * Example #4: But the photo should not be a favorite
 * Example #5: Then the photo should be a favorite
 *
 */
Then(/^the photo should (be|not be) a favorite$/, async function (be) {
  const page = this.page;
  const offered = be === 'be' ? 'Unfavorite' : 'Favorite';
  try {
    await page.getByRole('button', { name: offered, exact: true }).waitFor({ state: 'visible', timeout: h.WAIT.message });
  } catch (e) {
    throw failure(page, `Expected the photo ${be === 'be' ? 'to be' : 'not to be'} a favorite (the viewer offering "${offered}"), but it ${be === 'be' ? 'is not' : 'is'}.`, {
      hint: 'Open the photo first: When I open the photo taken on "…".',
    });
  }
});

/**
 * Move the photo open in the viewer to the trash (the viewer's Delete, which asks nothing); the step waits for the
 * library's "Trashed 1 asset". Its Undo: When I press "Undo" in the library's message.
 *
 * Example #1: When I move the photo to the trash
 * Example #2: When we move the photo to the trash
 * Example #3: And I move the photo to the trash
 * Example #4: Then I move the photo to the trash
 * Example #5: Given we move the photo to the trash
 *
 */
When(/^(?:I|we) move the photo to the trash$/, async function () {
  const page = this.page;
  const button = page.getByRole('button', { name: 'Delete', exact: true });
  if (!(await button.count())) {
    throw failure(page, 'Expected the viewer\'s "Delete" button, but no photo is open.', { hint: 'Open the photo first: When I open the photo taken on "…".' });
  }
  const answer = await h.callOf(page, 'DELETE', /^\/api\/assets$/, () => button.click());
  if (!answer || answer.status() >= 300) {
    throw failure(page, `Expected the library to move the photo to the trash, but it ${answer ? `answered ${answer.status()}` : 'did not answer'}.`, { hint: 'Check that the account owns the photo.' });
  }
  if (!(await h.messageShown(page, 'Trashed', h.WAIT.message))) {
    throw failure(page, 'Expected the library to say the photo was trashed, but it said nothing.', { hint: 'Check the library\'s settings: the trash may be off, which deletes for good.' });
  }
});

/**
 * The library says a text: in its messages (toasts: they have no role, so they are read by their text), a form's
 * error, or anywhere on the page. Waits for it.
 *
 * Example #1: Then the library should say "Trashed 1 asset"
 * Example #2: Then the library should say "Incorrect email or password"
 * Example #3: And the library should say "Added 1 asset to the album"
 * Example #4: Then the library should say "Restored 1 asset"
 * Example #5: But the library should say "Permanently deleted 1 asset"
 *
 */
Then(/^the library should say "([^"]+)"$/, async function (text) {
  if (!(await h.messageShown(this.page, text))) {
    const shown = await h.messagesShown(this.page);
    throw failure(this.page, `Expected the library to say "${text}", but it says ${shown.length ? shown.map((s) => `"${s}"`).join(', ') : 'nothing'}.`, {
      hint: 'A message shows for a few seconds after what it is about: read it in the next step.',
    });
  }
});

/**
 * Press a button of the library's message (a toast): its Undo, its View Album.
 *
 * Example #1: When I press "Undo" in the library's message
 * Example #2: When we press "View Album" in the library's message
 * Example #3: And I press "Undo" in the library's message
 * Example #4: When I press "View Album" in the library's message
 * Example #5: Then I press "Undo" in the library's message
 *
 */
When(/^(?:I|we) press "([^"]+)" in the library's message$/, async function (name) {
  const page = this.page;
  const button = page.locator('body > div').getByRole('button', { name, exact: true }).filter({ visible: true }).first();
  try {
    await button.waitFor({ state: 'visible', timeout: h.WAIT.message });
  } catch (e) {
    const shown = await h.messagesShown(page);
    throw failure(page, `Expected a message of the library with a "${name}" button, but it shows ${shown.length ? shown.map((s) => `"${s}"`).join(', ') : 'none'}.`, {
      hint: 'Press it right after what the message is about: a message leaves after a few seconds.',
    });
  }
  await button.click();
  await page.waitForLoadState('networkidle').catch(() => {});
});

/**
 * Press a button that asks first, and confirm: the library's question is a dialog with no name of its own, found by
 * its role and its text ("Are you sure…"), and answered with its "Confirm". The step waits until the dialog closes.
 *
 * Example #1: When I confirm "Empty trash"
 * Example #2: When we confirm "Restore all"
 * Example #3: And I confirm "Delete album"
 * Example #4: When I confirm "Empty trash"
 * Example #5: Then we confirm "Restore all"
 *
 */
When(/^(?:I|we) confirm "([^"]+)"$/, async function (name) {
  const page = this.page;
  const button = page.getByRole('button', { name, exact: true }).or(page.getByRole('menuitem', { name, exact: true })).filter({ visible: true }).first();
  try {
    await button.waitFor({ state: 'visible', timeout: h.WAIT.page });
  } catch (e) {
    throw failure(page, `Expected a "${name}" button to press, but the page (${page.url()}) has none.`, { hint: 'Open the page that offers it first (the trash, an album).' });
  }
  await button.click();
  const asks = await h.dialog(page);
  if (!asks) {
    throw failure(page, `Expected the library to ask before "${name}", but no question showed.`, { hint: 'A button that does not ask is pressed with: When I press "…".' });
  }
  const confirm = asks.getByRole('button', { name: 'Confirm', exact: true });
  if (!(await confirm.count())) {
    const text = (await asks.innerText()).replace(/\s*\n+\s*/g, ' · ');
    throw failure(page, `Expected the library's question to offer "Confirm", but it says: ${text}.`, { hint: 'Answer this dialog with the button it offers.' });
  }
  await confirm.click();
  await asks.waitFor({ state: 'hidden', timeout: h.WAIT.dialog }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
});

/**
 * The trash holds a photo taken on a date, or holds nothing: its page opened again, since it does not follow a
 * restore on its own (it keeps showing a restored photo until it is loaded again).
 *
 * Example #1: Then the trash should hold the photo taken on "May 1, 2024"
 * Example #2: And the trash should hold the photo taken on "August 15, 2023"
 * Example #3: Then the trash should hold the photo taken on "December 24, 2022"
 * Example #4: Then the trash should be empty
 * Example #5: But the trash should be empty
 *
 */
Then(/^the trash should (?:hold the photo taken on "([^"]+)"|be empty)$/, async function (date) {
  const page = this.page;
  await h.open(this, '/trash');
  if (date) {
    if (!(await h.photoShows(page, date))) {
      const shown = await h.photosShown(page);
      throw failure(page, `Expected the trash to hold the photo taken on "${date}", but it holds ${shown.length ? shown.map((d) => `"${d}"`).join(', ') : 'nothing'}.`, { hint: 'Move it to the trash first: When I move the photo to the trash.' });
    }
    return;
  }
  const empty = await h.messageShown(page, 'Trashed photos and videos will show up here.', h.WAIT.page);
  if (!empty) {
    const shown = await h.photosShown(page);
    throw failure(page, `Expected the trash to be empty, but it holds ${shown.length ? shown.map((d) => `the photo taken on "${d}"`).join(', ') : 'something'}.`, { hint: 'Empty it first: When I confirm "Empty trash".' });
  }
});
