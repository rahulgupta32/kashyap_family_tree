# Cookie origin enforcement and production security priorities

## Verified source finding

The API bootstrap reused its CORS origin predicate for cookie-authenticated
mutations. That predicate intentionally permits requests without Origin for
native/server clients, so the mutation guard also permitted missing Origin,
despite its rejection message. This was a defense-in-depth gap; this review does
not establish a demonstrated exploit or bypass of cookie SameSite protections.

The bootstrap now installs a dedicated cookie-origin middleware. POST, PUT,
PATCH and DELETE carrying an exact refreshToken cookie require an explicitly
trusted Origin; absent, opaque (`null`) and untrusted origins receive 403.
Safe reads and native bearer requests without refresh cookies retain their
existing behavior. CORS is not an authorization boundary.

Nine HTTP regression cases run through an Express listener using Supertest,
covering each mutation verb, hostile origins, trusted origins, native requests,
safe reads and similarly named cookies. These tests exercise the actual shared
middleware, independently of database fixtures.

## Production blockers and next implementation priorities

1. AUTH-FR-012 / ADM-FR-001: independently enforced administrator MFA and shorter
   privileged sessions remain missing. JWT validation currently reloads live
   roles and checks persistent session ownership/revocation, but those checks
   do not establish a second factor or privileged-session expiry policy.
2. Preserve original authentication time across refresh successors before
   claiming an absolute session limit; each current successor has a new
   created_at. Enforce any privileged policy at the server, including role
   elevation, recovery, enrollment and refresh paths.
3. Review web credential storage, XSS/CSP and secure headers, proxy/TLS/CORS
   configuration, distributed abuse limits, object/branch authorization,
   upload/storage isolation, secret handling and dependency exposure against
   concrete threat scenarios. No complete assessment is claimed here.
4. Before production, obtain independent security testing of deployed staging,
   provider/IAM validation, monitoring and incident response, backup restoration
   and rollback evidence, alongside all remaining mandatory acceptance gates.

Reference: OWASP Session Management Cheat Sheet,
https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
requires server-side timeout enforcement and distinguishes idle, absolute and
renewal limits. Security review must continue alongside feature implementation;
passing functional tests does not establish immunity to attacks.

No acceptance rows or cultural gates are closed by this change. PR #5 remains
draft. This report does not authorize or record a merge or deployment.
