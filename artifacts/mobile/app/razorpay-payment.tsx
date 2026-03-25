import React, { useRef, useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { getApiBase, getStoredToken } from "@/context/auth";

type PaymentParams = {
  razorpayOrderId: string;
  amount: string;
  currency: string;
  keyId: string;
  name: string;
  description: string;
  dbOrderId?: string;
  enrollmentId?: string;
  type: "order" | "chit" | "wallet";
};

async function verifyAndNavigate(
  data: { razorpayPaymentId: string; razorpayOrderId: string; razorpaySignature: string },
  params: PaymentParams,
) {
  const token = await getStoredToken();
  const apiBase = getApiBase();

  let endpoint = "";
  let body: Record<string, unknown> = {
    razorpayOrderId: data.razorpayOrderId,
    razorpayPaymentId: data.razorpayPaymentId,
    razorpaySignature: data.razorpaySignature,
  };

  if (params.type === "order") {
    endpoint = "/payment/verify-order";
    body.dbOrderId = parseInt(params.dbOrderId!);
  } else if (params.type === "wallet") {
    endpoint = "/payment/verify-wallet-payment";
  } else {
    endpoint = "/payment/verify-chit-payment";
    body.enrollmentId = parseInt(params.enrollmentId!);
  }

  const res = await fetch(apiBase + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const result = await res.json();

  if (res.ok && result.success) {
    if (params.type === "order") {
      router.replace({ pathname: "/order/[id]", params: { id: result.orderId } });
    } else if (params.type === "wallet") {
      router.replace({
        pathname: "/payment-result",
        params: { success: "true", type: "wallet" },
      });
    } else {
      router.replace({
        pathname: "/payment-result",
        params: { success: "true", type: "chit", isCompleted: result.isCompleted ? "true" : "false" },
      });
    }
  } else {
    router.replace({
      pathname: "/payment-result",
      params: { success: "false", message: result.error || "Verification failed", type: params.type },
    });
  }
}

// ─── Web platform: load Razorpay checkout.js directly in the browser ─────────
function WebRazorpayPayment({ params }: { params: PaymentParams }) {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<"loading" | "ready" | "processing" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    if ((window as any).Razorpay) { setStatus("ready"); openCheckout(); return; }

    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => { setStatus("ready"); openCheckout(); };
    script.onerror = () => { setStatus("error"); setErrorMsg("Failed to load payment gateway."); };
    document.head.appendChild(script);

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script);
    };
  }, []);

  const openCheckout = () => {
    const RazorpayClass = (window as any).Razorpay;
    if (!RazorpayClass) return;

    setStatus("processing");

    const options = {
      key: params.keyId,
      amount: params.amount,
      currency: params.currency || "INR",
      name: "DollDime",
      description: params.description || "Payment",
      order_id: params.razorpayOrderId,
      theme: { color: "#2E8B57" },
      modal: {
        ondismiss: () => {
          router.back();
        },
      },
      handler: async (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        setStatus("processing");
        try {
          await verifyAndNavigate(
            {
              razorpayPaymentId: response.razorpay_payment_id,
              razorpayOrderId: response.razorpay_order_id,
              razorpaySignature: response.razorpay_signature,
            },
            params,
          );
        } catch {
          router.replace({
            pathname: "/payment-result",
            params: { success: "false", message: "Verification error. Contact support.", type: params.type },
          });
        }
      },
    };

    const rzp = new RazorpayClass(options);
    rzp.on("payment.failed", (response: any) => {
      router.replace({
        pathname: "/payment-result",
        params: { success: "false", message: response.error?.description || "Payment failed", type: params.type },
      });
    });
    rzp.open();
  };

  return (
    <View style={[styles.container, { paddingTop: 67 }]}>
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Secure Payment</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.webBody}>
        {status === "loading" && (
          <>
            <ActivityIndicator size="large" color={Colors.light.tint} />
            <Text style={styles.loadingText}>Loading payment gateway…</Text>
          </>
        )}
        {status === "processing" && (
          <>
            <ActivityIndicator size="large" color={Colors.light.tint} />
            <Text style={styles.loadingText}>Processing payment…</Text>
          </>
        )}
        {status === "error" && (
          <>
            <Ionicons name="alert-circle-outline" size={48} color={Colors.light.error} />
            <Text style={styles.errorText}>{errorMsg}</Text>
            <Pressable style={styles.retryBtn} onPress={() => { setStatus("loading"); openCheckout(); }}>
              <Text style={styles.retryBtnText}>Retry</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

// ─── Native platform: use WebView with inline HTML ────────────────────────────
function NativeRazorpayPayment({ params }: { params: PaymentParams }) {
  const insets = useSafeAreaInsets();
  // Lazy import WebView only on native to avoid the "not supported" error on web
  const { WebView } = require("react-native-webview");
  const webViewRef = useRef<any>(null);

  const amountInRupees = (parseFloat(params.amount) / 100).toFixed(2);

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #FFF9F0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      min-height: 100vh; padding: 24px;
    }
    .card {
      background: #fff; border-radius: 20px; padding: 32px 24px;
      box-shadow: 0 4px 24px rgba(200,75,26,0.12);
      width: 100%; max-width: 400px; text-align: center;
    }
    .brand { font-size: 22px; font-weight: 700; color: #C84B1A; margin-bottom: 4px; }
    .desc { font-size: 14px; color: #888; margin-bottom: 24px; }
    .amount { font-size: 38px; font-weight: 800; color: #1a1a1a; margin-bottom: 8px; }
    .note { font-size: 13px; color: #aaa; margin-bottom: 28px; }
    .pay-btn {
      background: #C84B1A; color: #fff; border: none; border-radius: 14px;
      padding: 16px 40px; font-size: 17px; font-weight: 600; cursor: pointer; width: 100%;
    }
    .pay-btn:active { opacity: 0.8; }
    .spinner { display: none; color: #C84B1A; font-size: 15px; margin-top: 8px; }
    .loading .pay-btn { display: none; }
    .loading .spinner { display: block; }
    .secure { margin-top: 16px; font-size: 12px; color: #bbb; }
  </style>
</head>
<body>
  <div class="card" id="card">
    <div class="brand">DollDime</div>
    <div class="desc">${params.description || "Secure Payment"}</div>
    <div class="amount">&#8377;${amountInRupees}</div>
    <div class="note">via Razorpay</div>
    <button class="pay-btn" id="payBtn" onclick="startPayment()">Pay Now</button>
    <div class="spinner" id="spinner">Opening payment...</div>
    <div class="secure">&#128274; 256-bit SSL Secured</div>
  </div>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    function startPayment() {
      document.getElementById('card').classList.add('loading');
      var options = {
        key: "${params.keyId}",
        amount: "${params.amount}",
        currency: "${params.currency || "INR"}",
        name: "DollDime",
        description: "${params.description || "Payment"}",
        order_id: "${params.razorpayOrderId}",
        theme: { color: "#2E8B57" },
        modal: { ondismiss: function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: "dismiss" }));
        }},
        handler: function(response) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: "success",
            razorpayPaymentId: response.razorpay_payment_id,
            razorpayOrderId: response.razorpay_order_id,
            razorpaySignature: response.razorpay_signature
          }));
        }
      };
      var rzp = new Razorpay(options);
      rzp.on("payment.failed", function(response) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: "failed",
          error: response.error.description
        }));
      });
      rzp.open();
    }
    window.onload = function() { setTimeout(startPayment, 500); };
  </script>
