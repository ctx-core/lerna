#!/bin/sh
PWD="$(pwd)"
DIRS=$(
git submodule \
| awk -v pwd=$PWD '{print pwd"/"$2}' \
| grep -v "^$"
)
while read dir; do
  echo "$dir"
  cd "$dir"
  git add .
  git commit -av < /dev/tty > /dev/tty
done <<< $DIRS
