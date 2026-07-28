---
name: "source-command-prompts"
description: "Search and discover AI prompts from prompts.chat"
---

# source-command-prompts

Use this skill when the user asks to run the migrated source command `prompts`.

## Command Template

# /prompts

Search for AI prompts on prompts.chat to find the perfect prompt for your task.

## Usage

```
/prompts <query>
/prompts <query> --type IMAGE
/prompts <query> --category coding
/prompts <query> --tag productivity
```

- **query**: Keywords to search for (required)
- **--type**: Filter by type (TEXT, STRUCTURED, IMAGE, VIDEO, AUDIO)
- **--category**: Filter by category slug
- **--tag**: Filter by tag slug

## Examples

```
/prompts code review
/prompts writing assistant --category writing
/prompts midjourney --type IMAGE
/prompts react developer --tag coding
/prompts data analysis --category productivity
```

## How It Works

1. Calls `search_prompts` with your query and optional filters
2. Returns matching prompts with title, description, author, and tags
3. Each result includes a link to view/copy the full prompt on prompts.chat

## Getting a Specific Prompt

After finding a prompt you like, use its ID to get the full content:

```
/prompts get <prompt-id>
```

This will retrieve the prompt and prompt you to fill in any variables.

## Saving Prompts

To save a prompt to your prompts.chat account (requires API key):

```
/prompts save "My Prompt Title" --content "Your prompt content here..."
```

## Improving Prompts

To enhance a prompt using AI:

```
/prompts improve "Write a story about..."
```

This transforms basic prompts into well-structured, comprehensive ones.
