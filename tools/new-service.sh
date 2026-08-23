#!/usr/bin/env bash
set -Eeuo pipefail

name="${1:-}"
base_package="${2:-}"
config_path="${3:-}"

if [[ ! "$name" =~ ^[a-z][a-z0-9-]{2,39}$ ]]; then
  echo "Usage: $0 <kebab-service-name> <base.package> [template-config.json]" >&2
  exit 2
fi
if [[ ! "$base_package" =~ ^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$ ]]; then
  echo "Invalid base package: $base_package" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
template_root="$repo_root/templates/service-template"
feature_template_root="$repo_root/templates/service-features"
destination="$repo_root/services/$name"

if [[ -z "$config_path" && -f "$repo_root/template-config.json" ]]; then
  config_path="$repo_root/template-config.json"
elif [[ -n "$config_path" ]]; then
  config_path="$(cd "$(dirname "$config_path")" && pwd)/$(basename "$config_path")"
fi
if [[ -n "$config_path" && ! -f "$config_path" ]]; then
  echo "Configuration was not found: $config_path" >&2
  exit 1
fi

if [[ -e "$destination" ]]; then
  echo "Service already exists: $destination" >&2
  exit 1
fi

class_name=""
IFS='-' read -ra parts <<< "$name"
for part in "${parts[@]}"; do
  class_name+="${part^}"
done
package_path="${base_package//./\/}"

feature_flags=""
if [[ -n "$config_path" ]]; then
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js 22+ is required to validate the configuration against config/template-config.schema.json." >&2
    echo "Install Node.js, or use tools/new-service.ps1 which validates with PowerShell Test-Json." >&2
    exit 1
  fi
  schema_path="$repo_root/config/template-config.schema.json"
  if ! feature_flags="$(node "$repo_root/tools/lib/validate-template-config.mjs" "$config_path" "$schema_path" --features)"; then
    exit 1
  fi
fi

feature_enabled() {
  local key="$1"
  grep -qx "$key=true" <<< "$feature_flags"
}

declare -a selected_features=()
declare -a optional_starter_lines=()
declare -a config_import_lines=()

select_feature() {
  local config_key="$1"
  local feature_name="$2"
  local starter_name="$3"
  if feature_enabled "$config_key"; then
    selected_features+=("$feature_name")
    optional_starter_lines+=("    implementation project(':starters:$starter_name')")
    config_import_lines+=("      - classpath:application-platform-$feature_name.yml")
  fi
}

select_feature redis redis platform-starter-redis
select_feature kafka kafka platform-starter-kafka
select_feature elasticsearch search platform-starter-search
select_feature oidc security platform-starter-security
select_feature observability observability platform-starter-observability

cp -R "$template_root" "$destination"
for feature in "${selected_features[@]}"; do
  cp "$feature_template_root/$feature.yml" "$destination/src/main/resources/application-platform-$feature.yml"
done

replace_marker() {
  local file="$1"
  local marker="$2"
  shift 2
  local replacement=""
  if (($#)); then
    replacement="$(printf '%s\n' "$@")"
  fi
  awk -v marker="$marker" -v replacement="$replacement" \
    'index($0, marker) { print replacement; next } { print }' \
    "$file" > "$file.tmp"
  mv "$file.tmp" "$file"
}

if ((${#optional_starter_lines[@]})); then
  replace_marker "$destination/build.gradle" '// __OPTIONAL_STARTERS__' "${optional_starter_lines[@]}"
else
  replace_marker "$destination/build.gradle" '// __OPTIONAL_STARTERS__' '    // No optional platform starters selected.'
fi
if ((${#config_import_lines[@]})); then
  replace_marker "$destination/src/main/resources/application.yml" '# __OPTIONAL_CONFIG_IMPORTS__' \
    '  config:' '    import:' "${config_import_lines[@]}"
else
  replace_marker "$destination/src/main/resources/application.yml" '# __OPTIONAL_CONFIG_IMPORTS__'
fi

for source_set in main test; do
  java_root="$destination/src/$source_set/java"
  mkdir -p "$(dirname "$java_root/$package_path")"
  mv "$java_root/__PACKAGE_PATH__" "$java_root/$package_path"
done

while IFS= read -r -d '' file; do
  sed -i.bak \
    -e "s/__SERVICE_NAME__/$name/g" \
    -e "s/__BASE_PACKAGE__/$base_package/g" \
    -e "s/__CLASS_NAME__/$class_name/g" \
    "$file"
  rm -f "$file.bak"
done < <(find "$destination" -type f -print0)

find "$destination" -type f -name '*__CLASS_NAME__*' -print0 | while IFS= read -r -d '' file; do
  mv "$file" "${file/__CLASS_NAME__/$class_name}"
done

echo "Created services/$name"
if [[ -n "$config_path" ]]; then
  echo "Applied optional starters from $config_path"
fi
echo "Run: ./gradlew :services:$name:test"
