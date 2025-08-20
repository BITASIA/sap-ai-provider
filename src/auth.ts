import { SAPAIServiceKey } from "./sap-ai-provider";
import { OAUTH_ENDPOINT, OAUTH_GRANT_TYPE, CONTENT_TYPES } from "./constants";

/**
 * OAuth2 authentication utilities for SAP AI Core
 */

/**
 * Retrieves an OAuth access token using client credentials flow
 * @param serviceKey SAP AI Core service key containing client credentials
 * @param customFetch Optional custom fetch implementation
 * @returns Promise resolving to access token
 * @throws Error if token retrieval fails
 */
export async function getOAuthToken(
  serviceKey: SAPAIServiceKey,
  customFetch?: typeof fetch,
): Promise<string> {
  const fetchFn = customFetch || fetch;
  const tokenUrl = `${serviceKey.url}${OAUTH_ENDPOINT}`;
  const credentials = createBasicAuthCredentials(
    serviceKey.clientid,
    serviceKey.clientsecret,
  );

  const response = await fetchFn(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": CONTENT_TYPES.FORM_URLENCODED,
      Authorization: `Basic ${credentials}`,
    },
    body: `grant_type=${OAUTH_GRANT_TYPE}`,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get OAuth access token: ${response.status} ${response.statusText}\n${errorText}`,
    );
  }

  const tokenData = await response.json();
  return tokenData.access_token;
}

/**
 * Creates Basic Authentication credentials from client ID and secret
 * @param clientId OAuth client ID
 * @param clientSecret OAuth client secret
 * @returns Base64 encoded credentials
 */
function createBasicAuthCredentials(
  clientId: string,
  clientSecret: string,
): string {
  return Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

/**
 * Parses service key from string or returns as-is if already parsed
 * @param serviceKey Service key as string or object
 * @returns Parsed service key object
 * @throws Error if JSON parsing fails
 */
export function parseServiceKey(
  serviceKey: string | SAPAIServiceKey,
): SAPAIServiceKey {
  if (typeof serviceKey === "string") {
    try {
      return JSON.parse(serviceKey);
    } catch (_error) {
      throw new Error("Invalid service key JSON format");
    }
  }
  return serviceKey;
}
