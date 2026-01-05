# SAP AI Core API - Manual curl Testing Guide

This guide demonstrates how to make direct API calls to SAP AI Core using curl for testing and debugging purposes. In application code, authentication is handled automatically by the SAP AI SDK via `AICORE_SERVICE_KEY` or `VCAP_SERVICES`. Use this curl guide for low-level diagnostics and when you need to inspect raw requests/responses.

---

## Overview

This example shows the complete flow of:

1. **OAuth2 authentication** using service key credentials
2. **API call** to SAP AI Core's Orchestration v2 endpoint
3. **Function calling** with multiple tools (model-dependent)

---

## Prerequisites

- SAP AI Core instance with deployment
- Service key from SAP BTP cockpit
- `curl` command-line tool
- `base64` encoding utility

---

## Step-by-Step Guide

### Step 1: Prepare Your Credentials

From your SAP BTP cockpit, obtain your service key which contains:

- `clientid` - OAuth2 client ID
- `clientsecret` - OAuth2 client secret
- `url` - Authentication server URL
- `serviceurls.AI_API_URL` - SAP AI Core API base URL

⚠️ **Security Note**: Never commit credentials to version control. Use environment variables or secure vaults.

### Step 2: Get OAuth Token

SAP AI Core uses OAuth2 client credentials flow for authentication.

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

**Key Points:**

- Use `printf` instead of `echo -n` for proper special character handling (e.g., `|`, `$`, `!` in client IDs)
- The token is a JWT containing tenant information (`subaccountid`, `zid`)
- Tokens typically expire after 12 hours

### Step 3: Call SAP AI Core API

#### Endpoint Structure

```
https://{AI_API_URL}/v2/inference/deployments/{DEPLOYMENT_ID}/v2/completion
                      ^^                                      ^^
                      |                                       |
                  Base path                           Orchestration v2
```

⚠️ **Important**: Note the `/v2` appears **twice** - once as base path and once for the completion endpoint.

#### Example API Call

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

### Prompt Configuration

```json
"prompt": {
  "template": [
    {
      "role": "system" | "user" | "assistant" | "tool",
      "content": "message text"
    }
  ],
  "tools": [ /* Optional: function definitions */ ],
  "response_format": { /* Optional: structured output */ }
}
```

### Model Configuration

```json
"model": {
  "name": "gpt-4o",           // Model ID
  "version": "latest",         // Model version
  "params": {                  // Optional parameters
    "temperature": 0.7,
    "max_tokens": 1000,
    "top_p": 1.0,
    "parallel_tool_calls": true
  }
}
```

---

## Function Calling Example

### Defining Tools

```json
"tools": [
  {
    "type": "function",
    "function": {
      "name": "calculate_price",
      "description": "Calculate total price for products",
      "parameters": {
        "type": "object",
        "properties": {
          "price_per_unit": {
            "type": "number",
            "description": "Price per unit in dollars"
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
```

### ⚠️ Model-Specific Limitations

| Model                | Multiple Tools Support | Notes                                    |
| -------------------- | ---------------------- | ---------------------------------------- |
| **gpt-4o**           | ✅ Yes                 | Full support for multiple function tools |
| **gpt-4.1-mini**     | ✅ Yes                 | Full support for multiple function tools |
| **gemini-2.0-flash** | ⚠️ Limited             | Only 1 function tool per request         |
| **gemini-1.5-pro**   | ⚠️ Limited             | Only 1 function tool per request         |
| **claude-3-sonnet**  | ✅ Yes                 | Multiple tools, sequential execution     |

**Gemini Limitation**: Multiple tools will be supported in the future. For now, only one tool per request is supported.

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

## Common Issues and Solutions

### 1. "Missing Tenant Id" Error

**Problem**: HTTP 400 with "Missing Tenant Id"

**Causes**:

- Token expired or invalid
- Wrong endpoint URL (missing `/v2` in path)
- Token not generated from service key (lacks tenant context)

**Solution**:

- Generate fresh OAuth token using service key
- Verify endpoint URL includes both `/v2` paths
- Use `printf` for credential encoding (not `echo`)

### 2. "Bad Credentials" Error

**Problem**: OAuth token request fails with 401

**Causes**:

- Incorrect client ID or secret
- Special characters not properly encoded
- Wrong authentication URL

**Solution**:

- Double-check credentials from service key
- Use `printf '%s:%s' "$ID" "$SECRET"` for encoding
- Verify authentication URL matches your region

### 3. "Multiple Tools Not Supported"

**Problem**: HTTP 400 - "Multiple tools are supported only when they are all search tools"

**Causes**:

- Using Gemini model with multiple function tools
- Vertex AI limitation

**Solution**:

- Use only 1 tool per request for Gemini models
- Or switch to OpenAI models (gpt-4o, gpt-4.1-mini)
- Or combine multiple tools into one

---

## Debugging Tips

### Enable Verbose Output

```bash
curl --verbose \
  --fail-with-body \
  --show-error \
  ...
```

This shows:

- Full request headers
- Response headers
- Connection details
- HTTP status codes

### Check Token Validity

Decode JWT token (without verification):

```bash
echo "$ACCESS_TOKEN" | cut -d. -f2 | base64 -d | jq .
```

Look for:

- `exp` - Expiration timestamp
- `subaccountid` - Tenant information
- `scope` - Permissions

### Test with Minimal Request

Start with simplest possible request:

```json
{
  "config": {
    "modules": {
      "prompt_templating": {
        "prompt": {
          "template": [{ "role": "user", "content": "Hello" }]
        },
        "model": {
          "name": "gpt-4o",
          "version": "latest"
        }
      }
    }
  }
}
```

---

## Security Best Practices

1. **Never commit credentials**
   - Use `.gitignore` for scripts with credentials
   - Use environment variables: `CLIENT_ID="${CLIENT_ID}"`
   - Use secret management tools in production

2. **Rotate credentials regularly**
   - Generate new service keys periodically
   - Revoke old service keys

3. **Use HTTPS only**
   - All endpoints use HTTPS
   - Verify SSL certificates (curl does this by default)

4. **Store tokens securely**
   - Tokens are sensitive (12-hour validity)
   - Don't log full tokens
   - Clear tokens after use

5. **Limit token scope**
   - Use dedicated service keys per application
   - Apply principle of least privilege

---

## Additional Resources

- [SAP AI Core Documentation](https://help.sap.com/docs/sap-ai-core)
- [Orchestration Service API Reference](https://help.sap.com/docs/sap-ai-core/orchestration)
- [Function Calling Guide](https://help.sap.com/docs/sap-ai-core/function-calling)

---

## TypeScript Examples

For production-ready code examples using the SAP AI Provider package, see the TypeScript examples in the `examples/` directory:

- `example-generate-text.ts` - Basic text generation
- `example-simple-chat-completion.ts` - Simple chat completion
- `example-streaming-chat.ts` - Streaming responses
- `example-chat-completion-tool.ts` - Function calling / tool usage
- `example-data-masking.ts` - DPI data masking
- `example-image-recognition.ts` - Vision model usage

For more examples, see the [README](./README.md#basic-usage).

---

## Summary

This guide covers:

- ✅ OAuth2 authentication flow
- ✅ Proper credential encoding
- ✅ Orchestration v2 API structure
- ✅ Function calling setup
- ✅ Model-specific limitations
- ✅ Error handling and debugging
- ✅ Security best practices

For production use, consider using the TypeScript provider package instead of manual curl calls for better error handling and type safety.
