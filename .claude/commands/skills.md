---
description: Search and discover Agent Skills from prompts.chat
argument-hint: <query> [--category CATEGORY] [--tag TAG]
---

# /skills

Search for Agent Skills on prompts.chat to extend Claude's capabilities.

## Usage

```
/skills <query>
/skills <query> --category coding
/skills <query> --tag automation
```

- **query**: Keywords to search for (required)
- **--category**: Filter by category slug
- **--tag**: Filter by tag slug

## Examples

```
/skills code review
/skills documentation --category coding
/skills testing --tag automation
/skills api integration
/skills data analysis
```

## How It Works

1. Calls `search_skills` with your query and optional filters
2. Returns matching skills with title, description, author, files, and tags
3. Each result includes a link to view the skill on prompts.chat

## Getting a Specific Skill

After finding a skill you want, use its ID to get all files:

```
/skills get <skill-id>
```

This retrieves the skill with all its files (SKILL.md, reference docs, scripts, etc.)

## Installing a Skill

To download and install a skill to your workspace:

```
/skills install <skill-id>
```

This saves the skill files to `.claude/skills/{slug}/` structure.

## Creating a Skill

To create a new skill on prompts.chat (requires API key):

```
/skills create "My Skill Title" --description "What this skill does"
```

You'll be prompted to provide the SKILL.md content and any additional files.

## Skill Structure

Skills can contain multiple files:
- **SKILL.md** (required) - Main instructions with frontmatter
- **Reference docs** - Additional documentation
- **Scripts** - Helper scripts (Python, shell, etc.)
- **Config files** - JSON, YAML configurations
