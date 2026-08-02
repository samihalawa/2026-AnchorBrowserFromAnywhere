# Anchor Browser From Anywhere

A deliberately small, mobile-first control panel for running natural-language Facebook tasks in a real Anchor Browser session.

## What it does

- Starts an interactive remote Facebook browser and embeds its live view.
- Accepts natural-language tasks from a chat-style interface.
- Runs read-only requests immediately.
- Requires a second explicit confirmation before posts, comments, messages, reactions, joins, edits, or deletes.
- Lets the user paste Cookie-Editor JSON once and saves it in that device's local storage.
- Sends the cookie JSON only when creating/running that user's session, then injects it before Facebook opens.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Required production variables:

- `ANCHOR_API_KEY`
- `APP_ACCESS_KEY`

Facebook cookies are entered inside the app, not configured in Coolify.

The production Dockerfile is ready for a GitHub-driven Coolify deployment.
