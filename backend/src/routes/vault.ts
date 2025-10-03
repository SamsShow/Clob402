import { Router, Request, Response } from "express";
import {
  aptosClient,
  facilitatorAccount,
  VAULT_ADDRESS,
  MODULE_ADDRESS,
} from "../services/aptosService";
import { logger } from "../utils/logger";
import { generateNonce, generateExpiry } from "../services/nonceService";

export const vaultRouter = Router();

/**
 * Request deposit intent - Step 1 of gasless flow
 * User will sign the returned intent
 */
vaultRouter.post("/deposit-intent", async (req: Request, res: Response) => {
  try {
    const { userAddress, amount } = req.body;

    if (!userAddress || !amount) {
      return res.status(400).json({
        error: "Missing required fields: userAddress, amount",
      });
    }

    const nonce = generateNonce();
    const expiry = generateExpiry(5); // 5 minutes

    res.json({
      paymentRequired: true,
      intent: {
        sender: userAddress,
        recipient: VAULT_ADDRESS,
        amount: Number(amount),
        nonce,
        expiry,
        asset: "APT",
        network: process.env.APTOS_NETWORK || "testnet",
        moduleAddress: MODULE_ADDRESS,
      },
      message: "Sign this to deposit into vault (gasless - no transaction fee)",
      messageToSign: `${userAddress}:${VAULT_ADDRESS}:${amount}:${nonce}:${expiry}`,
    });
  } catch (error: any) {
    logger.error("Error creating deposit intent:", error);
    res
      .status(500)
      .json({ error: "Failed to create intent", message: error.message });
  }
});

/**
 * Execute deposit with signed authorization - Step 2 of gasless flow
 * Backend submits sponsored transaction
 */
vaultRouter.post("/deposit", async (req: Request, res: Response) => {
  try {
    const { userAddress, amount, nonce, expiry, signature, publicKey } =
      req.body;

    if (
      !userAddress ||
      !amount ||
      !signature ||
      !publicKey ||
      !nonce ||
      !expiry
    ) {
      return res.status(400).json({
        error: "Missing required fields",
        required: [
          "userAddress",
          "amount",
          "nonce",
          "expiry",
          "signature",
          "publicKey",
        ],
      });
    }

    logger.info("Processing gasless vault deposit (2-step flow)", {
      userAddress,
      amount,
      nonce,
    });

    // Handle signature format (could be string, object, or Uint8Array)
    let sigString: string;
    let pubKeyString: string;

    // Extract signature as string
    if (typeof signature === "string") {
      sigString = signature;
    } else if (signature && typeof signature === "object") {
      // Handle { signature: "..." } format or direct hex
      sigString = (signature as any).signature || JSON.stringify(signature);
    } else if (signature instanceof Uint8Array || Array.isArray(signature)) {
      // Convert bytes to hex string
      sigString = Buffer.from(signature).toString("hex");
    } else {
      sigString = String(signature);
    }

    // Extract public key as string
    if (typeof publicKey === "string") {
      pubKeyString = publicKey;
    } else if (publicKey instanceof Uint8Array || Array.isArray(publicKey)) {
      pubKeyString = Buffer.from(publicKey).toString("hex");
    } else {
      pubKeyString = String(publicKey);
    }

    // Remove 0x prefix if present
    sigString = sigString.replace(/^0x/i, "");
    pubKeyString = pubKeyString.replace(/^0x/i, "");

    // Log for debugging
    logger.info("Signature processing", {
      sigLength: sigString.length,
      pubKeyLength: pubKeyString.length,
    });

    // Convert hex strings to byte arrays
    const sigBytes = Array.from(Buffer.from(sigString, "hex"));
    const pubKeyBytes = Array.from(Buffer.from(pubKeyString, "hex"));

    // Validate signature and public key lengths
    // Ed25519: signature = 64 bytes (128 hex chars), public key = 32 bytes (64 hex chars)
    if (sigBytes.length !== 64) {
      logger.error("Invalid signature length", {
        expected: 64,
        actual: sigBytes.length,
        sigString: sigString.substring(0, 100), // First 100 chars for debugging
      });
      return res.status(400).json({
        error: "Invalid signature format",
        message: `Signature must be 64 bytes (128 hex characters), got ${sigBytes.length} bytes`,
      });
    }

    if (pubKeyBytes.length !== 32) {
      logger.error("Invalid public key length", {
        expected: 32,
        actual: pubKeyBytes.length,
      });
      return res.status(400).json({
        error: "Invalid public key format",
        message: `Public key must be 32 bytes (64 hex characters), got ${pubKeyBytes.length} bytes`,
      });
    }

    // STEP 1: Transfer coins from user to vault (gasless)
    const transferTx = await aptosClient.transaction.build.simple({
      sender: facilitatorAccount.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::payment_with_auth::transfer_with_authorization`,
        typeArguments: ["0x1::aptos_coin::AptosCoin"],
        functionArguments: [
          userAddress, // sender
          VAULT_ADDRESS, // recipient (vault address)
          Number(amount),
          Number(nonce),
          Number(expiry),
          sigBytes,
          pubKeyBytes,
        ],
      },
    });

    const transferPending = await aptosClient.signAndSubmitTransaction({
      signer: facilitatorAccount,
      transaction: transferTx,
    });

    await aptosClient.waitForTransaction({
      transactionHash: transferPending.hash,
    });

    logger.info("Step 1: Coins transferred", { hash: transferPending.hash });

    // STEP 2: Credit user with shares (accounting)
    const creditTx = await aptosClient.transaction.build.simple({
      sender: facilitatorAccount.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::strategy_vault::credit_deposit`,
        typeArguments: ["0x1::aptos_coin::AptosCoin"],
        functionArguments: [
          VAULT_ADDRESS, // vault address
          userAddress, // user to credit
          Number(amount),
        ],
      },
    });

    const creditPending = await aptosClient.signAndSubmitTransaction({
      signer: facilitatorAccount,
      transaction: creditTx,
    });

    await aptosClient.waitForTransaction({
      transactionHash: creditPending.hash,
    });

    logger.info("Step 2: Shares credited - Gasless deposit complete!", {
      transferHash: transferPending.hash,
      creditHash: creditPending.hash,
      user: userAddress,
      amount,
    });

    res.json({
      success: true,
      transactionHash: creditPending.hash, // Return the final transaction
      transferHash: transferPending.hash,
      message: "Gasless deposit successful (user paid NO gas!)",
      explorer: `https://explorer.aptoslabs.com/txn/${creditPending.hash}?network=testnet`,
    });
  } catch (error: any) {
    logger.error("Error processing gasless deposit:", error);
    res.status(500).json({
      error: "Failed to process deposit",
      message: error.message,
    });
  }
});

