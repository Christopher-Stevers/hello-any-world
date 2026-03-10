# Running Multiple EKS Stacks in One AWS Account

This guide shows you how to:

1. Use this infrastructure as a **template for brand-new projects**
2. Run **independent `dev` and `prod` infrastructure** in the same AWS account (or across accounts) without collisions

It is written for the current CDK/EKS setup in this repository.

---

## Goals

When you follow this guide, you will have:

- unique stack/resource names per environment
- isolated IAM roles for CI/CD per environment
- separate GitHub environment secrets/variables for `dev` and `prod`
- predictable deployment workflows with low risk of cross-environment impact

---

## Core design decision: environment-aware naming

Use one required environment identifier (`STACK_ID`) and include it in all fixed names.

Examples:

- `STACK_ID=dev`
- `STACK_ID=prod`

Derived names:

- CloudFormation stack: `EksStack-${STACK_ID}`
- EKS cluster: `${PROJECT_SLUG}-eks-${STACK_ID}`
- ECR repo: `${PROJECT_SLUG}-express-${STACK_ID}`
- GitHub OIDC role: `${PROJECT_SLUG}-${STACK_ID}-github-actions`
- Kubernetes namespace: `apps-${STACK_ID}` (or `apps` if you prefer shared naming)

> If a resource supports generated physical names, you can let CloudFormation generate one to reduce collision risk.

---

## Section A — Using this repo as a template for NEW projects

Use this section when cloning/copying this infra into a new project.

## 1) Define project-level naming inputs

Choose and standardize:

- `PROJECT_SLUG` (short, lowercase, unique-ish), e.g. `acme-api`
- `AWS_REGION`, e.g. `us-east-1`
- default environments to support, at minimum: `dev`, `prod`

Recommended convention:

- project + env in every fixed resource name
- never hardcode a global/shared name like `hello-express` across projects

## 2) Replace hardcoded config values with environment-driven values

In your config layer (currently `infra/cdk/lib/config.ts`), move from static strings to values derived from env vars and conventions.

At minimum, make these environment-aware:

- `clusterName`
- `ecrRepoName`
- IAM role names (if explicitly set)
- namespace (optional but recommended)
- GitHub repo/branch settings used in OIDC trust

Recommended inputs:

- `STACK_ID` (required for deploy)
- `PROJECT_SLUG` (required)
- `AWS_REGION`
- `GITHUB_OWNER`
- `GITHUB_REPO`
- `GITHUB_BRANCH` (or environment-specific branch mapping)

## 3) Keep defaults safe for local synth, strict for deploy

Practical pattern:

- local synth can default to `dev`
- CI deploy should fail fast if `STACK_ID`/`PROJECT_SLUG` are missing

This avoids accidental deploys with generic names.

## 4) Tag resources for governance/cost

Apply tags globally (stack-level if possible):

- `Project`
- `Environment`
- `Owner`
- `CostCenter`
- `ManagedBy=CDK`

This pays off when running multiple stacks/projects later.

---

## Section B — Running independent DEV and PROD infrastructure

Use this section for environment isolation in a single account or multi-account setup.

## 1) Decide isolation model

### Option 1: Same AWS account, separate stacks (minimum)
- `EksStack-dev`
- `EksStack-prod`
- unique names for cluster/ECR/roles/etc.

### Option 2: Separate AWS accounts (strongest isolation, recommended for production)
- one stack per environment account
- same naming pattern still useful
- lower blast radius and cleaner permissions boundaries

If you can, choose Option 2 for production.

## 2) Deploy each environment with explicit stack name + env vars

Use distinct deploy invocations per environment.  
Key principle: never deploy `prod` with `dev` variables.

Minimum variable set per environment:

- `STACK_ID`
- `PROJECT_SLUG`
- `AWS_REGION`
- GitHub OIDC claim inputs (owner/repo/branch)

## 3) Keep CI credentials independent per environment

Create one IAM OIDC role per env:

- `${PROJECT_SLUG}-dev-github-actions`
- `${PROJECT_SLUG}-prod-github-actions`

Scope trust and permissions separately:

- dev role can only target dev cluster/resources
- prod role can only target prod cluster/resources

Avoid one “super role” for all environments.

## 4) Use GitHub Environments for separation

Create GitHub Environments:

- `dev`
- `prod`

Store environment-scoped secrets/vars there:

- `AWS_ROLE_TO_ASSUME`
- `AWS_REGION`
- `EKS_CLUSTER_NAME`
- `ECR_REPOSITORY_URI`
- `K8S_NAMESPACE`
- optional Helm release/value settings

Enable protection rules on `prod` (required reviewers, branch restrictions).

---

## GitHub OIDC trust policy guidance (important)

Your trust policy should be strict and environment-specific.

Recommended approach:

- `dev` role trusts only dev deployment branch/workflow context
- `prod` role trusts only main/release branch + protected workflow path

At minimum, keep `sub` claim narrowed to exact repo + branch pattern(s), and keep `aud=sts.amazonaws.com`.

---

## Handling existing retained resources (`RETAIN` policy)

You already use retention on some resources (e.g., ECR).  
This means deleting stacks does not always delete physical resources.

Consequences:

- recreating a stack with the same fixed name can fail (`already exists`)

Mitigations:

1. Prefer unique names per env/project
2. Import existing resources intentionally when appropriate
3. Manually clean old retained resources before recreating same-name infra

---

## Recommended rollout plan (from current state)

1. Introduce `PROJECT_SLUG` + `STACK_ID` naming everywhere fixed names exist.
2. Deploy `dev` as first validated target.
3. Update workflow to use GitHub `environment: dev`.
4. Create `prod` OIDC role + secrets/vars under GitHub Environment `prod`.
5. Deploy `prod` with separate stack name and environment values.
6. Add branch protection and environment approval gates for prod.
7. Document recovery/runbook per environment.

---

## Operational guardrails for independent dev/prod

- Use stricter DB settings in prod:
  - higher backup retention
  - deletion protection enabled
  - stronger instance sizing and monitoring
- Set separate budgets/alerts by `Environment` tag
- Keep Helm release names/namespace environment-specific if sharing patterns
- Restrict who can trigger prod workflows
- Periodically validate OIDC trust policy conditions

---

## Quick troubleshooting

- **`Repository already exists`**
  - fixed ECR name collision; include env/project in name or import existing repo.

- **OIDC `Could not load credentials` in GitHub Actions**
  - role ARN secret/var name mismatch in workflow vs repo/environment settings.

- **OIDC `AssumeRoleWithWebIdentity` denied**
  - trust policy `sub` does not match repo/branch/workflow context.

- **CloudFormation output confusion**
  - read outputs from top-level app stack (`EksStack-*`), not nested provider stacks.

---

## Minimal checklist (copy/paste)

- [ ] `PROJECT_SLUG` defined
- [ ] `STACK_ID` required for deploy
- [ ] Stack name includes env (`EksStack-dev`, `EksStack-prod`)
- [ ] Cluster/ECR/IAM fixed names include env
- [ ] Separate OIDC role for dev and prod
- [ ] GitHub Environments created (`dev`, `prod`)
- [ ] Environment-scoped secrets/vars configured
- [ ] Prod workflow has approvals/protection
- [ ] Tags applied for project/environment/cost
- [ ] Retained resource strategy documented

---

## Summary

To use this infra reliably across new projects and independent `dev`/`prod` environments:

- make naming deterministic and environment-aware
- separate CI roles and secrets by environment
- protect production workflow paths
- treat retained resources intentionally

With this pattern, you can safely scale from one-off deployments to repeatable multi-environment operations.