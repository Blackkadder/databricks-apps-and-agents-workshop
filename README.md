# databricks-apps-and-agents-workshop

## Prerequisites

Install the [Databricks AI Dev Kit](https://github.com/databricks-solutions/ai-dev-kit) to set up your AI coding environment with the necessary tools and configuration.

**Mac/Linux:**
```bash
bash <(curl -sL https://raw.githubusercontent.com/databricks-solutions/ai-dev-kit/main/install.sh)
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/databricks-solutions/ai-dev-kit/main/install.ps1 | iex
```

The installer sets up configuration for AI coding environments (Claude Code, Cursor, Gemini CLI) and requires:
- [uv](https://docs.astral.sh/uv/) — Python package manager
- [Databricks CLI](https://docs.databricks.com/dev-tools/cli/index.html) — Databricks command line interface