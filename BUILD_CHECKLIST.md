# Noir House build checklist

This is the single source of truth for the remaining build. An item is only marked complete after it has been built and checked.

## Current working product

- [x] Premium glossy-black dashboard and responsive iPad layout
- [x] Department-specific dashboards and department icons
- [x] Housekeeping room board with Ready and undo states
- [x] Restaurant table board with Food Away and undo states
- [x] Messaging, tasks, pins, handovers, calendar, guest requests and GM oversight interface
- [x] Initial D1 schema, permissions, session, audit and API foundation
- [x] R2 logical file binding declared as `FILES`

## Backend and live-data work

- [x] Save Housekeeping room status permanently in D1
- [x] Save Restaurant table status permanently in D1
- [x] Log every room/table change and undo in the audit trail
- [x] Connect the room and table boards to their live APIs
- [ ] Back messages, tasks, pins and handovers with D1 while retaining curated showcase examples for demonstrations
- [ ] Use one department account and PIN per department
- [ ] Enforce department, Front of House, GM and administrator permissions on the server
- [ ] Connect GM announcements, management decisions, watches and resolution actions
- [ ] Keep every action in one original issue thread; never create a duplicate conversation
- [ ] Connect delivery, viewed, acknowledged and dismissed receipts
- [ ] Store photos, PDFs and voice notes in R2, with their metadata in D1
- [ ] Verify the `FILES` binding is attached to the intended production R2 storage
- [ ] Add live multi-screen updates and reliable retry/offline handling
- [ ] Add normal and urgent notification delivery, including the correct department icon
- [ ] Add the 60-day retention process and authorised hold rules
- [ ] Add secure recovery, archive and audit-log access for authorised managers

## Product review and release checks

- [ ] Review each department dashboard and record its small differences
- [ ] Test complete Housekeeping-to-Front-of-House room flow
- [ ] Test complete Restaurant-to-Kitchen table flow
- [ ] Test GM decision and approval flows
- [ ] Test attachments and voice notes
- [ ] Test permissions so departments cannot view restricted guest information
- [ ] Test on laptop and iPad sizes, including touch controls
- [ ] Test outages, retries, duplicate prevention and busy-service traffic
- [ ] Run security and accessibility reviews
- [ ] Publish a verified production checkpoint and refresh the downloadable ZIP

## Reliable messaging checkpoint

- [x] Reject message sends without a stable client message ID
- [x] Prevent duplicate messages when a device retries the same send
- [x] Queue one durable delivery record for every recipient department
- [x] Provide cursor-based live synchronisation without caching
- [x] Record server delivery when the recipient department receives its sync event
- [x] Preserve unsent messages in an IndexedDB outbox while offline
- [x] Retry queued messages after connectivity returns
- [x] Create timed escalations for unacknowledged urgent and emergency messages
- [x] Cancel pending escalation when the recipient acknowledges the message
- [x] Record sends, receipts and escalations in the audit trail
- [x] Connect the current visual message composer to the authenticated reliable outbox
- [ ] Provision department accounts so live screens can authenticate to the messaging APIs
- [ ] Add a scheduled escalation worker so escalation does not depend on an active screen polling
- [ ] Run multi-device, outage, concurrency and sustained-load tests
