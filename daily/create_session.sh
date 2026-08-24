#!/usr/bin/env bash
#
# AI のセッション単位の記録ディレクトリを
# daily/<YYYY-MM>/<DD>/agents/<ツール名>/<セッションID>/ に作成する。
#
# 使い方:
#   ./create_session.sh [--tool <ツール名>] [--date YYYY-MM-DD] [セッションID]
#
#   ツール名とセッションIDは、Claude Code から実行した場合は環境変数から補完される。
#   その日の日報ディレクトリが無ければ create_daily.sh を呼んで作る。
#   既に存在する場合はパスを出力するだけで何も変更しない (冪等)。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOD'
使い方:
  ./create_session.sh [--tool <ツール名>] [--date YYYY-MM-DD] [セッションID]

引数:
  セッションID   セッションの識別子 (省略時は $CLAUDE_CODE_SESSION_ID)

オプション:
  --tool <名前>  AI ツール名。ディレクトリ名になる (省略時は claude-code を自動判定)
  --date <日付>  YYYY-MM-DD (省略時は当日)
  -h, --help     このヘルプを表示

実行内容:
  daily/<YYYY-MM>/<DD>/agents/<ツール名>/<セッションID>/ を作成し、パスを出力する。
  その日の日報ディレクトリが無ければ create_daily.sh を先に実行する。
  作成後、調査記録は daily/template/_.md を複製して置く。

例:
  ./create_session.sh                          # Claude Code から: 環境変数で補完
  ./create_session.sh --tool codex abc12345    # 他のツール: 明示して指定
EOD
}

die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

# --- 引数解析 --------------------------------------------------------------

tool=""
date_str=""
session_id=""

while (( $# > 0 )); do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --tool)
      [[ $# -ge 2 ]] || die "--tool に値がありません"
      tool="$2"
      shift 2
      ;;
    --date)
      [[ $# -ge 2 ]] || die "--date に値がありません"
      date_str="$2"
      shift 2
      ;;
    -*)
      die "不明なオプション: $1"
      ;;
    *)
      [[ -z "$session_id" ]] || die "引数が多すぎます: $1"
      session_id="$1"
      shift
      ;;
  esac
done

# ツール名: 未指定なら実行環境から判定する
if [[ -z "$tool" ]]; then
  if [[ -n "${CLAUDECODE:-}" ]]; then
    tool="claude-code"
  else
    die "ツール名が判定できません。--tool <ツール名> を指定してください"
  fi
fi

# セッションID: 未指定なら環境変数から補完する
if [[ -z "$session_id" ]]; then
  session_id="${CLAUDE_CODE_SESSION_ID:-}"
  [[ -n "$session_id" ]] \
    || die "セッションIDが判定できません。引数で指定してください"
fi

# ディレクトリ名に使える文字だけに限る (パス区切りや空白の混入を防ぐ)
[[ "$tool" =~ ^[a-z0-9][a-z0-9-]*$ ]] \
  || die "ツール名は英小文字・数字・ハイフンで指定してください: $tool"
[[ "$session_id" =~ ^[A-Za-z0-9][A-Za-z0-9_-]*$ ]] \
  || die "セッションIDに使えない文字が含まれています: $session_id"

[[ -n "$date_str" ]] || date_str="$(date +%Y-%m-%d)"
[[ "$date_str" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] \
  || die "日付は YYYY-MM-DD の形式で指定してください: $date_str"

year_month="${date_str:0:7}"
day="${date_str:8:2}"

# --- 日報ディレクトリを用意する --------------------------------------------

day_dir="${SCRIPT_DIR}/${year_month}/${day}"

if [[ ! -d "$day_dir" ]]; then
  "${SCRIPT_DIR}/create_daily.sh" "$date_str"
fi

# --- 作成 ------------------------------------------------------------------

session_dir="${day_dir}/agents/${tool}/${session_id}"
rel_path="daily/${year_month}/${day}/agents/${tool}/${session_id}"

if [[ -d "$session_dir" ]]; then
  printf 'すでに存在します: %s\n' "$rel_path"
else
  mkdir -p "$session_dir"
  printf '作成しました: %s\n' "$rel_path"
fi

printf '  調査記録 : cp daily/template/_.md %s/<名前>.md\n' "$rel_path"
