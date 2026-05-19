use serde_json::Value;

use crate::integrations::vcs::{Comment, InlineContext, Pr, Reviewer, User};

fn extract_jira_key(text: &str) -> Option<String> {
    // Match the same shape as the Bitbucket parser: uppercase project + dash + digits.
    let re = regex_lite::Regex::new(r"\b([A-Z][A-Z0-9_]+-\d+)\b").ok()?;
    re.find(text).map(|m| m.as_str().to_string())
}

/// Map a GitHub user object to our neutral `User`. GitHub login is used as
/// both the nickname and the account_id (which the Bitbucket-shaped trait
/// uses for "this is me" matching).
pub(super) fn parse_user(v: &Value) -> User {
    let login = v["login"].as_str().unwrap_or("").to_string();
    let display = v["name"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or(&login)
        .to_string();
    User {
        display_name: display,
        nickname: login.clone(),
        account_id: if login.is_empty() { None } else { Some(login) },
    }
}

pub(super) fn parse_pr(v: &Value) -> Pr {
    let title = v["title"].as_str().unwrap_or("").to_string();
    let description = v["body"]
        .as_str()
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let source_branch = v["head"]["ref"].as_str().unwrap_or("").to_string();
    let destination_branch = v["base"]["ref"].as_str().unwrap_or("").to_string();
    let jira_issue_key = extract_jira_key(&title)
        .or_else(|| extract_jira_key(&source_branch))
        .or_else(|| description.as_deref().and_then(extract_jira_key));

    let reviewers = v["requested_reviewers"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|r| Reviewer {
                    user: parse_user(r),
                    approved: false,
                    state: "PENDING".to_string(),
                })
                .collect()
        })
        .unwrap_or_default();

    // GitHub's draft state is `draft: true`, but a PR can also be in draft
    // because `mergeable_state == "draft"`. We trust the explicit flag here.
    let draft = v["draft"].as_bool().unwrap_or(false);

    // Comment count: GitHub reports issue comments and review (inline)
    // comments separately. Sum them for the unified count surfaced to the
    // UI so the badge matches what users see across the screen.
    let comment_count = v["comments"].as_i64().unwrap_or(0)
        + v["review_comments"].as_i64().unwrap_or(0);

    Pr {
        // GitHub PR identifier is `number` (the user-visible #N), not the
        // opaque `id`. We use that throughout — it's what every other URL
        // takes and what users recognise.
        id: v["number"].as_i64().unwrap_or(0),
        title,
        description,
        state: v["state"].as_str().unwrap_or("").to_uppercase(),
        author: parse_user(&v["user"]),
        reviewers,
        source_branch,
        destination_branch,
        created_on: v["created_at"].as_str().unwrap_or("").to_string(),
        updated_on: v["updated_at"].as_str().unwrap_or("").to_string(),
        comment_count,
        task_count: 0,
        url: v["html_url"].as_str().unwrap_or("").to_string(),
        jira_issue_key,
        // Filled in by the caller when reviews are also fetched.
        changes_requested: false,
        draft,
    }
}

/// Parse a comment from either the issue-comments endpoint (no inline) or
/// the pull-requests/comments endpoint (with inline path/line metadata).
pub(super) fn parse_comment(v: &Value) -> Comment {
    let inline = if v["path"].is_string() {
        Some(InlineContext {
            path: v["path"].as_str().unwrap_or("").to_string(),
            // `original_line` is the line in the diff at review time;
            // `line` follows the file as it moves. Prefer the moving one.
            from_line: v["start_line"].as_i64(),
            to_line: v["line"]
                .as_i64()
                .or_else(|| v["original_line"].as_i64()),
        })
    } else {
        None
    };
    Comment {
        id: v["id"].as_i64().unwrap_or(0),
        content: v["body"].as_str().unwrap_or("").to_string(),
        author: parse_user(&v["user"]),
        created_on: v["created_at"].as_str().unwrap_or("").to_string(),
        updated_on: v["updated_at"].as_str().unwrap_or("").to_string(),
        inline,
        parent_id: v["in_reply_to_id"].as_i64(),
    }
}

/// Roll up a PR's review history into a single "is anyone requesting
/// changes?" flag. Used by the detail-view fetcher; the listing path
/// doesn't call this so list responses stay one round trip.
pub(super) fn changes_requested_from_reviews(reviews: &[Value]) -> bool {
    // GitHub returns reviews in chronological order. For each reviewer we
    // need their *latest* terminal state — earlier APPROVE/CHANGES_REQUESTED
    // events are overridden by later ones.
    let mut latest: std::collections::HashMap<String, String> =
        std::collections::HashMap::new();
    for r in reviews {
        let state = r["state"].as_str().unwrap_or("").to_string();
        let login = r["user"]["login"].as_str().unwrap_or("").to_string();
        if login.is_empty() || state.is_empty() {
            continue;
        }
        if matches!(
            state.as_str(),
            "APPROVED" | "CHANGES_REQUESTED" | "DISMISSED"
        ) {
            latest.insert(login, state);
        }
    }
    latest.values().any(|s| s == "CHANGES_REQUESTED")
}
