#!/usr/bin/env bash
#
# その日の日報ディレクトリを daily/<YYYY-MM>/<DD>/ に作成する。
#
# 使い方:
#   ./create_daily.sh [YYYY-MM-DD]
#
#   日付を省略した場合は当日分を作成する。
#   daily/template/ の内容 (mine/ と agents/template/) をそのまま複製する。
#   既に存在する場合は何もしない。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TEMPLATE_DIR="${SCRIPT_DIR}/template"

usage() {
  cat <<'EOS'
使い方:
  ./create_daily.sh [YYYY-MM-DD]

引数:
  YYYY-MM-DD  作成する日付 (省略時は当日)

オプション:
  -h, --help  このヘルプを表示

実行内容:
  daily/<YYYY-MM>/<DD>/ を作成し、daily/template/ の内容を複製する。
  複製されるのは mine/ (自分用) と agents/template/ (agent 用の複製元)。
  既に存在する場合は何も変更しない。
EOS
}

die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

# --- 引数解析 --------------------------------------------------------------

date_str=""

while (( $# > 0 )); do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      die "不明なオプション: $1"
      ;;
    *)
      [[ -z "$date_str" ]] || die "引数が多すぎます: $1"
      date_str="$1"
      shift
      ;;
  esac
done

[[ -n "$date_str" ]] || date_str="$(date +%Y-%m-%d)"

[[ "$date_str" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] \
  || die "日付は YYYY-MM-DD の形式で指定してください: $date_str"

year_month="${date_str:0:7}"
day="${date_str:8:2}"

# 10進数として比較する (08, 09 が8進数扱いにならないよう 10# を付ける)
(( 10#${date_str:5:2} >= 1 && 10#${date_str:5:2} <= 12 )) \
  || die "月の指定が不正です: $date_str"
(( 10#$day >= 1 && 10#$day <= 31 )) \
  || die "日の指定が不正です: $date_str"

# --- 事前チェック ----------------------------------------------------------

[[ -d "$TEMPLATE_DIR" ]] || die "テンプレートが見つかりません: $TEMPLATE_DIR"

target_dir="${SCRIPT_DIR}/${year_month}/${day}"

if [[ -e "$target_dir" ]]; then
  printf 'すでに存在します: daily/%s/%s\n' "$year_month" "$day"
  exit 0
fi

# --- 作成 ------------------------------------------------------------------

mkdir -p "$target_dir"
cp -R "${TEMPLATE_DIR}/." "$target_dir/"

printf '作成しました: daily/%s/%s\n' "$year_month" "$day"
printf '  自分用   : daily/%s/%s/mine/\n' "$year_month" "$day"
printf '  agent用  : daily/%s/%s/agents/template/ を agent 名で複製して使用\n' "$year_month" "$day"
