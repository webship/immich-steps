@removes-test-content
Feature: The library's API
  The API every client of the library uses, signed in with a token or an API key: it takes an upload, says who is
  signed in, and refuses a key it does not know. No browser is needed, so these scenarios run without JavaScript too.

  Background:
    Given the API base URL is "/"

  Scenario: Signed in with a token, the API takes an upload, and the library holds it
    Given I am signed in to the library's API as "user"
    When I upload "webship-test-green.jpg" to the library through the API
    Then the library should hold "webship-test-green.jpg"
    And the library should not hold "webship-test-blue.jpg"

  Scenario: An API key signs the requests on its own
    Given the library's API uses a key of "user"
    When I send a GET request to "/api/users/me"
    Then the API response code should be 200
    And the API response should contain "Webship user"

  Scenario: A key the library does not know is refused
    Given I set the header "x-api-key" to "not-a-key"
    When I send a GET request to "/api/users/me"
    Then the API response code should be 401
    And the API response should contain "Invalid API key"

  Scenario: The server answers its ping
    When I send a GET request to "/api/server/ping"
    Then the API response code should be 200
    And the API response should contain "pong"
