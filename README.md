# immich-steps

Cucumber step definitions for Immich, the self-hosted photo and video library, for
[webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation harness built on Playwright and
Cucumber-js.

Immich keeps a library of photos and videos: it takes uploads, draws them in a timeline by date, gathers them into
albums, shares them through links, keeps what is deleted in a trash for a while, and has an API every client uses,
signed in with a session or an API key. The steps work on its pages and its API, and wait on its uploads, its timeline
and its messages, never for a fixed time. No step phrase names the product.

The steps, their features, the sample library and CI come with the first release, `2.0.0`.
