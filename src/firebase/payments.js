/**
 * ============================================================================
 * MUSHBIO CLIENT PAYMENT API MODULE (PHASE 10)
 *
 * Provides a clean client-side integration layer for Razorpay payment processing.
 * All monetary amounts are formatted from integer Paise to ₹ display.
 * ============================================================================
 */

import { USE_EMULATORS, EMULATOR_CONFIG } from "./config.js";

const API_BASE_URL = USE_EMULATORS
  ? `${EMULATOR_CONFIG.functionsHost}/mushbio-organics/asia-south1/api/api/v1`
  : "/api/v1";

/**
 * Load the official Razorpay Checkout modal script dynamically
 */
export function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

/**
 * Request creation of a Razorpay payment order from the server
 */
export async function createPaymentOrder(orderId, idToken) {
  const response = await fetch(`${API_BASE_URL}/payments/create-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({ orderId }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || "Failed to create payment order");
  }
  return data.data;
}

/**
 * Submit payment response from Razorpay modal to server for signature verification
 */
export async function verifyPayment(
  { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature },
  idToken
) {
  const response = await fetch(`${API_BASE_URL}/payments/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      orderId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || "Payment signature verification failed");
  }
  return data.data;
}

/**
 * Get safe payment history for an order
 */
export async function getOrderPayments(orderId, idToken) {
  const response = await fetch(`${API_BASE_URL}/payments/${orderId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || data.error || "Failed to fetch order payments");
  }
  return data.data;
}

/**
 * Open Razorpay Checkout modal and coordinate callbacks
 */
export async function startRazorpayPaymentFlow({
  checkoutData,
  idToken,
  onStatusChange,
  onSuccess,
  onFailure,
}) {
  onStatusChange?.("Preparing payment gateway...");

  const loaded = await loadRazorpayScript();
  if (!loaded) {
    const err = new Error("Unable to load Razorpay SDK. Please check your internet connection.");
    onFailure?.(err);
    return;
  }

  onStatusChange?.("Opening secure Razorpay Checkout...");

  const options = {
    key: checkoutData.razorpayKeyId,
    amount: checkoutData.amount, // In paise
    currency: checkoutData.currency || "INR",
    name: checkoutData.name || "MushBio Organics",
    description: checkoutData.description || `Order ${checkoutData.orderNumber}`,
    order_id: checkoutData.razorpayOrderId,
    prefill: checkoutData.prefill || {},
    theme: {
      color: "#2e7d32",
    },
    modal: {
      ondismiss: function () {
        onStatusChange?.("Payment cancelled");
        onFailure?.(new Error("Payment was dismissed by user."));
      },
    },
    handler: async function (response) {
      try {
        onStatusChange?.("Verifying payment security signature...");
        const verificationResult = await verifyPayment(
          {
            orderId: checkoutData.orderId,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          },
          idToken
        );

        onStatusChange?.("Payment successful! Order confirmed.");
        onSuccess?.(verificationResult);
      } catch (err) {
        onStatusChange?.("Payment verification failed");
        onFailure?.(err);
      }
    },
  };

  const rzp = new window.Razorpay(options);
  rzp.on("payment.failed", function (response) {
    onStatusChange?.("Payment failed");
    onFailure?.(new Error(response.error?.description || "Payment failed at gateway."));
  });
  rzp.open();
}
