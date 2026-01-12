#!/bin/bash
# Master documentation validation script

set -e

echo "📚 SAP AI Provider - Documentation Validation"
echo "=============================================="
echo ""

# Track overall status
OVERALL_STATUS=0

# 1. Check dotenv imports
echo "1️⃣  Checking dotenv imports..."
if ./scripts/check-dotenv-imports.sh; then
  echo ""
else
  OVERALL_STATUS=1
fi

# 2. Check link formats
echo "2️⃣  Checking link formats..."
if ./scripts/check-links-format.sh; then
  echo ""
else
  OVERALL_STATUS=1
fi

# 3. Check for broken internal links (basic check)
echo "3️⃣  Checking for broken internal links..."
BROKEN=0
for FILE in *.md .github/*.md; do
  # Skip documentation audit files and completion checklists (they contain example links)
  if [[ "$FILE" == DOC_*.md ]] || [[ "$FILE" == PHASE*_COMPLETION_CHECKLIST.md ]]; then
    continue
  fi
  
  if [ -f "$FILE" ]; then
    # Extract markdown links to .md files, skipping code blocks
    awk '
      /^```/ { in_code = !in_code; next }
      !in_code && /\[.*\]\(\.\/[^)]*\.md/ {
        match($0, /\[.*\]\(\.\/[^)]*\.md[^)]*\)/)
        print substr($0, RSTART, RLENGTH)
      }
    ' "$FILE" 2>/dev/null | \
    sed 's/.*(\.\///' | sed 's/#.*//' | sed 's/).*//' | \
    while read LINKED_FILE; do
      if [ -n "$LINKED_FILE" ] && [ ! -f "$LINKED_FILE" ]; then
        echo "❌ Broken link in $FILE: $LINKED_FILE does not exist"
        BROKEN=1
      fi
    done
  fi
done

if [ $BROKEN -eq 0 ]; then
  echo "✅ No broken internal links found"
  echo ""
else
  OVERALL_STATUS=1
  echo ""
fi

# 4. Check file existence
echo "4️⃣  Checking required documentation files..."
REQUIRED_FILES=(
  "README.md"
  "LICENSE.md"
  "CONTRIBUTING.md"
  "API_REFERENCE.md"
  "ARCHITECTURE.md"
  "ENVIRONMENT_SETUP.md"
  "TROUBLESHOOTING.md"
  "MIGRATION_GUIDE.md"
  ".env.example"
)

MISSING=0
for FILE in "${REQUIRED_FILES[@]}"; do
  if [ ! -f "$FILE" ]; then
    echo "❌ Missing required file: $FILE"
    MISSING=1
  fi
done

if [ $MISSING -eq 0 ]; then
  echo "✅ All required files present"
  echo ""
else
  OVERALL_STATUS=1
  echo ""
fi

# Final status
echo "=============================================="
if [ $OVERALL_STATUS -eq 0 ]; then
  echo "✅ Documentation validation PASSED"
  echo ""
  exit 0
else
  echo "❌ Documentation validation FAILED"
  echo ""
  exit 1
fi
