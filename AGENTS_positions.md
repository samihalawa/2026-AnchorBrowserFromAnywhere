INDEX
2026-08-03 | persistent decision-making agent | treating chat as a classifier and Anchor as a fixed macro loses the natural agent behavior the user expects | do let the controller reason about tool use and let the browser agent inspect, choose, adapt, and verify | don't reduce free-form requests to hardcoded workflows or click scripts | verify ordinary dialogue stays conversational and explicit outcomes reach an adaptive live-browser prompt
2026-08-03 | direct actions plus visual preview truth | an extra approval click blocks the requested autonomous workflow, while promising an image without checking the Facebook preview produces an ugly text-only story | do execute clear actions directly, retain Stop/Pause, require relevant media for visual requests, and verify the final preview before sharing | don't show a confirmation dialog or publish a plain gradient when an image was requested | verify direct `/api/run`, zero confirmation artifacts, paused unwanted task, runtime visual rules, and live action start
2026-08-03 | SUPERSEDED confirmation across generated verb forms | the conjugation classifier remains useful for read/write execution instructions, but the user explicitly removed the second confirmation gate | do retain accurate read/write classification and direct execution | don't restore the dialog, pending state, or server 409 gate | verify Stop/Pause remains and direct writes reach Anchor
2026-08-03 | configuration-only identity and business context | committed persona/campaign defaults make the agent brittle and leak one account into product behavior | do load session identity and agent context only from the ignored repo-root `.env`, then inspect live Facebook | don't commit account, campaign, contact, or action-specific fallbacks | verify a forbidden-string source sweep, runtime context version, configured session restoration, and broad-action direct execution
2026-08-03 | SUPERSEDED context-grounded broad Facebook actions | demoting underspecified content actions to chat can create repetitive questions, but committed export-derived defaults were the wrong layer | do use runtime-configured context plus live state with direct action execution | don't add Story-specific or campaign-specific source fallbacks | verify the configured context reaches dialogue/execution and ordinary chat stays chat
2026-08-03 | smartphone live-view affordances | listing iframe permissions or opening another tab does not make a 1280px remote browser comfortable on a phone | do activate in-app full screen, exact-URL reconnect, safe-area controls, and wake lock while preserving the provider session | don't create a second mobile browser route or change the shared remote viewport | verify 390px fullscreen fills the viewport, reconnect retains the exact session ID, reload restores it, and desktop keeps its existing toolbar
2026-08-02 | provider-backed configured-user history | client-only continuity cannot recover across devices and forbidding parallel sessions was too narrow | do tag sessions with `SESSION_USER`, discover/replay them from Anchor, keep one primary view, and tuck parallel/history controls into a submenu | don't add a database or expose a permanent session-manager layout | verify a new device autoloads the newest active session, reload preserves selection, recordings play, parallel creation preserves the old session, and inactivity closes sessions
2026-08-02 | SUPERSEDED clarification-only routing and reload continuity | forcing every underspecified content action to chat was too narrow once persistent Facebook context became available | do retain full reload persistence but resolve broad actions from saved context plus live state before asking | don't launch Anchor for a truly indispensable missing recipient or value | verify context-resolvable actions start directly while genuinely unresolvable requests stay chat, and reload still restores all UI/session state
2026-08-02 | SUPERSEDED persistent single-session restriction | the continuity lesson remains, but rejecting parallel sessions conflicts with the corrected product | do keep one primary UI while allowing tagged parallel sessions under History | don't replace the main view with a visible session manager | verify chat/workflow continuity plus provider-backed parallel discovery
2026-08-02 | conversational agent routing | sending every chat turn directly to Anchor makes greetings create browser tasks | do route every turn through conversational AI and invoke Anchor only for an explicit Facebook action | don't treat every non-write message as a read-only browser command | verify hello returns a chat reply with no workflow, a follow-up preserves context, and an explicit write starts directly
2026-08-02 | Anchor session continuity | in-memory session state and shutdown cleanup discard a still-running remote browser, while author CSS can keep a hidden empty-state overlay visible | do persist the exact live-view metadata on-device, validate the Anchor session on restore, and enforce `[hidden]` | don't terminate remote sessions during app redeploy or trust the DOM property without rendered proof | verify reload keeps the same ID, New session changes it, End session completes it, and the iframe is visibly unobscured
2026-08-02 | Coolify Docker health checks | the slim image omits both curl and wget, so a healthy Node process is rejected as unhealthy | do keep curl installed in the production image while Coolify health checks are enabled | don't infer an app crash from repeated `starting` checks | verify Coolify reports healthy and `/health` returns the expected JSON
2026-08-02 | chatbot scope drift | presets can tempt a fixed-task dashboard instead of the requested conversational agent | do keep the unrestricted prompt and recent chat context as the primary control surface, with presets only as optional shortcuts | don't require users to choose from predefined Facebook actions | verify any free-form prompt reaches Anchor and its result returns to the chat
2026-08-02 | injected cookies are not authenticated proof | a valid cookie array can still open Facebook's saved-profile chooser | do inject the user-pasted cookies before navigation and keep the live view interactive for login or 2FA | don't label the account connected from cookie count or homepage URL alone | verify the current page text or agent report shows an authenticated Facebook surface

