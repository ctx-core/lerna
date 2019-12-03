#!/bin/sh
read -r -d '' SCRIPT <<'EOF'
cat package.json \
| jq "[.name, .version] | @tsv" -r \
| awk  '{print ARGV[1]" "$1"@"$2}' \
| xargs echo $(basename $(pwd)) \
| awk '{print "git add . && git commit -m \""$2"\" && git tag "$2" && git push"}' \
| sh
EOF
echo $SCRIPT
lerna exec -- "$SCRIPT"
