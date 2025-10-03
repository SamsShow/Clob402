module clob_strategy_vault::strategy_vault {
    use std::signer;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_std::table::{Self, Table};

    /// Error codes
    const E_VAULT_NOT_INITIALIZED: u64 = 1;
    const E_INSUFFICIENT_BALANCE: u64 = 2;
    const E_INVALID_AMOUNT: u64 = 3;
    const E_INSUFFICIENT_SHARES: u64 = 4;
    const E_UNAUTHORIZED: u64 = 5;
    const E_INSUFFICIENT_AVAILABLE_BALANCE: u64 = 6;
    const E_INSUFFICIENT_LOCKED_BALANCE: u64 = 7;

    /// Vault that tracks deposits and shares for copy-trading
    /// Also serves as escrow for order book trading
    struct Vault has key {
        reference_trader: address,
        total_deposits: u64,
        total_shares: u64,
        user_shares: Table<address, u64>,
        user_available_balance: Table<address, u64>,  // Available for trading
        user_locked_balance: Table<address, u64>,     // Locked in open orders
        is_active: bool,
    }

    /// Events
    #[event]
    struct DepositEvent has drop, store {
        user: address,
        amount: u64,
        shares_minted: u64,
        timestamp: u64,
    }

    #[event]
    struct WithdrawEvent has drop, store {
        user: address,
        amount: u64,
        shares_burned: u64,
        timestamp: u64,
    }

    #[event]
    struct VaultTradeEvent has drop, store {
        reference_trader: address,
        trade_amount: u64,
        timestamp: u64,
    }

    /// Initialize a new vault
    public entry fun initialize_vault(
        admin: &signer,
        reference_trader: address
    ) {
        let addr = signer::address_of(admin);
        if (!exists<Vault>(addr)) {
            move_to(admin, Vault {
                reference_trader,
                total_deposits: 0,
                total_shares: 0,
                user_shares: table::new(),
                user_available_balance: table::new(),
                user_locked_balance: table::new(),
                is_active: true,
            });
        };
    }

    /// Deposit funds into vault and receive shares
    public entry fun deposit<CoinType>(
        user: &signer,
        vault_addr: address,
        amount: u64
    ) acquires Vault {
        assert!(exists<Vault>(vault_addr), E_VAULT_NOT_INITIALIZED);
        assert!(amount > 0, E_INVALID_AMOUNT);

        let vault = borrow_global_mut<Vault>(vault_addr);
        assert!(vault.is_active, E_UNAUTHORIZED);

        let user_addr = signer::address_of(user);

        // Calculate shares to mint
        let shares_to_mint = if (vault.total_shares == 0) {
            amount  // First deposit: 1:1 ratio
        } else {
            // shares = amount * total_shares / total_deposits
            (amount * vault.total_shares) / vault.total_deposits
        };

        // Update vault state
        vault.total_deposits = vault.total_deposits + amount;
        vault.total_shares = vault.total_shares + shares_to_mint;

        // Update user shares
        if (!table::contains(&vault.user_shares, user_addr)) {
            table::add(&mut vault.user_shares, user_addr, 0);
        };
        let user_shares = table::borrow_mut(&mut vault.user_shares, user_addr);
        *user_shares = *user_shares + shares_to_mint;

        // Initialize and update user available balance for trading
        if (!table::contains(&vault.user_available_balance, user_addr)) {
            table::add(&mut vault.user_available_balance, user_addr, 0);
        };
        if (!table::contains(&vault.user_locked_balance, user_addr)) {
            table::add(&mut vault.user_locked_balance, user_addr, 0);
        };
        let available_balance = table::borrow_mut(&mut vault.user_available_balance, user_addr);
        *available_balance = *available_balance + amount;

        // Transfer coins to vault
        coin::transfer<CoinType>(user, vault_addr, amount);

        event::emit(DepositEvent {
            user: user_addr,
            amount,
            shares_minted: shares_to_mint,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Credit deposit for gasless flow - coins already in vault
    /// Called AFTER payment_with_auth::transfer_with_authorization
    /// This allows gasless deposits where user only signs a message
    public entry fun credit_deposit<CoinType>(
        facilitator: &signer,
        vault_addr: address,
        user_addr: address,
        amount: u64
    ) acquires Vault {
        assert!(exists<Vault>(vault_addr), E_VAULT_NOT_INITIALIZED);
        assert!(amount > 0, E_INVALID_AMOUNT);

        let vault = borrow_global_mut<Vault>(vault_addr);
        assert!(vault.is_active, E_UNAUTHORIZED);

        // Calculate shares to mint
        let shares_to_mint = if (vault.total_shares == 0) {
            amount  // First deposit: 1:1 ratio
        } else {
            (amount * vault.total_shares) / vault.total_deposits
        };

        // Update vault state
        vault.total_deposits = vault.total_deposits + amount;
        vault.total_shares = vault.total_shares + shares_to_mint;

        // Update user shares
        if (!table::contains(&vault.user_shares, user_addr)) {
            table::add(&mut vault.user_shares, user_addr, 0);
        };
        let user_shares = table::borrow_mut(&mut vault.user_shares, user_addr);
        *user_shares = *user_shares + shares_to_mint;

        // Initialize and update user available balance
        if (!table::contains(&vault.user_available_balance, user_addr)) {
            table::add(&mut vault.user_available_balance, user_addr, 0);
        };
        if (!table::contains(&vault.user_locked_balance, user_addr)) {
            table::add(&mut vault.user_locked_balance, user_addr, 0);
        };
        let available_balance = table::borrow_mut(&mut vault.user_available_balance, user_addr);
        *available_balance = *available_balance + amount;

        // NOTE: Coins are already in vault from transfer_with_authorization
        // We only update accounting here

        event::emit(DepositEvent {
            user: user_addr,
            amount,
            shares_minted: shares_to_mint,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Withdraw funds from vault by burning shares
    public entry fun withdraw<CoinType>(
        user: &signer,
        vault_addr: address,
        shares: u64
    ) acquires Vault {
        assert!(exists<Vault>(vault_addr), E_VAULT_NOT_INITIALIZED);
        assert!(shares > 0, E_INVALID_AMOUNT);

        let vault = borrow_global_mut<Vault>(vault_addr);
        let user_addr = signer::address_of(user);

        assert!(table::contains(&vault.user_shares, user_addr), E_INSUFFICIENT_SHARES);
        let user_shares = table::borrow_mut(&mut vault.user_shares, user_addr);
        assert!(*user_shares >= shares, E_INSUFFICIENT_SHARES);

        // Calculate withdrawal amount
        let amount = (shares * vault.total_deposits) / vault.total_shares;

        // Update vault state
        vault.total_deposits = vault.total_deposits - amount;
        vault.total_shares = vault.total_shares - shares;
        *user_shares = *user_shares - shares;

        // Transfer coins from vault to user (requires vault to be a signer)
        // In production, this would need proper vault signer capability
        
        event::emit(WithdrawEvent {
            user: user_addr,
            amount,
            shares_burned: shares,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Record a trade executed by the reference trader
    public entry fun record_vault_trade(
        facilitator: &signer,
        vault_addr: address,
        trade_amount: u64
    ) acquires Vault {
        assert!(exists<Vault>(vault_addr), E_VAULT_NOT_INITIALIZED);
        
        let vault = borrow_global<Vault>(vault_addr);

        event::emit(VaultTradeEvent {
            reference_trader: vault.reference_trader,
            trade_amount,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Lock user balance for an open order
    /// Called by order book when user places an order
    public fun lock_balance(
        vault_addr: address,
        user: address,
        amount: u64
    ) acquires Vault {
        assert!(exists<Vault>(vault_addr), E_VAULT_NOT_INITIALIZED);
        let vault = borrow_global_mut<Vault>(vault_addr);

        // Ensure user has balances initialized
        if (!table::contains(&vault.user_available_balance, user)) {
            table::add(&mut vault.user_available_balance, user, 0);
        };
        if (!table::contains(&vault.user_locked_balance, user)) {
            table::add(&mut vault.user_locked_balance, user, 0);
        };

        let available = table::borrow_mut(&mut vault.user_available_balance, user);
        let locked = table::borrow_mut(&mut vault.user_locked_balance, user);

        assert!(*available >= amount, E_INSUFFICIENT_AVAILABLE_BALANCE);

        // Move from available to locked
        *available = *available - amount;
        *locked = *locked + amount;
    }

    /// Unlock user balance when order is cancelled
    public fun unlock_balance(
        vault_addr: address,
        user: address,
        amount: u64
    ) acquires Vault {
        assert!(exists<Vault>(vault_addr), E_VAULT_NOT_INITIALIZED);
        let vault = borrow_global_mut<Vault>(vault_addr);

        let available = table::borrow_mut(&mut vault.user_available_balance, user);
        let locked = table::borrow_mut(&mut vault.user_locked_balance, user);

        assert!(*locked >= amount, E_INSUFFICIENT_LOCKED_BALANCE);

        // Move from locked back to available
        *locked = *locked - amount;
        *available = *available + amount;
    }

    /// Settle order by transferring locked balance between users
    /// Called when an order is filled
    public fun settle_order(
        vault_addr: address,
        from: address,
        to: address,
        amount: u64
    ) acquires Vault {
        assert!(exists<Vault>(vault_addr), E_VAULT_NOT_INITIALIZED);
        let vault = borrow_global_mut<Vault>(vault_addr);

        // Ensure 'to' user has balances initialized
        if (!table::contains(&vault.user_available_balance, to)) {
            table::add(&mut vault.user_available_balance, to, 0);
        };
        if (!table::contains(&vault.user_locked_balance, to)) {
            table::add(&mut vault.user_locked_balance, to, 0);
        };

        let from_locked = table::borrow_mut(&mut vault.user_locked_balance, from);
        let to_available = table::borrow_mut(&mut vault.user_available_balance, to);

        assert!(*from_locked >= amount, E_INSUFFICIENT_LOCKED_BALANCE);

        // Transfer from locked (from) to available (to)
        *from_locked = *from_locked - amount;
        *to_available = *to_available + amount;
    }

    /// View functions
    #[view]
    public fun get_user_shares(vault_addr: address, user: address): u64 acquires Vault {
        assert!(exists<Vault>(vault_addr), E_VAULT_NOT_INITIALIZED);
        let vault = borrow_global<Vault>(vault_addr);
        if (table::contains(&vault.user_shares, user)) {
            *table::borrow(&vault.user_shares, user)
        } else {
            0
        }
    }

    #[view]
    public fun get_vault_info(vault_addr: address): (address, u64, u64, bool) acquires Vault {
        assert!(exists<Vault>(vault_addr), E_VAULT_NOT_INITIALIZED);
        let vault = borrow_global<Vault>(vault_addr);
        (vault.reference_trader, vault.total_deposits, vault.total_shares, vault.is_active)
    }

    #[view]
    public fun calculate_share_value(vault_addr: address, shares: u64): u64 acquires Vault {
        assert!(exists<Vault>(vault_addr), E_VAULT_NOT_INITIALIZED);
        let vault = borrow_global<Vault>(vault_addr);
        if (vault.total_shares == 0) {
            0
        } else {
            (shares * vault.total_deposits) / vault.total_shares
        }
    }

    #[view]
    public fun get_user_available_balance(vault_addr: address, user: address): u64 acquires Vault {
        assert!(exists<Vault>(vault_addr), E_VAULT_NOT_INITIALIZED);
        let vault = borrow_global<Vault>(vault_addr);
        if (table::contains(&vault.user_available_balance, user)) {
            *table::borrow(&vault.user_available_balance, user)
        } else {
            0
        }
    }

    #[view]
    public fun get_user_locked_balance(vault_addr: address, user: address): u64 acquires Vault {
        assert!(exists<Vault>(vault_addr), E_VAULT_NOT_INITIALIZED);
        let vault = borrow_global<Vault>(vault_addr);
        if (table::contains(&vault.user_locked_balance, user)) {
            *table::borrow(&vault.user_locked_balance, user)
        } else {
            0
        }
    }

    #[view]
    public fun get_user_total_balance(vault_addr: address, user: address): u64 acquires Vault {
        assert!(exists<Vault>(vault_addr), E_VAULT_NOT_INITIALIZED);
        let vault = borrow_global<Vault>(vault_addr);
        let available = if (table::contains(&vault.user_available_balance, user)) {
            *table::borrow(&vault.user_available_balance, user)
        } else {
            0
        };
        let locked = if (table::contains(&vault.user_locked_balance, user)) {
            *table::borrow(&vault.user_locked_balance, user)
        } else {
            0
        };
        available + locked
    }
}

