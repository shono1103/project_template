#!/usr/bin/env bash
#
# repos/<リポジトリ名>/.worktrees/ に常設のworktreeを作成する。
#
# 使い方:
#   ./setup_worktrees.sh <リポジトリ名> [--branch <ブランチ名>]...
#
# 既定で作るworktree:
#   .worktrees/verify   local/verify — 動作確認用
#   .worktrees/e2e      local/e2e   — E2Eテスト用
#
# デフォルトブランチの参照用には repo/ 自体を使う (worktreeは作らない)。
# repo/ がデフォルトブランチにいなければ切り替える。
#
# local/* はローカル専用ブランチなのでpushしない。
# 既に存在するworktreeはスキップする (冪等)。

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOD'
使い方:
  ./setup_worktrees.sh <リポジトリ名> [--branch <ブランチ名>]...

引数:
  <リポジトリ名>  repos/ 配下のディレクトリ名 (submoduleは その中の repo/)

オプション:
  --branch <名前>  既定に加えて作成するブランチ。複数指定可。
                   ディレクトリ名はスラッシュをハイフンに置き換えた名前になる
                   (例: feature/foo -> .worktrees/feature-foo)
  -h, --help       このヘルプを表示

実行内容:
  repo/               デフォルトブランチに置く (参照用。worktreeは作らない)
  .worktrees/verify   local/verify — 動作確認用
  .worktrees/e2e      local/e2e   — E2Eテスト用
  既に存在するものはスキップする。
EOD
}

die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

# --- 引数解析 --------------------------------------------------------------

dir_name=""
extra_branches=()

while (( $# > 0 )); do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --branch)
      (( $# >= 2 )) || die "--branch にはブランチ名の指定が必要です"
      extra_branches+=("$2")
      shift 2
      ;;
    --branch=*)
      extra_branches+=("${1#*=}")
      shift
      ;;
    -*)
      die "不明なオプション: $1"
      ;;
    *)
      [[ -z "$dir_name" ]] || die "引数が多すぎます: $1"
      dir_name="$1"
      shift
      ;;
  esac
done

[[ -n "$dir_name" ]] || { usage >&2; die "リポジトリ名は必須です"; }
[[ "$dir_name" != */* ]] || die "リポジトリ名にディレクトリ区切りは使用できません: $dir_name"

# --- 事前チェック ----------------------------------------------------------

entry_dir="${SCRIPT_DIR}/${dir_name}"
repo_dir="${entry_dir}/repo"
wt_dir="${entry_dir}/.worktrees"

[[ -d "$entry_dir" ]] || die "ディレクトリが見つかりません: repos/${dir_name}"
[[ -d "$repo_dir" ]] || die "submoduleが見つかりません: repos/${dir_name}/repo"
git -C "$repo_dir" rev-parse --git-dir >/dev/null 2>&1 \
  || die "gitリポジトリではありません: repos/${dir_name}/repo"

mkdir -p "$wt_dir"

# デフォルトブランチを判定する (origin/HEAD -> 現在のブランチ の順に見る)
default_branch="$(git -C "$repo_dir" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
default_branch="${default_branch#origin/}"
if [[ -z "$default_branch" ]]; then
  default_branch="$(git -C "$repo_dir" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
fi
[[ -n "$default_branch" && "$default_branch" != "HEAD" ]] \
  || die "デフォルトブランチを判別できませんでした: repos/${dir_name}/repo"

# --- worktree 作成 ---------------------------------------------------------

# デフォルトブランチの参照用には repo/ 自体を使う。
# 作業はすべて worktree で行うので、repo/ の作業ツリーは触らない。
ensure_repo_on_default_branch() {
  local current
  current="$(git -C "$repo_dir" rev-parse --abbrev-ref HEAD 2>/dev/null || true)"

  if [[ "$current" == "$default_branch" ]]; then
    printf '  repo/ は %s を参照 (参照用)\n' "$default_branch"
    return 0
  fi

  # 未コミットの変更があるときは触らない
  if [[ -n "$(git -C "$repo_dir" status --porcelain)" ]]; then
    printf '  警告: repo/ に未コミットの変更があるため %s に切り替えませんでした (現在: %s)\n' \
      "$default_branch" "$current" >&2
    return 0
  fi

  if git -C "$repo_dir" checkout "$default_branch" >/dev/null 2>&1; then
    printf '  repo/ を %s に切り替えました (参照用)\n' "$default_branch"
  else
    printf '  警告: repo/ を %s に切り替えられませんでした (現在: %s)\n' \
      "$default_branch" "$current" >&2
  fi
}

# ブランチ用worktree。ブランチが無ければデフォルトブランチから作る
add_branch() {
  local name="$1" branch="$2" note="${3:-}"
  if [[ -e "${wt_dir}/${name}" ]]; then
    printf '  スキップ (既存): .worktrees/%s\n' "$name"
    return 0
  fi
  if git -C "$repo_dir" show-ref --verify --quiet "refs/heads/${branch}"; then
    git -C "$repo_dir" worktree add "${wt_dir}/${name}" "$branch" >/dev/null
  else
    git -C "$repo_dir" worktree add -b "$branch" "${wt_dir}/${name}" "$default_branch" >/dev/null
  fi
  printf '  作成: .worktrees/%-12s %s %s\n' "$name" "$branch" "$note"
}

printf 'repos/%s/ を整えます\n' "$dir_name"

ensure_repo_on_default_branch
add_branch "verify" "local/verify" "(動作確認用)"
add_branch "e2e" "local/e2e" "(E2Eテスト用)"

for branch in ${extra_branches[@]+"${extra_branches[@]}"}; do
  add_branch "${branch//\//-}" "$branch" ""
done

printf '\n'
printf 'local/* はローカル専用ブランチです。pushはしません。\n'
printf '一覧: git -C repos/%s/repo worktree list\n' "$dir_name"
