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
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let token = "";
    for (let j = 0; j < 20; j++) {
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

    if (tokenCard && tokenList) {
        if (isPaymentSuccess()) {
            tokenCard.style.display = "flex";
            // Generate and display 1 futuristic token
            const token = generateToken();
            tokenList.innerHTML = `<div class=\"token futuristic-token\">${token}</div>`;
            // Optionally scroll to tokens
            setTimeout(() => {
                tokenCard.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 300);
        } else {
            tokenCard.style.display = "none";
            tokenList.innerHTML = "";
        }
    }
});
