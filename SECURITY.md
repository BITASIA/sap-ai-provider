# Security policy

This security policy applies to all repositories in the
[mymediset GitHub organization](https://github.com/BITASIA). If you find a
security vulnerability in any of our projects, we want to know about it — and
we'll work with you to fix it quickly.

## Reporting a vulnerability

**Don't open a public issue.** Public issues expose the vulnerability to
everyone before we have a chance to fix it.

Instead, use one of these two channels:

- **GitHub private vulnerability reporting (preferred):** On the affected
  repository's main page, go to **Security → Report a vulnerability**. GitHub
  encrypts the report and routes it directly to our security team. You get
  automated status updates as we work through triage and remediation.

- **Email:** Send details to **security@mymediset.net**. Encrypt your message
  with our PGP key if the details are especially sensitive — key available on
  request.

Include as much of the following as you can:

- The repository name and affected version or branch
- A clear description of the vulnerability and its potential impact
- Steps to reproduce, or a proof-of-concept
- Any suggested mitigations you've already identified

## What to expect

| Milestone | Target |
|---|---|
| Initial acknowledgment | Within 2 business days |
| Severity triage and owner assignment | Within 5 business days |
| Remediation or mitigation shipped | Within 90 days for critical/high severity |
| Public disclosure | Coordinated with you after a fix is available |

We follow coordinated disclosure. We ask that you give us reasonable time to
fix the issue before publishing details publicly. In return, we commit to
keeping you updated throughout the process and crediting you in the advisory
if you'd like.

## Supported versions

We actively maintain the latest production version of each service. If you're
reporting a vulnerability in an older version, let us know — we'll assess
whether a backport is feasible.

## Scope

This policy covers vulnerabilities in code, configuration, and infrastructure
owned by the mymediset organization. Out of scope:

- Vulnerabilities in third-party dependencies (report those upstream;
  we track them via Dependabot)
- Issues that require physical access to our infrastructure
- Social engineering attacks against our team

## Safe harbor

We support responsible security research. If you act in good faith under this
policy, we won't pursue legal action against you. We treat good-faith reports
as authorized activity and won't file complaints with law enforcement.
