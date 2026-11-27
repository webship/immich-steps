'use strict';

// Albums, shared links and search: an album made with a photo, as a person makes it; an album's link shared and
// opened by someone who is not signed in; and the library's search by file name (its default search reads what a
// photo shows, which needs machine learning: without it, the words are not read).

const { When, Then } = require('@cucumber/cucumber');
const h = require('./immich-helpers');

const { friendly, failure } = h;

/** An album of the signed-in browser's account, by its name, through the library's API (the page's own session). */
async function albumNamed(world, name) {
  const answer = await h.request(world, 'GET', '/api/albums', { session: true });
  const albums = Array.isArray(answer.data) ? answer.data : [];
  const album = albums.find((a) => a.albumName === name);
  if (!album) {
    throw failure(world.page, `Expected an album "${name}", but the library has ${albums.length ? albums.map((a) => `"${a.albumName}"`).join(', ') : 'none'}${answer.status === 401 ? ' (the browser is not signed in)' : ''}.`, {
      hint: answer.status === 401 ? 'Sign in first: Given I am signed in to the library as "user".' : 'Make it first: When I create the album "…" with the photo taken on "…".',
    });
  }
  return album;
}

/**
 * Make an album with a photo, as a person does: Albums, "Create album" (the library makes an untitled album at
 * once), its title, "Select photos", the photo taken on the date, "Add assets". Name it "Webship test …" so
 * @removes-test-content removes it after.
 *
 * Example #1: When I create the album "Webship test album" with the photo taken on "May 1, 2024"
 * Example #2: When we create the album "Webship test holidays" with the photo taken on "August 15, 2023"
 * Example #3: And I create the album "Webship test album" with the photo taken on "December 24, 2022"
 * Example #4: When I create the album "Webship test family" with the photo taken on "January 9, 2021"
 * Example #5: Given I create the album "Webship test album" with the photo taken on "May 1, 2024"
 *
 */
When(/^(?:I|we) create the album "([^"]+)" with the photo taken on "([^"]+)"$/, async function (name, date) {
  const page = this.page;
  await h.open(this, '/albums');
  const create = page.getByRole('button', { name: 'Create album', exact: true });
  try {
    await create.waitFor({ state: 'visible', timeout: h.WAIT.page });
  } catch (e) {
    throw failure(page, `Expected the library's albums with a "Create album" button, but the page is ${page.url()}.`, { hint: 'Sign in first: Given I am signed in to the library as "user".' });
  }
  const made = await h.callOf(page, 'POST', /^\/api\/albums$/, () => create.click());
  if (!made || made.status() !== 201) {
    throw failure(page, `Expected the library to make an album, but it ${made ? `answered ${made.status()}` : 'did not answer'}.`, { hint: 'Check that the account may make albums.' });
  }
  const title = page.getByRole('textbox', { name: 'Edit Title' });
  await title.waitFor({ state: 'visible', timeout: h.WAIT.page });
  await title.fill(name);
  const named = await h.callOf(page, 'PATCH', /^\/api\/albums\/[^/]+$/, () => title.press('Enter'));
  if (!named || named.status() !== 200) {
    throw failure(page, `Expected the library to name the album "${name}", but it ${named ? `answered ${named.status()}` : 'did not answer'}.`, { hint: 'Check the name: the library takes any text.' });
  }
  await page.getByRole('button', { name: 'Select photos', exact: true }).click();
  if (!(await h.photoShows(page, date))) {
    const shown = await h.photosShown(page);
    throw failure(page, `Expected the album's picker to offer the photo taken on "${date}", but it offers ${shown.length ? shown.map((d) => `"${d}"`).join(', ') : 'no photo'}.`, { hint: 'Upload it first, as the same account.' });
  }
  await h.photo(page, date).first().click();
  const add = page.getByRole('button', { name: 'Add assets', exact: true });
  await add.waitFor({ state: 'visible', timeout: h.WAIT.message });
  const added = await h.callOf(page, 'PUT', /^\/api\/albums\/[^/]+\/assets$/, () => add.click());
  if (!added || added.status() !== 200) {
    throw failure(page, `Expected the library to add the photo taken on "${date}" to the album "${name}", but it ${added ? `answered ${added.status()}` : 'did not answer'}.`, { hint: 'Check the library\'s log.' });
  }
});

/**
 * An album holds a number of photos and videos ("1 item", "3 items"), on its own page.
 *
 * Example #1: Then the album "Webship test album" should hold 1 item
 * Example #2: And the album "Webship test holidays" should hold 2 items
 * Example #3: Then the album "Webship test album" should hold 0 items
 * Example #4: Then the album "Webship test family" should hold 3 items
 * Example #5: But the album "Webship test album" should hold 1 item
 *
 */
Then(/^the album "([^"]+)" should hold (\d+) items?$/, async function (name, count) {
  const album = await albumNamed(this, name);
  await h.open(this, `/albums/${album.id}`);
  const text = `${count} item${Number(count) === 1 ? '' : 's'}`;
  if (!(await h.messageShown(this.page, text, h.WAIT.page))) {
    const shown = await this.page.getByText(/\d+ items?/).allInnerTexts().catch(() => []);
    throw failure(this.page, `Expected the album "${name}" to hold ${text}, but its page says ${shown.length ? `"${shown[0].trim()}"` : 'no count'}.`, { hint: 'Add the photo to it in the scenario first.' });
  }
});

