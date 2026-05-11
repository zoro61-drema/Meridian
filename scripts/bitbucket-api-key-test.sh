#!/bin/zsh
# bitbucket-api-key-test.sh

# Usage: ./bitbucket-api-key-test.sh <api_key> <workspace>
# Tests Bitbucket API key (Bearer token) by fetching the repo list for the
# given workspace.

if [[ "$1" == "-h" || "$1" == "--help" || "$#" -ne 2 ]]; then
  echo "Usage: $0 <api_key> <workspace>"
  echo "Example: $0 xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx your-workspace"
  exit 1
fi

API_KEY="$1"
WORKSPACE="$2"
API_URL="https://api.bitbucket.org/2.0/repositories/${WORKSPACE}?pagelen=1"
echo "Testing Bitbucket API key (Bearer token) against workspace '${WORKSPACE}'"

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $API_KEY" "$API_URL")

if [[ "$HTTP_STATUS" == "200" ]]; then
  echo "✅ Success: API key is valid."
  exit 0
else
  echo "❌ Failed: API key is invalid or lacks permissions. HTTP status: $HTTP_STATUS"
  exit 2
fi