</body>
</html>
`;

  const handleMessage = async (event: { nativeEvent: { data: string } }) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "dismiss") { router.back(); return; }
      if (data.type === "failed") {
        router.replace({ pathname: "/payment-result", params: { success: "false", message: data.error || "Payment failed", type: params.type } });
        return;
      }
      if (data.type === "success") {
        await verifyAndNavigate(
          { razorpayPaymentId: data.razorpayPaymentId, razorpayOrderId: data.razorpayOrderId, razorpaySignature: data.razorpaySignature },
          params,
        );
      }
    } catch {
      router.back();
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={22} color={Colors.light.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Secure Payment</Text>
        <View style={{ width: 40 }} />
      </View>
      <WebView
        ref={webViewRef}
        source={{ html: htmlContent }}
        onMessage={handleMessage}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={Colors.light.tint} />
          </View>
        )}
        javaScriptEnabled
        domStorageEnabled
        originWhitelist={["*"]}
        style={styles.webview}
        mixedContentMode="always"
        allowsInlineMediaPlayback
      />
    </View>
  );
}

// ─── Root component ────────────────────────────────────────────────────────────
export default function RazorpayPaymentScreen() {
  const params = useLocalSearchParams<PaymentParams>();
  if (Platform.OS === "web") {
    return <WebRazorpayPayment params={params} />;
  }
  return <NativeRazorpayPayment params={params} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.light.background },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: "#fff", alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: Colors.light.border,
  },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, color: Colors.light.text },
  webview: { flex: 1 },
  loader: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: Colors.light.background },
  webBody: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, padding: 32 },
  loadingText: { fontSize: 15, color: Colors.light.textMuted, marginTop: 8 },
  errorText: { fontSize: 15, color: Colors.light.error, textAlign: "center" },
  retryBtn: { backgroundColor: Colors.light.tint, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14 },
  retryBtnText: { fontSize: 15, color: "#fff" },
});
