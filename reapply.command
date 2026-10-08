#!/bin/zsh
set -eu
cd -- "${0:A:h}"
bun_path="${commands[bun]:-$HOME/.bun/bin/bun}"
if [[ ! -x "$bun_path" ]]; then
  print 'Bun is required. Install it from https://bun.sh then run this again.'
  exit 1
fi
"$bun_path" run apply
if [[ -t 0 ]]; then read -r '?Press Enter to close…'; fi
