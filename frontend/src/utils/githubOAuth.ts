const STATE_KEY = "github_oauth_state";
const CODE_VERIFIER_KEY = "github_oauth_code_verifier";

const redirectUri =
  import.meta.env.VITE_REDIRECT_URI ?? "http://localhost:5173/oauth/callback";
const clientId = import.meta.env.VITE_CLIENT_ID;
const clientSecret = import.meta.env.VITE_CLIENT_SECRET;

const base64UrlEncode = (arrayBuffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const generateRandomString = (length = 64): string => {
  const charset =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  let result = "";
  randomValues.forEach((v) => {
    result += charset[v % charset.length];
  });
  return result;
};

const sha256 = async (value: string): Promise<ArrayBuffer> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  return crypto.subtle.digest("SHA-256", data);
};

const createCodeChallenge = async (verifier: string): Promise<string> => {
  const digest = await sha256(verifier);
  return base64UrlEncode(digest);
};

export const clearOAuthState = () => {
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(CODE_VERIFIER_KEY);
};

export const startGitHubOAuth = async (
  scopes = ["repo", "read:org", "read:user"],
) => {
  if (!clientId) {
    throw new Error("Missing VITE_CLIENT_ID in your environment.");
  }

  const codeVerifier = generateRandomString(64);
  const codeChallenge = await createCodeChallenge(codeVerifier);

  sessionStorage.setItem(CODE_VERIFIER_KEY, codeVerifier);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    allow_signup: "false",
  });

  window.location.assign(
    `https://github.com/login/oauth/authorize?${params.toString()}`,
  );
};

export const exchangeCodeForToken = async (
  code: string,
  returnedState?: string | null,
): Promise<string> => {
  if (!clientId || !clientSecret) {
    throw new Error(
      "VITE_CLIENT_ID and VITE_CLIENT_SECRET must be set to exchange the code.",
    );
  }

  const storedState = sessionStorage.getItem(STATE_KEY);
  if (storedState && returnedState && storedState !== returnedState) {
    throw new Error("State mismatch. Please restart the sign-in flow.");
  }

  const codeVerifier = sessionStorage.getItem(CODE_VERIFIER_KEY);
  if (!codeVerifier) {
    throw new Error("Missing PKCE verifier. Restart the sign-in flow.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    state: returnedState ?? "",
    code_verifier: codeVerifier,
  });

  const response = await fetch("/api/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  const data = await response.json();

  clearOAuthState();

  if (!response.ok || data.error) {
    const message =
      data.error_description ||
      data.error ||
      `GitHub token exchange failed (${response.status})`;
    throw new Error(message);
  }

  if (!data.access_token) {
    throw new Error("No access token returned by GitHub.");
  }

  return data.access_token as string;
};
