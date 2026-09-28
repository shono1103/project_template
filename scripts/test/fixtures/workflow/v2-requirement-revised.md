---
id: T-016
workflowVersion: 2
status: open
phase: implement
requirementRevision: 2
createdAt: 2026-09-28
updatedAt: 2026-10-02
completedAt:
closureReason:
requestedBy: human/saiki
createdBy: agent/codex
blockedBy: []
relatedTasks: []
workflow:
  plan:
    status: done
    attempt: 2
    assignee: agent/codex
    completedBy: agent/codex
    completedAt: 2026-10-02
    outcome: completed
    inputRevision: 2
    artifactRefs:
      - path: 01-plan.md
  implement:
    status: ready
    attempt: 2
    assignee:
    completedBy:
    completedAt:
    outcome:
    inputRevision: 2
    artifactRefs: []
  review:
    status: waiting
    attempt: 1
    assignee:
    completedBy:
    completedAt:
    outcome:
    inputRevision:
    artifactRefs: []
  acceptance:
    status: waiting
    attempt: 1
    assignee: human/saiki
    completedBy:
    completedAt:
    outcome:
    inputRevision:
    artifactRefs: []
history:
  - seq: 1
    at: 2026-09-28
    actor: agent/codex
    event: create
    phase: plan
    attempt: 1
    inputRevision: 1
    outcome:
    from:
    to: ready
    reason:
    refersTo:
    refs: []
  - seq: 2
    at: 2026-09-28
    actor: agent/codex
    event: complete
    phase: plan
    attempt: 1
    inputRevision: 1
    outcome: completed
    from: progress
    to: done
    reason:
    refersTo:
    refs:
      - path: 01-plan.md
  - seq: 3
    at: 2026-10-01
    actor: human/saiki
    event: revise
    phase:
    attempt:
    inputRevision: 2
    outcome:
    from:
    to:
    reason: "受入基準を追加"
    refersTo:
    refs: []
  - seq: 4
    at: 2026-10-01
    actor: human/saiki
    event: reopen
    phase: plan
    attempt: 2
    inputRevision: 2
    outcome:
    from: done
    to: ready
    reason:
    refersTo: 3
    refs: []
  - seq: 5
    at: 2026-10-02
    actor: agent/codex
    event: complete
    phase: plan
    attempt: 2
    inputRevision: 2
    outcome: completed
    from: progress
    to: done
    reason:
    refersTo:
    refs:
      - path: 01-plan.md
---

# 概要
