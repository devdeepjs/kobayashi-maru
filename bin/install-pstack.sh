#!/bin/bash
# Install cursor/plugins pstack for Pi and Cursor.
# Matt Pocock keeps the names tdd and teach. Pstack's copies are registered as pstack-tdd and pstack-teach.
set -euo pipefail
SRC="${1:-}"
if [[ -z "$SRC" || ! -d "$SRC/skills" ]]; then
  echo "usage: install-pstack.sh <path-to-pstack-plugin-root>" >&2
  exit 1
fi
DEST="$HOME/.agents/vendor/pstack"
mkdir -p "$HOME/.agents/vendor" "$HOME/.agents/skills" "$HOME/.cursor/plugins/local"
rm -rf "$DEST"
rsync -a --exclude .git "$SRC/" "$DEST/"
ln -sfn "$DEST" "$HOME/.cursor/plugins/local/pstack"
linked=0
skipped=0
for d in "$DEST/skills"/*; do
  [[ -d "$d" ]] || continue
  name=$(basename "$d")
  if [[ "$name" == "tdd" || "$name" == "teach" ]]; then
    target="$HOME/.agents/skills/pstack-$name"
    rm -rf "$target"
    mkdir -p "$target"
    cp -R "$d"/. "$target"/
    python3 - "$target/SKILL.md" "pstack-$name" <<'PY'
import pathlib, sys
file, new = pathlib.Path(sys.argv[1]), sys.argv[2]
base = new[len("pstack-"):]
text = file.read_text()
needle = f"name: {base}\n"
if needle not in text:
    raise SystemExit(f"frontmatter name missing in {file}")
text = text.replace(needle, f"name: {new}\n", 1)
marker = "shortcut: copy renamed so Matt Pocock keeps this name, re-run ~/.agents/vendor/install-pstack.sh after a pstack update\n"
end = text.find("\n---\n", 3)
if end == -1:
    raise SystemExit(f"no closing frontmatter in {file}")
text = text[: end + 5] + marker + text[end + 5 :]
file.write_text(text)
PY
    continue
  fi
  link="$HOME/.agents/skills/$name"
  if [[ -e "$link" && ! -L "$link" ]]; then
    echo "skip $name: real skill already there" >&2
    skipped=$((skipped + 1))
    continue
  fi
  ln -sfn "$d" "$link"
  linked=$((linked + 1))
done
echo "linked=$linked skipped=$skipped renamed=pstack-tdd,pstack-teach"
