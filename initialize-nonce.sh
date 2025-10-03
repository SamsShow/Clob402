#!/bin/bash

# Initialize Nonce Store for User
# This is a one-time setup per wallet address

echo "🔐 Initializing Nonce Store"
echo "==========================="
echo ""

USER_ADDRESS="$1"

if [ -z "$USER_ADDRESS" ]; then
  echo "❌ Error: User address required"
  echo ""
  echo "Usage: ./initialize-nonce.sh YOUR_WALLET_ADDRESS"
  echo ""
  echo "Example:"
  echo "  ./initialize-nonce.sh 0x9840325ffef7ffc5de961625fd9909d916eecd4fa515ddb2fdf4b38f47f5b083"
  echo ""
  exit 1
fi

echo "User Address: $USER_ADDRESS"
echo "Module: 0xa4d7e1f47887dc6b84743297164fdd63deaa872329f8617be1d4c87375d39323::payment_with_auth"
echo ""

# Check if user has any APT
echo "📊 Checking balance..."
BALANCE=$(aptos account list --account $USER_ADDRESS 2>/dev/null | grep -A 1 "0x1::aptos_coin::AptosCoin" | tail -1 | grep -o '"[0-9]*"' | tr -d '"')

if [ -z "$BALANCE" ]; then
  echo "⚠️  Warning: Could not verify balance"
  echo "   Make sure address has at least 0.01 APT for initialization"
else
  echo "✅ Balance: $((BALANCE / 100000000)) APT"
fi

echo ""
echo "🚀 Initializing nonce store..."
echo "   This is a one-time setup per wallet"
echo "   You'll need to approve the transaction in your wallet"
echo ""

# Run the initialization
cd /Users/samshow/Desktop/Clob402

aptos move run \
  --function-id 0xa4d7e1f47887dc6b84743297164fdd63deaa872329f8617be1d4c87375d39323::payment_with_auth::initialize_nonce_store \
  --assume-yes

if [ $? -eq 0 ]; then
  echo ""
  echo "✅ Nonce store initialized successfully!"
  echo ""
  echo "🎉 You can now:"
  echo "   1. Make gasless deposits"
  echo "   2. Place gasless orders"
  echo "   3. Trade with ZERO gas fees!"
  echo ""
else
  echo ""
  echo "❌ Initialization failed"
  echo ""
  echo "Possible reasons:"
  echo "   - Nonce store already initialized (this is OK!)"
  echo "   - Insufficient balance"
  echo "   - Wrong network"
  echo ""
  echo "Try testing deposit again - it might work!"
fi

