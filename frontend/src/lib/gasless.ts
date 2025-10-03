/**
 * Gasless Payment Authorization Utilities
 * Users sign messages (not transactions) - Backend sponsors gas
 */

import { InputTransactionData } from "@aptos-labs/wallet-adapter-react";

export interface PaymentIntent {
  sender: string;
  recipient: string;
  amount: number;
  nonce: number;
  expiry: number;
  asset: string;
  network: string;
  moduleAddress: string;
}

export interface SignedAuthorization {
  userAddress: string;
  amount: number;
  nonce: number;
  expiry: number;
  signature: string;
  publicKey: string;
}

/**
 * Request a payment intent from backend
 */
export async function requestPaymentIntent(
  backendUrl: string,
  userAddress: string,
  amount: number,
  endpoint: string = "/api/vault/deposit-intent"
): Promise<PaymentIntent> {
  const response = await fetch(`${backendUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userAddress, amount }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to request payment intent");
  }

  const data = await response.json();
  return data.intent;
}

/**
 * Sign a payment authorization message
 * This creates a message signature (NOT a transaction signature)
 */
export async function signPaymentAuthorization(
  signMessage: (message: {
    message: string;
    nonce: string;
  }) => Promise<{ signature: string }>,
  intent: PaymentIntent
): Promise<{ signature: string }> {
  // Create the message to sign (same format the Move contract expects)
  const message = `${intent.sender}:${intent.recipient}:${intent.amount}:${intent.nonce}:${intent.expiry}`;

  // Sign the message (not a transaction!)
  const result = await signMessage({
    message,
    nonce: intent.nonce.toString(),
  });

  // Extract signature - handle different wallet formats
  console.log("Raw signature result:", result);
  console.log(
    "Full message signed by wallet:",
    (result as any).fullMessage || "not provided"
  );

  let sig: string;

  // Try different extraction methods
  if (typeof result.signature === "string") {
    sig = result.signature;
  } else if (typeof result === "string") {
    sig = result as string;
  } else if (
    result.signature &&
    typeof (result.signature as any).signature === "string"
  ) {
    sig = (result.signature as any).signature;
  } else if ((result as any).fullMessage) {
    // Some wallets return fullMessage with signature
    sig = (result as any).signature || result.signature;
  } else if (result.signature && typeof result.signature === "object") {
    // If it's an object, try to extract hex
    const sigObj = result.signature as any;
    if (sigObj.data) {
      // Array format: { data: [1, 2, 3, ...] }
      sig = Buffer.from(sigObj.data).toString("hex");
    } else if (Array.isArray(result.signature)) {
      // Direct array: [1, 2, 3, ...]
      sig = Buffer.from(result.signature as any).toString("hex");
    } else {
      sig = JSON.stringify(result.signature);
    }
  } else {
    sig = String(result.signature || result);
  }

  // Ensure it's a string
  if (typeof sig !== "string") {
    sig = String(sig);
  }

  console.log("Signature from wallet:", {
    type: typeof sig,
    length: sig?.length || 0,
    preview: sig ? sig.substring(0, 20) + "..." : "empty",
  });

  return {
    signature: sig,
  };
}

/**
 * Submit signed authorization to backend for gasless execution
 */
export async function submitGaslessTransaction(
  backendUrl: string,
  intent: PaymentIntent,
  signature: string,
  publicKey: string,
  endpoint: string = "/api/vault/deposit"
): Promise<{ transactionHash: string; explorer: string }> {
  const response = await fetch(`${backendUrl}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userAddress: intent.sender,
      amount: intent.amount,
      nonce: intent.nonce,
      expiry: intent.expiry,
      signature,
      publicKey,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || "Failed to execute gasless transaction");
  }

  const data = await response.json();
  return {
    transactionHash: data.transactionHash,
    explorer: data.explorer,
  };
}

/**
 * Complete gasless payment flow
 * 1. Request intent
 * 2. Sign message
 * 3. Submit for execution
 */
export async function executeGaslessPayment(
  backendUrl: string,
  userAddress: string,
  publicKey: string,
  amount: number,
  signMessage: (message: {
    message: string;
    nonce: string;
  }) => Promise<{ signature: string }>,
  intentEndpoint: string = "/api/vault/deposit-intent",
  submitEndpoint: string = "/api/vault/deposit"
): Promise<{ transactionHash: string; explorer: string }> {
  // Step 1: Request payment intent
  const intent = await requestPaymentIntent(
    backendUrl,
    userAddress,
    amount,
    intentEndpoint
  );

  // Step 2: Sign the authorization message
  const { signature } = await signPaymentAuthorization(signMessage, intent);

  // Step 3: Submit for gasless execution
  return await submitGaslessTransaction(
    backendUrl,
    intent,
    signature,
    publicKey,
    submitEndpoint
  );
}
