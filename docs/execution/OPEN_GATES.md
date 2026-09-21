# Open Gates

**Project**: Kashyap Adhikari Family Tree  
**Owner**: Jyphra Technology Pvt. Ltd.

## Purpose

This document tracks all items requiring explicit human, cultural, legal, religious, or executive approval before they can be activated, deployed, or released. These are not feature deferrals — the engineering implementation proceeds with disabled-by-default capability, test doubles, and configuration gates.

## Gate Register

### Cultural / Religious Authority Gates

| Gate ID | Item | Required Authority | Engineering Status | Activation Criteria | GitHub Issue |
|---------|------|-------------------|-------------------|--------------------| ------------|
| HG-002 | Nata/Saino relationship terminology rules | Community/Religious Representative (two-person approval: Cultural Reviewer + Senior Authority) | Engine implemented, versioned config, reference test framework ready | Signed rule catalogue with all path-to-term mappings | TBD |
| HG-003 | Jutho duration/exception/color rules | Community/Religious Representative (two-person approval) | Engine implemented, versioned config, reference test framework ready | Signed Jutho rule catalogue with relationship-to-duration mappings | TBD |
| HG-004 | Tithi/Shraddha calendar rules/source | Religious Representative + Product Owner | Adapter pattern implemented, fallback to unavailable state | Approved provider/source and conversion rules | TBD |
| HG-005 | Cultural content canon | Governing Committee | CMS with draft/review/approve/publish lifecycle | Approved initial content catalogue | TBD |

### Legal / Privacy Gates

| Gate ID | Item | Required Authority | Engineering Status | Activation Criteria |
|---------|------|-------------------|-------------------|-------------------|
| HG-006 | Nepal legal/privacy review | Nepal-qualified legal counsel | Configurable retention, consent framework, DPIA template | Signed legal review of all data practices |
| HG-017-L | Terms of service / privacy policy text | Jyphra Legal | Placeholder surfaces ready | Approved legal text |

### Executive / Business Gates

| Gate ID | Item | Required Authority | Engineering Status | Activation Criteria |
|---------|------|-------------------|-------------------|-------------------|
| HG-001 | Software license selection | Jyphra executive | LICENSE_DECISION_REQUIRED.md placeholder | License decision communicated |
| HG-008 | Production cloud provider | Jyphra executive | IaC with provider adapters, portable design | Provider selected and budget approved |
| HG-012 | Production data migration | Jyphra PO + Data Steward | Import tooling with dry-run/reconciliation | Approved migration plan and data readiness |
| HG-013 | App Store submission | Jyphra executive | Store-ready builds, screenshots, metadata | Go decision from executive |
| HG-014 | Production go-live (G6) | Jyphra executive | All release gates passed | Executive sign-off on Final Release Readiness Report |

### Credential / External Service Gates

| Gate ID | Item | Required Authority | Engineering Status | Activation Criteria |
|---------|------|-------------------|-------------------|-------------------|
| HG-007 | Apple Developer certificates/profiles | Jyphra + Apple | Flutter iOS code compiles, macOS CI path documented | Certificates provisioned |
| HG-009 | OTP/SMS provider credentials | Jyphra procurement | Adapter interface + test double | Contract signed, credentials in secret manager |
| HG-010 | Push notification credentials | Jyphra + Google/Apple | FCM/APNs adapter + test double | Credentials provisioned |
| HG-011 | Maps API key | Jyphra procurement | Maps adapter + test double | API key provisioned |
| HG-015 | Docker Desktop D-drive config | DevOps | Documented configuration steps | Docker data root verified on D: |
| HG-016 | GitHub `gh` CLI authentication | Developer | HTTPS git push works | `gh auth login` completed |
| HG-017 | Branch protection rules | Repository owner | Development continues on unprotected branches | Protection configured via GitHub settings |

## Gate Dependency Map

```
HG-002, HG-003, HG-004 ──→ Domain rule activation ──→ RG-02 (Release Gate)
HG-005 ──→ Cultural content publication ──→ RG-04
HG-006 ──→ Legal compliance sign-off ──→ RG-07
HG-007, HG-010 ──→ iOS build signing ──→ RG-10
HG-008 ──→ Production infrastructure ──→ RG-09
HG-009 ──→ OTP in production ──→ RG-04
HG-012 ──→ Data migration ──→ RG-03
HG-013, HG-014 ──→ Production release ──→ RG-12 (Go-Live)
```

## Protocol

- Engineering implements the full capability with adapter/config gates
- Test doubles are clearly separated from production adapters
- Disabled capabilities have neutral fallback behavior (e.g., "Nata/Saino term pending approval")
- Each gate has a GitHub issue for tracking
- Gate closure requires documented evidence and explicit authority sign-off
- No gate can be silently bypassed or self-approved

---

*Last updated: 2026-09-09*
