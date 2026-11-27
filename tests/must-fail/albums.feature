# Each scenario fails at its last step by design. They leave the demo as they found it: what they make is test
# content, removed after them.
@must-fail @needs-javascript @removes-test-content
Feature: Albums, shared links and search, asserted wrong
  Each scenario asserts something about albums, links or search that is not true, at its last step.

  Background:
    Given I am signed in to the library as "user"

  Scenario: An album the library does not have
    Fails with: Expected an album "Webship test nowhere", but the library has
    Then the album "Webship test nowhere" should hold 1 item

  Scenario: A count the album does not have
    Fails with: Expected the album "Webship test album" to hold 2 items, but its page says "1 item"
    When I upload "webship-test-red.jpg" to the library
    And I create the album "Webship test album" with the photo taken on "May 1, 2024"
    Then the album "Webship test album" should hold 2 items

  Scenario: A shared link the scenario did not make
    Fails with: There is no shared link to open: the scenario has not made one.
    When I open the shared link signed out

  Scenario: A search that finds what it should not
    Fails with: Expected the search for "webship-test-red" to find nothing, but it finds the photo taken on "May 1, 2024"
    When I upload "webship-test-red.jpg" to the library
    And I search the library for the file name "webship-test-red"
    Then the search should find nothing
