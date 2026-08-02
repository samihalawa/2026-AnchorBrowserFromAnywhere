# Anchor Browser From Anywhere

A deliberately small, mobile-first control panel for running natural-language Facebook tasks in a real Anchor Browser session.

Production: https://anchorbrowser.megawebs.com

## What it does

- Starts an interactive remote Facebook browser and embeds its live view.
- Tags every new app-created session to the fixed Anchor user `kittyfb` and automatically restores the last selected running session, or the newest running session on a new device.
- Reads recent sessions and recordings directly from Anchor Browser without adding a database.
- Keeps parallel and recorded sessions inside a discreet History menu so the product still feels like one primary browser.
- Stops hidden disconnected sessions after 15 minutes and the visible session after 30 minutes of in-app inactivity when no task is running.
- Accepts natural-language tasks from a chat-style interface.
- Loads a compact, persistent Zimo/Kitty Facebook context distilled from the official export, including the room-rental and Chinese-lesson campaigns, voice, priorities, and autonomous defaults.
- Resolves broad actions such as `publish a story` from that context plus the live account instead of asking for content already available on Facebook.
- Keeps chat history, drafts, pending confirmations, selected workspace view, the active workflow, queued actions, and the exact Anchor iframe session across refreshes and deployments.
- Restores the primary browser and chat in place after reload, with a clear live/busy/attention status and a loading state while Anchor reconnects.
- Keeps the conversation composer large and reachable on phones, collapses secondary shortcuts behind `More`, and exposes the live browser as a dedicated mobile view with in-app full screen, safe-area controls, live-view reconnect, and screen wake lock while it is open.
- Lets desktop users resize the browser/chat split and remembers their preferred width on that device.
- Lets an active browser task be paused and resumed without ending its persistent Anchor session.
- Lets the Anchor `browser-use` agent autonomously navigate and complete multi-step Facebook requests in that same session.
- Runs read-only requests immediately.
- Requires a second explicit confirmation before posts, comments, messages, reactions, joins, edits, or deletes.
- Lets the user paste Cookie-Editor JSON once and saves it in that device's local storage.
- Sends the cookie JSON only when creating/running that user's session, then injects it before Facebook opens.
- Provides mobile Agent/Live Browser views, native full screen with a new-tab fallback, compact hidden history with current/recording badges, recording playback, and `/browser`, `/cookies`, `/new`, `/chat`, and `/session` commands. `/new` creates a parallel session without ending the current one.

## Run locally

```bash
npm install
# Create .env with the required values below; npm start reads it automatically.
npm start
```

Required production variables:

- `ANCHOR_API_KEY`
- `APP_ACCESS_KEY`
- `GEMINI_API_KEY`
- `FACEBOOK_COOKIES_JSON` (the default Cookie-Editor JSON loaded on a device that has not saved its own cookies yet)
- `FACEBOOK_AGENT_CONTEXT` (optional JSON or plain-text override for the versioned context pack)
- `FACEBOOK_AGENT_CONTEXT_PATH` (optional path override; defaults to `context/facebook-agent-context.json`)

The repo-root `.env` is the canonical deployment configuration. Keep Coolify's
runtime variables synchronized from it. `FACEBOOK_COOKIES_JSON` supplies the
default cookies; cookies pasted inside the app override that default on the
current device and remain in local storage.

The versioned context pack is the default durable agent memory on every device and deployment. A `FACEBOOK_AGENT_CONTEXT` value in the canonical `.env` overrides it when a faster temporary context update is needed; the app bounds the injected text and still checks live Facebook before using time-sensitive facts.

The app access password is the `APP_ACCESS_KEY` value in the repo-root `.env`.

The production Dockerfile is ready for a GitHub-driven Coolify deployment.
