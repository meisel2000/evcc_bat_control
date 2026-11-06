# ADR Review Manifest

- Status: completed
- Review date: 2026-11-06

## Review Summary

ADR review completed for this change. Two durable architectural decisions were recorded.

## In-Force ADRs Reviewed

- None. `adr/` had no in-force ADRs before this change.

## New Durable ADRs Created

- `adr/0001-one-shot-cronjob-process.md`: the job runs as a one-shot process owned by a Kubernetes CronJob.
- `adr/0002-state-marker-on-persistent-volume.md`: the startup-recovery marker lives on a PersistentVolumeClaim.
