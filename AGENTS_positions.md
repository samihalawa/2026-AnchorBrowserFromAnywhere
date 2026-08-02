INDEX
2026-08-03 | smartphone live-view affordances | listing iframe permissions or opening another tab does not make a 1280px remote browser comfortable on a phone | do activate in-app full screen, exact-URL reconnect, safe-area controls, and wake lock while preserving the provider session | don't create a second mobile browser route or change the shared remote viewport | verify 390px fullscreen fills the viewport, reconnect retains the exact session ID, reload restores it, and desktop keeps its existing toolbar
2026-08-02 | provider-backed kittyfb history | client-only continuity cannot recover across devices and forbidding parallel sessions was too narrow | do tag sessions kittyfb, discover/replay them from Anchor, keep one primary view, and tuck parallel/history controls into a submenu | don't add a database or expose a permanent session-manager layout | verify a new device autoloads the newest active session, reload preserves selection, recordings play, parallel creation preserves the old session, and inactivity closes sessions
2026-08-02 | clarification and reload continuity | an agent reply can ask for missing content while still returning action mode, and session-only persistence can omit pending/UI state | do force clarification replies to chat and persist pending confirmation, draft, selected view, collapsed state, history, workflow, queue, cookies, and exact live URL | don't launch Anchor while asking what to publish or restore only the session ID | verify underspecified publish leaves the workflow idle and reload restores chat, pending/UI state, and the same iframe session ID
2026-08-02 | SUPERSEDED persistent single-session restriction | the continuity lesson remains, but rejecting parallel sessions conflicts with the corrected product | do keep one primary UI while allowing tagged parallel sessions under History | don't replace the main view with a visible session manager | verify chat/workflow continuity plus provider-backed parallel discovery
2026-08-02 | conversational agent routing | sending every chat turn directly to Anchor makes greetings create browser tasks | do route every turn through conversational AI and invoke Anchor only for an explicit Facebook action | don't treat every non-write message as a read-only browser command | verify hello returns a chat reply with no workflow, a follow-up preserves context, and an explicit write reaches confirmation
2026-08-02 | Anchor session continuity | in-memory session state and shutdown cleanup discard a still-running remote browser, while author CSS can keep a hidden empty-state overlay visible | do persist the exact live-view metadata on-device, validate the Anchor session on restore, and enforce `[hidden]` | don't terminate remote sessions during app redeploy or trust the DOM property without rendered proof | verify reload keeps the same ID, New session changes it, End session completes it, and the iframe is visibly unobscured
2026-08-02 | Coolify Docker health checks | the slim image omits both curl and wget, so a healthy Node process is rejected as unhealthy | do keep curl installed in the production image while Coolify health checks are enabled | don't infer an app crash from repeated `starting` checks | verify Coolify reports healthy and `/health` returns the expected JSON
2026-08-02 | chatbot scope drift | presets can tempt a fixed-task dashboard instead of the requested conversational agent | do keep the unrestricted prompt and recent chat context as the primary control surface, with presets only as optional shortcuts | don't require users to choose from predefined Facebook actions | verify any free-form prompt reaches Anchor and its result returns to the chat
2026-08-02 | injected cookies are not authenticated proof | a valid cookie array can still open Facebook's saved-profile chooser | do inject the user-pasted cookies before navigation and keep the live view interactive for login or 2FA | don't label the account connected from cookie count or homepage URL alone | verify the current page text or agent report shows an authenticated Facebook surface

## 2026-08-03 | CURRENT

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: smartphone interaction with the persistent Anchor live-view iframe
- mistaken approach: describing iframe parameters and relying on a new-tab handoff while the embedded 1280px remote browser remains cramped on a phone
- superior approach: use the existing single stage for native full screen with a new-tab fallback, safe-area controls, exact-live-URL reconnect, and screen wake lock only while the mobile browser is visible
- evidence: user correction plus current 390px render; session `506057e1-9ba8-4f76-aa80-7594297c5eea` filled `390×844`, survived reconnect/reload unchanged, and the 1024px layout retained its toolbar
- trigger terms: `smartphone`, `iframe parameters`, `take advantage`, `full screen`, `reconnect`, `tiny browser`
- do: improve the existing stage without changing provider-backed continuity; don't: add a mobile route, session manager, or phone-specific Anchor session
- required verification: rendered 390px in-stage/full-screen states, exact session ID before and after reconnect/reload, zero horizontal overflow, and desktop regression render

