# Messaging reliability

## Implemented in the backend

- Every send requires a client-generated message ID. Retrying the same send returns the original message instead of creating a duplicate.
- Messages and their recipient delivery records are written to D1 before the API reports that the message is queued.
- Each recipient department has an independent queued, delivered or failed delivery state.
- Department screens can request ordered events using a cursor. The response is explicitly non-cacheable.
- Receipt events record delivered, viewed, acknowledged and dismissed times and the acting identity.
- Urgent messages are due for escalation after five minutes; emergencies after one minute. Acknowledgement cancels an escalation that has not fired.
- Send, receipt and escalation actions append an audit event.
- The browser outbox uses IndexedDB, preserves messages across reloads and retries them when connectivity returns.

## Still required before a hotel pilot

- The visual dashboard is not yet authenticated against the department account system, so its current demo composer is not using the reliable outbox.
- Escalations are currently evaluated whenever a department performs a live sync. A scheduled worker is required to guarantee escalation while every dashboard is offline.
- Real device tests must cover disconnected Wi-Fi, browser suspension, duplicate sends, rapid reconnects and clock differences.
- Load tests must confirm service at the intended message volume and busy-service bursts.
- Operational monitoring, alerting, backup restoration and a documented incident process are required.
- The hash-linked audit writer needs concurrency testing before it can be described as tamper-evident under simultaneous hotel traffic.

