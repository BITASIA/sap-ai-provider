#!/bin/bash
# Check that all markdown links use correct format (relative with ./)

set -e

echo "🔗 Checking link formats..."

FAILED=0

find . -name "*.md" -not -path "./node_modules/*" -not -path "./.git/*" | while read FILE; do
  # Check for links without ./ prefix for relative markdown links
  # Use awk to skip code blocks (between ```)
  BAD_LINKS=$(awk '
    /^```/ { in_code = !in_code; next }
    !in_code && /\[.*\]\([^./http#].*\.md/ { 
      print NR ":" $0 
    }
  ' "$FILE" 2>/dev/null || true)
  
  if [ -n "$BAD_LINKS" ]; then
    echo "❌ $FILE has relative links without ./ prefix:"
    echo "$BAD_LINKS" | sed 's/^/   /'
    FAILED=1
  fi
done

if [ $FAILED -eq 1 ]; then
  echo ""
  echo "❌ Some files have incorrectly formatted links"
  echo "   Correct format: [Text](./FILE.md) or [Text](./FILE.md#section)"
  echo "   Incorrect: [Text](FILE.md)"
  exit 1
else
  echo "✅ All links are correctly formatted"
fi

exit 0
