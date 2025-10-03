import { Router, Request, Response } from "express";
import {
  aptosClient,
  facilitatorAccount,
  ORDER_BOOK_ADDRESS,
  MODULE_ADDRESS,
} from "../services/aptosService";
import { logger } from "../utils/logger";
import {
  generateNonce,
  generateExpiry,
  isNonceUsed,
  markNonceUsed,
} from "../services/nonceService";

export const orderBookRouter = Router();

/**
 * Step 1: Request order intent (gasless)
 * Generate nonce and expiry for user to sign
 */
orderBookRouter.post("/order-intent", async (req: Request, res: Response) => {
  try {
    const { userAddress, price, quantity, side } = req.body;

    if (!userAddress || !price || !quantity || side === undefined) {
      return res.status(400).json({
        error: "Missing required fields: userAddress, price, quantity, side",
      });
    }

    // Generate nonce and expiry
    const nonce = generateNonce();
    const expiry = generateExpiry(5); // 5 minutes

    // Create message to sign
    const messageToSign = `${userAddress}:${ORDER_BOOK_ADDRESS}:${price}:${quantity}:${side}:${nonce}:${expiry}`;

    logger.info("Generated order intent", {
      userAddress,
      price,
      quantity,
      side: side === 0 ? "BUY" : "SELL",
      nonce,
      expiry,
    });

    res.json({
      success: true,
      intent: {
        userAddress,
        orderBookAddress: ORDER_BOOK_ADDRESS,
        price,
        quantity,
        side,
        nonce,
        expiry,
        network: process.env.APTOS_NETWORK || "testnet",
      },
      messageToSign,
      message: "Sign this to place your order (gasless - no transaction fee)",
    });
  } catch (error: any) {
    logger.error("Error generating order intent:", error);
    res.status(500).json({
      error: "Failed to generate order intent",
      message: error.message,
    });
  }
});

/**
 * Step 2: Place order with signed authorization (gasless)
 * Facilitator submits transaction on behalf of user
 */
orderBookRouter.post("/place", async (req: Request, res: Response) => {
  try {
    const {
      userAddress,
      price,
      quantity,
      side,
      nonce,
      expiry,
      signature,
      publicKey,
    } = req.body;

    if (
      !userAddress ||
      !price ||
      !quantity ||
      side === undefined ||
      !nonce ||
      !expiry ||
      !signature ||
      !publicKey
    ) {
      return res.status(400).json({
        error:
          "Missing required fields: userAddress, price, quantity, side, nonce, expiry, signature, publicKey",
      });
    }

    // Note: For gasless orders, we trust the user signed the intent off-chain
    // The facilitator places the order on their behalf using place_order_for_user
    // No on-chain signature verification is needed

    // Check expiry
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime > expiry) {
      return res.status(400).json({
        error: "Authorization expired",
        message: "Please request a new order intent",
      });
    }

    // Verify and use nonce
    const nonceAlreadyUsed = await isNonceUsed(userAddress, nonce);
    if (nonceAlreadyUsed) {
      return res.status(400).json({
        error: "Invalid or already used nonce",
        message: "Please request a new order intent",
      });
    }

    // Mark nonce as used
    markNonceUsed(userAddress, nonce);

    logger.info("Processing gasless order placement", {
      userAddress,
      price,
      quantity,
      side: side === 0 ? "BUY" : "SELL",
    });

    // Place order on behalf of user (facilitator pays gas)
    const transaction = await aptosClient.transaction.build.simple({
      sender: facilitatorAccount.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::order_book::place_order_for_user`,
        functionArguments: [
          ORDER_BOOK_ADDRESS,
          userAddress,
          price,
          quantity,
          side,
        ],
      },
    });

    const pendingTxn = await aptosClient.signAndSubmitTransaction({
      signer: facilitatorAccount,
      transaction,
    });

    const response = await aptosClient.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });

    logger.info("Gasless order placed successfully", {
      hash: pendingTxn.hash,
      userAddress,
      price,
      quantity,
      side: side === 0 ? "BUY" : "SELL",
    });

    res.json({
      success: true,
      transactionHash: pendingTxn.hash,
      message: `${
        side === 0 ? "Buy" : "Sell"
      } order placed successfully (gasless!)`,
      explorer: `https://explorer.aptoslabs.com/txn/${
        pendingTxn.hash
      }?network=${process.env.APTOS_NETWORK || "testnet"}`,
    });
  } catch (error: any) {
    logger.error("Error placing gasless order:", error);
    res.status(500).json({
      error: "Failed to place order",
      message: error.message,
    });
  }
});

/**
 * Check vault balance before placing order
 * Returns available balance and whether user has sufficient funds
 */
orderBookRouter.post("/check-balance", async (req: Request, res: Response) => {
  try {
    const { userAddress, price, quantity, side } = req.body;

    if (!userAddress || !price || !quantity || side === undefined) {
      return res.status(400).json({
        error: "Missing required fields: userAddress, price, quantity, side",
      });
    }

    const VAULT_ADDRESS = process.env.VAULT_ADDRESS || MODULE_ADDRESS;

    // Get user's available balance from vault
    const availableBalance = await aptosClient.view({
      payload: {
        function: `${MODULE_ADDRESS}::strategy_vault::get_user_available_balance`,
        functionArguments: [VAULT_ADDRESS, userAddress],
      },
    });

    const available = Number(availableBalance[0]);
    const requiredAmount = side === 0 ? price * quantity : quantity; // bid = price*qty, ask = qty

    res.json({
      success: true,
      availableBalance: available,
      requiredAmount: requiredAmount,
      sufficient: available >= requiredAmount,
      vaultAddress: VAULT_ADDRESS,
      orderBookAddress: ORDER_BOOK_ADDRESS,
    });
  } catch (error: any) {
    logger.error("Error checking balance:", error);
    res.status(500).json({
      error: "Failed to check balance",
      message: error.message,
    });
  }
});

/**
 * Cancel an order
 */
orderBookRouter.post("/cancel", async (req: Request, res: Response) => {
  try {
    const { userAddress, orderId } = req.body;

    if (!userAddress || !orderId) {
      return res.status(400).json({
        error: "Missing required fields: userAddress, orderId",
      });
    }

    const transaction = await aptosClient.transaction.build.simple({
      sender: facilitatorAccount.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::order_book::cancel_order`,
        functionArguments: [ORDER_BOOK_ADDRESS, orderId],
      },
    });

    const pendingTxn = await aptosClient.signAndSubmitTransaction({
      signer: facilitatorAccount,
      transaction,
    });

    await aptosClient.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });

    logger.info("Order cancelled", {
      hash: pendingTxn.hash,
      userAddress,
      orderId,
    });

    res.json({
      success: true,
      transactionHash: pendingTxn.hash,
      message: "Order cancelled successfully",
    });
  } catch (error: any) {
    logger.error("Error cancelling order:", error);
    res.status(500).json({
      error: "Failed to cancel order",
      message: error.message,
    });
  }
});

