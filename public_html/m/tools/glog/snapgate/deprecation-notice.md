## Snapgate (Deprecated)

Snapgate is being deprecated and parked for reference.

The original design tightly coupled:

- Version bumping in `package.json`

- Changelog enforcement

- Snapshot building (`dist/`)

- Release manifest generation

- Git tagging

While this provided strong atomic guarantees, it also introduced complexity and diverged from standard CI/CD practice for deployable services.

### Why We Are Deprecating Snapgate

We are transitioning to a leaner, industry-aligned release model:

- Every commit produces a build artifact identified by its commit SHA.

- Thorough testing occurs against that immutable artifact.

- When approved, a Git tag is applied directly to the tested commit.

- No rebuild occurs at release time.

- Git tags serve as the canonical version source of truth.

This aligns with modern continuous delivery principles:

- Immutable artifacts

- No mutation at promotion time

- Tag-based release promotion

- Git as the version authority

### New Direction (Draft v2)

The new draft release flow:

1. Build and deploy snapshot per commit.

2. Test thoroughly.

3. When approved:
   
   `git tag -a vX.Y.Z <tested_commit> git push origin vX.Y.Z`

4. Build metadata (commit, tag, mode) is injected via Vite at build time.

Release is now a lightweight tagging operation, not a build event.

### Transitional Note

The Snapgate scripts are retained temporarily for reference and potential code reuse.

They will be removed once the new release flow is finalised and validated.
