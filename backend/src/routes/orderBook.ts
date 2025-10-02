import { Router, Request, Response } from "express";
import {
  aptosClient,
  facilitatorAccount,
  ORDER_BOOK_ADDRESS,
  MODULE_ADDRESS,
} from "../services/aptosService";
import { logger } from "../utils/logger";

export const orderBookRouter = Router();

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