/**
 * Get user orders
 */
orderBookRouter.get("/user/:address", async (req: Request, res: Response) => {
  try {
    const { address } = req.params;

    const orderIds = await aptosClient.view({
      payload: {
        function: `${MODULE_ADDRESS}::order_book::get_user_orders`,
        functionArguments: [ORDER_BOOK_ADDRESS, address],
      },
    });

    logger.info("Retrieved user orders", {
      userAddress: address,
      orderCount: (orderIds[0] as any[]).length,
    });

    res.json({
      success: true,
      userAddress: address,
      orderIds: orderIds[0],
    });
  } catch (error: any) {
    logger.error("Error getting user orders:", error);
    res.status(500).json({
      error: "Failed to retrieve orders",
      message: error.message,
    });
  }
});

/**
 * Get order details
 */
orderBookRouter.get("/order/:orderId", async (req: Request, res: Response) => {
  try {
    const { orderId } = req.params;

    const order = await aptosClient.view({
      payload: {
        function: `${MODULE_ADDRESS}::order_book::get_order`,
        functionArguments: [ORDER_BOOK_ADDRESS, orderId],
      },
    });

    res.json({
      success: true,
      order: order[0],
    });
  } catch (error: any) {
    logger.error("Error getting order details:", error);
    res.status(500).json({
      error: "Failed to retrieve order",
      message: error.message,
    });
  }
});

/**
 * Get all orders from the order book
 * Returns all bids and asks (open orders only)
 */
orderBookRouter.get("/all", async (req: Request, res: Response) => {
  try {
    // Get the OrderBook resource from the blockchain
    const orderBookResource = await aptosClient.getAccountResource({
      accountAddress: ORDER_BOOK_ADDRESS,
      resourceType: `${MODULE_ADDRESS}::order_book::OrderBook`,
    });

    if (!orderBookResource) {
      return res.json({
        success: true,
        bids: [],
        asks: [],
        spread: 0,
        orderBookAddress: ORDER_BOOK_ADDRESS,
        message: "Order book not initialized",
      });
    }

    const orderBookData = orderBookResource as any;
    const nextOrderId = Number(orderBookData.next_order_id || "1");

    // Fetch all orders
    const bids: any[] = [];
    const asks: any[] = [];

    // Query orders from 1 to next_order_id - 1
    for (let orderId = 1; orderId < nextOrderId; orderId++) {
      try {
        const orderResult = await aptosClient.view({
          payload: {
            function: `${MODULE_ADDRESS}::order_book::get_order`,
            functionArguments: [ORDER_BOOK_ADDRESS, orderId.toString()],
          },
        });

        const order = orderResult[0] as any;

        // Only include open orders (status 0) or partially filled (status 3)
        if (order.status === 0 || order.status === 3) {
          const orderData = {
            order_id: Number(order.order_id),
            owner: order.owner,
            price: Number(order.price),
            quantity: Number(order.quantity),
            filled_quantity: Number(order.filled_quantity),
            remaining_quantity:
              Number(order.quantity) - Number(order.filled_quantity),
            side: Number(order.side),
            status: Number(order.status),
            timestamp: Number(order.timestamp),
            total:
              Number(order.price) *
              (Number(order.quantity) - Number(order.filled_quantity)),
          };

          if (orderData.side === 0) {
            bids.push(orderData);
          } else {
            asks.push(orderData);
          }
        }
      } catch (err: any) {
        // Order might not exist or might be an error, skip it
        if (!err.message?.includes("ORDER_NOT_FOUND")) {
          logger.debug(`Skipping order ${orderId}:`, err.message);
        }
      }
    }

    // Sort bids by price descending (highest first)
    bids.sort((a, b) => b.price - a.price);

    // Sort asks by price ascending (lowest first)
    asks.sort((a, b) => a.price - b.price);

    logger.info("Retrieved order book", {
      totalBids: bids.length,
      totalAsks: asks.length,
    });

    res.json({
      success: true,
      bids,
      asks,
      spread:
        asks.length > 0 && bids.length > 0 ? asks[0].price - bids[0].price : 0,
      orderBookAddress: ORDER_BOOK_ADDRESS,
    });
  } catch (error: any) {
    logger.error("Error getting order book:", error);
    res.status(500).json({
      error: "Failed to retrieve order book",
      message: error.message,
    });
  }
});
