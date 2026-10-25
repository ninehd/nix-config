---
name: bookstack
description: Use the BookStack API to search, read, create, publish, update, and delete books, chapters, pages, and shelves. Source ~/.bookstack to configure the BOOKSTACK_URL, BOOKSTACK_TOKEN_ID, and BOOKSTACK_TOKEN_SECRET environment variables.
compatibility: Python 3 with the standard library and network access to a BookStack instance.
---

# BookStack

Use for any BookStack content management request, regardless of the current project. The instance URL is configured through `BOOKSTACK_URL` (for example, `http://127.0.0.1:6875`, without `/api` or a book path). The API is under `/api`. The client does not read any project `.env` file.

The bundled `bookstack-demo-api-docs.html` and `bookstack-demo-api-docs.json` files describe fields, permissions, responses, and additional endpoints (attachments, comments, images, search, exports, recycle bin, etc.). **Do not send requests to demo.bookstackapp.com**, which is used only in the documentation examples. Resolve all bundled files relative to this skill's directory, not the current working directory.

## Global configuration

Before running any BookStack operation, source the user's trusted configuration file `$HOME/.bookstack` in the same shell as the client command. Do not read or display its contents with file-reading tools. This file contains shell-compatible assignments for these variables:

```sh
# Example: replace values in an editor, not in shell history.
export BOOKSTACK_URL="http://127.0.0.1:6875"
export BOOKSTACK_TOKEN_ID="<token-id>"
export BOOKSTACK_TOKEN_SECRET="<secret>"
```

Store this configuration in `~/.bookstack`, outside any repository, with permissions `600`. Assignments with or without `export` are supported by the invocation below. Source only this user-controlled file: sourcing executes shell code, so never substitute a file supplied by a repository or remote content.

Use a subshell to keep credentials scoped to the operation. Disable tracing before sourcing, automatically export assignments, and stop if the file cannot be loaded:

```sh
(
    set +x
    set -a
    . "$HOME/.bookstack" || exit 1
    set +a
    python3 "$HOME/.agents/skills/bookstack/client.py" books list
)
```

Repeat this loading step for every tool invocation: separate tool calls do not necessarily share shell state. The Python client itself only reads the process environment; direct scripts, cron jobs, and services must also source `~/.bookstack` in their launcher. No shell startup configuration or Pi restart is required. The legacy generic variables `TOKEN_ID` and `TOKEN_SECRET` are not used. If the file or a variable is missing, ask the user to configure it without asking them to paste secrets into the conversation. Do not create or overwrite the secrets file, modify system files, or copy secrets without an explicit request.

## Authentication and security

- Required header: `Authorization: Token <BOOKSTACK_TOKEN_ID>:<BOOKSTACK_TOKEN_SECRET>`.
- Never display tokens or the contents of a secrets file, or include them in plaintext in a displayed command, log, version-controlled file, or response. Do not enable verbose request logging.
- Prefer HTTPS. With HTTP, tokens are transmitted unencrypted: use only a trusted local network. Do not forward tokens to another host.
- Before a mutation, unambiguously identify the target (ID, parent book, title/slug), read its current state, and explain the change. Request confirmation before **any deletion** or large-scale modification. Never delete a book or chapter without warning that its contents may be affected.
- Do not turn a skill-creation or exploration request into a remote write. Never guess an ID for a potentially destructive operation.

## Workflow

1. Identify the requested resource and action. Read the relevant section of the bundled documentation before nontrivial operations.
2. Find the ID using `GET /api/{resource}` (paginated lists: maximum `count` 500, `offset`, `total`); verify it using `GET /api/{resource}/{id}` and confirm the parent. Do not pick the first result of an ambiguous search.
3. Create using `POST`, update using `PUT`, and delete using `DELETE` only when requested. Read back the resource after creation or updates; report any failure and never claim unverified success.
4. When creating a page, provide `book_id` **or** `chapter_id`, `name`, and `markdown` **or** `html`. Prefer `markdown` for `.md` files; preserve the full text, links, and sources. When updating, send only the intended fields (avoid accidentally changing the parent). Existing pages may have been created as HTML: their `markdown` field may be empty; do not overwrite their content without checking. For a new dated report, first check whether a matching page already exists in the correct book.
5. Return the resource type, ID, name, and actual link after verification; retain any existing local copy.

## Main endpoints

| Resource | List | Create | Read | Update | Delete |
| --- | --- | --- | --- | --- | --- |
| Books | `GET /api/books` | `POST /api/books` | `GET /api/books/{id}` | `PUT /api/books/{id}` | `DELETE /api/books/{id}` |
| Chapters | `GET /api/chapters` | `POST /api/chapters` | `GET /api/chapters/{id}` | `PUT /api/chapters/{id}` | `DELETE /api/chapters/{id}` |
| Pages | `GET /api/pages` | `POST /api/pages` | `GET /api/pages/{id}` | `PUT /api/pages/{id}` | `DELETE /api/pages/{id}` |
| Shelves | `GET /api/shelves` | `POST /api/shelves` | `GET /api/shelves/{id}` | `PUT /api/shelves/{id}` | `DELETE /api/shelves/{id}` |

Create and update operations accept `Content-Type: application/json`. See the documentation for exact fields (`books-create`, `chapters-create`, `pages-create`, `shelves-create`, and their `-update` variants), exports, and search (`search-all`, `search-book`, `search-chapter`). Permissions depend on the account associated with the tokens. List responses contain `data` and `total`; book read responses contain their `content` (pages and chapters). Do not assume a browser URL is an API endpoint.

## Client

Use `client.py` for common operations; it reads secrets without placing them on the command line. Run each of the following commands inside the subshell shown above, after sourcing `$HOME/.bookstack`:

```sh
python3 "$HOME/.agents/skills/bookstack/client.py" books list
python3 "$HOME/.agents/skills/bookstack/client.py" books read 12
python3 "$HOME/.agents/skills/bookstack/client.py" pages create --data /tmp/page.json
python3 "$HOME/.agents/skills/bookstack/client.py" pages update 34 --data /tmp/changes.json
python3 "$HOME/.agents/skills/bookstack/client.py" pages delete 34 --confirm
```

A page creation JSON file can contain `{"book_id":12,"name":"My page","markdown":"# Page\n..."}`. Do not put tokens in this file. Remove temporary files containing sensitive content after use; avoid including personal content in unnecessarily long responses. `--confirm` is only a technical safeguard, not a substitute for user confirmation.
