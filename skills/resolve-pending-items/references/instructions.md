# Instructions

This document defines queue management, suggestions, approval, continuation, and response formatting for pending items.

## Pending Items

1. Work through only the first unresolved item.
2. Under `PENDING ITEMS`, list every inactive unresolved item as `- **TITLE**`. Omit the section when no inactive items remain.
3. Exclude anything resolved, completed, patched, rejected as unnecessary, or otherwise closed.
4. Present the active item as `⚪ **TITLE**`.
5. Explain what is wrong or missing, why it matters, and the concrete consequence. For an explicitly invoked decision or option, explain its criteria and meaningful tradeoffs without presenting it as defective.
6. For code or files, provide a precise location when known; otherwise provide a short searchable excerpt.

## Suggestions

1. Present one concrete primary fix, choice, or course of action under `🟢 **SUGGESTION**`.
2. Include a focused code example when the active item concerns code and the suggestion would otherwise be ambiguous.
3. Add a separate `🟢 **ALTERNATIVE**` section only for a genuinely useful alternative. Repeat it for additional alternatives in descending order of usefulness.
4. Add `🔴 **Risk:** <risk>` only when a genuine risk exists.
5. Identify every exact file and required operation in an `Operations` section before requesting approval for a file-changing suggestion, using the format below.
6. Allow a suggestion to create, modify, delete, rename, or move files only when the solution requires those operations.
7. Stop and wait for explicit approval, rejection, modification, or selection.

## Operations

1. For every file-changing suggestion or alternative, place an `**Operations**` section after its complete description and any code examples, before any risk note or approval question. Omit it when no files change.
2. Use a numbered list with one entry per file operation. Start each entry with the operation and filename, followed by the exact project-relative path in parentheses, as shown in Required Format.
3. After a blank line, add an indented description under that entry explaining exactly what will be done in the file. Keep it part of the same numbered item, not a separate bullet or numbered item.
4. Use the applicable operation: Create, Modify, Delete, Rename, or Move. For Rename or Move, show both source and destination project-relative paths. Identify the project when operations span multiple projects.

## Approval and Continuation

1. Treat an unqualified positive instruction such as `diy`, `go`, `add it`, or `do it` as approval of the primary suggestion. Apply an alternative only when explicitly selected; clarify ambiguous selections.
2. Treat approval of a file-changing suggestion as authorization to delegate only the active suggestion to one fresh-context subagent.
5. Give the editing subagent every exact file and operation identified in the approved suggestion.
8. Do not allow the editing subagent to modify another file because the approved solution depends on it.
14. End the file-change authorization when the active item is resolved.
15. Require separate approval for every subsequent item.
16. Apply only the approved fix or choice. For a decision, perform follow-up implementation only when requested or already part of the active task.
17. Remove resolved or rejected-as-unnecessary items. If only the suggestions are rejected, keep the item unresolved and present new suggestions.
18. In the same response, immediately present the updated queue and the next complete item. Never wait for `next`, `continue`, or `go`.
19. When no items remain, state `No unresolved items remain.` and omit an ordinary completion report.
20. While this workflow is active, use its required format instead of ordinary completion-report formatting.

## Required Format

Use this structure, omitting `PENDING ITEMS`, `ALTERNATIVE`, `Operations`, or `Risk` when its content does not exist:

```md
---

**PENDING ITEMS**

- **SECOND UNRESOLVED ITEM**

---

⚪ **FIRST UNRESOLVED ITEM**

Explain the item or decision, why it matters, its concrete consequences or tradeoffs, and where it is located when applicable.

---

🟢 **SUGGESTION**

Explain the concrete fix, choice, or course of action. Include useful code examples when applicable.

**Operations**

1. **Create NodeRenameRequest.php** (`app/Http/Requests/NodeRenameRequest.php`)

   Validate the name.

2. **Modify NodeController.php** (`app/Http/Controllers/NodeController.php`)

   Add `rename()` with resource/JSON responses.

🔴 **Risk:** State a genuine risk when one exists.

---

🟢 **ALTERNATIVE**

Explain the alternative fix, choice, or course of action. Include useful code examples when applicable.

**Operations**

1. **Modify filename.ext** (`project/relative/path/filename.ext`)

   Describe exactly what this alternative changes in the file.

🔴 **Risk:** State a genuine risk when one exists.
```
