"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface OrderIntent {
  userAddress: string;
  orderBookAddress: string;
  price: number;
  quantity: number;
  side: number;
  nonce: number;
  expiry: number;
  network: string;
}

export function OrderForm() {
  const { account, connected, signMessage } = useWallet();
  const { toast } = useToast();

  const [buyPrice, setBuyPrice] = useState("");
  const [buyQuantity, setBuyQuantity] = useState("");
  const [sellPrice, setSellPrice] = useState("");
  const [sellQuantity, setSellQuantity] = useState("");
  const [loading, setLoading] = useState(false);
  const [vaultBalance, setVaultBalance] = useState({
    available: 0,
    locked: 0,
    total: 0,
  });

  // Fetch vault balance
  useEffect(() => {
    const fetchVaultBalance = async () => {
      if (!connected || !account) return;

      try {
        const backendUrl =
          process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
        const vaultAddress = process.env.NEXT_PUBLIC_MODULE_ADDRESS;

        const response = await fetch(
          `https://api.testnet.aptoslabs.com/v1/view`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              function: `${vaultAddress}::strategy_vault::get_user_available_balance`,
              type_arguments: [],
              arguments: [vaultAddress, account.address],
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          const available = Number(data[0] || 0);

          const lockedResponse = await fetch(
            `https://api.testnet.aptoslabs.com/v1/view`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                function: `${vaultAddress}::strategy_vault::get_user_locked_balance`,
                type_arguments: [],
                arguments: [vaultAddress, account.address],
              }),
            }
          );

          const lockedData = await lockedResponse.json();
          const locked = Number(lockedData[0] || 0);

          setVaultBalance({
            available,
            locked,
            total: available + locked,
          });
        }
      } catch (error) {
        console.error("Error fetching vault balance:", error);
      }
    };

    fetchVaultBalance();
    const interval = setInterval(fetchVaultBalance, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, [connected, account]);

  const handlePlaceOrder = async (side: "buy" | "sell") => {
    if (!connected || !account) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet to place orders",
        variant: "destructive",
      });
      return;
    }

    if (!signMessage) {
      toast({
        title: "Wallet not supported",
        description:
          "Your wallet doesn't support message signing. Please use Petra or Martian wallet.",
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

    const priceNum = parseFloat(price);
    const qtyNum = parseFloat(quantity);
    const sideNum = side === "buy" ? 0 : 1;

    // Check vault balance
    const requiredAmount = sideNum === 0 ? priceNum * qtyNum : qtyNum;
    if (vaultBalance.available < requiredAmount) {
      toast({
        title: "Insufficient vault balance",
        description: `Required: ${requiredAmount}, Available: ${vaultBalance.available}. Please deposit funds first.`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

      // Step 1: Request order intent from backend
      const intentResponse = await fetch(
        `${backendUrl}/api/orders/order-intent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userAddress: account.address,
            price: priceNum,
            quantity: qtyNum,
            side: sideNum,
          }),
        }
      );

      if (!intentResponse.ok) {
        const error = await intentResponse.json();
        throw new Error(error.message || "Failed to create order intent");
      }

      const intentData = await intentResponse.json();
      const intent: OrderIntent = intentData.intent;
      const messageToSign = intentData.messageToSign;

      // Step 2: User signs the message (NOT a transaction!)
      toast({
        title: "🔏 Sign Message",
        description: "Please sign the message to place your order (no gas!)",
      });

      const { signature, fullMessage } = await signMessage({
        message: messageToSign,
        nonce: intent.nonce.toString(),
      });

      // Step 3: Submit signed authorization to backend
      const placeResponse = await fetch(`${backendUrl}/api/orders/place`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: account.address,
          price: priceNum,
          quantity: qtyNum,
          side: sideNum,
          nonce: intent.nonce,
          expiry: intent.expiry,
          signature: signature,
          publicKey: account.publicKey,
        }),
      });

      if (!placeResponse.ok) {
        const error = await placeResponse.json();
        throw new Error(error.message || "Failed to place order");
      }

      const result = await placeResponse.json();

      toast({
        title: "✅ Order Placed (No Gas!)",
        description: `${side.toUpperCase()} ${quantity} @ $${price} • You paid NO gas!`,
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
        {connected && (
          <div className="mt-2 p-2.5 bg-muted/50 rounded border">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              Vault Balance
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Available:</span>
              <span className="font-mono font-medium">
                {vaultBalance.available}
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Locked:</span>
              <span className="font-mono font-medium">
                {vaultBalance.locked}
              </span>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
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
              {loading ? "Placing..." : "Buy APT"} {!loading && "⚡"}
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
              {loading ? "Placing..." : "Sell APT"} {!loading && "⚡"}
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
