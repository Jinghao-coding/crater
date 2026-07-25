---
name: crater-cli-file
version: 0.3.0
description: "Use Crater CLI to create, move, safely remove, or upload one entry in ordinary-user remote storage."
metadata:
  requires:
    bins: ["crater"]
  cliHelp: "crater file --help"
---

# Crater CLI File Operations

**CRITICAL — Before doing anything else, MUST read `crater-cli-shared` (possible path: [`../crater-cli-shared/SKILL.md`](../crater-cli-shared/SKILL.md)) for global options, non-interactive use, errors, and sensitive information handling.**

Use `crater file` when a user wants to create a directory, move or safely remove one remote entry, or copy one local regular file into Crater storage.

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

- Remove one remote file after confirming the normalized target:

  ```bash
  crater file rm user/jobs/archive/train.py
  ```

- Recursively remove one remote directory only with both explicit safeguards:

  ```bash
  crater file rm user/jobs/old-run --recursive --yes
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
- `rm` accepts one exact path only. It rejects logical roots, raw `.` or `..` segments, reserved platform roots, globs, and bulk targets.
- Interactive `rm` shows the normalized exact path and defaults to No. Cancellation sends no request.
- `--json` and `--no-interactive` are non-interactive; add `--yes` explicitly or the command returns a usage error.
- Directories require `--recursive` in addition to confirmation. Never infer or add it unless recursive deletion is the user's stated intent.
- `rm` uses only the dedicated safe `/api/ss/files` endpoint. Never retry through the legacy `/api/ss/delete` endpoint.
- A failed recursive deletion can be partial on network filesystems. Inspect the remaining path before deciding whether to retry.
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
5. If `rm` reports that a directory requires recursive authorization, verify the exact target and rerun with `--recursive`; add `--yes` only when the user has confirmed deletion.
6. If a recursive remove fails, inspect the path before retrying because some children may already be gone.
7. If an upload target exists, choose a new path or obtain explicit permission to add `--overwrite`.
8. A `404` from `/api/ss/upload` or `/api/ss/files` means the storage service may be older than the safe endpoint; upgrade it instead of falling back to an unsafe legacy route.
9. For API errors, inspect `category`, `code`, and `context.http_status` from JSON stderr without exposing credentials.
