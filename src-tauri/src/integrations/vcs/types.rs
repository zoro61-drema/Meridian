// Provider-neutral PR/comment/task/user shapes used by every `VcsProvider`
// impl. Field-level serde renames preserve the camelCase wire format that
// the frontend already consumes.

use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub display_name: String,
    pub nickname: String,
    pub account_id: Option<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Reviewer {
    pub user: User,
    pub approved: bool,
    pub state: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Pr {
    pub id: i64,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub author: User,
    pub reviewers: Vec<Reviewer>,
    pub source_branch: String,
    pub destination_branch: String,
    pub created_on: String,
    pub updated_on: String,
    pub comment_count: i64,
    pub task_count: i64,
    pub url: String,
    pub jira_issue_key: Option<String>,
    pub changes_requested: bool,
    pub draft: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Comment {
    pub id: i64,
    pub content: String,
    pub author: User,
    pub created_on: String,
    pub updated_on: String,
    pub inline: Option<InlineContext>,
    pub parent_id: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct InlineContext {
    pub path: String,
    pub from_line: Option<i64>,
    pub to_line: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: i64,
    pub content: String,
    pub resolved: bool,
    pub comment_id: Option<i64>,
}
