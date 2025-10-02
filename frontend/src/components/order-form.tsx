"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

export function OrderForm() {
  const { account, connected, signAndSubmitTransaction } = useWallet();
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
      const moduleAddress = process.env.NEXT_PUBLIC_MODULE_ADDRESS;
      const orderBookAddress =
        process.env.NEXT_PUBLIC_ORDER_BOOK_ADDRESS || moduleAddress;

      // Place order directly - user signs the transaction
      const response = await signAndSubmitTransaction({
        sender: account.address,
        data: {
          function: `${moduleAddress}::order_book::place_order`,
          functionArguments: [orderBookAddress, priceNum, qtyNum, sideNum],
        },
      });

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
