# Privileged absolute session age

All six authority roles (super, central and branch administrators, branch
verifiers, cultural historians and community moderators) now require a session
whose original OTP authentication is less than one hour old. This fixed initial
policy is enforced by the API's JWT strategy using current database assignments,
not token role claims or the client clock. Expired/unknown-age privileged
sessions are revoked and return SESSION_EXPIRED, using existing login handling.

Migration 039 adds nullable authenticated_at with a database default for new
sessions. Existing rows intentionally remain NULL: earlier refresh chains did
not retain the original login timestamp. Ordinary members may continue using
those sessions, but acquiring an authority role requires fresh authentication.
The down migration refuses rollback while any active session remains.

Refresh rotation copies authenticated_at exactly, including NULL. Under the
existing session row lock it reads current database roles and rejects an expired
privileged session before creating a successor. AuthService rechecks current
authority after rotation, and every subsequent authenticated request checks it
again. The refresh token's ordinary expiry does not override this limit.
Current role changes still have their normal transaction visibility; this does
not claim to serialize every operation against simultaneous role assignment.

Eight policy unit cases cover all authority roles, exact expiry boundaries,
unknown/invalid/future timestamps and ordinary users. Two real PostgreSQL HTTP
cases cover original-time preservation, revoked predecessor, bearer rejection,
refresh rejection without successor creation, later elevation, legacy NULL and
fresh login. The existing WebSocket gateway also calls the JWT strategy when
validating authenticated frames; no new dedicated device/socket acceptance is
claimed here.

The previous cookie-origin patch exposed browser test setup requests carrying
shared cookies without Origin. Trusted test contexts now explicitly supply the
portal Origin. An additional independent Playwright API context deliberately
omits it and verifies 403 for missing/opaque/hostile origins, while a trusted
origin reaches normal invalid-refresh rejection (401). No production origin
check was weakened to accommodate tests.

Local API typecheck/build and 187 unit tests passed. Remote exact-head results
are tracked in PR #5; prior-head browser failures are not passing evidence.

AUTH-FR-012 is partially implemented: independently enforced MFA enrollment,
challenge, recovery and administration remain required. Idle timeout, stronger
admin login separation, deployed security assessment and all original signed
acceptance gates remain open. This is an absolute session-age control, not MFA.

Reference: OWASP Session Management Cheat Sheet
https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
distinguishes absolute lifetime from renewal and requires server enforcement.
One hour is this project's initial conservative implementation choice, not an
OWASP-mandated duration; production usability/security review remains required.