/**
 * Share an album by a link anyone can open: its Share, "Create link", the link's description "Webship test link",
 * "Create link". The link is kept for: When I open the shared link signed out. @removes-test-content removes it after.
 *
 * Example #1: When I share the album "Webship test album" by a link
 * Example #2: When we share the album "Webship test holidays" by a link
 * Example #3: And I share the album "Webship test album" by a link
 * Example #4: When I share the album "Webship test family" by a link
 * Example #5: Given I share the album "Webship test album" by a link
 *
 */
When(/^(?:I|we) share the album "([^"]+)" by a link$/, async function (name) {
  const page = this.page;
  const album = await albumNamed(this, name);
  await h.open(this, `/albums/${album.id}`);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const options = await h.dialog(page);
  if (!options) throw failure(page, `Expected the album's sharing options, but no dialog opened.`, { hint: 'Check that the account owns the album.' });
  await options.getByRole('button', { name: 'Create link', exact: true }).click();
  const form = await h.dialog(page);
  await form.getByRole('textbox', { name: 'Description' }).fill('Webship test link');
  const answer = await h.callOf(page, 'POST', /^\/api\/shared-links$/, () => form.getByRole('button', { name: 'Create link', exact: true }).click());
  if (!answer || answer.status() !== 201) {
    throw failure(page, `Expected the library to make a link to the album "${name}", but it ${answer ? `answered ${answer.status()}` : 'did not answer'}.`, { hint: 'Check that shared links are on in the library\'s settings.' });
  }
  const link = await answer.json();
  this.immichSharedLink = { key: link.key, slug: link.slug, album: name };
  await page.keyboard.press('Escape').catch(() => {});
});

/**
 * Open the shared link the scenario made as someone who is not signed in: a browser context of its own, with no
 * session. The steps about the shared page read that page.
 *
 * Example #1: When I open the shared link signed out
 * Example #2: When we open the shared link signed out
 * Example #3: And I open the shared link signed out
 * Example #4: Then I open the shared link signed out
 * Example #5: Given we open the shared link signed out
 *
 */
When(/^(?:I|we) open the shared link signed out$/, async function () {
  if (!this.immichSharedLink) {
    throw friendly({ message: 'There is no shared link to open: the scenario has not made one.', hint: 'Make it first: When I share the album "…" by a link.' });
  }
  const browser = this.page.context().browser();
  this.immichSharedContext = await browser.newContext({ viewport: this.page.viewportSize() || { width: 1280, height: 860 }, ignoreHTTPSErrors: true });
  this.immichSharedPage = await this.immichSharedContext.newPage();
  const address = h.absolute(this, `/share/${this.immichSharedLink.slug || this.immichSharedLink.key}`);
  const answer = await this.immichSharedPage.goto(address, { waitUntil: 'domcontentloaded' });
  await this.immichSharedPage.waitForLoadState('networkidle', { timeout: h.WAIT.page }).catch(() => {});
  if (!answer || answer.status() >= 400) {
    throw failure(this.immichSharedPage, `Expected the shared link to open, but ${address.replace(/\/share\/.*/, '/share/…')} answered ${answer ? answer.status() : 'nothing'}.`, { hint: 'The link may have expired, or been removed.' });
  }
});

