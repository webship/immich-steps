# Each scenario fails at its last step by design. They leave the demo as they found it: what they make is test
# content, removed after them.
@must-fail @needs-javascript
Feature: Signing in, asserted wrong
  Each scenario asserts something about signing in that is not true of the demo, at its last step.

  Scenario: An account the users registry does not have
    Fails with: The user "nobody" is not in the users registry
    When I sign in to the library as "nobody"

  Scenario: The first-run wizard of an account that has met it already
    Fails with: Expected the library's first-run wizard, but the page is
    When I sign in to the library as "user"
    And I get past the library's first-run wizard

  # The browser logs the refused sign-in (a 401) as a console error.
  @js-warn
  Scenario: A message the form does not show
    Fails with: Expected the library to say "Welcome back", but it says
    When I sign in to the library as "user" with a wrong password
    Then the library should say "Welcome back"
