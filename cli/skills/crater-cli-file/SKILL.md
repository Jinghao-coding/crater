---
name: crater-cli-file
version: 0.1.0
description: "Use Crater CLI to download one ordinary-user remote file safely and atomically."
metadata:
  requires:
    bins: ["crater"]
  cliHelp: "crater file --help"
---

# Crater CLI File Download

**CRITICAL — Before doing anything else, MUST read `crater-cli-shared` (possible path: [`../crater-cli-shared/SKILL.md`](../crater-cli-shared/SKILL.md)) for global options, non-interactive use, errors, and sensitive information handling.**

Use `crater file download` when a user wants to copy one remote file from Crater storage to the local machine.

## Supported workflow

- Download to the current directory using the remote basename:

  ```bash
  crater file download user/results/model.bin
  ```

- Choose an exact local file path:

  ```bash
  crater file download "account/共享数据/result.bin" ./downloads/result.bin
  ```

- Replace an existing local file only after the user explicitly asks for it:

  ```bash
  crater file download user/results/model.bin ./model.bin --overwrite
  ```

- Return structured metadata:

  ```bash
  crater file download user/results/model.bin ./model.bin --json --no-interactive
  ```

## Safety

- Remote paths must start with `user`, `public`, or `account` and must name an entry below that root.
- Never add `--overwrite` unless replacing the exact local target is part of the user's request.
- The optional local path is a file path, not a directory.
- The command downloads one file only; it does not recursively download directories.
- Binary content is written only to the target file. JSON stdout contains metadata, not file bytes.
- Do not ask the user to provide a token or Keyring content.

## Troubleshooting

1. Run `crater auth ls --json` and confirm an active context exists.
2. Use `crater file download --help` to verify the local binary supports the command.
3. If the target exists, choose another path or obtain explicit permission to use `--overwrite`.
4. If a transfer fails, the final target is not published and the temporary file is cleaned up.
5. For API errors, inspect `category`, `code`, and `context.http_status` from JSON stderr without exposing credentials.
