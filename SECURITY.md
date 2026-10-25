# Security Policy

## Scope

This is a personal project that collects public cryptocurrency market data and
serves it as a dashboard. It holds no user accounts, no personal data and no
private information. The most sensitive assets are the cloud credentials used to
deploy it, so most of the hardening here is aimed at protecting those.

## Reporting a vulnerability

Please report suspected vulnerabilities privately through
[GitHub Security Advisories](https://github.com/Isma-L154/Serverless-Crypto-Pipeline/security/advisories/new)
rather than opening a public issue.

Include the affected component, what an attacker could achieve, and the steps to
reproduce it. I will acknowledge the report within a week. Since this is a
personal project maintained in my spare time, please treat any fix timeline as
best effort.

## What is in scope

- The Cloudflare Worker and its API endpoints
- The Terraform configuration and the IAM permissions it grants
- The GitHub Actions workflows and their access to cloud credentials
- Dependency vulnerabilities that are actually reachable from this code

## What is not in scope

- Vulnerabilities in CoinGecko or any other upstream provider
- Denial of service against the public dashboard
- Missing hardening that has no practical impact on a project with no user data
- Reports produced by a scanner without evidence that the issue is exploitable here

## Baseline security controls

The project keeps these seven baseline controls in place:

1. **Credentialless source control:** no long-lived cloud credentials are committed.
2. **Federated deployment auth:** GitHub Actions deploys with OIDC and short-lived AWS role assumptions.
3. **Least-privilege infrastructure:** IAM permissions are constrained to only the resources this project needs.
4. **Secret leak prevention:** GitHub secret scanning and push protection are enabled.
5. **Dependency and supply-chain hygiene:** Dependabot tracks vulnerable dependencies and workflow actions are pinned to commit SHAs.
6. **Static and dynamic analysis in CI:** CI runs tests and CodeQL scans pull requests for regressions and security issues.
7. **Runtime abuse controls:** API endpoints are rate-limited and served with strict security headers.

## How this project protects credentials

- No long-lived cloud keys are stored in the repository. Deployments to AWS
  authenticate through GitHub OIDC and assume a role scoped to this repository.
- The deploy role is granted only the permissions this project needs, rather
  than broad administrative access.
- Terraform state and variable files are excluded from version control, since
  state can contain resource details that should not be public.
- Secret scanning and push protection are enabled, so known credential formats
  are blocked before they can be committed.
- Dependencies are monitored by Dependabot, and GitHub Actions are pinned to a
  commit SHA so a moved tag cannot silently change what runs in CI.