## 2026-08-03 | CURRENT

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: natural-language controller, Anchor tool use, and adaptive browser execution
- mistaken approach: treating the conversational model as a command classifier and the browser model as a fixed macro that merely follows a predetermined click sequence
- superior approach: keep one persistent controller that decides when tools are useful, then give the operating browser agent an outcome, relevant context, and authority to inspect, choose, revise, and verify against the live page
- evidence: explicit user correction that the Anchor app agent must make decisions like Codex, plus the existing `chat`/`action` routing and persistent session architecture
- trigger terms: `agent`, `make decisions`, `like here`, `natural language`, `tools`, `macro`, `adapt`
- do: preserve free conversation and adaptive browser judgment; don't: add fixed-task modes, per-action scripts, or launch the browser for every message
- required verification: `hello` produces dialogue without a task, an explicit goal generates a self-contained adaptive action, and the execution prompt requires live inspection, replanning, and visible-result verification

## 2026-08-03 | CURRENT

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: direct Facebook actions, visual/story quality, and live intervention
- mistaken approach: requiring a second approval after a clear user command and allowing a text-only gradient Story even after the agent promised an image
- superior approach: execute clear actions immediately while retaining Stop/Pause; for visual requests, require relevant media, short legible copy, and inspection of the final Facebook preview before sharing
- evidence: explicit user removal request plus screenshot showing a plain blue Story with tiny dense text, an enabled Share button, and a running agent that had promised an image; the active agent was paused before publication
- trigger terms: `no confirmation`, `publish something`, `ugly`, `no visual content`, `with image`, `Share to Story`, `Stop task`
- do: preserve direct execution and honest visual verification; don't: restore approval state or claim media exists from intent alone
- required verification: no confirmation markup/state/server gate, write reaches the mocked Anchor task directly, Stop/Pause remains, runtime context rejects text-only visual fallback, and production serves the new version

## 2026-08-03 | SUPERSEDED

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: confirmation classification between conversational action prompts and Anchor execution
- mistaken approach: matching only exact base verbs, so an accented conjugated imperative could be classified read-only even when it visibly requests publication
- superior approach: retain normalized read/write classification for task instructions, but remove the separately enforced approval gate per the later explicit user request
- evidence: production `/api/preview` classified a base-form publish instruction as write but its imperative-pronoun equivalent as read; the attempted run created a session and failed before Facebook because cookies were absent
- trigger terms: `confirmation`, `publish`, `publícala`, `write detector`, `needsConfirmation`, `cookies must be a JSON array`
- do: test the exact model-generated action prompt and siblings; don't: reintroduce the dialog, pending state, or `409` approval response
- required verification: the exact generated write is classified correctly and reaches the Anchor task directly, while Stop/Pause remains available

## 2026-08-03 | CURRENT

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: agent identity, business context, broad Facebook actions, and provider session attribution
- mistaken approach: committing one account's export-derived context, campaign facts, contact details, session tag, and action-specific fallback behavior into product source
- superior approach: source `SESSION_USER` and `FACEBOOK_AGENT_CONTEXT` only from the ignored canonical `.env`; keep committed UI and server behavior generic; inspect current Facebook before acting
- evidence: direct user correction `remove all hardcoded`; source sweep identified committed context JSON, server fallback rules, campaign shortcuts, documentation, tests, and fixed history labels
- trigger terms: `hardcoded`, `context`, `persona`, `campaign`, `contact`, `session user`, `publish a story`
- do: configure privately and pass the runtime context to dialogue/execution; don't: commit business facts or special-case a requested action
- required verification: committed-source forbidden-string sweep, tests, `/health` reports configured context/user, session history restores the configured user's provider session, and live broad-action chat reaches direct execution