## 2026-08-02 | CURRENT

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: provider-backed session attribution, autoload, parallel sessions, hidden history, recording replay, and inactivity cleanup
- mistaken approach: relying on one device's stored live URL and forbidding concurrent sessions, which prevents cross-device discovery and misses Anchor recordings
- superior approach: tag every new session `kittyfb`, query Anchor history directly, keep the chosen/newest running session primary, and place parallel/replay controls only inside History
- evidence: live Anchor list returned 24 app-tagged sessions including one running session and recording metadata; official API supports descending tag filters and recording URLs; user explicitly corrected the single-session restriction
- trigger terms: `kittyfb`, `last session`, `ongoing`, `parallel`, `history`, `replay`, `no database`, `not a session manager`, `inactive`
- do: use Anchor as durable session truth with one primary browser; don't: add DB state, surface all sessions permanently, or replace an active session when creating another
- required verification: new sessions carry all three tags and 15-minute idle timeout, a fresh browser autoloads the active provider session, History is closed by default, replay works, parallel creation preserves the original running ID, and 30-minute inactive primary cleanup is wired

## 2026-08-02 | CURRENT

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: missing-detail clarification, tool inventory, and full reload continuity
- mistaken approach: trusting the model's `action` flag when its reply is actually asking what to publish, and persisting only chat/workflow/session while losing pending confirmation, draft, selected mobile view, or collapsed iframe state
- superior approach: deterministically demote clarification replies to chat, provide an exact tool inventory including JSON follow-ups, and persist every user-visible continuity state alongside the exact Anchor live URL
- evidence: attached production transcript and live `/api/chat` response returned `mode:"action"` for `publish a story` while asking for content; current client persistence inventory omitted pending/UI/draft keys
- trigger terms: `publish a story`, `what would you like`, `Working while asking`, `in json`, `reload all saved`, `same place`
- do: keep the browser idle until indispensable content is supplied and restore the entire workspace; don't: start a workflow from an incomplete action or reset the layout on reload
- required verification: production dialogue returns chat for incomplete publish, JSON parses, and browser reload preserves history, pending confirmation/draft/view state, session ID, and iframe URL

## 2026-08-02 | SUPERSEDED

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: persistent conversational agent, Anchor tool execution, mobile human intervention
- mistaken approach: persisting only `sessionId`/`liveViewUrl` while leaving chat, active workflow, queue, and server reattachment ephemeral; showing the 1280px live view only inside a small phone iframe
- superior approach: persist chat/workflow/queue locally, always reattach the backend to the stored running Anchor session before creating another, serialize actions in that session, and expose mobile Agent/Live Browser views with a full-screen handoff and slash commands
- evidence: user correction in the creation thread plus current `public/app.js`, `server.mjs`, and 390px local renders in `/Users/samihalawa/.codex/visualizations/anchor-mobile-agent-running-chat.png` and `/Users/samihalawa/.codex/visualizations/anchor-mobile-local-browser-live.png`
- trigger terms: `same session`, `agent freedom`, `autonomous`, `phone`, `embedded browser`, `allow input`, `keyword`, `continue after refresh`
- do: retain the continuity/mobile lessons; don't: reuse the obsolete prohibition on parallel sessions
- required verification before reuse: rendered 390px chat and live views plus provider-backed history showing that one primary session can coexist with hidden parallel sessions

