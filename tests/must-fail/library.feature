# Each scenario fails at its last step by design. They leave the demo as they found it: what they upload is test
# content, removed after them.
@must-fail @needs-javascript @removes-test-content
Feature: Photos in the library, asserted wrong
  Each scenario asserts something about the photos that is not true, at its last step.

  Background:
    Given I am signed in to the library as "user"

  Scenario: A file there is none of
    Fails with: There is no file "no-such-photo.jpg" to upload. Known files:
    When I upload "no-such-photo.jpg" to the library

  Scenario: A date no photo was taken on
    Fails with: Expected the timeline to show the photo taken on "July 4, 1999", but it shows "May 1, 2024"
    When I upload "webship-test-red.jpg" to the library
    Then the timeline should show the photo taken on "July 4, 1999"

  Scenario: A photo that is not on the page, opened
    Fails with: Expected a photo taken on "July 4, 1999" to open, but the page shows "May 1, 2024"
    When I upload "webship-test-red.jpg" to the library
    And I open the photo taken on "July 4, 1999"

  Scenario: Details the photo does not have
    Fails with: Expected the photo's details to say "Another camera", but they say:
    When I upload "webship-test-red.jpg" to the library
    And I open the photo taken on "May 1, 2024"
    Then the photo's details should say "Another camera"

  Scenario: A favorite that is not one
    Fails with: Expected the photo to be a favorite (the viewer offering "Unfavorite"), but it is not.
    When I upload "webship-test-blue.jpg" to the library
    And I open the photo taken on "August 15, 2023"
    Then the photo should be a favorite

  Scenario: A photo in a trash that is empty
    Fails with: Expected the trash to hold the photo taken on "May 1, 2024", but it holds nothing.
    When I upload "webship-test-red.jpg" to the library
    Then the trash should hold the photo taken on "May 1, 2024"

  Scenario: A question a button does not ask
    Fails with: Expected the library to ask before "Upload", but no question showed.
    When I confirm "Upload"
