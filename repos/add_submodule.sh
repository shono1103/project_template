#!/usr/bin/env bash
#
# repos配下へのsubmodule追加と、README.mdのアクセス権限テーブルへの追記を行う。
#
# 使い方:
#   ./add_submodule.sh <リモートリポジトリのssh経由URL> [--dir_name <ディレクトリ名>] <権限>
#
#   <権限> は2桁の数字。1桁目がproject_group、2桁目がsubmoduleのrole。
#   4=r / 2=w / 1=x の合計値で指定する (7=rwx)。
#
# 例:
#   ./add_submodule.sh git@github.com:example/foo.git --dir_name foo 77

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
README="${SCRIPT_DIR}/README.md"

usage() {
  cat <<'EOS'
使い方:
  ./add_submodule.sh <リモートリポジトリのssh経由URL> [--dir_name <ディレクトリ名>] <権限>

引数:
  <リモートリポジトリのssh経由URL>  例: git@github.com:example/foo.git
  <権限>                            2桁の数字。1桁目=project_group、2桁目=submodule
                                    4=r / 2=w / 1=x の合計値 (7=rwx)

オプション:
  --dir_name <ディレクトリ名>  submoduleを配置するディレクトリ名
                               (省略時はURLのリポジトリ名を使用)
  -h, --help                   このヘルプを表示

実行内容:
  1. repos/<ディレクトリ名> へのsubmodule追加
  2. repos/README.md のアクセス権限テーブルへの行追加
EOS
}

die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

# 権限の1桁 (0-7) を rwx 表記に変換する
perm_to_rwx() {
  local d="$1" s=""
  if (( (d & 4) != 0 )); then s="r"; else s="-"; fi
  if (( (d & 2) != 0 )); then s="${s}w"; else s="${s}-"; fi
  if (( (d & 1) != 0 )); then s="${s}x"; else s="${s}-"; fi
  printf '%s' "$s"
}

# --- 引数解析 --------------------------------------------------------------

url=""
dir_name=""
perm=""
positional_count=0

while (( $# > 0 )); do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --dir_name)
      (( $# >= 2 )) || die "--dir_name にはディレクトリ名の指定が必要です"
      dir_name="$2"
      shift 2
      ;;
    --dir_name=*)
      dir_name="${1#*=}"
      shift
      ;;
    -*)
      die "不明なオプション: $1"
      ;;
    *)
      case "$positional_count" in
        0) url="$1" ;;
        1) perm="$1" ;;
        *) die "引数が多すぎます: $1" ;;
      esac
      positional_count=$(( positional_count + 1 ))
      shift
      ;;
  esac
done

if [[ -z "$url" || -z "$perm" ]]; then
  usage >&2
  die "URLと権限は必須です"
fi

[[ "$perm" =~ ^[0-7][0-7]$ ]] || die "権限は2桁の数字 (各桁0-7) で指定してください: $perm"

# ディレクトリ名の省略時はURLのリポジトリ名を使用する
if [[ -z "$dir_name" ]]; then
  dir_name="${url##*/}"   # git@host:org/repo.git -> repo.git
  dir_name="${dir_name##*:}"  # git@host:repo.git   -> repo.git
  dir_name="${dir_name%.git}"
fi

[[ -n "$dir_name" ]] || die "ディレクトリ名を判別できませんでした。--dir_name で指定してください"
[[ "$dir_name" != */* ]] || die "ディレクトリ名にディレクトリ区切りは使用できません: $dir_name"

project_group_perm="$(perm_to_rwx "${perm:0:1}")"
submodule_perm="$(perm_to_rwx "${perm:1:1}")"

# --- 事前チェック ----------------------------------------------------------

repo_root="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)" \
  || die "gitリポジトリ内で実行してください"

if [[ "$SCRIPT_DIR" == "$repo_root" ]]; then
  submodule_path="$dir_name"
else
  submodule_path="${SCRIPT_DIR#"$repo_root"/}/$dir_name"
fi

[[ -f "$README" ]] || die "README.mdが見つかりません: $README"

grep -qE '^[[:space:]]*\|[[:space:]]*submodule_dir[[:space:]]*\|' "$README" \
  || die "README.mdにアクセス権限テーブルのヘッダが見つかりません"

[[ ! -e "${SCRIPT_DIR}/${dir_name}" ]] \
  || die "すでに存在します: ${submodule_path}"

# --- submodule追加 ---------------------------------------------------------

printf 'submoduleを追加します: %s -> %s\n' "$url" "$submodule_path"
git -C "$repo_root" submodule add "$url" "$submodule_path"

# --- アクセス権限テーブル更新 ----------------------------------------------

tmp_readme="$(mktemp "${README}.XXXXXX")"
trap 'rm -f "$tmp_readme"' EXIT

set +e
awk -v dir="$dir_name" -v pg="$project_group_perm" -v sm="$submodule_perm" '
function trim(s) {
  sub(/^[ \t]+/, "", s)
  sub(/[ \t]+$/, "", s)
  return s
}
# 空セルのみの行 (テーブルのプレースホルダ行) かどうか
function is_blank_row(line,   t) {
  t = line
  gsub(/[| \t]/, "", t)
  return t == ""
}
# 行の1列目 (submodule_dir) を取り出す
function row_key(line,   n, a) {
  n = split(line, a, "|")
  if (n < 2) return ""
  return trim(a[2])
}
{ lines[NR] = $0 }
END {
  # テーブルのヘッダ行を探す
  hdr = 0
  for (i = 1; i <= NR; i++) {
    if (lines[i] ~ /^[ \t]*\|[ \t]*submodule_dir[ \t]*\|/) { hdr = i; break }
  }
  if (hdr == 0) exit 2

  # テーブルの最終行 (先頭が | である連続行の終わり)
  last = hdr
  for (i = hdr + 1; i <= NR; i++) {
    if (lines[i] ~ /^[ \t]*\|/) last = i; else break
  }

  newrow = "| " dir " | " pg " | " sm " |"
  done = 0
  for (i = 1; i <= NR; i++) {
    if (i >= hdr + 2 && i <= last) {
      # 同名の行があれば置き換える
      if (row_key(lines[i]) == dir) { print newrow; done = 1; continue }
      # 空セルのみのプレースホルダ行は除去する
      # (| <例> | rwx | rwx | のような書式サンプル行はそのまま残す)
      if (is_blank_row(lines[i])) continue
    }
    if (i == last + 1 && !done) { print newrow; done = 1 }
    print lines[i]
  }
  if (!done) print newrow
}
' "$README" > "$tmp_readme"
awk_status=$?
set -e

(( awk_status == 0 )) || die "README.mdの更新に失敗しました"

cat "$tmp_readme" > "$README"
rm -f "$tmp_readme"
trap - EXIT

git -C "$repo_root" add -- "$README"

printf 'アクセス権限テーブルを更新しました: | %s | %s | %s |\n' \
  "$dir_name" "$project_group_perm" "$submodule_perm"
printf '変更はステージ済みです。内容を確認してcommitしてください。\n'
