# SMS (Script Management System) - Requirements & Plan

## Problem Statement

Local script execution is fragile:
1. **Fragile Paths**: Scripts break when moved (`./old_proj/v2/etl.py` → `./analytics/etl.py`)
2. **Hard to Manage**: No central registry, scripts scattered across projects
3. **No Versioning**: Accidental overwrites, no history of changes

**Out of Scope**: Environment/dependency management (Phase 2). This version focuses purely on **path abstraction** and **git tracking**.

---

## 2-Phase Implementation Plan

### Phase 1: Git-Backed Alias System (Day 1)
**Goal**: Run scripts by stable alias regardless of file location.

**Core Mechanism**:
- Single git repository at `~/.sms/`
- `index.json` maps aliases → relative paths
- Moving files updates the index, not your muscle memory

**Deliverables**:
- `sms add &lt;file&gt; --alias &lt;name&gt;`: Copy to repo, create alias, commit
- `sms run &lt;alias&gt;`: Lookup path in index, execute with bash/python
- `sms mv &lt;alias&gt; &lt;new-folder&gt;/`: Update path in index, commit
- `sms rm &lt;alias&gt;`: Remove script and index entry

### Phase 2: Sync & Discovery (Day 2)
**Goal**: prevent broken links.

**Deliverables**:
- `sms list`: Show all aliases with their actual paths
- `sms doctor`: Detect broken paths (file moved outside sms), suggest fixes

