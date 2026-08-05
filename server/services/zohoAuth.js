import axios from 'axios';

const {
  ZOHO_CLIENT_ID,
  ZOHO_CLIENT_SECRET,
  ZOHO_REFRESH_TOKEN,
  ZOHO_ACCOUNTS_URL = 'https://accounts.zoho.com',
} = process.env;

// Refresh a bit before actual expiry so an in-flight request never sees a stale token.
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

let cachedToken = null;
let cachedExpiresAt = 0;
let pendingRefresh = null;

function assertConfigured() {
  if (!ZOHO_CLIENT_ID || !ZOHO_CLIENT_SECRET || !ZOHO_REFRESH_TOKEN) {
    const error = new Error(
      'Zoho OAuth is not configured. Set ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_REFRESH_TOKEN in the .env file.',
    );
    error.statusCode = 400;
    throw error;
  }
}

async function refreshAccessToken() {
  assertConfigured();

  const response = await axios.post(`${ZOHO_ACCOUNTS_URL}/oauth/v2/token`, null, {
    params: {
      grant_type: 'refresh_token',
      client_id: ZOHO_CLIENT_ID,
      client_secret: ZOHO_CLIENT_SECRET,
      refresh_token: ZOHO_REFRESH_TOKEN,
    },
  });

  const { access_token, expires_in } = response.data;

  if (!access_token) {
    const error = new Error(response.data?.error || 'Failed to refresh Zoho access token.');
    error.statusCode = 500;
    throw error;
  }

  cachedToken = access_token;
  cachedExpiresAt = Date.now() + expires_in * 1000;

  return cachedToken;
}

export async function getZohoAccessToken() {
  const isExpiringSoon = Date.now() >= cachedExpiresAt - TOKEN_REFRESH_BUFFER_MS;

  if (cachedToken && !isExpiringSoon) {
    return cachedToken;
  }

  if (!pendingRefresh) {
    pendingRefresh = refreshAccessToken().finally(() => {
      pendingRefresh = null;
    });
  }

  return pendingRefresh;
}
