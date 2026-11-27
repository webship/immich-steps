# Each scenario fails at its last step by design. They leave the demo as they found it: what they upload is test
# content, removed after them.
@must-fail @removes-test-content
Feature: The library's API, asserted wrong
  Each scenario asserts something about the API that is not true, at its last step.

  Background:
    Given the API base URL is "/"

  Scenario: An upload through an API that is not signed in
    Fails with: The API is not signed in: this step sends its request as a signed-in account.
    When I upload "webship-test-green.jpg" to the library through the API

  Scenario: A file the library does not hold
    Fails with: Expected the library to hold "webship-test-blue.jpg", but its search finds no such file outside the trash.
    Given I am signed in to the library's API as "user"
    Then the library should hold "webship-test-blue.jpg"

  Scenario: A file the library holds, asserted away
    Fails with: Expected the library not to hold "webship-test-green.jpg", but it holds it
    Given I am signed in to the library's API as "user"
    When I upload "webship-test-green.jpg" to the library through the API
    Then the library should not hold "webship-test-green.jpg"

  Scenario: An API key of an account the users registry does not have
    Fails with: The user "nobody" is not in the users registry
    Given the library's API uses a key of "nobody"
