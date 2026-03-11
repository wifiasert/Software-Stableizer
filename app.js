const PAYMENT_URL = "https://paystack.shop/pay/gk4arw42zx";
const SOFTWARE_CODE = window.VERTEX_SOFTWARE_CODE || "VERTEX";
const TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const TOKEN_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const elements = {
  purchaseBtn: document.getElementById("purchaseBtn"),
  exampleToken: document.getElementById("exampleToken"),
  termsAgree: document.getElementById("termsAgree"),
  paymentStatus: document.getElementById("paymentStatus"),
  tokenValue: document.getElementById("tokenValue"),
};

function resolveTokenSecret() {
  if (window.VERTEX_TOKEN_SECRET) {
    return window.VERTEX_TOKEN_SECRET;
  }
  const parts = window.VERTEX_TOKEN_SECRET_B64_PARTS;
  if (Array.isArray(parts) && parts.length > 0) {
    try {
      return atob(parts.join(""));
    } catch (_err) {
      return "";
    }
  }
  return "";
}

const TOKEN_SECRET = resolveTokenSecret();

function setStatus(message, type) {
  if (!elements.paymentStatus) return;
  elements.paymentStatus.textContent = message || "";
  elements.paymentStatus.classList.remove("status-banner--error", "status-banner--ok");
  if (type === "error") {
    elements.paymentStatus.classList.add("status-banner--error");
  }
  if (type === "ok") {
    elements.paymentStatus.classList.add("status-banner--ok");
  }
}

function getTokenTextById(id) {
  const el = id ? document.getElementById(id) : null;
  return (el && el.textContent ? el.textContent : "").trim();
}

async function copyToClipboard(text) {
  if (!text) {
    throw new Error("No token available.");
  }
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

function initCopyButtons() {
  const buttons = document.querySelectorAll("[data-copy-target]");
  buttons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetId = btn.getAttribute("data-copy-target");
      const token = getTokenTextById(targetId);
      if (!token) {
        setStatus("No token available to copy yet.", "error");
        return;
      }
      try {
        await copyToClipboard(token);
        btn.classList.add("is-copied");
        btn.setAttribute("title", "Copied");
        setTimeout(() => {
          btn.classList.remove("is-copied");
          btn.setAttribute("title", "Copy token");
        }, 1400);
      } catch (_error) {
        setStatus("Copy failed. Please select the token and copy manually.", "error");
      }
    });
  });
}

function bytesToBase64(bytes) {
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function b64urlEncodeBytes(bytes) {
  return bytesToBase64(bytes)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function utf8ToBytes(text) {
  return new TextEncoder().encode(text);
}

function canonicalPayload(payload) {
  const ordered = {};
  Object.keys(payload)
    .sort()
    .forEach((key) => {
      ordered[key] = payload[key];
    });
  return JSON.stringify(ordered);
}

let hmacKeyPromise = null;

function getHmacKey() {
  if (!TOKEN_SECRET) {
    return Promise.reject(new Error("Token secret is not configured."));
  }
  if (!window.crypto || !crypto.subtle) {
    return Promise.reject(new Error("Token generation requires HTTPS."));
  }
  if (!hmacKeyPromise) {
    hmacKeyPromise = crypto.subtle.importKey(
      "raw",
      utf8ToBytes(TOKEN_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
  }
  return hmacKeyPromise;
}

async function signPayload(payloadB64) {
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, utf8ToBytes(payloadB64));
  return b64urlEncodeBytes(new Uint8Array(sig));
}

async function generateToken(user, issuedAt) {
  const now = issuedAt || Math.floor(Date.now() / 1000);
  const payload = {
    code: SOFTWARE_CODE,
    exp: now + TOKEN_TTL_SECONDS,
    iat: now,
    user,
  };
  const payloadJson = canonicalPayload(payload);
  const payloadB64 = b64urlEncodeBytes(utf8ToBytes(payloadJson));
  const sig = await signPayload(payloadB64);
  const token = `${payloadB64}.${sig}`;
  if (!TOKEN_REGEX.test(token) || token.length < 33) {
    throw new Error("Generated token is invalid.");
  }
  return token;
}

function storeTokenRecord(record) {
  try {
    const stored = localStorage.getItem("vertex_tokens");
    const list = stored ? JSON.parse(stored) : [];
    list.push(record);
    localStorage.setItem("vertex_tokens", JSON.stringify(list));
  } catch (_err) {
    // Best-effort storage for static sites.
  }
}

function handlePurchase() {
  if (elements.termsAgree && !elements.termsAgree.checked) {
    setStatus("Please accept the terms and conditions before proceeding to payment.", "error");
    return;
  }
  window.location.href = PAYMENT_URL;
}

async function renderExampleToken() {
  if (!elements.exampleToken) return;
  try {
    const token = await generateToken("user@example.com");
    elements.exampleToken.textContent = token;
  } catch (error) {
    elements.exampleToken.textContent = "Token generation unavailable.";
    setStatus(error.message || "Token generation failed.", "error");
  }
}

async function handlePaymentSuccess() {
  if (!elements.paymentStatus) return;
  const params = new URLSearchParams(window.location.search);
  const success =
    (params.get("status") || "").toLowerCase() === "success" ||
    (params.get("payment") || "").toLowerCase() === "completed" ||
    (params.get("paid") || "").toLowerCase() === "true";
  if (!success) return;

  const reference =
    params.get("reference") || params.get("trxref") || params.get("payment_ref") || `offline-${Date.now()}`;
  const user = params.get("email") || params.get("user") || "offline-user";
  const issuedAt = Math.floor(Date.now() / 1000);

  try {
    const token = await generateToken(user, issuedAt);
    if (elements.tokenValue) {
      elements.tokenValue.textContent = token;
    }
    storeTokenRecord({
      token,
      user,
      reference,
      issued_at: issuedAt,
      expires_at: issuedAt + TOKEN_TTL_SECONDS,
    });
    setStatus("Payment completed! Here is your valid token.", "ok");
  } catch (error) {
    setStatus(error.message || "Token generation failed.", "error");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderExampleToken();
  initCopyButtons();

  if (elements.termsAgree && elements.purchaseBtn) {
    elements.purchaseBtn.disabled = !elements.termsAgree.checked;
    elements.termsAgree.addEventListener("change", () => {
      elements.purchaseBtn.disabled = !elements.termsAgree.checked;
      setStatus("", "");
    });
  }

  if (elements.purchaseBtn) {
    elements.purchaseBtn.addEventListener("click", handlePurchase);
  }

  handlePaymentSuccess();
});
