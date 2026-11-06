# Run the battery grid-charge job as a one-shot Kubernetes CronJob

- Status: accepted
- Date: 2026-11-06

## Context and Problem Statement

The home battery must be charged from the grid during a daily window (00:00 to 06:00, November to February). The job runs in a minimal container inside the same Kubernetes cluster as evcc. The schedule must be owned by the cluster, not by application code, so the operator can adjust it without a rebuild.

## Considered Options

- One-shot process run by a Kubernetes CronJob
- Long-running process with an internal scheduler

## Decision Outcome

Chosen option: "one-shot process run by a Kubernetes CronJob", because the cluster already provides scheduling, missed-start handling, and concurrency control, and the job holds no state between runs beyond what it writes to the state marker.

### Consequences

- Good, because the schedule, time zone, months, and `concurrencyPolicy: Forbid` live in the manifest.
- Good, because a run ends when its charge ends, so no pod stays alive all day.
- Bad, because each run starts a new pod, so any state must live outside the pod (see ADR-0002).
