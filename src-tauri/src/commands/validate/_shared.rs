use reqwest::Client;
use std::time::Duration;

use crate::http::make_corporate_client;

pub(super) fn make_client() -> Result<Client, String> {
    make_corporate_client(Duration::from_secs(10), false)
}

// The OAuth PKCE helpers (generate_random_base64url, sha256_base64url,
// percent_encode, percent_decode, wait_for_oauth_callback, parse_callback)
// were deleted along with the Anthropic + Gemini OAuth flows in the
// 2026-05-10 auth pivot — both providers now delegate to user-installed
// CLIs that handle auth themselves, so Meridian no longer runs an OAuth
// callback listener on a loopback port.
