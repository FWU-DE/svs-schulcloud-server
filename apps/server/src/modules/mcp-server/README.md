# MCP server

Exposes the platform's rooms, courses and board content to MCP clients (Claude Code, the
Claude desktop app, the iOS assistant) over the
[Model Context Protocol](https://modelcontextprotocol.io) — Streamable HTTP, stateless.

```
POST /api/v3/mcp
Authorization: Bearer <schulcloud JWT>
Accept: application/json, text/event-stream
```

`GET` and `DELETE` answer `405`: those verbs only carry SSE streams and session teardown in
stateful mode, and this endpoint keeps no session. Each POST authenticates through the normal
`@JwtAuthentication()` guard, builds a fresh `McpServer` bound to that user, answers, and tears
everything down again.

## Authentication

There is no separate credential. Any JWT the platform already issues works:

```bash
TOKEN=$(curl -s localhost:3030/api/v3/authentication/local \
  -H 'content-type: application/json' \
  -d '{"username":"lehrer@schul-cloud.org","password":"Schulcloud1!"}' | jq -r .accessToken)

curl -s localhost:3030/api/v3/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H 'accept: application/json, text/event-stream' \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | jq
```

The token lives as long as any other session (`JWT_LIFETIME`, 30 days by default) but the
whitelist drops it after `JWT_TIMEOUT_SECONDS` of inactivity (2 hours) — a client that idles
longer has to log in again. OAuth 2.1 discovery and dynamic client registration, which
claude.ai's connector UI needs for a browser login, are **not** implemented; clients pass the
token as a header.

Registering the local server with Claude Code:

```bash
claude mcp add --transport http svs http://localhost:3030/api/v3/mcp \
  --header "Authorization: Bearer $TOKEN"
```

## Tools

| Tool | Purpose |
| --- | --- |
| `list_rooms`, `get_room` | the user's own rooms (same view as `GET /rooms`), one room in detail |
| `create_room`, `update_room` | create a room (the caller becomes its owner) or edit name/colour/features |
| `list_room_boards`, `list_course_boards` | the boards of a room or course |
| `list_courses`, `get_course`, `create_course` | courses the user participates in / teaches |
| `create_board` | a board in a room or course — optionally with its whole content tree in one call |
| `get_board` | a board with all columns, cards and element contents |
| `add_column`, `add_card`, `add_card_element` | append to an existing board |
| `set_board_visibility` | publish a board or turn it back into a draft |

`create_board` takes nested `columns → cards → elements`, because doing the same over REST is a
chain of six calls per card. Two deliberate deviations from the REST API:

- **A board created here is published.** Over REST a new board is a draft that students cannot
  see at all — the single most common way a "board is missing" bug is created. Pass
  `isVisible: false` for the REST behaviour.
- **Element types are limited to `text` and `link`.** Files, drawings, H5P and external tools
  need an upload or a context the protocol cannot supply here.

If a step inside `create_board` fails, the board and everything created before that step stay —
call `get_board` to see how far it got.

Watch which use-case a tool binds to: `RoomUc.getRoomStats` reads like the list every user
wants, but it is the school-admin view behind `SCHOOL_ADMINISTRATE_ROOMS` and answers `403` for
a teacher. `list_rooms` therefore uses `RoomArrangementUc`, exactly like `GET /rooms`.

## Authorization

Every tool calls the same use-case the REST controller calls, so the room, course and board
rules decide what a user may do; no permission logic lives in this module. Tool arguments are
transformed and validated with `GlobalValidationPipe` against the very same DTOs
(`CreateRoomBodyParams`, `CreateBoardBodyParams`, `RichTextContentBody`, …), which is also what
sanitises titles and rich text.

Errors are logged through `ErrorLogger` and returned to the client as an MCP tool error
(`isError: true`) naming tool, HTTP status and message, rather than as a failed HTTP request —
that is what lets an assistant read "403 you cannot edit this room" and try something else.

## Clients

Claude Code and the Claude desktop app take the tool schemas as they are. The iOS assistant
bridges them into Apple's Foundation Models `Tool` protocol
(`ios-client/Sources/SVSClient/Assistant/MCPToolBridge.swift`), and a tool whose schema it cannot
map is silently skipped — so keep the single-step tools flat: if the nested `create_board` schema
ever gets dropped there, `add_column` / `add_card` / `add_card_element` still work. Untested on
the simulator, which has no Foundation Models.

## Structure

| File | Role |
| --- | --- |
| `api/mcp.controller.ts` | the HTTP endpoint and transport wiring |
| `api/mcp-server.factory.ts` | builds the per-request server from the tool groups |
| `api/tools/*.tools.ts` | one group per domain: rooms, courses, boards |
| `api/tools/tool-support.ts` | serialisation, DTO validation, error logging base class |
| `mcp-sdk.d.ts` | ambient typings for the ESM-only SDK subpaths (see the file header) |

## Tests

```bash
npx jest apps/server/src/modules/mcp-server
```

`api/test/mcp.api.spec.ts` drives real JSON-RPC over HTTP against a full `ServerTestModule`,
including the 401/405/406 paths. Note that it seeds the room roles once per suite: `RoleRepo`
caches roles by name for a minute, so wiping them between tests leaves memberships pointing at
a role id that no longer exists.