## 2026-08-02 | CURRENT

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: conversational agent and optional Facebook browser tools
- mistaken approach: `submitPrompt()` sent every message to `/api/run`, so even `hello` created an Anchor workflow and showed `Working in the live browser`
- superior approach: Gemini handles ordinary conversation and returns an explicit `chat` or `action` decision; only `action` reaches Anchor, while Facebook writes still require confirmation
- evidence: user browser screenshot plus `public/app.js`; local live responses classified `hello` and drafting as `chat`, then the follow-up `Now ... publish` as `action`
- trigger terms: `hello starts task`, `doesn't talk`, `conversational agent`, `every message`, `tools`
- do: prove chat, contextual follow-up, action routing, and confirmation separately; don't: infer an action from every non-write message
- required verification: rendered production chat must answer `hello` without creating a workflow, then an explicit Facebook write must show the confirmation dialog

## 2026-08-02 | CURRENT

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: persistent Anchor session restore and mobile live-view rendering
- mistaken approach to avoid: keeping the session only in the Node map, deleting it on SIGTERM, or assuming `element.hidden=true` defeats an author rule with `display:grid`
- superior approach: retain the remote session through deploys, store its exact live URL and ID on-device, validate its running state before restore, and force `[hidden]` to `display:none`
- evidence: local session `9fbb9b92-78e8-4f04-9e44-df6781269580` survived reload with the same ID; New session created `fe33880d-b29e-4f40-80d6-1dc7b84f8c26`; End session changed it from `running` to `completed`
- trigger terms: `reload`, `existing session`, `new session`, `End session`, `empty overlay`, `hidden iframe`
- do: prove the full ID/state transition and rendered iframe; don't: infer continuity from localStorage alone
- required verification: same-layer mobile render plus Anchor API status for the exact IDs

## 2026-08-02 | CURRENT

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: Coolify Dockerfile deployment and `/health` readiness check
- mistaken approach to avoid: using `node:22-slim` without an HTTP client while Coolify's Docker health check is enabled
- superior approach: install `curl` in the image and retain the real `/health` route
- evidence: deployment `lsbwtochmh6rf2a6ngcbaiaa` built the app, but every check reported `/bin/sh: 1: curl: not found` and `wget: not found`
- trigger terms: `starting`, `unhealthy`, `Coolify healthcheck`, `curl not found`, `wget not found`
- do: keep the health probe executable; don't: disable readiness checks or misdiagnose the Node server
- required verification: exact deployed commit reaches `healthy`, then read the JSON body from the public `/health` URL

## 2026-08-02 | CURRENT

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: free-form chatbot versus predefined Facebook task buttons
- mistaken approach to avoid: narrowing the product into presets after the user explicitly asked to talk to an agent like the current Codex conversation
- superior approach: keep one unrestricted prompt, recent conversational context, agent replies, and the continuing live browser session; presets are optional one-tap prompt fillers only
- evidence: user correction in the creation thread; local `/api/run` accepted an arbitrary read-only sentence and returned Anchor workflow `83550`
- trigger terms: `chatbot`, `talk freely`, `like here`, `predefined messages`, `tell it to do things`
- do: route arbitrary prompts to Anchor; don't: gate execution behind a fixed task catalog
- required verification: submit a non-preset prompt and read the completed agent response inside the same chat thread

## 2026-08-02 | CURRENT

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: Facebook cookie injection and Anchor session authentication
- mistaken approach to avoid: treating `cookiesApplied` or `facebook.com/` as proof that Facebook is logged in
- superior approach: inject the user-pasted Cookie-Editor array before navigation, warm the page, inspect the visible page, and leave the embedded live view interactive when login or 2FA remains
- evidence: local session `4e22e48d-aafa-4ea2-a43c-bba4c697c2de` applied 11 cookies; workflow `83550` visibly reported Facebook's saved-profile login chooser for Zimo Qiu and Sami Halawa Ribas
- trigger terms: `cookies saved`, `authenticated`, `profile chooser`, `login needed`, `2FA`
- do: report the observed auth state; don't: infer authentication from cookie presence
- required verification: current visible feed/group/inbox content or an agent report from that authenticated surface
