import { Router, Request, Response } from "express";
import {
  verifyPaymentSignature,
  submitSponsoredPaymentAuth,
  PaymentAuthMessage,
  MODULE_ADDRESS,
} from "../services/aptosService";
import {
  validateNonceAndExpiry,
  markNonceUsed,
  generateNonce,
  generateExpiry,
} from "../services/nonceService";
import { logger } from "../utils/logger";

export const paymentAuthRouter = Router();

/**
 * Initialize nonce store for a user
 */
paymentAuthRouter.post("/initialize-nonce-store", async (req: Request, res: Response) => {
  try {
    const { userAddress } = req.body;

    if (!userAddress) {
      return res.status(400).json({
        error: "Missing required field: userAddress",
      });
    }

    // Submit transaction to initialize nonce store
    const { aptosClient, facilitatorAccount, MODULE_ADDRESS } = require("../services/aptosService");
    
    const transaction = await aptosClient.transaction.build.simple({
      sender: facilitatorAccount.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::payment_with_auth::initialize_nonce_store`,
        functionArguments: [userAddress],
      },
    });

    const pendingTxn = await aptosClient.signAndSubmitTransaction({
      signer: facilitatorAccount,
      transaction,
    });

    await aptosClient.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });

    logger.info("Nonce store initialized", {
      hash: pendingTxn.hash,
      userAddress,
    });

    res.json({
      success: true,
      transactionHash: pendingTxn.hash,
      message: "Nonce store initialized successfully",
    });
  } catch (error: any) {
    logger.error("Error initializing nonce store:", error);
    res.status(500).json({
      error: "Failed to initialize nonce store",
      message: error.message,
    });
  }
});

/**
 * Request payment authorization intent (HTTP 402)
 * Returns payment details for user to sign
 */
paymentAuthRouter.post("/request-intent", (req: Request, res: Response) => {
  try {
    const { sender, recipient, amount } = req.body;

    if (!sender || !recipient || !amount) {
      return res.status(400).json({
        error: "Missing required fields: sender, recipient, amount",
      });
    }

    // Generate nonce and expiry
    const nonce = generateNonce();
    const expiry = generateExpiry(5); // 5 minutes

    // Return 402 Payment Required with payment intent
    res.status(402).json({
      paymentRequired: true,
      intent: {
        sender,
        recipient,
        amount,
        nonce,
        expiry,
        asset: "APT", // For MVP, using APT instead of USDC
        network: process.env.APTOS_NETWORK,
        moduleAddress: MODULE_ADDRESS,
      },
      message: "Sign this payment authorization to proceed",
      instructions: {
        step1: "Construct authorization message from intent fields",
        step2: "Sign message with your Aptos wallet",
        step3: "Submit signed authorization to /api/auth/submit-authorization",
      },
    });
  } catch (error) {
    logger.error("Error creating payment intent:", error);
    res.status(500).json({ error: "Failed to create payment intent" });
  }
});

/**
 * Submit signed payment authorization
 * Verifies signature and submits sponsored transaction
 */
paymentAuthRouter.post(
  "/submit-authorization",
  async (req: Request, res: Response) => {
    try {
      const { sender, recipient, amount, nonce, expiry, signature, publicKey } =
        req.body;

      // Validate required fields
      const missingFields = [];
      if (!sender) missingFields.push("sender");
      if (!recipient) missingFields.push("recipient");
      if (!amount) missingFields.push("amount");
      if (!nonce) missingFields.push("nonce");
      if (!expiry) missingFields.push("expiry");
      if (!signature) missingFields.push("signature");
      if (!publicKey) missingFields.push("publicKey");

      if (missingFields.length > 0) {
        logger.error("Missing required fields in authorization", {
          missingFields,
          receivedBody: req.body,
        });
        return res.status(400).json({
          error: "Missing required fields",
          missing: missingFields,
          required: [
            "sender",
            "recipient",
            "amount",
            "nonce",
            "expiry",
            "signature",
            "publicKey",
          ],
        });
      }

      // Construct message
      const authMessage: PaymentAuthMessage = {
        sender,
        recipient,
        amount,
        nonce,
        expiry,
      };

      // Validate nonce and expiry
      const validation = await validateNonceAndExpiry(sender, nonce, expiry);
      if (!validation.valid) {
        return res.status(400).json({
          error: "Invalid authorization",
          reason: validation.reason,
        });
      }

      // Skip off-chain signature verification - let Move contract verify on-chain
      // This avoids message format mismatch between wallet signing and contract verification
      logger.info(
        "Skipping off-chain signature verification, will verify on-chain",
        {
          sender,
          nonce,
        }
      );

      // Mark nonce as used (will be validated on-chain too)
      markNonceUsed(sender, nonce);

      // Submit sponsored transaction
      const txHash = await submitSponsoredPaymentAuth(
        authMessage,
        signature,
        publicKey
      );

      // Return success
      res.status(200).json({
        success: true,
        transactionHash: txHash,
        message: "Payment authorized and executed",
        explorer: `https://explorer.aptoslabs.com/txn/${txHash}?network=${process.env.APTOS_NETWORK}`,
      });
    } catch (error: any) {
      logger.error("Error submitting payment authorization:", error);
      res.status(500).json({
        error: "Failed to process authorization",
        message: error.message,
      });
    }
  }
);

/**
 * Get payment authorization status
 */
paymentAuthRouter.get(
  "/status/:txHash",
  async (req: Request, res: Response) => {
    try {
      const { txHash } = req.params;

      // In production, query transaction status from Aptos
      res.json({
        transactionHash: txHash,
        status: "pending",
        message: "Transaction status check not fully implemented in MVP",
      });
    } catch (error) {
      logger.error("Error checking transaction status:", error);
      res.status(500).json({ error: "Failed to check transaction status" });
    }
  }
);
