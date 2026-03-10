# Setup Learnings: EKS + Helm Deployment

This document captures the most important learnings from setting up and deploying `express-server` to EKS using Helm and GitHub Actions.

## 1) Kubernetes/EKS Connection Basics

### Required tools
- AWS CLI
- `kubectl`
- `helm` (for chart deploys)

### Connect to cluster
Use the same values as CI:

```/dev/null/eks-connect.sh#L1-1
aws eks update-kubeconfig --name my-monorepo-eks --region us-east-1
```

Verify access:

```/dev/null/eks-verify.sh#L1-3
kubectl config current-context
kubectl get nodes
kubectl get ns
```

### Common access issues
- Wrong cluster name/region
- Missing AWS credentials/session token
- IAM principal not authorized in EKS RBAC
- Network/VPN restrictions to cluster endpoint

---

## 2) Helm Deploy Behavior (`upgrade --install`)

### Key behavior
`helm upgrade --install` is create-or-update:
- If release does not exist: installs it
- If release exists: upgrades it

This is the correct command pattern for idempotent CI deploys.

### CI command shape used
- Set `image.repository`
- Set `image.tag`
- Set service target port
- Set existing secret name for env file source

---

## 3) Root Cause of Deployment Failure

### Observed error
Deployment failed with duplicate `volumeMounts` on:

- `mountPath="/app/.env"`

### Why it happened
Chart logic allowed multiple env file sources to render simultaneously:
- default `envFile.config` (from `values.yaml`)
- plus `envFile.existingSecretName` (from CI override)

Both rendered mounts to the same path, which Kubernetes rejects as duplicate entries.

---

## 4) Correct Chart Pattern for Env File Source

### Rule
Only one env file source should be active at a time.

### Preferred precedence
1. `envFile.existingSecretName` (best for production secret management)
2. `envFile.secret` (chart-managed secret values)
3. `envFile.config` (non-secret config map fallback)

### Practical fix
Use mutually exclusive `if / else if` blocks for:
- `volumeMounts`
- `volumes`

This guarantees only one mount at `/app/.env`.

---

## 5) CI Override Pitfalls and Best Practices

### Pitfall seen
Passing `--set envFile.secret={}` triggered Helm type warning:
- “cannot overwrite table with non table …”

### Best practice
- Do **not** set `envFile.secret` unless providing real key/value data.
- If using existing Kubernetes secret, only set:
  - `envFile.existingSecretName=<secret-name>`

### Recommended CI settings for this app
- `envFile.existingSecretName=express-server-db`
- leave `envFile.secret` unset
- keep image and service overrides explicit in CI

---

## 6) Ingress Warning Learning

Observed warning:
- `kubernetes.io/ingress.class` annotation is deprecated.

### Best practice
Prefer:
- `spec.ingressClassName`

Keep annotation-based class only if needed for older controller compatibility.

---

## 7) Operational Checklist Before Deploy

1. Confirm EKS access:
   - `kubectl get nodes`
2. Confirm target namespace:
   - `kubectl get ns apps || kubectl create ns apps`
3. Confirm secret exists:
   - `kubectl -n apps get secret express-server-db`
4. Render chart locally when debugging:
   - `helm template ...` and inspect `volumeMounts`/`volumes`
5. Deploy with:
   - `helm upgrade --install ...`
6. Verify rollout:
   - `kubectl -n apps rollout status deploy/express-server`
   - `kubectl -n apps get pods`

---

## 8) Final Takeaways

- `upgrade --install` is the right deployment primitive for CI.
- Chart values that represent alternative sources must be mutually exclusive in templates.
- Avoid forcing empty map/object values via `--set` unless type behavior is fully understood.
- Keep secret source strategy simple: prefer `existingSecretName` in production.
- Validate rendered manifests when errors mention duplicate fields or patch failures.