## 2026-08-03 | SUPERSEDED

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: conversational routing and Anchor execution for broad Facebook actions
- mistaken approach: treating a broad content action as incomplete, then correcting it by committing one account's export-derived context and action-specific fallback behavior
- superior approach: inject privately configured runtime context into both decision and execution, inspect current Facebook activity, choose content autonomously, and execute explicit actions directly
- evidence: user corrections plus production dialogue evidence; the later correction explicitly rejected all hardcoded product context
- trigger terms: `publish a story`, `what would you like`, `all context`, `massive prompt`, `should know`, `ask again`
- do: resolve posts/stories/comments/reviews from context plus live state; don't: reuse stale prices or invent a recipient when live state cannot identify one
- required verification: direct production chat returns a concrete action without a question, execution starts directly with context, and ordinary conversation creates no workflow

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
- superior approach: tag every new session with the configured `SESSION_USER`, query Anchor history directly, keep the chosen/newest running session primary, and place parallel/replay controls only inside History
- evidence: live Anchor list returned 24 app-tagged sessions including one running session and recording metadata; official API supports descending tag filters and recording URLs; user explicitly corrected the single-session restriction
- trigger terms: `session user`, `last session`, `ongoing`, `parallel`, `history`, `replay`, `no database`, `not a session manager`, `inactive`
- do: use Anchor as durable session truth with one primary browser; don't: add DB state, surface all sessions permanently, or replace an active session when creating another
- required verification: new sessions carry all three tags and 15-minute idle timeout, a fresh browser autoloads the active provider session, History is closed by default, replay works, parallel creation preserves the original running ID, and 30-minute inactive primary cleanup is wired

## 2026-08-02 | SUPERSEDED

- project/root: `/Users/samihalawa/git/PROJECTS_CODING/2026-AnchorBrowserFromAnywhere`
- surface/workflow: missing-detail clarification, tool inventory, and full reload continuity
- mistaken approach: trusting the model's `action` flag when its reply is actually asking what to publish, and persisting only chat/workflow/session while losing pending confirmation, draft, selected mobile view, or collapsed iframe state
- superior approach: retain the exact tool inventory and full workspace persistence, but first resolve broad actions from persistent context plus live Facebook; demote only truly indispensable missing details
- evidence: attached production transcript and live `/api/chat` response returned `mode:"action"` for `publish a story` while asking for content; current client persistence inventory omitted pending/UI/draft keys
- trigger terms: `publish a story`, `what would you like`, `Working while asking`, `in json`, `reload all saved`, `same place`
- do: keep the browser idle only when context and live state cannot resolve an indispensable value; don't: ask again for content already available in history or Facebook
- required verification: context-resolvable publish starts directly, a truly unidentified recipient remains chat, JSON parses, and browser reload preserves history, draft/view state, session ID, and iframe URL

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
- superior approach: Gemini handles ordinary conversation and returns an explicit `chat` or `action` decision; only an explicit Facebook `action` reaches Anchor and starts directly
- evidence: user browser screenshot plus `public/app.js`; local live responses classified `hello` and drafting as `chat`, then the follow-up `Now ... publish` as `action`
- trigger terms: `hello starts task`, `doesn't talk`, `conversational agent`, `every message`, `tools`
- do: prove chat, contextual follow-up, and direct action routing separately; don't: infer an action from every non-write message
- required verification: rendered production chat must answer `hello` without creating a workflow, then an explicit Facebook write must start without a confirmation dialog

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
- evidence: a local session applied 11 cookies yet visibly reported Facebook's saved-profile login chooser instead of an authenticated feed
- trigger terms: `cookies saved`, `authenticated`, `profile chooser`, `login needed`, `2FA`
- do: report the observed auth state; don't: infer authentication from cookie presence
- required verification: current visible feed/group/inbox content or an agent report from that authenticated surface
