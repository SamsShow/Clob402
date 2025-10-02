import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
  AccountAddress,
  Ed25519PublicKey,
  Ed25519Signature,
} from "@aptos-labs/ts-sdk";
import dotenv from "dotenv";
import { logger } from "../utils/logger";

dotenv.config();

// Initialize Aptos client
const network = (process.env.APTOS_NETWORK || "testnet") as Network;
const config = new AptosConfig({ network });
export const aptosClient = new Aptos(config);

// Initialize facilitator account
const facilitatorPrivateKeyHex = process.env.FACILITATOR_PRIVATE_KEY;
if (!facilitatorPrivateKeyHex) {
  logger.error("FACILITATOR_PRIVATE_KEY not set in environment variables");
  throw new Error("FACILITATOR_PRIVATE_KEY is required");
}

const privateKey = new Ed25519PrivateKey(facilitatorPrivateKeyHex);
export const facilitatorAccount = Account.fromPrivateKey({ privateKey });

logger.info("Aptos service initialized", {
  network,
  facilitatorAddress: facilitatorAccount.accountAddress.toString(),
});

// Configuration addresses
export const MODULE_ADDRESS =
  process.env.MODULE_ADDRESS || facilitatorAccount.accountAddress.toString();
export const ORDER_BOOK_ADDRESS =
  process.env.ORDER_BOOK_ADDRESS ||
  facilitatorAccount.accountAddress.toString();
export const VAULT_ADDRESS =
  process.env.VAULT_ADDRESS || facilitatorAccount.accountAddress.toString();

/**
 * Verify Ed25519 signature for payment authorization
 */
export function verifyPaymentSignature(
  userAddress: string,
  publicKeyHex: string,
  signatureHex: string,
  message: PaymentAuthMessage
): boolean {
  try {
    // Remove 0x prefix if present
    const cleanPublicKey = publicKeyHex.startsWith("0x")
      ? publicKeyHex.slice(2)
      : publicKeyHex;
    const cleanSignature = signatureHex.startsWith("0x")
      ? signatureHex.slice(2)
      : signatureHex;

    // Validate hex string lengths
    if (cleanPublicKey.length !== 64) {
      logger.error("Invalid public key length", {
        expected: 64,
        actual: cleanPublicKey.length,
        publicKey: cleanPublicKey,
      });
      return false;
    }

    if (cleanSignature.length !== 128) {
      logger.error("Invalid signature length", {
        expected: 128,
        actual: cleanSignature.length,
        signature: cleanSignature,
      });
      return false;
    }

    // Construct the message that was signed (text format for wallet signing)
    const messageText = `${message.sender}:${message.recipient}:${message.amount}:${message.nonce}:${message.expiry}`;
    const messageBytes = new TextEncoder().encode(messageText);

    // Parse public key and signature
    const publicKey = new Ed25519PublicKey(`0x${cleanPublicKey}`);
    const signature = new Ed25519Signature(`0x${cleanSignature}`);

    // Verify signature
    const isValid = publicKey.verifySignature({
      message: messageBytes,
      signature,
    });

    logger.info("Signature verification result", {
      userAddress,
      isValid,
      nonce: message.nonce,
    });

    return isValid;
  } catch (error) {
    logger.error("Signature verification error:", error);
    return false;
  }
}

/**
 * Construct authorization message for signing
 */
export function constructAuthorizationMessage(
  message: PaymentAuthMessage
): Uint8Array {
  const encoder = new TextEncoder();

  // Domain separator
  const domainSeparator = encoder.encode("APTOS_PAYMENT_AUTH");

  // Serialize parameters (matching Move contract logic)
  const senderBytes = AccountAddress.from(message.sender).toUint8Array();
  const recipientBytes = AccountAddress.from(message.recipient).toUint8Array();
  const amountBytes = new Uint8Array(8);
  new DataView(amountBytes.buffer).setBigUint64(
    0,
    BigInt(message.amount),
    true
  );
  const nonceBytes = new Uint8Array(8);
  new DataView(nonceBytes.buffer).setBigUint64(0, BigInt(message.nonce), true);
  const expiryBytes = new Uint8Array(8);
  new DataView(expiryBytes.buffer).setBigUint64(
    0,
    BigInt(message.expiry),
    true
  );

  // Concatenate all parts
  const totalLength =
    domainSeparator.length +
    senderBytes.length +
    recipientBytes.length +
    amountBytes.length +
    nonceBytes.length +
    expiryBytes.length;

  const fullMessage = new Uint8Array(totalLength);
  let offset = 0;

  fullMessage.set(domainSeparator, offset);
  offset += domainSeparator.length;
  fullMessage.set(senderBytes, offset);
  offset += senderBytes.length;
  fullMessage.set(recipientBytes, offset);
  offset += recipientBytes.length;
  fullMessage.set(amountBytes, offset);
  offset += amountBytes.length;
  fullMessage.set(nonceBytes, offset);
  offset += nonceBytes.length;
  fullMessage.set(expiryBytes, offset);

  return fullMessage;
}

/**
 * Payment authorization message structure
 */
export interface PaymentAuthMessage {
  sender: string;
  recipient: string;
  amount: number;
  nonce: number;
  expiry: number;
}

/**
 * Submit sponsored transaction to transfer with authorization
 */
export async function submitSponsoredPaymentAuth(
  authMessage: PaymentAuthMessage,
  signature: string,
  publicKey: string
): Promise<string> {
  try {
    // Ensure proper hex format for contract call (with 0x prefix)
    const cleanPublicKey = publicKey.startsWith("0x")
      ? publicKey.slice(2)
      : publicKey;
    const cleanSignature = signature.startsWith("0x")
      ? signature.slice(2)
      : signature;

    // Convert hex strings to Uint8Array for Move contract
    const signatureBytes = Uint8Array.from(Buffer.from(cleanSignature, "hex"));
    const publicKeyBytes = Uint8Array.from(Buffer.from(cleanPublicKey, "hex"));

    const transaction = await aptosClient.transaction.build.simple({
      sender: facilitatorAccount.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::payment_with_auth::transfer_with_authorization`,
        typeArguments: ["0x1::aptos_coin::AptosCoin"], // Using APT for MVP, replace with USDC FA
        functionArguments: [
          authMessage.sender,
          authMessage.recipient,
          authMessage.amount,
          authMessage.nonce,
          authMessage.expiry,
          signatureBytes,
          publicKeyBytes,
        ],
      },
    });

    // Sign and submit as facilitator (gas sponsor)
    const pendingTxn = await aptosClient.signAndSubmitTransaction({
      signer: facilitatorAccount,
      transaction,
    });

    // Wait for transaction
    const response = await aptosClient.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });

    logger.info("Sponsored payment transaction submitted", {
      hash: pendingTxn.hash,
      success: response.success,
      sender: authMessage.sender,
      amount: authMessage.amount,
    });

    return pendingTxn.hash;
  } catch (error) {
    logger.error("Error submitting sponsored payment:", error);
    throw error;
  }
}

/**
 * Check if nonce has been used
 */
export async function isNonceUsed(
  userAddress: string,
  nonce: number
): Promise<boolean> {
  try {
    const result = await aptosClient.view({
      payload: {
        function: `${MODULE_ADDRESS}::payment_with_auth::is_nonce_used`,
        functionArguments: [userAddress, nonce],
      },
    });

    return result[0] as boolean;
  } catch (error) {
    logger.error("Error checking nonce:", error);
    // If error (e.g., nonce store not initialized), treat as not used
    return false;
  }
}
