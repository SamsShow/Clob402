"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { AccountAddress } from "@aptos-labs/ts-sdk";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

// Helper function to construct BCS authorization message matching Move contract
function constructBCSAuthMessage(
  sender: string,
  recipient: string,
  amount: number,
  nonce: number,
  expiry: number
): Uint8Array {
  const encoder = new TextEncoder();

  // Domain separator
  const domainSeparator = encoder.encode("APTOS_PAYMENT_AUTH");

  // Serialize parameters using BCS format (little-endian for numbers)
  const senderBytes = AccountAddress.from(sender).toUint8Array();
  const recipientBytes = AccountAddress.from(recipient).toUint8Array();

  const amountBytes = new Uint8Array(8);
  new DataView(amountBytes.buffer).setBigUint64(0, BigInt(amount), true);

  const nonceBytes = new Uint8Array(8);
  new DataView(nonceBytes.buffer).setBigUint64(0, BigInt(nonce), true);

  const expiryBytes = new Uint8Array(8);
  new DataView(expiryBytes.buffer).setBigUint64(0, BigInt(expiry), true);

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

export function OrderForm() {
  const { account, connected, signMessage, signAndSubmitTransaction } =
    useWallet();
  const { toast } = useToast();

  const [buyPrice, setBuyPrice] = useState("");
  const [buyQuantity, setBuyQuantity] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellQuantity, setSellQuantity] = useState("");
  const [loading, setLoading] = useState(false);
  const [nonceStoreInitialized, setNonceStoreInitialized] = useState(false);

  // Check if nonce store is initialized
  useEffect(() => {
    const checkNonceStore = async () => {
      if (!connected || !account) return;

      try {
        const moduleAddress = process.env.NEXT_PUBLIC_MODULE_ADDRESS;
        const response = await fetch(
          `https://api.testnet.aptoslabs.com/v1/accounts/${
            account.address
          }/resource/0x${moduleAddress?.replace(
            "0x",
            ""
          )}::payment_with_auth::NonceStore`
        );
        setNonceStoreInitialized(response.ok);
      } catch {
        setNonceStoreInitialized(false);
      }
    };

    checkNonceStore();
  }, [connected, account]);

  const initializeNonceStore = async () => {
    if (!connected) return;

    setLoading(true);
    try {
      const moduleAddress = process.env.NEXT_PUBLIC_MODULE_ADDRESS;

      const response = await signAndSubmitTransaction({
        sender: account.address,
        data: {
          function: `${moduleAddress}::payment_with_auth::initialize_nonce_store`,
          functionArguments: [],
        },
      });

      toast({
        title: "Initialization successful!",
        description: "Your account is now ready to place orders",
      });

      setNonceStoreInitialized(true);
    } catch (error: any) {
      console.error("Error initializing nonce store:", error);
      toast({
        title: "Initialization failed",
        description: error.message || "Failed to initialize account",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePlaceOrder = async (side: "buy" | "sell") => {
    if (!connected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to place orders",
        variant: "destructive",
      });
      return;
    }

    const price = side === "buy" ? buyPrice : sellPrice;
    const quantity = side === "buy" ? buyQuantity : sellQuantity;

    if (!price || !quantity) {
      toast({
        title: "Invalid input",
        description: "Please enter both price and quantity",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      // Step 1: Request payment intent (HTTP 402)
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
      const intentResponse = await fetch(
        `${backendUrl}/api/auth/request-intent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sender: account?.address,
            recipient: process.env.NEXT_PUBLIC_MODULE_ADDRESS,
            amount: parseFloat(price) * parseFloat(quantity),
          }),
        }
      );

      if (intentResponse.status !== 402) {
        throw new Error("Failed to get payment intent");
      }

      const intentData = await intentResponse.json();
      const { intent } = intentData;

      // Step 2: Sign the payment authorization
      // Construct BCS message matching Move contract's verification format
      const bcsMessage = constructBCSAuthMessage(
        intent.sender,
        intent.recipient,
        intent.amount,
        intent.nonce,
        intent.expiry
      );

      // Convert to hex string for wallet display
      const messageHex = Array.from(bcsMessage)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const signedMessage = await signMessage({
        message: messageHex,
        nonce: intent.nonce.toString(),
      });

      console.log("Signed message result:", signedMessage);
      console.log("Account public key:", account?.publicKey);
      console.log("Signature type:", typeof signedMessage.signature);
      console.log("Signature object:", signedMessage.signature);

      // Extract signature from various possible formats
      let signatureHex: string;
      const sig = signedMessage.signature;

      if (typeof sig === "string") {
        signatureHex = sig;
      } else if (sig && typeof sig === "object") {
        // Try different methods to extract the signature
        if ("toString" in sig && typeof sig.toString === "function") {
          const sigStr = sig.toString();
          // Check if toString returns a hex string
          if (sigStr.startsWith("0x") || /^[0-9a-fA-F]+$/.test(sigStr)) {
            signatureHex = sigStr;
          } else {
            throw new Error("Signature toString() did not return a hex string");
          }
        } else if (
          "toHexString" in sig &&
          typeof (sig as any).toHexString === "function"
        ) {
          signatureHex = (sig as any).toHexString();
        } else if (
          "toBytes" in sig &&
          typeof (sig as any).toBytes === "function"
        ) {
          const bytes = (sig as any).toBytes();
          signatureHex = Array.from(bytes as Uint8Array)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        } else if (sig instanceof Uint8Array) {
          signatureHex = Array.from(sig)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        } else {
          throw new Error(
            `Unable to extract signature. Type: ${typeof sig}, Constructor: ${
              sig.constructor?.name
            }`
          );
        }
      } else {
        throw new Error(`Unknown signature format: ${typeof sig}`);
      }

      // Remove 0x prefix if present
      if (signatureHex.startsWith("0x")) {
        signatureHex = signatureHex.slice(2);
      }

      console.log("Extracted signature hex:", signatureHex);

      let publicKeyHex = account?.publicKey as string;
      if (typeof publicKeyHex !== "string") {
        // Convert to hex if needed
        publicKeyHex = Array.from(publicKeyHex as Uint8Array)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }
      // Remove 0x prefix if present
      if (publicKeyHex.startsWith("0x")) {
        publicKeyHex = publicKeyHex.slice(2);
      }

      // Step 3: Submit signed authorization
      const authPayload = {
        sender: intent.sender,
        recipient: intent.recipient,
        amount: intent.amount,
        nonce: intent.nonce,
        expiry: intent.expiry,
        signature: signatureHex,
        publicKey: publicKeyHex,
      };

      console.log("Submitting authorization with payload:", authPayload);

      const authResponse = await fetch(
        `${backendUrl}/api/auth/submit-authorization`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(authPayload),
        }
      );

      if (!authResponse.ok) {
        const errorData = await authResponse
          .json()
          .catch(() => ({ error: "Unknown error" }));
        console.error("Authorization failed:", errorData);
        throw new Error(
          errorData.error ||
            errorData.message ||
            "Failed to submit authorization"
        );
      }

      const authResult = await authResponse.json();

      // Step 4: Place order
      const orderResponse = await fetch(`${backendUrl}/api/orders/place`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: account?.address,
          price: parseFloat(price),
          quantity: parseFloat(quantity),
          side: side === "buy" ? 0 : 1,
        }),
      });

      if (!orderResponse.ok) {
        throw new Error("Failed to place order");
      }

      const orderResult = await orderResponse.json();

      toast({
        title: "Order placed successfully!",
        description: `${side.toUpperCase()} ${quantity} @ $${price}`,
      });

      // Reset form
      if (side === "buy") {
        setBuyPrice("");
        setBuyQuantity("");
      } else {
        setSellPrice("");
        setSellQuantity("");
      }
    } catch (error: any) {
      console.error("Error placing order:", error);
      toast({
        title: "Order failed",
        description: error.message || "Failed to place order",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-muted/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">New Order</CardTitle>
      </CardHeader>
      <CardContent>
        {connected && !nonceStoreInitialized && (
          <div className="mb-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <h3 className="font-semibold text-yellow-900 dark:text-yellow-100 mb-2 text-sm">
              Account Setup Required
            </h3>
            <p className="text-xs text-yellow-800 dark:text-yellow-200 mb-3">
              Initialize your account for payment authorization (one-time
              setup).
            </p>
            <Button
              onClick={initializeNonceStore}
              disabled={loading}
              size="sm"
              className="w-full"
            >
              {loading ? "Initializing..." : "Initialize Account"}
            </Button>
          </div>
        )}

        <Tabs defaultValue="buy" className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="buy" className="text-sm">
              Buy APT
            </TabsTrigger>
            <TabsTrigger value="sell" className="text-sm">
              Sell APT
            </TabsTrigger>
          </TabsList>

          <TabsContent value="buy" className="space-y-3.5 mt-0">
            <div className="space-y-1.5">
              <Label
                htmlFor="buy-price"
                className="text-xs text-muted-foreground uppercase tracking-wider"
              >
                Limit Price
              </Label>
              <div className="relative">
                <Input
                  id="buy-price"
                  type="number"
                  placeholder="10.50"
                  value={buyPrice}
                  onChange={(e) => setBuyPrice(e.target.value)}
                  step="0.01"
                  className="font-mono pr-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  USDC
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="buy-quantity"
                className="text-xs text-muted-foreground uppercase tracking-wider"
              >
                Amount
              </Label>
              <div className="relative">
                <Input
                  id="buy-quantity"
                  type="number"
                  placeholder="100"
                  value={buyQuantity}
                  onChange={(e) => setBuyQuantity(e.target.value)}
                  step="0.01"
                  className="font-mono pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  APT
                </span>
              </div>
            </div>
            <div className="p-2.5 bg-muted/50 rounded border">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total cost</span>
                <span className="font-mono font-medium">
                  {(
                    (parseFloat(buyPrice) || 0) * (parseFloat(buyQuantity) || 0)
                  ).toFixed(2)}{" "}
                  <span className="text-muted-foreground">USDC</span>
                </span>
              </div>
            </div>
            <Button
              className="w-full bg-green-600 hover:bg-green-700 text-sm h-9"
              onClick={() => handlePlaceOrder("buy")}
              disabled={loading || !connected}
            >
              {loading ? "Placing..." : "Buy APT"}
            </Button>
          </TabsContent>

          <TabsContent value="sell" className="space-y-3.5 mt-0">
            <div className="space-y-1.5">
              <Label
                htmlFor="sell-price"
                className="text-xs text-muted-foreground uppercase tracking-wider"
              >
                Limit Price
              </Label>
              <div className="relative">
                <Input
                  id="sell-price"
                  type="number"
                  placeholder="10.50"
                  value={sellPrice}
                  onChange={(e) => setSellPrice(e.target.value)}
                  step="0.01"
                  className="font-mono pr-14"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  USDC
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="sell-quantity"
                className="text-xs text-muted-foreground uppercase tracking-wider"
              >
                Amount
              </Label>
              <div className="relative">
                <Input
                  id="sell-quantity"
                  type="number"
                  placeholder="100"
                  value={sellQuantity}
                  onChange={(e) => setSellQuantity(e.target.value)}
                  step="0.01"
                  className="font-mono pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  APT
                </span>
              </div>
            </div>
            <div className="p-2.5 bg-muted/50 rounded border">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total receive</span>
                <span className="font-mono font-medium">
                  {(
                    (parseFloat(sellPrice) || 0) *
                    (parseFloat(sellQuantity) || 0)
                  ).toFixed(2)}{" "}
                  <span className="text-muted-foreground">USDC</span>
                </span>
              </div>
            </div>
            <Button
              className="w-full text-sm h-9"
              variant="destructive"
              onClick={() => handlePlaceOrder("sell")}
              disabled={loading || !connected}
            >
              {loading ? "Placing..." : "Sell APT"}
            </Button>
          </TabsContent>
        </Tabs>

        {!connected && (
          <div className="mt-4 p-2.5 bg-muted/50 rounded border text-xs text-center text-muted-foreground">
            Connect wallet to trade
          </div>
        )}
      </CardContent>
    </Card>
  );
}
