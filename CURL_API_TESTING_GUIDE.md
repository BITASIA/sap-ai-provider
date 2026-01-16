# SAP AI Core API - Manual curl Testing Guide

This guide shows how to make direct API calls to SAP AI Core using curl for
testing and debugging. For production code, use the SAP AI SDK with
`AICORE_SERVICE_KEY`.

---

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Step-by-Step Guide](#step-by-step-guide)
  - [Step 1: Prepare Credentials](#step-1-prepare-credentials)
  - [Step 2: Get OAuth Token](#step-2-get-oauth-token)
  - [Step 3: Call SAP AI Core API](#step-3-call-sap-ai-core-api)
- [Request Body Structure (Orchestration v2)](#request-body-structure-orchestration-v2)
  - [Basic Structure](#basic-structure)
  - [Request Structure](#request-structure)
- [Tool Calling Example](#tool-calling-example)
  - [⚠️ Model-Specific Limitations](#model-specific-limitations)
- [Complete Working Example](#complete-working-example)
- [Response Format](#response-format)
  - [Success Response (HTTP 200)](#success-response-http-200)
  - [Error Response (HTTP 400)](#error-response-http-400)
- [Common Issues](#common-issues)
- [Debugging Tips](#debugging-tips)
- [Security Best Practices](#security-best-practices)
- [Additional Resources](#additional-resources)
- [TypeScript Examples](#typescript-examples)

## Overview

Complete OAuth2 authentication → API call → Tool calling flow.

---

## Prerequisites

- SAP AI Core instance + service key (from BTP cockpit)
- `curl` and `base64` utilities

---

## Step-by-Step Guide

### Step 1: Prepare Credentials

Service key contains: `clientid`, `clientsecret`, `url` (auth server),
`serviceurls.AI_API_URL`

⚠️ **Important:** Never commit credentials. Use environment variables.

### Step 2: Get OAuth Token

```bash
#!/bin/bash

# Your credentials (replace with actual values)
CLIENT_ID="your-client-id-here"
CLIENT_SECRET="your-client-secret-here"
AUTH_URL="https://your-subdomain.authentication.region.hana.ondemand.com"

# Encode credentials to Base64
# IMPORTANT: Use printf (not echo) for proper handling of special characters
CREDENTIALS=$(printf '%s:%s' "$CLIENT_ID" "$CLIENT_SECRET" | base64)

# Request OAuth token
TOKEN_RESPONSE=$(curl -s --request POST \
  --url "${AUTH_URL}/oauth/token" \
  --header "Authorization: Basic ${CREDENTIALS}" \
  --header "Content-Type: application/x-www-form-urlencoded" \
  --data "grant_type=client_credentials")

# Extract access token from JSON response
ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

# Verify token was obtained
if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Failed to get OAuth token"
  echo "Response: $TOKEN_RESPONSE"
  exit 1
fi

echo "✅ OAuth token obtained"
```

**Key Points:** Use `printf` (not `echo`) for special characters. Tokens expire
after 12h.

### Step 3: Call SAP AI Core API

**Endpoint:**
`https://{AI_API_URL}/v2/inference/deployments/{DEPLOYMENT_ID}/v2/completion`

> **Note:** The `/v2` appears **twice** (base path + completion endpoint).

```bash
# Configuration
AI_API_URL="https://api.ai.prod.region.aws.ml.hana.ondemand.com"
DEPLOYMENT_ID="your-deployment-id"
RESOURCE_GROUP="default"

# Build endpoint URL
API_ENDPOINT="${AI_API_URL}/v2/inference/deployments/${DEPLOYMENT_ID}/v2/completion"

# Make API call
curl --request POST \
  --url "${API_ENDPOINT}" \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  --header "AI-Resource-Group: ${RESOURCE_GROUP}" \
  --header "Content-Type: application/json" \
  --data '{
  "config": {
    "modules": {
      "prompt_templating": {
        "prompt": {
          "template": [
            {
              "role": "system",
              "content": "You are a helpful assistant."
            },
            {
              "role": "user",
              "content": "What is 2+2?"
            }
          ]
        },
        "model": {
          "name": "gpt-4o",
          "version": "latest"
        }
      }
    }
  }
}'
```

---

## Request Body Structure (Orchestration v2)

### Basic Structure

```json
{
  "config": {
    "modules": {
      "prompt_templating": {
        "prompt": {
          /* Prompt configuration */
        },
        "model": {
          /* Model configuration */
        }
      }
    }
  }
}
```

### Request Structure

The SAP AI Core v2 API uses a modular configuration structure with `prompt`
(messages, tools, response_format) and `model` (name, version, params) sections.
See complete working examples below for the full structure.

> 💡 For detailed parameter documentation, see
> [API_REFERENCE.md](./API_REFERENCE.md#modelparams)

---

## Tool Calling Example

For complete tool calling documentation including all models, parallel
execution, error handling, and best practices, see
[API Reference - Tool Calling](./API_REFERENCE.md#tool-calling-function-calling).

### ⚠️ Model-Specific Limitations

| Model                | Multiple Tools Support | Notes                                |
| -------------------- | ---------------------- | ------------------------------------ |
| **gpt-4o**           | ✅ Yes                 | Full support for multiple tools      |
| **gpt-4.1-mini**     | ✅ Yes                 | Full support for multiple tools      |
| **gemini-2.0-flash** | ⚠️ Limited             | Only 1 tool per request              |
| **gemini-1.5-pro**   | ⚠️ Limited             | Only 1 tool per request              |
| **claude-3-sonnet**  | ✅ Yes                 | Multiple tools, sequential execution |

**Gemini Note**: Multiple tools supported in future. Currently: 1 tool per
request.

---

## Complete Working Example

```bash
#!/bin/bash

# ============================================
# Configuration (REPLACE WITH YOUR VALUES)
# ============================================

CLIENT_ID="your-client-id"
CLIENT_SECRET="your-client-secret"
AUTH_URL="https://your-auth-url.authentication.region.hana.ondemand.com"
AI_API_URL="https://api.ai.prod.region.aws.ml.hana.ondemand.com"
DEPLOYMENT_ID="your-deployment-id"
RESOURCE_GROUP="default"

# ============================================
# Get OAuth Token
# ============================================

echo "🔐 Getting OAuth token..."

CREDENTIALS=$(printf '%s:%s' "$CLIENT_ID" "$CLIENT_SECRET" | base64)

TOKEN_RESPONSE=$(curl -s --request POST \
  --url "${AUTH_URL}/oauth/token" \
  --header "Authorization: Basic ${CREDENTIALS}" \
  --header "Content-Type: application/x-www-form-urlencoded" \
  --data "grant_type=client_credentials")

ACCESS_TOKEN=$(echo $TOKEN_RESPONSE | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)

if [ -z "$ACCESS_TOKEN" ]; then
  echo "❌ Failed to get OAuth token"
  exit 1
fi

echo "✅ OAuth token obtained"

# ============================================
# Call SAP AI Core API
# ============================================

echo "🚀 Calling SAP AI Core..."

API_ENDPOINT="${AI_API_URL}/v2/inference/deployments/${DEPLOYMENT_ID}/v2/completion"

curl --request POST \
  --url "${API_ENDPOINT}" \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  --header "AI-Resource-Group: ${RESOURCE_GROUP}" \
  --header "Content-Type: application/json" \
  --data '{
  "config": {
    "modules": {
      "prompt_templating": {
        "prompt": {
          "template": [
            {
              "role": "system",
              "content": "You are a helpful assistant."
            },
            {
              "role": "user",
              "content": "Calculate the total price: 100 per unit, 10 units."
            }
          ],
          "tools": [
            {
              "type": "function",
              "function": {
                "name": "calculate_total_price",
                "description": "Calculate total price",
                "parameters": {
                  "type": "object",
                  "properties": {
                    "price_per_unit": {
                      "type": "number",
                      "description": "Price per unit"
                    },
                    "quantity": {
                      "type": "number",
                      "description": "Number of units"
                    }
                  },
                  "required": ["price_per_unit", "quantity"],
                  "additionalProperties": false
                }
              }
            }
          ]
        },
        "model": {
          "name": "gpt-4o",
          "version": "latest"
        }
      }
    }
  }
}'

echo ""
echo "✅ Request completed"
```

---

## Response Format

### Success Response (HTTP 200)

```json
{
  "request_id": "uuid",
  "final_result": {
    "id": "chatcmpl-xxx",
    "object": "chat.completion",
    "created": 1234567890,
    "model": "gpt-4o-2024-08-06",
    "choices": [
      {
        "index": 0,
        "message": {
          "role": "assistant",
          "content": "The total price is $1000",
          "tool_calls": [
            {
              "id": "call_xxx",
              "type": "function",
              "function": {
                "name": "calculate_total_price",
                "arguments": "{\"price_per_unit\": 100, \"quantity\": 10}"
              }
            }
          ]
        },
        "finish_reason": "tool_calls"
      }
    ],
    "usage": {
      "completion_tokens": 59,
      "prompt_tokens": 129,
      "total_tokens": 188
    }
  }
}
```

### Error Response (HTTP 400)

```json
{
  "error": {
    "request_id": "uuid",
    "code": 400,
    "message": "Error description",
    "location": "Module name"
  }
}
```

---

## Common Issues

| Error                | Cause                                                   | Solution                                       |
| -------------------- | ------------------------------------------------------- | ---------------------------------------------- |
| Missing Tenant Id    | Expired token, wrong endpoint, invalid token            | Regenerate token, verify `/v2` paths           |
| Bad Credentials      | Wrong client ID/secret, bad Base64 encoding             | Check credentials, use `printf` not `echo`     |
| Deployment Not Found | Wrong deployment ID, wrong region, wrong resource group | Verify deployment exists, check resource group |
| Multiple Tools Error | Gemini model with >1 tool                               | Use 1 tool OR switch to OpenAI/Claude models   |

---

## Debugging Tips

**Verbose output:**

```bash
curl --verbose --fail-with-body --show-error ...
```

**Decode JWT token:**

```bash
echo "$ACCESS_TOKEN" | cut -d. -f2 | base64 -d | jq .
```

Check: `exp` (expiration), `subaccountid`, `scope`

**Minimal test request:**

```json
{
  "config": {
    "modules": {
      "prompt_templating": {
        "prompt": {
          "template": [{ "role": "user", "content": "Hello" }]
        },
        "model": { "name": "gpt-4o", "version": "latest" }
      }
    }
  }
}
```

---

## Security Best Practices

1. Never commit credentials (use `.gitignore` + env vars)
2. Rotate credentials regularly
3. Use HTTPS only (curl verifies SSL by default)
4. Store tokens securely (12h validity, don't log)
5. Limit token scope (dedicated keys per app)

---

## Additional Resources

- [SAP AI Core Documentation](https://help.sap.com/docs/sap-ai-core)
- [Orchestration Service API Reference](https://help.sap.com/docs/sap-ai-core/orchestration)
- [Tool Calling Guide](https://help.sap.com/docs/sap-ai-core/function-calling)

---

## TypeScript Examples

See `examples/` directory: `example-generate-text.ts`,
`example-streaming-chat.ts`, `example-chat-completion-tool.ts`,
`example-image-recognition.ts`, `example-data-masking.ts`. More in
[README](./README.md#basic-usage).

---

For production, use the TypeScript provider package for better error handling
and type safety.
