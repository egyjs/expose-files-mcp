import crypto from "node:crypto";

function generateCode() {
  return crypto.randomBytes(24).toString("base64url");
}

function generateToken() {
  return crypto.randomBytes(32).toString("base64url");
}

function verifyPKCE(verifier, challenge, method) {
  if (method === "S256") {
    const hash = crypto.createHash("sha256").update(verifier).digest("base64url");
    return hash === challenge;
  }
  return verifier === challenge;
}

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderConsentPage({ client_id, redirect_uri, state, scope, code_challenge, code_challenge_method }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Authorize — expose-files-mcp</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 480px; margin: 80px auto; padding: 0 20px; color: #111; }
    h1 { font-size: 1.4rem; margin-bottom: 8px; }
    .client { font-weight: 600; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: .9em; }
    .actions { margin-top: 24px; }
    button { padding: 10px 24px; margin: 0 6px 0 0; border: none; border-radius: 6px; cursor: pointer; font-size: 1rem; }
    .allow { background: #2563eb; color: #fff; }
    .deny  { background: #e5e7eb; color: #333; }
  </style>
</head>
<body>
  <h1>Authorization Request</h1>
  <p><span class="client">${escHtml(client_id)}</span> is requesting access to this MCP server.</p>
  <p>Scope: <code>${escHtml(scope || "mcp")}</code></p>
  <form method="POST" action="/oauth/authorize">
    <input type="hidden" name="client_id"             value="${escHtml(client_id)}">
    <input type="hidden" name="redirect_uri"          value="${escHtml(redirect_uri)}">
    <input type="hidden" name="state"                 value="${escHtml(state)}">
    <input type="hidden" name="scope"                 value="${escHtml(scope || "mcp")}">
    <input type="hidden" name="code_challenge"        value="${escHtml(code_challenge)}">
    <input type="hidden" name="code_challenge_method" value="${escHtml(code_challenge_method)}">
    <div class="actions">
      <button class="allow" type="submit" name="approved" value="1">Allow</button>
      <button class="deny"  type="submit" name="approved" value="0">Deny</button>
    </div>
  </form>
</body>
</html>`;
}

export function createOAuthServer(config) {
  const oauthCfg = config.oauth;
  const issuer = oauthCfg.issuer || `http://${config.http.host}:${config.http.port}`;

  // In-memory stores (sufficient for a single-process local MCP server)
  const authCodes = new Map();    // code  -> { clientId, redirectUri, scope, expiresAt, codeChallenge, codeChallengeMethod }
  const accessTokens = new Map(); // token -> { clientId, scope, expiresAt }

  function getClient(clientId) {
    return (oauthCfg.clients || []).find((c) => c.clientId === clientId) ?? null;
  }

  // GET /.well-known/oauth-authorization-server
  function metadataHandler(_req, res) {
    res.json({
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/oauth/token`,
      scopes_supported: ["mcp"],
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      token_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
      code_challenge_methods_supported: ["S256"],
    });
  }

  // GET /oauth/authorize — show consent page
  function authorizeGetHandler(req, res) {
    const {
      response_type, client_id, redirect_uri, state, scope,
      code_challenge, code_challenge_method,
    } = req.query;

    if (response_type !== "code") {
      return res.status(400).send("Unsupported response_type. Only 'code' is supported.");
    }
    const client = getClient(client_id);
    if (!client) return res.status(400).send("Unknown client_id.");
    if (!client.redirectUris.includes(redirect_uri)) return res.status(400).send("Invalid redirect_uri.");

    res.send(renderConsentPage({ client_id, redirect_uri, state, scope, code_challenge, code_challenge_method }));
  }

  // POST /oauth/authorize — process consent form
  function authorizePostHandler(req, res) {
    const {
      client_id, redirect_uri, state, scope, approved,
      code_challenge, code_challenge_method,
    } = req.body;

    let redirectUrl;
    try {
      redirectUrl = new URL(redirect_uri);
    } catch {
      return res.status(400).send("Invalid redirect_uri.");
    }

    if (approved !== "1") {
      redirectUrl.searchParams.set("error", "access_denied");
      if (state) redirectUrl.searchParams.set("state", state);
      return res.redirect(redirectUrl.toString());
    }

    const client = getClient(client_id);
    if (!client || !client.redirectUris.includes(redirect_uri)) {
      return res.status(400).send("Invalid request.");
    }

    const code = generateCode();
    authCodes.set(code, {
      clientId: client_id,
      redirectUri: redirect_uri,
      scope: scope || "mcp",
      expiresAt: Date.now() + 10 * 60 * 1000,
      codeChallenge: code_challenge || null,
      codeChallengeMethod: code_challenge_method || null,
    });

    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);
    return res.redirect(redirectUrl.toString());
  }

  // POST /oauth/token — exchange code for access token
  function tokenHandler(req, res) {
    const { grant_type, code, redirect_uri, code_verifier } = req.body;

    let clientId = req.body.client_id;
    let clientSecret = req.body.client_secret;

    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Basic ")) {
      const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
      const sep = decoded.indexOf(":");
      clientId = decoded.slice(0, sep);
      clientSecret = decoded.slice(sep + 1);
    }

    const client = getClient(clientId);
    if (!client) {
      return res.status(401).json({ error: "invalid_client", error_description: "Unknown client." });
    }
    if (client.clientSecret && client.clientSecret !== clientSecret) {
      return res.status(401).json({ error: "invalid_client", error_description: "Invalid client secret." });
    }

    if (grant_type !== "authorization_code") {
      return res.status(400).json({ error: "unsupported_grant_type" });
    }

    const codeData = authCodes.get(code);
    if (!codeData || codeData.expiresAt < Date.now()) {
      return res.status(400).json({ error: "invalid_grant", error_description: "Code expired or not found." });
    }
    if (codeData.clientId !== clientId || codeData.redirectUri !== redirect_uri) {
      return res.status(400).json({ error: "invalid_grant", error_description: "Code mismatch." });
    }

    if (codeData.codeChallenge) {
      if (!code_verifier) {
        return res.status(400).json({ error: "invalid_grant", error_description: "code_verifier required." });
      }
      if (!verifyPKCE(code_verifier, codeData.codeChallenge, codeData.codeChallengeMethod)) {
        return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed." });
      }
    }

    authCodes.delete(code);

    const accessToken = generateToken();
    const expiresIn = oauthCfg.tokenExpirySeconds || 3600;
    accessTokens.set(accessToken, {
      clientId,
      scope: codeData.scope,
      expiresAt: Date.now() + expiresIn * 1000,
    });

    res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      scope: codeData.scope,
    });
  }

  // Middleware — validates Bearer tokens issued by this OAuth server
  function tokenMiddleware(req, res, next) {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) {
      return res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized: Bearer token required." },
        id: null,
      });
    }

    const tokenData = accessTokens.get(token);
    if (!tokenData || tokenData.expiresAt < Date.now()) {
      if (tokenData) accessTokens.delete(token);
      return res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized: invalid or expired token." },
        id: null,
      });
    }

    req.oauthToken = tokenData;
    next();
  }

  return {
    issuer,
    metadataHandler,
    authorizeGetHandler,
    authorizePostHandler,
    tokenHandler,
    tokenMiddleware,
  };
}
