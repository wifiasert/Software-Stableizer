const PAYMENT_URL = "https://paystack.shop/pay/gk4arw42zx";
const TOKEN_API_URL = window.VERTEX_TOKEN_API || "https://api.yourdomain.com";
const SOFTWARE_CODE = window.VERTEX_SOFTWARE_CODE || "VERTEX";
const ISSUE_ENDPOINT = `${TOKEN_API_URL.replace(/\/$/, "")}/api/tokens/issue`;
const TOKEN_REGEX = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const elements = {
  purchaseBtn: document.getElementById("purchaseBtn"),
  exampleToken: document.getElementById("exampleToken"),
  termsAgree: document.getElementById("termsAgree"),
  paymentStatus: document.getElementById("paymentStatus"),
  tokenValue: document.getElementById("tokenValue"),
};

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
        if (elements.paymentStatus) {
          elements.paymentStatus.textContent = "No token available to copy yet.";
          elements.paymentStatus.classList.add("status-banner--error");
          elements.paymentStatus.classList.remove("status-banner--ok");
        }
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
        if (elements.paymentStatus) {
          elements.paymentStatus.textContent =
            "Copy failed. Please select the token and copy manually.";
          elements.paymentStatus.classList.add("status-banner--error");
          elements.paymentStatus.classList.remove("status-banner--ok");
        }
      }
    });
  });
}

function isDisallowedApi(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== "https:") return true;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") {
      return true;
    }
    return false;
  } catch (_err) {
    return true;
  }
}

function generateExampleToken() {
  const payload = {
    user: "user@example.com",
    code: SOFTWARE_CODE,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  };
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const signature = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `${encoded}.${signature}`;
}

async function requestIssuedToken(reference) {
  try {
    if (isDisallowedApi(TOKEN_API_URL)) {
      throw new Error("Activation server must be a public HTTPS URL.");
    }
    const params = new URLSearchParams(window.location.search);
    const user = params.get("email") || params.get("user") || reference;
    const response = await fetch(ISSUE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reference,
        user,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Token issuance failed.");
    }
    if (data && data.error) {
      throw new Error(data.error);
    }
    if (!data || !TOKEN_REGEX.test(data.token || "")) {
      throw new Error("Invalid token returned from server.");
    }
    return data.token;
  } catch (error) {
    if (elements.paymentStatus) {
      elements.paymentStatus.textContent =
        error && error.message
          ? error.message
          : "We could not issue a token yet. Please contact support.";
      elements.paymentStatus.classList.add("status-banner--error");
    }
    return null;
  }
}

function handlePurchase() {
  if (elements.termsAgree && !elements.termsAgree.checked) {
    if (elements.paymentStatus) {
      elements.paymentStatus.textContent =
        "Please accept the terms and conditions before proceeding to payment.";
      elements.paymentStatus.classList.add("status-banner--error");
    }
    return;
  }
  window.location.href = PAYMENT_URL;
}

function renderExampleToken() {
  if (!elements.exampleToken) return;
  elements.exampleToken.textContent = generateExampleToken();
}

document.addEventListener("DOMContentLoaded", () => {
  renderExampleToken();
  initCopyButtons();

  if (elements.termsAgree && elements.purchaseBtn) {
    elements.purchaseBtn.disabled = !elements.termsAgree.checked;
    elements.termsAgree.addEventListener("change", () => {
      elements.purchaseBtn.disabled = !elements.termsAgree.checked;
      if (elements.paymentStatus) {
        elements.paymentStatus.textContent = "";
        elements.paymentStatus.classList.remove("status-banner--error", "status-banner--ok");
      }
    });
  }

  if (elements.purchaseBtn) {
    elements.purchaseBtn.addEventListener("click", handlePurchase);
  }

  if (elements.paymentStatus) {
    const params = new URLSearchParams(window.location.search);
    const success =
      (params.get("status") || "").toLowerCase() === "success" ||
      (params.get("payment") || "").toLowerCase() === "completed" ||
      (params.get("paid") || "").toLowerCase() === "true";
    if (success) {
      const reference =
        params.get("reference") ||
        params.get("trxref") ||
        params.get("payment_ref");
      if (!reference) {
        elements.paymentStatus.textContent =
          "Payment completed, but no reference was provided. Please contact support.";
        elements.paymentStatus.classList.add("status-banner--error");
        return;
      }
      requestIssuedToken(reference).then((token) => {
        if (!token) return;
        if (elements.tokenValue) {
          elements.tokenValue.textContent = token;
        }
        elements.paymentStatus.textContent = "Payment completed! Here is your valid token.";
        elements.paymentStatus.classList.remove("status-banner--error");
        elements.paymentStatus.classList.add("status-banner--ok");
      });
    }
  }
});
