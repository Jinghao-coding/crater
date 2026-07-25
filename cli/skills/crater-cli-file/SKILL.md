---
name: crater-cli-file
version: 0.1.0
description: "Use Crater CLI to stream one local regular file into ordinary-user remote storage with explicit, atomic overwrite semantics."
metadata:
  requires:
    bins: ["crater"]
  cliHelp: "crater file --help"
---

# Crater CLI File Upload

**CRITICAL — Before doing anything else, MUST read `crater-cli-shared` (possible path: [`../crater-cli-shared/SKILL.md`](../crater-cli-shared/SKILL.md)) for global options, non-interactive use, errors, and sensitive information handling.**

Use `crater file upload` when a user wants to copy one local regular file into Crater storage.

## Supported workflow

- Create a new remote file:

  ```bash
  crater file upload ./train.py user/jobs/train.py
  ```

- Upload a binary file to current-account storage:

  ```bash
  crater file upload ./weights.bin "account/模型/weights.bin"
  ```

- Replace an existing regular remote file only after the user explicitly asks for it:

  ```bash
  crater file upload ./train.py user/jobs/train.py --overwrite
  ```

- Return structured metadata:

  ```bash
  crater file upload ./train.py user/jobs/train.py --json --no-interactive
  ```

## Safety

- The local path must resolve to one open regular file. Directories, devices, sockets, and pipes are rejected before any API request.
- Remote paths must start with `user`, `public`, or `account` and must name an entry below that root.
- Never add `--overwrite` unless replacing that exact remote target is part of the user's request.
- The server stages the complete stream in the target directory and atomically publishes it. A failed transfer never exposes a partial new file or truncates the previous file.
- Parent directories are never created automatically.
- This command uploads one file only. Do not pass a directory or shell glob.
- JSON stdout contains metadata only; it never includes file bytes.
- Do not ask the user to provide a token or Keyring content.

## Troubleshooting

1. Run `crater auth ls --json` and confirm an active context exists.
2. Use `crater file upload --help` to verify the local binary supports the command.
3. If the target exists, choose a new path or obtain explicit permission to add `--overwrite`.
4. A `404` from `/api/ss/upload` means the storage service is older than this CLI feature; upgrade the server rather than falling back to unsafe WebDAV PUT.
5. For API errors, inspect `category`, `code`, and `context.http_status` from JSON stderr without exposing credentials.
