# Anchor Browser From Anywhere

A deliberately small, mobile-first control panel for running natural-language Facebook tasks in a real Anchor Browser session.

Production: https://anchorbrowser.megawebs.com

## What it does

- Starts an interactive remote Facebook browser and embeds its live view.
- Tags every new app-created session to the user configured by `SESSION_USER` and automatically restores the last selected running session, or the newest running session on a new device.
- Reads recent sessions and recordings directly from Anchor Browser without adding a database.
- Keeps parallel and recorded sessions inside a discreet History menu so the product still feels like one primary browser.
- Stops hidden disconnected sessions after 15 minutes and the visible session after 30 minutes of in-app inactivity when no task is running.
- Accepts natural-language tasks from a chat-style interface.
- Loads optional persistent agent context from `FACEBOOK_AGENT_CONTEXT` at runtime.
- Resolves broad actions from configured context plus the live account instead of embedding identity, campaign, contact, or content assumptions in the application.
- Keeps chat history, drafts, selected workspace view, the active workflow, queued actions, and the exact Anchor iframe session across refreshes and deployments.
- Restores the primary browser and chat in place after reload, with a clear live/busy/attention status and a loading state while Anchor reconnects.
- Keeps the conversation composer large and reachable on phones, collapses secondary shortcuts behind `More`, and exposes the live browser as a dedicated mobile view with in-app full screen, safe-area controls, live-view reconnect, and screen wake lock while it is open.
- Lets desktop users resize the browser/chat split and remembers their preferred width on that device.
- Lets an active browser task be paused and resumed without ending its persistent Anchor session.
- Lets the Anchor `browser-use` agent autonomously navigate and complete multi-step Facebook requests in that same session.
- Uses the chat model as a persistent controller and the live browser model as an operating agent: both can make context-grounded decisions, inspect results, and revise their approach instead of replaying fixed click macros.
- Runs read-only requests immediately.
- Executes clear Facebook action requests directly, with Stop/Pause available while the browser agent is working.
- Accepts photos and videos from the chat composer, uploads them into the current Anchor session as agent resources, and passes their `/uploads/...` paths to the browser agent for posts and Stories.
- For image and Story requests, requires relevant visual media, short legible overlay text, and a final Facebook preview check instead of a plain gradient or text-only fallback.
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
- `SESSION_USER` (the Anchor session tag used for cross-device history and restoration)
- `ANCHOR_PROFILE_NAME` (the persistent Anchor browser profile used to restore authenticated Facebook storage)
- `FACEBOOK_AGENT_CONTEXT` (optional JSON or plain-text agent instructions and business context)

The repo-root `.env` is the canonical deployment configuration. Keep Coolify's
runtime variables synchronized from it. `FACEBOOK_COOKIES_JSON` supplies the
default cookies; cookies pasted inside the app override that default on the
current device and remain in local storage.

No account identity, browser-profile name, campaign, contact detail, or action-specific content is committed as an application default. `ANCHOR_PROFILE_NAME` and `FACEBOOK_AGENT_CONTEXT` come from the canonical `.env`; the app bounds the injected context and still checks live Facebook before using time-sensitive facts.

The app access password is the `APP_ACCESS_KEY` value in the repo-root `.env`.

The production Dockerfile is ready for a GitHub-driven Coolify deployment.
