# Keep the charge state marker on a PersistentVolumeClaim

- Status: accepted
- Date: 2026-11-06

## Context and Problem Statement

If a run is killed mid-charge, the battery can stay in `charge` mode. On the next run, the job must clear only the charges it started, so a charge set by a user is left alone. Each CronJob run is a new pod, so the record of "this job started the charge" must survive pod restarts.

## Considered Options

- Marker file on a PersistentVolumeClaim
- ConfigMap written by the job
- Infer ownership from the charge start time

## Decision Outcome

Chosen option: "marker file on a PersistentVolumeClaim", because it survives pod replacement without granting the job permission to modify cluster objects.

### Consequences

- Good, because the job needs no RBAC permissions beyond its mounted volume.
- Good, because the marker is removed after a clean restore, so a stale marker signals an unclean run.
- Bad, because the job cannot start a charge if the PVC is unavailable, which means a failed night with no grid charge.
- Bad, because the PVC is a stateful dependency that must be provisioned and backed up with the cluster.
