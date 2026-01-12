#!/bin/bash
# Check that all TypeScript examples with createSAPAIProvider import dotenv/config

set -e

FAILED=0
FILES="README.md API_REFERENCE.md MIGRATION_GUIDE.md ENVIRONMENT_SETUP.md TROUBLESHOOTING.md"

echo "🔍 Checking dotenv imports in documentation..."

for FILE in $FILES; do
  if [ ! -f "$FILE" ]; then
    echo "⚠️  File not found: $FILE"
    continue
  fi
  
  # Extract TypeScript code blocks and check for pattern
  awk '/```typescript/,/```/' "$FILE" | \
  awk '/createSAPAIProvider/ {
    # Look back in the last 10 lines for dotenv
    found=0
    for (i=NR-10; i<NR; i++) {
      if (lines[i%10] ~ /dotenv\/config/) {
        found=1
        break
      }
    }
    if (!found) {
      print "❌ Missing dotenv import before createSAPAIProvider"
      exit 1
    }
  }
  {
    lines[NR%10] = $0
  }' && echo "  ✅ $FILE" || { echo "  ❌ $FILE"; FAILED=1; }
done

if [ $FAILED -eq 1 ]; then
  echo ""
  echo "❌ Some files are missing dotenv imports"
  echo "   Expected format: import \"dotenv/config\"; // Load environment variables"
  exit 1
else
  echo ""
  echo "✅ All documentation files have correct dotenv imports"
fi

exit 0
