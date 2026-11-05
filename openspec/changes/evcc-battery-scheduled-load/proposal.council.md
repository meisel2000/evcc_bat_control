# Council Notes: proposal.md

## Author Summary
Draft revised to use the verified evcc API: `charge` mode via `POST /batterymode/charge`, `normal` mode via `POST /batterymode/normal` on restore, state from `GET /state` (`battery.soc`, `batteryMode`), 2 h maximum duration, one-shot Node.js/TypeScript job in a minimal Docker image run by a Kubernetes CronJob from November to February within the 00:00 to 06:00 tariff window.

## Reviewer Challenges
- Keep-alive interval was unspecified; the 60-second reset needs a margin.
- Startup recovery could override a user's manual charge or a run started outside the CronJob.
- Restore cannot run on SIGKILL or OOM; the 60-second evcc reset is the real backstop.
- Failure and retry semantics were ambiguous when the mode or SoC could not be read.
- Restore mechanism: `normal` versus `DELETE /batterymode`.
- Authentication mechanism was undefined; cookie auth is unsuitable for a headless job.
- Numeric values (target SoC, poll interval, timeouts, config schema) were missing.
- A 2 h cap can run past the 06:00 window end.
- No stall detection when SoC does not rise.
- Missed CronJob starts, cron expression, and time zone were unaddressed.
- Dry-run was missing from Capabilities and needed a no-POST rule.
- Tariff basis was stated as fact in Impact.
- "Pinned" overstated the API version commitment.
- Missing AGENTS.md process requirement and Non-goals about other battery consumers.
- Multiple batteries and `battery.soc` source ambiguity.

## Resolutions
- Accepted: 30-second keep-alive re-send, with the 60-second evcc reset stated as the backstop.
- Accepted: Startup recovery restricted to charge sessions this script started, tracked by a state marker.
- Accepted: Termination handling documented as best effort; evcc's 60-second reset is the guarantee.
- Accepted: Charge stops at the earliest of target SoC, 2 h, or 06:00.
- Accepted: No-progress timeout added; value to be set in config.
- Accepted: Config validation and refusal to start on invalid values.
- Accepted: API key via Kubernetes Secret; replaces cookie auth.
- Accepted: Dry-run performs reads only and sends no POST or DELETE.
- Accepted: Tariff basis moved from Impact to Risks; "pinned" reworded to "tested against".
- Accepted: AGENTS.md process requirement added to Impact.
- Accepted: Non-goal added for coordination with other battery consumers.
- Accepted: Single home battery stated as an assumption.
- Accepted: CronJob `startingDeadlineSeconds` and `terminationGracePeriodSeconds` named in Impact.
- Deferred: Exact numeric values (target SoC default, poll interval, timeouts, no-progress timeout) to specs.
- Deferred: Base image, Node version, NetworkPolicy, read-only filesystem, resource limits to design.
- Deferred: Whether a retry may start a new charge session after a failed night, and the Job `backoffLimit`, to specs.
- Deferred: Target SoC overshoot semantics and behaviour when the target exceeds battery capacity, to specs.
- Rejected: Using `DELETE /batterymode` for restore. The user explicitly chose `normal` mode.
- Rejected: Making the 2 h cap a non-configurable constant. It remains configurable in the config file.

## Remaining Risks
- Net savings after round-trip losses and evcc's own charging behaviour are unconfirmed.
- `charge` mode must be verified on the running evcc instance to grid-charge to target.
- A failed night gives no grid charge, and failures are visible only in logs.
- SIGKILL and node loss leave the battery in `charge` for up to 60 seconds before evcc's reset.
- evcc runs inside the same cluster, so its location and network path are known. Its Service address and any NetworkPolicy still need confirming in design.