/**
 * Withdraw from strategy vault
 */
vaultRouter.post("/withdraw", async (req: Request, res: Response) => {
  try {
    const { userAddress, shares } = req.body;

    if (!userAddress || !shares) {
      return res.status(400).json({
        error: "Missing required fields: userAddress, shares",
      });
    }

    const transaction = await aptosClient.transaction.build.simple({
      sender: facilitatorAccount.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::strategy_vault::withdraw`,
        typeArguments: ["0x1::aptos_coin::AptosCoin"],
        functionArguments: [VAULT_ADDRESS, shares],
      },
    });

    const pendingTxn = await aptosClient.signAndSubmitTransaction({
      signer: facilitatorAccount,
      transaction,
    });

    await aptosClient.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });

    logger.info("Vault withdrawal", {
      hash: pendingTxn.hash,
      userAddress,
      shares,
    });

    res.json({
      success: true,
      transactionHash: pendingTxn.hash,
      message: "Withdrawal successful",
    });
  } catch (error: any) {
    logger.error("Error withdrawing from vault:", error);
    res.status(500).json({
      error: "Failed to withdraw",
      message: error.message,
    });
  }
});

/**
 * Get user vault shares
 */
vaultRouter.get("/shares/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    const shares = await aptosClient.view({
      payload: {
        function: `${MODULE_ADDRESS}::strategy_vault::get_user_shares`,
        functionArguments: [VAULT_ADDRESS, address],
      },
    });

    res.json({
      success: true,
      userAddress: address,
      shares: shares[0],
    });
  } catch (error: any) {
    logger.error("Error getting vault shares:", error);
    res.status(500).json({
      error: "Failed to retrieve shares",
      message: error.message,
    });
  }
});

/**
 * Get vault information
 */
vaultRouter.get("/info", async (req: Request, res: Response) => {
  try {
    const vaultInfo = await aptosClient.view({
      payload: {
        function: `${MODULE_ADDRESS}::strategy_vault::get_vault_info`,
        functionArguments: [VAULT_ADDRESS],
      },
    });

    res.json({
      success: true,
      vaultAddress: VAULT_ADDRESS,
      referenceTrader: vaultInfo[0],
      totalDeposits: vaultInfo[1],
      totalShares: vaultInfo[2],
      isActive: vaultInfo[3],
    });
  } catch (error: any) {
    logger.error("Error getting vault info:", error);
    res.status(500).json({
      error: "Failed to retrieve vault info",
      message: error.message,
    });
  }
});

/**
 * Calculate share value
 */
vaultRouter.get(
  "/calculate-value/:shares",
  async (req: Request, res: Response) => {
    try {
      const { shares } = req.params;

      const value = await aptosClient.view({
        payload: {
          function: `${MODULE_ADDRESS}::strategy_vault::calculate_share_value`,
          functionArguments: [VAULT_ADDRESS, shares],
        },
      });

      res.json({
        success: true,
        shares,
        value: value[0],
      });
    } catch (error: any) {
      logger.error("Error calculating share value:", error);
      res.status(500).json({
        error: "Failed to calculate value",
        message: error.message,
      });
    }
  }
);

/**
 * Get user's available balance (for trading)
 */
vaultRouter.get(
  "/balance/available/:address",
  async (req: Request, res: Response) => {
    try {
      const { address } = req.params;

      const balance = await aptosClient.view({
        payload: {
          function: `${MODULE_ADDRESS}::strategy_vault::get_user_available_balance`,
          functionArguments: [VAULT_ADDRESS, address],
        },
      });

      res.json({
        success: true,
        userAddress: address,
        availableBalance: balance[0],
      });
    } catch (error: any) {
      logger.error("Error getting available balance:", error);
      res.status(500).json({
        error: "Failed to retrieve available balance",
        message: error.message,
      });
    }
  }
);

/**
 * Get user's locked balance (in open orders)
 */
vaultRouter.get(
  "/balance/locked/:address",
  async (req: Request, res: Response) => {
    try {
      const { address } = req.params;

      const balance = await aptosClient.view({
        payload: {
          function: `${MODULE_ADDRESS}::strategy_vault::get_user_locked_balance`,
          functionArguments: [VAULT_ADDRESS, address],
        },
      });

      res.json({
        success: true,
        userAddress: address,
        lockedBalance: balance[0],
      });
    } catch (error: any) {
      logger.error("Error getting locked balance:", error);
      res.status(500).json({
        error: "Failed to retrieve locked balance",
        message: error.message,
      });
    }
  }
);

/**
 * Get user's total balance (available + locked)
 */
vaultRouter.get(
  "/balance/total/:address",
  async (req: Request, res: Response) => {
    try {
      const { address } = req.params;

      const balance = await aptosClient.view({
        payload: {
          function: `${MODULE_ADDRESS}::strategy_vault::get_user_total_balance`,
          functionArguments: [VAULT_ADDRESS, address],
        },
      });

      res.json({
        success: true,
        userAddress: address,
        totalBalance: balance[0],
      });
    } catch (error: any) {
      logger.error("Error getting total balance:", error);
      res.status(500).json({
        error: "Failed to retrieve total balance",
        message: error.message,
      });
    }
  }
);

/**
 * Get all user balances (available, locked, total) in one call
 */
vaultRouter.get("/balance/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    const [available, locked, total] = await Promise.all([
      aptosClient.view({
        payload: {
          function: `${MODULE_ADDRESS}::strategy_vault::get_user_available_balance`,
          functionArguments: [VAULT_ADDRESS, address],
        },
      }),
      aptosClient.view({
        payload: {
          function: `${MODULE_ADDRESS}::strategy_vault::get_user_locked_balance`,
          functionArguments: [VAULT_ADDRESS, address],
        },
      }),
      aptosClient.view({
        payload: {
          function: `${MODULE_ADDRESS}::strategy_vault::get_user_total_balance`,
          functionArguments: [VAULT_ADDRESS, address],
        },
      }),
    ]);

    res.json({
      success: true,
      userAddress: address,
      availableBalance: available[0],
      lockedBalance: locked[0],
      totalBalance: total[0],
    });
  } catch (error: any) {
    logger.error("Error getting balances:", error);
    res.status(500).json({
      error: "Failed to retrieve balances",
      message: error.message,
    });
  }
});
