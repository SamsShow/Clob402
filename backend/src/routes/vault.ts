import { Router, Request, Response } from 'express';
import { aptosClient, facilitatorAccount, VAULT_ADDRESS, MODULE_ADDRESS } from '../services/aptosService';
import { logger } from '../utils/logger';

export const vaultRouter = Router();

/**
 * Deposit into strategy vault
 */
vaultRouter.post('/deposit', async (req: Request, res: Response) => {
  try {
    const { userAddress, amount } = req.body;

    if (!userAddress || !amount) {
      return res.status(400).json({
        error: 'Missing required fields: userAddress, amount',
      });
    }

    // In production, this would be via sponsored transaction after payment auth
    const transaction = await aptosClient.transaction.build.simple({
      sender: facilitatorAccount.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::strategy_vault::deposit`,
        typeArguments: ['0x1::aptos_coin::AptosCoin'],
        functionArguments: [VAULT_ADDRESS, amount],
      },
    });

    const pendingTxn = await aptosClient.signAndSubmitTransaction({
      signer: facilitatorAccount,
      transaction,
    });

    await aptosClient.waitForTransaction({
      transactionHash: pendingTxn.hash,
    });

    logger.info('Vault deposit', {
      hash: pendingTxn.hash,
      userAddress,
      amount,
    });

    res.json({
      success: true,
      transactionHash: pendingTxn.hash,
      message: 'Deposit successful',
    });
  } catch (error: any) {
    logger.error('Error depositing to vault:', error);
    res.status(500).json({
      error: 'Failed to deposit',
      message: error.message,
    });
  }
});

/**
 * Withdraw from strategy vault
 */
vaultRouter.post('/withdraw', async (req: Request, res: Response) => {
  try {
    const { userAddress, shares } = req.body;

    if (!userAddress || !shares) {
      return res.status(400).json({
        error: 'Missing required fields: userAddress, shares',
      });
    }

    const transaction = await aptosClient.transaction.build.simple({
      sender: facilitatorAccount.accountAddress,
      data: {
        function: `${MODULE_ADDRESS}::strategy_vault::withdraw`,
        typeArguments: ['0x1::aptos_coin::AptosCoin'],
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

    logger.info('Vault withdrawal', {
      hash: pendingTxn.hash,
      userAddress,
      shares,
    });

    res.json({
      success: true,
      transactionHash: pendingTxn.hash,
      message: 'Withdrawal successful',
    });
  } catch (error: any) {
    logger.error('Error withdrawing from vault:', error);
    res.status(500).json({
      error: 'Failed to withdraw',
      message: error.message,
    });
  }
});

/**
 * Get user vault shares
 */
vaultRouter.get('/shares/:address', async (req: Request, res: Response) => {
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
    logger.error('Error getting vault shares:', error);
    res.status(500).json({
      error: 'Failed to retrieve shares',
      message: error.message,
    });
  }
});

/**
 * Get vault information
 */
vaultRouter.get('/info', async (req: Request, res: Response) => {
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
    logger.error('Error getting vault info:', error);
    res.status(500).json({
      error: 'Failed to retrieve vault info',
      message: error.message,
    });
  }
});

/**
 * Calculate share value
 */
vaultRouter.get('/calculate-value/:shares', async (req: Request, res: Response) => {
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
    logger.error('Error calculating share value:', error);
    res.status(500).json({
      error: 'Failed to calculate value',
      message: error.message,
    });
  }
});

/**
 * Get user's available balance (for trading)
 */
vaultRouter.get('/balance/available/:address', async (req: Request, res: Response) => {
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
    logger.error('Error getting available balance:', error);
    res.status(500).json({
      error: 'Failed to retrieve available balance',
      message: error.message,
    });
  }
});

/**
 * Get user's locked balance (in open orders)
 */
vaultRouter.get('/balance/locked/:address', async (req: Request, res: Response) => {
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
    logger.error('Error getting locked balance:', error);
    res.status(500).json({
      error: 'Failed to retrieve locked balance',
      message: error.message,
    });
  }
});

/**
 * Get user's total balance (available + locked)
 */
vaultRouter.get('/balance/total/:address', async (req: Request, res: Response) => {
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
    logger.error('Error getting total balance:', error);
    res.status(500).json({
      error: 'Failed to retrieve total balance',
      message: error.message,
    });
  }
});

/**
 * Get all user balances (available, locked, total) in one call
 */
vaultRouter.get('/balance/:address', async (req: Request, res: Response) => {
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
    logger.error('Error getting balances:', error);
    res.status(500).json({
      error: 'Failed to retrieve balances',
      message: error.message,
    });
  }
});