/**
 * The shared page (opened signed out) shows a photo taken on a date.
 *
 * Example #1: Then the shared page should show the photo taken on "May 1, 2024"
 * Example #2: And the shared page should show the photo taken on "August 15, 2023"
 * Example #3: Then the shared page should show the photo taken on "December 24, 2022"
 * Example #4: Then the shared page should show the photo taken on "January 9, 2021"
 * Example #5: But the shared page should show the photo taken on "May 1, 2024"
 *
 */
Then(/^the shared page should show the photo taken on "([^"]+)"$/, async function (date) {
  const page = this.immichSharedPage;
  if (!page) throw friendly({ message: 'No shared page is open.', hint: 'Open it first: When I open the shared link signed out.' });
  if (!(await h.photoShows(page, date))) {
    const shown = await h.photosShown(page);
    throw failure(page, `Expected the shared page to show the photo taken on "${date}", but it shows ${shown.length ? shown.map((d) => `"${d}"`).join(', ') : 'no photo'}.`, { hint: 'Add the photo to the shared album first.' });
  }
});

/**
 * Search the library by a file name (or the start of one): its File name search, which the step chooses. The
 * library's default search reads what a photo shows, which needs machine learning; without it, its words are not
 * read and every photo comes back.
 *
 * Example #1: When I search the library for the file name "webship-test-blue"
 * Example #2: When we search the library for the file name "webship-test-red.jpg"
 * Example #3: And I search the library for the file name "webship-test"
 * Example #4: When I search the library for the file name "holiday-2024"
 * Example #5: Given I search the library for the file name "webship-test-green"
 *
 */
When(/^(?:I|we) search the library for the file name "([^"]+)"$/, async function (name) {
  const page = this.page;
  const query = encodeURIComponent(JSON.stringify({ originalFileName: name }));
  const answer = await h.callOf(page, 'POST', /^\/api\/search\/metadata$/, () => page.goto(h.absolute(this, `/search?query=${query}`), { waitUntil: 'domcontentloaded' }));
  if (!answer || answer.status() !== 200) {
    throw failure(page, `Expected the library to search for the file name "${name}", but it ${answer ? `answered ${answer.status()}` : 'sent no search'}.`, { hint: 'Sign in first: Given I am signed in to the library as "user".' });
  }
  this.immichSearch = { name, found: ((await answer.json()).assets || {}).total };
  await page.waitForLoadState('networkidle').catch(() => {});
});

/**
 * The search finds a photo taken on a date, or finds nothing.
 *
 * Example #1: Then the search should find the photo taken on "August 15, 2023"
 * Example #2: And the search should find the photo taken on "May 1, 2024"
 * Example #3: Then the search should find the photo taken on "December 24, 2022"
 * Example #4: Then the search should find nothing
 * Example #5: But the search should find nothing
 *
 */
Then(/^the search should (?:find the photo taken on "([^"]+)"|find nothing)$/, async function (date) {
  const page = this.page;
  if (!this.immichSearch) throw friendly({ message: 'The scenario has not searched.', hint: 'Search first: When I search the library for the file name "…".' });
  if (date) {
    if (!(await h.photoShows(page, date))) {
      const shown = await h.photosShown(page);
      throw failure(page, `Expected the search for "${this.immichSearch.name}" to find the photo taken on "${date}", but it finds ${shown.length ? shown.map((d) => `"${d}"`).join(', ') : 'nothing'}.`, { hint: 'The search is by the file\'s original name, from its start.' });
    }
    return;
  }
  const shown = await h.photosShown(page);
  if (this.immichSearch.found || shown.length) {
    throw failure(page, `Expected the search for "${this.immichSearch.name}" to find nothing, but it finds ${shown.length ? shown.map((d) => `the photo taken on "${d}"`).join(', ') : `${this.immichSearch.found} item(s)`}.`, { hint: 'Search for a name no file of the library has.' });
  }
});
