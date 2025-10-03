"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@aptos-labs/wallet-adapter-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TrendingUp, Wallet as WalletIcon, Users, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { executeGaslessPayment } from "@/lib/gasless";

export function VaultDashboard() {
  const { account, connected, signMessage, signAndSubmitTransaction } =
    useWallet();
  const { toast } = useToast();
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawShares, setWithdrawShares] = useState("");
  const [userShares, setUserShares] = useState(0);
  const [vaultInfo, setVaultInfo] = useState({
    totalDeposits: 0,
    totalShares: 0,
    referenceTrader: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (connected && account) {
      fetchVaultData();
    }
  }, [connected, account]);

  const fetchVaultData = async () => {
    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

      // Fetch vault info
      const vaultResponse = await fetch(`${backendUrl}/api/vault/info`);
      if (vaultResponse.ok) {
        const data = await vaultResponse.json();
        setVaultInfo({
          totalDeposits: Number(data.totalDeposits) || 0,
          totalShares: Number(data.totalShares) || 0,
          referenceTrader: data.referenceTrader || "",
        });
      }

      // Fetch user shares
      const sharesResponse = await fetch(
        `${backendUrl}/api/vault/shares/${account?.address}`
      );
      if (sharesResponse.ok) {
        const data = await sharesResponse.json();
        setUserShares(Number(data.shares) || 0);
      }
    } catch (error) {
      console.error("Error fetching vault data:", error);
    }
  };

  const handleDeposit = async () => {
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      toast({
        title: "Invalid Amount",
        description: "Please enter a valid amount",
        variant: "destructive",
      });
      return;
    }

    if (!account || !connected) {
      toast({
        title: "Wallet Not Connected",
        description: "Please connect your wallet",
        variant: "destructive",
      });
      return;
    }

    if (!signMessage) {
      toast({
        title: "Wallet Error",
        description: "Your wallet doesn't support message signing",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

      toast({
        title: "🔏 Sign Message",
        description: "Please sign the authorization message (no gas required!)",
      });

      // Wrap the wallet's signMessage to match the expected type
      const signMessageAdapter = async (message: {
        message: string;
        nonce: string;
      }) => {
        const response = await signMessage({
          message: message.message,
          nonce: message.nonce,
        });

        // Extract signature from the response
        let signature: string;
        if (typeof response.signature === "string") {
          signature = response.signature;
        } else if (Array.isArray(response.signature)) {
          signature = Buffer.from(response.signature as any).toString("hex");
        } else {
          // Handle Signature object
          signature = String(response.signature);
        }

        return { signature };
      };

      // Execute gasless payment - user only signs a message!
      const result = await executeGaslessPayment(
        backendUrl,
        account.address,
        account.publicKey?.toString() || "",
        Math.floor(parseFloat(depositAmount) * 100000000), // Convert to octas
        signMessageAdapter,
        "/api/vault/deposit-intent",
        "/api/vault/deposit"
      );

      toast({
        title: "✅ Deposit Successful!",
        description: `You paid NO gas! Transaction: ${result.transactionHash.slice(
          0,
          8
        )}...`,
      });

      setDepositAmount("");
      await fetchVaultData();
    } catch (error: any) {
      console.error("Error depositing:", error);

      // Check if it's a nonce store initialization error
      if (
        error.message &&
        error.message.includes("E_NONCE_STORE_NOT_INITIALIZED")
      ) {
        // Auto-initialize for the user
        if (signAndSubmitTransaction && account) {
          try {
            toast({
              title: "🔐 First-Time Setup",
              description:
                "Initializing your account for gasless transactions (one-time fee ~$0.001)...",
            });

            await signAndSubmitTransaction({
              sender: account.address,
              data: {
                function: `${process.env.NEXT_PUBLIC_MODULE_ADDRESS}::payment_with_auth::initialize_nonce_store`,
                functionArguments: [],
              },
            });

            toast({
              title: "✅ Account Initialized!",
              description:
                "You can now make gasless deposits! Please try your deposit again.",
            });

            return; // Don't show error, initialization succeeded
          } catch (initError: any) {
            console.error("Initialization error:", initError);
            toast({
              title: "Initialization Failed",
              description: "Please try again or contact support.",
              variant: "destructive",
            });
            return;
          }
        }
      }

      toast({
        title: "Deposit Failed",
        description: error.message || "Failed to deposit",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawShares || parseFloat(withdrawShares) <= 0) return;

    setLoading(true);
    try {
      const backendUrl =
        process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
      const response = await fetch(`${backendUrl}/api/vault/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress: account?.address,
          shares: parseFloat(withdrawShares),
        }),
      });

      if (response.ok) {
        setWithdrawShares("");
        await fetchVaultData();
      }
    } catch (error) {
      console.error("Error withdrawing:", error);
    } finally {
      setLoading(false);
    }
  };

  const shareValue =
    vaultInfo.totalShares > 0
      ? vaultInfo.totalDeposits / vaultInfo.totalShares
      : 1;

  const userValue = Number(userShares) * shareValue;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Vault Stats */}
      <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-muted/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              TVL
            </CardTitle>
            <WalletIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {(vaultInfo.totalDeposits / 100000000).toFixed(4)} APT
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {vaultInfo.totalShares.toLocaleString()} shares issued
            </p>
          </CardContent>
        </Card>

        <Card className="border-muted/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Your Position
            </CardTitle>
            <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {(userValue / 100000000).toFixed(4)} APT
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {Number(userShares).toLocaleString()} shares
            </p>
          </CardContent>
        </Card>

        <Card className="border-muted/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Share Price
            </CardTitle>
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              ${shareValue.toFixed(4)}
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              Last 24h: <span className="text-green-500">+0.00%</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Deposit Card */}
      <Card className="border-muted/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Deposit</CardTitle>
          <CardDescription className="text-xs">
            Add USDC to earn from copy-trading
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3.5">
          <div className="space-y-1.5">
            <Label
              htmlFor="deposit-amount"
              className="text-xs text-muted-foreground uppercase tracking-wider"
            >
              Amount
            </Label>
            <div className="relative">
              <Input
                id="deposit-amount"
                type="number"
                placeholder="1000"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                step="0.01"
                className="font-mono pr-14"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                USDC
              </span>
            </div>
          </div>
          <div className="p-2.5 bg-muted/50 rounded border">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">You'll receive</span>
              <span className="font-mono font-medium">
                {depositAmount
                  ? (parseFloat(depositAmount) / shareValue).toFixed(2)
                  : "0.00"}{" "}
                shares
              </span>
            </div>
          </div>
          <Button
            className="w-full text-sm h-9"
            onClick={handleDeposit}
            disabled={loading || !connected || !depositAmount}
          >
            {loading ? (
              "Processing..."
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 mr-1.5" />
                Deposit (No Gas!)
              </>
            )}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            ⚡ Gasless deposit - you only sign a message!
          </p>
        </CardContent>
      </Card>

      {/* Withdraw Card */}
      <Card className="border-muted/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Withdraw</CardTitle>
          <CardDescription className="text-xs">
            Redeem shares for USDC
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3.5">
          <div className="space-y-1.5">
            <Label
              htmlFor="withdraw-shares"
              className="text-xs text-muted-foreground uppercase tracking-wider"
            >
              Shares to Redeem
            </Label>
            <Input
              id="withdraw-shares"
              type="number"
              placeholder="0.00"
              value={withdrawShares}
              onChange={(e) => setWithdrawShares(e.target.value)}
              step="0.01"
              className="font-mono"
            />
            <div className="text-[10px] text-muted-foreground">
              You own {Number(userShares).toFixed(2)} shares
            </div>
          </div>
          <div className="p-2.5 bg-muted/50 rounded border">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">You'll receive</span>
              <span className="font-mono font-medium">
                {withdrawShares
                  ? (parseFloat(withdrawShares) * shareValue).toFixed(2)
                  : "0.00"}{" "}
                <span className="text-muted-foreground">USDC</span>
              </span>
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full text-sm h-9"
            onClick={handleWithdraw}
            disabled={loading || !connected || !withdrawShares}
          >
            {loading ? "Withdrawing..." : "Withdraw"}
          </Button>
        </CardContent>
      </Card>

      {/* Strategy Info */}
      <Card className="border-muted/40">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Strategy</CardTitle>
          <CardDescription className="text-xs">
            Vault configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3.5">
          <div className="space-y-3">
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                Reference Trader
              </div>
              <div className="text-xs font-mono bg-muted/50 p-2 rounded border">
                {vaultInfo.referenceTrader
                  ? `${vaultInfo.referenceTrader.slice(
                      0,
                      8
                    )}...${vaultInfo.referenceTrader.slice(-6)}`
                  : "Not configured"}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Strategy
                </div>
                <div className="text-xs font-medium">Copy Trading</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                  Performance Fee
                </div>
                <div className="text-xs font-medium">10%</div>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5">
                Status
              </div>
              <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-500/10 rounded text-xs font-medium text-green-600 dark:text-green-400">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                Active
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {!connected && (
        <Card className="lg:col-span-3 border-muted/40">
          <CardContent className="py-6">
            <div className="text-center text-sm text-muted-foreground">
              Connect wallet to manage vault positions
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
