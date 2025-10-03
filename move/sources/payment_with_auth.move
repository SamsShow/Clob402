module clob_strategy_vault::payment_with_auth {
    use std::signer;
    use std::vector;
    use std::bcs;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::timestamp;
    use aptos_framework::account;
    use aptos_framework::event;
    use aptos_std::table::{Self, Table};
    use aptos_std::ed25519;

    /// Error codes
    const E_NONCE_ALREADY_USED: u64 = 1;
    const E_AUTHORIZATION_EXPIRED: u64 = 2;
    const E_INVALID_SIGNATURE: u64 = 3;
    const E_NONCE_STORE_NOT_INITIALIZED: u64 = 4;
    const E_INSUFFICIENT_BALANCE: u64 = 5;

    /// Stores used nonces for each user to prevent replay attacks
    struct NonceStore has key {
        used_nonces: Table<u64, bool>,
    }

    /// Event emitted when a payment authorization is executed
    #[event]
    struct PaymentExecutedEvent has drop, store {
        sender: address,
        recipient: address,
        amount: u64,
        nonce: u64,
        timestamp: u64,
    }

    /// Initialize nonce store for a user
    public entry fun initialize_nonce_store(account: &signer) {
        let addr = signer::address_of(account);
        if (!exists<NonceStore>(addr)) {
            move_to(account, NonceStore {
                used_nonces: table::new(),
            });
        };
    }

    /// Transfer tokens with authorization
    /// This function verifies the signature and executes the transfer atomically
    public entry fun transfer_with_authorization<CoinType>(
        facilitator: &signer,
        sender: address,
        recipient: address,
        amount: u64,
        nonce: u64,
        expiry: u64,
        signature: vector<u8>,
        public_key: vector<u8>
    ) acquires NonceStore {
        // Verify expiry
        let current_time = timestamp::now_seconds();
        assert!(current_time <= expiry, E_AUTHORIZATION_EXPIRED);

        // Check if nonce store exists for sender
        assert!(exists<NonceStore>(sender), E_NONCE_STORE_NOT_INITIALIZED);

        // Check nonce replay
        let nonce_store = borrow_global_mut<NonceStore>(sender);
        assert!(!table::contains(&nonce_store.used_nonces, nonce), E_NONCE_ALREADY_USED);

        // Construct message for signature verification
        let message = construct_authorization_message(sender, recipient, amount, nonce, expiry);
        
        // Verify signature
        let public_key_obj = ed25519::new_unvalidated_public_key_from_bytes(public_key);
        let signature_obj = ed25519::new_signature_from_bytes(signature);
        let valid = ed25519::signature_verify_strict(&signature_obj, &public_key_obj, message);
        assert!(valid, E_INVALID_SIGNATURE);

        // Mark nonce as used
        table::add(&mut nonce_store.used_nonces, nonce, true);

        // Execute transfer
        coin::transfer<CoinType>(facilitator, recipient, amount);

        // Emit event
        event::emit(PaymentExecutedEvent {
            sender,
            recipient,
            amount,
            nonce,
            timestamp: current_time,
        });
    }

    /// Construct authorization message for signing
    /// EXACT format that Aptos wallet uses when signing messages
    fun construct_authorization_message(
        sender: address,
        recipient: address,
        amount: u64,
        nonce: u64,
        expiry: u64
    ): vector<u8> {
        // Build the inner message first (what we want to sign)
        let inner_message = address_to_string(sender);
        vector::append(&mut inner_message, b":");
        vector::append(&mut inner_message, address_to_string(recipient));
        vector::append(&mut inner_message, b":");
        vector::append(&mut inner_message, u64_to_string(amount));
        vector::append(&mut inner_message, b":");
        vector::append(&mut inner_message, u64_to_string(nonce));
        vector::append(&mut inner_message, b":");
        vector::append(&mut inner_message, u64_to_string(expiry));
        
        // Aptos wallet wraps it with:
        // APTOS\nmessage: {inner_message}\nnonce: {nonce}
        let full_message = b"APTOS\nmessage: ";
        vector::append(&mut full_message, inner_message);
        vector::append(&mut full_message, b"\nnonce: ");
        vector::append(&mut full_message, u64_to_string(nonce));
        
        full_message
    }
    
    /// Convert address to hex string
    fun address_to_string(addr: address): vector<u8> {
        let addr_bytes = bcs::to_bytes(&addr);
        let result = b"0x";
        vector::append(&mut result, to_hex_string(&addr_bytes));
        result
    }
    
    /// Convert u64 to string
    fun u64_to_string(value: u64): vector<u8> {
        if (value == 0) {
            return b"0"
        };
        
        let result = vector::empty<u8>();
        let temp = value;
        
        while (temp > 0) {
            let digit = ((temp % 10) as u8) + 48; // ASCII '0' = 48
            vector::push_back(&mut result, digit);
            temp = temp / 10;
        };
        
        vector::reverse(&mut result);
        result
    }
    
    /// OLD CODE - keeping for reference but not used
    fun construct_authorization_message_old(
        sender: address,
        recipient: address,
        amount: u64,
        nonce: u64,
        expiry: u64
    ): vector<u8> {
        let message = vector::empty<u8>();
        
        // First, construct the BCS message part
        let bcs_message = vector::empty<u8>();
        vector::append(&mut bcs_message, b"APTOS_PAYMENT_AUTH");
        vector::append(&mut bcs_message, bcs::to_bytes(&sender));
        vector::append(&mut bcs_message, bcs::to_bytes(&recipient));
        vector::append(&mut bcs_message, bcs::to_bytes(&amount));
        vector::append(&mut bcs_message, bcs::to_bytes(&nonce));
        vector::append(&mut bcs_message, bcs::to_bytes(&expiry));
        
        // Convert BCS message to hex string (as the wallet does)
        let hex_message = to_hex_string(&bcs_message);
        
        // Wallet wraps with: "APTOS\nmessage: {hex}\nnonce: {nonce_string}"
        vector::append(&mut message, b"APTOS\nmessage: ");
        vector::append(&mut message, hex_message);
        vector::append(&mut message, b"\nnonce: ");
        vector::append(&mut message, to_string_u64(nonce));
        
        message
    }
    
    /// Convert bytes to hex string
    fun to_hex_string(bytes: &vector<u8>): vector<u8> {
        let hex_chars = b"0123456789abcdef";
        let result = vector::empty<u8>();
        let len = vector::length(bytes);
        let i = 0;
        
        while (i < len) {
            let byte = *vector::borrow(bytes, i);
            let high = byte / 16;
            let low = byte % 16;
            vector::push_back(&mut result, *vector::borrow(&hex_chars, (high as u64)));
            vector::push_back(&mut result, *vector::borrow(&hex_chars, (low as u64)));
            i = i + 1;
        };
        
        result
    }
    
    /// Convert u64 to string
    fun to_string_u64(value: u64): vector<u8> {
        if (value == 0) {
            return b"0"
        };
        
        let result = vector::empty<u8>();
        let temp = value;
        
        while (temp > 0) {
            let digit = ((temp % 10) as u8);
            vector::push_back(&mut result, digit + 48); // 48 is ASCII '0'
            temp = temp / 10;
        };
        
        // Reverse the result
        vector::reverse(&mut result);
        result
    }

    /// Check if a nonce has been used
    #[view]
    public fun is_nonce_used(user: address, nonce: u64): bool acquires NonceStore {
        if (!exists<NonceStore>(user)) {
            return false
        };
        
        let nonce_store = borrow_global<NonceStore>(user);
        table::contains(&nonce_store.used_nonces, nonce)
    }
}

