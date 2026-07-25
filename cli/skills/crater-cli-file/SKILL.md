---
name: crater-cli-file
version: 0.2.0
description: "Use Crater CLI to create directories, move entries, and stream one local regular file into ordinary-user remote storage."
metadata:
  requires:
    bins: ["crater"]
  cliHelp: "crater file --help"
---

# Crater CLI File Operations

**CRITICAL — Before doing anything else, MUST read `crater-cli-shared` (possible path: [`../crater-cli-shared/SKILL.md`](../crater-cli-shared/SKILL.md)) for global options, non-interactive use, errors, and sensitive information handling.**

Use `crater file` when a user wants to create a directory, move one remote entry, or copy one local regular file into Crater storage.

## Supported workflow

- Create a new remote file:

  ```bash
  crater file upload ./train.py user/jobs/train.py
  ```

- Create exactly one remote directory:

  ```bash
  crater file mkdir user/jobs/new-run
  ```

- Move or rename one remote file:

  ```bash
  crater file mv user/jobs/train.py user/jobs/archive/train.py
  ```

- Move one remote directory:

  ```bash
  crater file mv user/jobs/old-run account/archive/old-run
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
- `mkdir` creates exactly one directory. Its parent must already exist.
- `mv` takes the complete source and complete destination path. The destination is not interpreted as a parent directory.
- `mv` never overwrites an existing destination and has no overwrite flag. Choose a different exact path when the server reports a conflict.
- `mv` fails closed when the backing filesystem cannot provide atomic no-clobber rename semantics.
- Do not move an entry to itself or below itself.
- Never add `--overwrite` unless replacing that exact remote target is part of the user's request.
- The server stages the complete stream in the target directory and atomically publishes it. A failed transfer never exposes a partial new file or truncates the previous file.
- Parent directories are never created automatically.
- This command uploads one file only. Do not pass a directory or shell glob.
- JSON stdout contains metadata only; it never includes file bytes.
- Do not ask the user to provide a token or Keyring content.

## Troubleshooting

1. Run `crater auth ls --json` and confirm an active context exists.
2. Use `crater file --help` and the selected subcommand's help to verify the local binary supports the operation.
3. If `mkdir` reports a missing parent, create each required parent explicitly from top to bottom.
4. If `mv` reports a conflict, choose another complete destination path; there is no overwrite mode.
5. If an upload target exists, choose a new path or obtain explicit permission to add `--overwrite`.
6. A `404` from `/api/ss/upload` means the storage service is older than the safe upload feature; upgrade the server rather than falling back to unsafe WebDAV PUT.
7. For API errors, inspect `category`, `code`, and `context.http_status` from JSON stderr without exposing credentials.
