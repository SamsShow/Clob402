module clob_strategy_vault::order_book {
    use std::signer;
    use std::vector;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_std::table::{Self, Table};
    use aptos_std::smart_table::{Self, SmartTable};
    use clob_strategy_vault::strategy_vault;

    /// Error codes
    const E_ORDER_BOOK_NOT_INITIALIZED: u64 = 1;
    const E_INVALID_ORDER_ID: u64 = 2;
    const E_INVALID_PRICE: u64 = 3;
    const E_INVALID_QUANTITY: u64 = 4;
    const E_ORDER_NOT_FOUND: u64 = 5;
    const E_UNAUTHORIZED: u64 = 6;

    /// Order side
    const ORDER_SIDE_BID: u8 = 0;
    const ORDER_SIDE_ASK: u8 = 1;

    /// Order status
    const ORDER_STATUS_OPEN: u8 = 0;
    const ORDER_STATUS_FILLED: u8 = 1;
    const ORDER_STATUS_CANCELLED: u8 = 2;
    const ORDER_STATUS_PARTIALLY_FILLED: u8 = 3;

    /// Represents a limit order
    struct Order has store, drop, copy {
        order_id: u64,
        owner: address,
        price: u64,
        quantity: u64,
        filled_quantity: u64,
        side: u8,  // 0 = bid, 1 = ask
        status: u8,
        timestamp: u64,
    }

    /// Order book for a trading pair
    struct OrderBook has key {
        next_order_id: u64,
        orders: SmartTable<u64, Order>,
        user_orders: Table<address, vector<u64>>,  // user -> order_ids
        vault_address: address,  // Vault that holds user funds
    }

    /// Events
    #[event]
    struct OrderPlacedEvent has drop, store {
        order_id: u64,
        owner: address,
        price: u64,
        quantity: u64,
        side: u8,
        timestamp: u64,
    }

    #[event]
    struct OrderFilledEvent has drop, store {
        order_id: u64,
        owner: address,
        filled_quantity: u64,
        remaining_quantity: u64,
        timestamp: u64,
    }

    #[event]
    struct OrderCancelledEvent has drop, store {
        order_id: u64,
        owner: address,
        timestamp: u64,
    }

    /// Initialize order book for a trading pair
    public entry fun initialize_order_book(admin: &signer, vault_address: address) {
        let addr = signer::address_of(admin);
        if (!exists<OrderBook>(addr)) {
            move_to(admin, OrderBook {
                next_order_id: 1,
                orders: smart_table::new(),
                user_orders: table::new(),
                vault_address,
            });
        };
    }

    /// Place a limit order
    /// For BUY orders: locks (price * quantity) in vault
    /// For SELL orders: locks quantity in vault
    public entry fun place_order(
        user: &signer,
        order_book_addr: address,
        price: u64,
        quantity: u64,
        side: u8
    ) acquires OrderBook {
        assert!(exists<OrderBook>(order_book_addr), E_ORDER_BOOK_NOT_INITIALIZED);
        assert!(price > 0, E_INVALID_PRICE);
        assert!(quantity > 0, E_INVALID_QUANTITY);

        let order_book = borrow_global_mut<OrderBook>(order_book_addr);
        let owner = signer::address_of(user);
        
        // Calculate amount to lock based on order side
        let lock_amount = if (side == ORDER_SIDE_BID) {
            price * quantity  // Buy order: lock USDC (price * quantity)
        } else {
            quantity  // Sell order: lock APT (quantity)
        };

        // Lock funds in vault before creating order
        strategy_vault::lock_balance(order_book.vault_address, owner, lock_amount);

        let order_id = order_book.next_order_id;
        order_book.next_order_id = order_id + 1;

        let current_time = timestamp::now_seconds();

        let order = Order {
            order_id,
            owner,
            price,
            quantity,
            filled_quantity: 0,
            side,
            status: ORDER_STATUS_OPEN,
            timestamp: current_time,
        };

        smart_table::add(&mut order_book.orders, order_id, order);

        // Add to user's order list
        if (!table::contains(&order_book.user_orders, owner)) {
            table::add(&mut order_book.user_orders, owner, vector::empty<u64>());
        };
        let user_order_list = table::borrow_mut(&mut order_book.user_orders, owner);
        vector::push_back(user_order_list, order_id);

        event::emit(OrderPlacedEvent {
            order_id,
            owner,
            price,
            quantity,
            side,
            timestamp: current_time,
        });
    }

    /// Place an order on behalf of a user (gasless)
    /// Called by facilitator after verifying user's signed authorization
    /// User signed off-chain authorization to place this order
    public entry fun place_order_for_user(
        facilitator: &signer,
        order_book_addr: address,
        user_addr: address,
        price: u64,
        quantity: u64,
        side: u8
    ) acquires OrderBook {
        assert!(exists<OrderBook>(order_book_addr), E_ORDER_BOOK_NOT_INITIALIZED);
        assert!(price > 0, E_INVALID_PRICE);
        assert!(quantity > 0, E_INVALID_QUANTITY);

        let order_book = borrow_global_mut<OrderBook>(order_book_addr);
        
        // Calculate amount to lock based on order side
        let lock_amount = if (side == ORDER_SIDE_BID) {
            price * quantity  // Buy order: lock USDC (price * quantity)
        } else {
            quantity  // Sell order: lock APT (quantity)
        };

        // Lock user's funds in vault (facilitator calls this, but locks user's funds)
        strategy_vault::lock_balance(order_book.vault_address, user_addr, lock_amount);

        let order_id = order_book.next_order_id;
        order_book.next_order_id = order_id + 1;

        let current_time = timestamp::now_seconds();

        let order = Order {
            order_id,
            owner: user_addr,  // User is the owner, not facilitator
            price,
            quantity,
            filled_quantity: 0,
            side,
            status: ORDER_STATUS_OPEN,
            timestamp: current_time,
        };

        smart_table::add(&mut order_book.orders, order_id, order);

        // Add to user's order list
        if (!table::contains(&order_book.user_orders, user_addr)) {
            table::add(&mut order_book.user_orders, user_addr, vector::empty<u64>());
        };
        let user_order_list = table::borrow_mut(&mut order_book.user_orders, user_addr);
        vector::push_back(user_order_list, order_id);

        event::emit(OrderPlacedEvent {
            order_id,
            owner: user_addr,
            price,
            quantity,
            side,
            timestamp: current_time,
        });
    }

    /// Cancel an order
    /// Unlocks remaining funds back to user's available balance
    public entry fun cancel_order(
        user: &signer,
        order_book_addr: address,
        order_id: u64
    ) acquires OrderBook {
        assert!(exists<OrderBook>(order_book_addr), E_ORDER_BOOK_NOT_INITIALIZED);
        
        let order_book = borrow_global_mut<OrderBook>(order_book_addr);
        assert!(smart_table::contains(&order_book.orders, order_id), E_ORDER_NOT_FOUND);

        let order = smart_table::borrow_mut(&mut order_book.orders, order_id);
        let owner = signer::address_of(user);
        assert!(order.owner == owner, E_UNAUTHORIZED);
        assert!(order.status == ORDER_STATUS_OPEN || order.status == ORDER_STATUS_PARTIALLY_FILLED, E_INVALID_ORDER_ID);

        // Calculate remaining locked amount
        let remaining_quantity = order.quantity - order.filled_quantity;
        let unlock_amount = if (order.side == ORDER_SIDE_BID) {
            order.price * remaining_quantity
        } else {
            remaining_quantity
        };

        // Unlock funds in vault
        strategy_vault::unlock_balance(order_book.vault_address, owner, unlock_amount);

        order.status = ORDER_STATUS_CANCELLED;

        event::emit(OrderCancelledEvent {
            order_id,
            owner,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// Fill an order (called by matching engine)
    /// Settles funds between maker and taker through vault
    public entry fun fill_order(
        facilitator: &signer,
        order_book_addr: address,
        maker_order_id: u64,
        taker_address: address,
        fill_quantity: u64
    ) acquires OrderBook {
        assert!(exists<OrderBook>(order_book_addr), E_ORDER_BOOK_NOT_INITIALIZED);
        
        let order_book = borrow_global_mut<OrderBook>(order_book_addr);
        assert!(smart_table::contains(&order_book.orders, maker_order_id), E_ORDER_NOT_FOUND);

        let order = smart_table::borrow_mut(&mut order_book.orders, maker_order_id);
        assert!(order.status == ORDER_STATUS_OPEN || order.status == ORDER_STATUS_PARTIALLY_FILLED, E_INVALID_ORDER_ID);

        // Calculate settlement amounts
        let fill_value = order.price * fill_quantity;
        
        // Settle trade through vault
        if (order.side == ORDER_SIDE_BID) {
            // Buy order: maker pays USDC, receives APT
            strategy_vault::settle_order(order_book.vault_address, order.owner, taker_address, fill_value);  // Maker -> Taker: USDC
            strategy_vault::settle_order(order_book.vault_address, taker_address, order.owner, fill_quantity); // Taker -> Maker: APT
        } else {
            // Sell order: maker pays APT, receives USDC
            strategy_vault::settle_order(order_book.vault_address, order.owner, taker_address, fill_quantity);  // Maker -> Taker: APT
            strategy_vault::settle_order(order_book.vault_address, taker_address, order.owner, fill_value); // Taker -> Maker: USDC
        };

        order.filled_quantity = order.filled_quantity + fill_quantity;
        let remaining = order.quantity - order.filled_quantity;

        if (remaining == 0) {
            order.status = ORDER_STATUS_FILLED;
        } else {
            order.status = ORDER_STATUS_PARTIALLY_FILLED;
        };

        event::emit(OrderFilledEvent {
            order_id: maker_order_id,
            owner: order.owner,
            filled_quantity: fill_quantity,
            remaining_quantity: remaining,
            timestamp: timestamp::now_seconds(),
        });
    }

    /// View functions
    #[view]
    public fun get_order(order_book_addr: address, order_id: u64): Order acquires OrderBook {
        assert!(exists<OrderBook>(order_book_addr), E_ORDER_BOOK_NOT_INITIALIZED);
        let order_book = borrow_global<OrderBook>(order_book_addr);
        *smart_table::borrow(&order_book.orders, order_id)
    }

    #[view]
    public fun get_user_orders(order_book_addr: address, user: address): vector<u64> acquires OrderBook {
        assert!(exists<OrderBook>(order_book_addr), E_ORDER_BOOK_NOT_INITIALIZED);
        let order_book = borrow_global<OrderBook>(order_book_addr);
        if (table::contains(&order_book.user_orders, user)) {
            *table::borrow(&order_book.user_orders, user)
        } else {
            vector::empty<u64>()
        }
    }
}

