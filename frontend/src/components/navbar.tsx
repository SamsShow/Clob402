"use client";

import { useWallet } from "@aptos-labs/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/mode-toggle";
import { Wallet, LogOut } from "lucide-react";
import Image from "next/image";

export function Navbar() {
  const { connect, disconnect, account, connected } = useWallet();

  const handleConnect = async () => {
    try {
      await connect("Petra" as any);
    } catch (error) {
      console.error("Failed to connect wallet:", error);
    }
  };

  return (
    <nav className="border-b backdrop-blur-sm bg-background/95">
      <div className="container mx-auto px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 relative">
              <Image
                src="/Group.svg"
                alt="Clob402"
                width={32}
                height={32}
                className="logo-light logo-dark transition-all duration-200"
              />
            </div>
            <div className="flex flex-col -space-y-1">
              <span className="text-xl font-bold tracking-tight">Clob402</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                x402 Protocol
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <ModeToggle />

            {connected && account ? (
              <div className="flex items-center gap-2">
                <div className="px-3 py-1.5 rounded-md bg-muted/60 text-xs font-mono border">
                  {account.address.slice(0, 6)}...{account.address.slice(-4)}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={disconnect}
                  className="text-xs"
                >
                  <LogOut className="w-3.5 h-3.5 mr-1.5" />
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button onClick={handleConnect} size="sm">
                <Wallet className="w-4 h-4 mr-2" />
                Connect
              </Button>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
