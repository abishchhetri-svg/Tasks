# Internship Work Log

Weekly Review: https://docs.google.com/document/d/1VzIM9DgTUWZULfrtl9EayLLfifBnx7pko4AL_q3dMs8/edit?pli=1&tab=t.0

## Structure

```
Tasks/
└── logs/
    └── 2026/
        └── feb/
            ├── 2026-02-12.md       # Daily analyzed log
            ├── 2026-02-12-activity.json  # Raw data
            └── index.md            # Monthly summary
```

## How It Works

1. **ActivityWatch** runs in background, capturing:
   - Applications used
   - Websites visited
   - Window/activity data
   - Away/AFK time

2. **Daily `/daily-log` command**:
   - Queries ActivityWatch API
   - Collects git activity from all projects
   - AI analyzes and categorizes everything
   - Generates human-readable daily log
   - Saves raw data as JSON
   - Auto-commits to GitHub

3. **Zero manual entry** - AI deduces:
   - What you worked on (from window titles, commits)
   - Time spent per category (coding, meetings, research)
   - Completed tasks (from commit messages)
   - In-progress work (from open files)
   - Tomorrow's priorities (from context)

## Usage

Start ActivityWatch:
```bash
brew services start activitywatch
# or
open -a ActivityWatch
```

### Commands (say these to Claude)

| Command | What It Does |
|---------|--------------|
| "Generate my daily work log" | Full ActivityWatch + Git analysis |
| "Add this to my daily work" | Quick append to today's log |
| "Summarize this and update to my daily work" | Summarize conversation & update |

View dashboard:
```bash
open http://localhost:5600
```

### Features

- **Smart file handling**: Checks if today's log exists, updates instead of overwriting
- **Data merging**: When updating, recalculates all totals (hours, commits, percentages)
- **Quick add**: Instantly add entries without full analysis
- **Auto-commit**: All updates automatically pushed to GitHub (no confirmation needed)

### Update Behavior

When updating an existing log, values are **merged and recalculated**:

```
Before:  2 hours coding, 2 commits
Update:  +4 hours coding, +5 commits
After:   6 hours coding, 7 commits (all stats updated)
```

## Data

- **100% local** - ActivityWatch stores everything locally
- **Private** - Only anonymized data goes to GitHub
- **Open source** - ActivityWatch: https://activitywatch.net

---

*Auto-generated daily - no manual updates needed*
