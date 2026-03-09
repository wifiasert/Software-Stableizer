// Payment URL
const PAYMENT_URL = "https://paystack.shop/pay/gk4arw42zx";

// Helper: Get URL query params
function getQueryParams() {
    const params = {};
    window.location.search.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m, key, value) {
        params[key] = value;
    });
    return params;
}

// Payment status detection
function isPaymentSuccess() {
    const params = getQueryParams();
    return (
        (params.status && params.status.toLowerCase() === "success") ||
        (params.payment && params.payment.toLowerCase() === "completed")
    );
}

// Generate futuristic tokens
function generateToken() {
    // Match Python's secrets.choice from string.ascii_uppercase + string.digits, 20 chars
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let token = "";
    for (let j = 0; j < 45; j++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

document.addEventListener("DOMContentLoaded", function() {
    const payNowBtn = document.getElementById("payNowBtn");
    const tokenCard = document.getElementById("tokenCard");
    const tokenList = document.getElementById("tokenList");

    if (payNowBtn) {
        payNowBtn.addEventListener("click", function() {
            window.location.href = PAYMENT_URL;
        });
    }

    // Always reset to pre-payment state on load
    if (tokenCard && tokenList) {
        tokenCard.style.display = "none";
        tokenList.innerHTML = "";
        // If payment detected, show token
        if (isPaymentSuccess()) {
            tokenCard.style.display = "flex";
            const token = generateToken();
            tokenList.innerHTML = `<div class=\"token futuristic-token\">${token}</div>`;
            setTimeout(() => {
                tokenCard.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 300);
        }
    }
});
