use std::os::unix::fs::PermissionsExt;
use std::process::Command;

use crate::storage::credentials::get_credential;
use crate::storage::preferences::get_pref;

/// Look up the user's preferred macOS terminal app (same key the PR
/// Review terminal launcher uses). Falls back to iTerm2.
fn default_terminal() -> String {
    get_pref("pr_review_terminal")
        .or_else(|| get_credential("pr_review_terminal"))
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "iTerm2".to_string())
}

/// Open a terminal window and run a guided install + sign-in script for the
/// chosen provider's CLI. The terminal application is read from the
/// `pr_review_terminal` preference (same setting the PR Review terminal-
/// launcher uses; supported values: iTerm2, Terminal, Warp, Kitty,
/// Alacritty). The script:
///
///   1. Checks whether the CLI is already on PATH; skips install if so.
///   2. Otherwise asks the user (in the terminal) whether to
///      `npm install -g …`. On accept, runs the install.
///   3. Spawns the CLI's sign-in command so the user can complete OAuth
///      against the vendor's browser flow (Anthropic's claude.ai for
///      Claude Code, Google's accounts.google.com for Gemini CLI).
///   4. Tells the user to come back to Meridian and click "Re-detect".
///
/// The script is written to a temp file and invoked from the terminal so
/// the AppleScript stays simple (single `sh /tmp/…` invocation) and
/// pasted-into-Apple-Script escaping doesn't need to handle the full
/// install transcript.
#[tauri::command]
pub async fn setup_ai_cli(provider: String) -> Result<(), String> {
    let script_body = match provider.as_str() {
        "anthropic" | "claude" => CLAUDE_CODE_SETUP_SH,
        "google" | "gemini" => GEMINI_CLI_SETUP_SH,
        "copilot" | "github" => COPILOT_CLI_SETUP_SH,
        other => return Err(format!("Unknown provider for CLI setup: {other}")),
    };

    let mut path = std::env::temp_dir();
    path.push(format!("meridian-setup-{provider}.sh"));
    std::fs::write(&path, script_body)
        .map_err(|e| format!("Failed to write setup script: {e}"))?;

    let mut perms = std::fs::metadata(&path)
        .map_err(|e| format!("Failed to stat setup script: {e}"))?
        .permissions();
    perms.set_mode(0o755);
    std::fs::set_permissions(&path, perms)
        .map_err(|e| format!("Failed to chmod setup script: {e}"))?;

    let path_str = path.to_string_lossy().to_string();

    let terminal = default_terminal();

    let script_cmd = format!("sh {path_str}");
    let osa_script = if terminal.eq_ignore_ascii_case("iterm2") {
        format!(
            r#"tell application "iTerm2"
    activate
    if (count of windows) > 0 then
        tell current window
            set newTab to (create tab with default profile)
            tell current session of newTab
                write text "{script_cmd}"
            end tell
        end tell
    else
        set newWindow to (create window with default profile)
        tell current session of newWindow
            write text "{script_cmd}"
        end tell
    end if
end tell"#
        )
    } else {
        format!(
            r#"tell application "{terminal}"
    activate
    if (count of windows) > 0 then
        tell front window
            do script "{script_cmd}" in front window
        end tell
    else
        do script "{script_cmd}"
    end if
end tell"#
        )
    };

    let out = Command::new("osascript")
        .arg("-e")
        .arg(&osa_script)
        .output()
        .map_err(|e| format!("Failed to launch {terminal}: {e}"))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("{terminal} launch failed: {stderr}"));
    }
    Ok(())
}

const CLAUDE_CODE_SETUP_SH: &str = r#"#!/bin/sh
clear
cat <<'BANNER'
╭───────────────────────────────────────────────────────────╮
│ Meridian — Claude Code CLI setup                          │
╰───────────────────────────────────────────────────────────╯

BANNER

if command -v claude >/dev/null 2>&1; then
  echo "✓ Claude Code CLI already installed at $(command -v claude)"
else
  echo "Claude Code CLI is not installed."
  echo ""
  printf "Install via 'npm install -g @anthropic-ai/claude-code'? [y/N] "
  read -r ans
  case "$ans" in
    y|Y|yes|YES)
      echo ""
      npm install -g @anthropic-ai/claude-code
      if [ $? -ne 0 ]; then
        echo ""
        echo "Install failed. Press Enter to close."
        read -r _
        exit 1
      fi
      ;;
    *)
      echo "Aborted. Press Enter to close."
      read -r _
      exit 1
      ;;
  esac
fi

echo ""
echo "Launching 'claude /login' to sign in to your Pro/Max subscription"
echo "(or to register an API key). A browser window will open."
echo ""
echo "After you finish, type /exit to leave the CLI, close this terminal,"
echo "then click 'Re-detect CLI' back in Meridian → Settings → Anthropic."
echo ""
claude /login
"#;

const GEMINI_CLI_SETUP_SH: &str = r#"#!/bin/sh
clear
cat <<'BANNER'
╭───────────────────────────────────────────────────────────╮
│ Meridian — Gemini CLI setup                               │
╰───────────────────────────────────────────────────────────╯

BANNER

if command -v gemini >/dev/null 2>&1; then
  echo "✓ Gemini CLI already installed at $(command -v gemini)"
else
  echo "Gemini CLI is not installed."
  echo ""
  printf "Install via 'npm install -g @google/gemini-cli'? [y/N] "
  read -r ans
  case "$ans" in
    y|Y|yes|YES)
      echo ""
      npm install -g @google/gemini-cli
      if [ $? -ne 0 ]; then
        echo ""
        echo "Install failed. Press Enter to close."
        read -r _
        exit 1
      fi
      ;;
    *)
      echo "Aborted. Press Enter to close."
      read -r _
      exit 1
      ;;
  esac
fi

echo ""
echo "Launching 'gemini' — sign in with your Google account when prompted."
echo "(A browser window will open for OAuth.) The first 'Sign in with Google'"
echo "tier gives you free Gemini Code Assist access."
echo ""
echo "After signing in, type /quit to leave the CLI, close this terminal,"
echo "then click 'Re-detect CLI' back in Meridian → Settings → Gemini."
echo ""
gemini
"#;

const COPILOT_CLI_SETUP_SH: &str = r#"#!/bin/sh
clear
cat <<'BANNER'
╭───────────────────────────────────────────────────────────╮
│ Meridian — GitHub Copilot CLI setup                       │
╰───────────────────────────────────────────────────────────╯

BANNER

if command -v copilot >/dev/null 2>&1; then
  echo "✓ Copilot CLI already installed at $(command -v copilot)"
else
  echo "GitHub Copilot CLI is not installed."
  echo ""
  printf "Install via 'npm install -g @github/copilot'? [y/N] "
  read -r ans
  case "$ans" in
    y|Y|yes|YES)
      echo ""
      npm install -g @github/copilot
      if [ $? -ne 0 ]; then
        echo ""
        echo "Install failed. Press Enter to close."
        read -r _
        exit 1
      fi
      ;;
    *)
      echo "Aborted. Press Enter to close."
      read -r _
      exit 1
      ;;
  esac
fi

echo ""
echo "Launching 'copilot login' to sign in with your GitHub account."
echo "(A device-code flow will open in your browser.) Your Copilot subscription"
echo "(Free, Pro, Business, Enterprise) is read from that account."
echo ""
echo "After signing in, close this terminal, then click 'Re-detect CLI'"
echo "back in Meridian → Settings → GitHub Copilot."
echo ""
copilot login
"#;
