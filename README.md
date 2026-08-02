# Anchor Browser From Anywhere

A deliberately small, mobile-first control panel for running natural-language Facebook tasks in a real Anchor Browser session.

Production: https://anchorbrowser.megawebs.com

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
# Create .env with the required values below; npm start reads it automatically.
npm start
```

Required production variables:

- `ANCHOR_API_KEY`
- `APP_ACCESS_KEY`
- `FACEBOOK_COOKIES_JSON` (the default Cookie-Editor JSON loaded on a device that has not saved its own cookies yet)

The repo-root `.env` is the canonical deployment configuration. Keep Coolify's
runtime variables synchronized from it. Facebook cookies are entered inside the
app and remain in that device's local storage; they do not belong in `.env`.

The app access password is the `APP_ACCESS_KEY` value in the repo-root `.env`.

The production Dockerfile is ready for a GitHub-driven Coolify deployment.
