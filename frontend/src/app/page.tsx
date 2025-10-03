"use client";

import { useState } from "react";
import { HeroSection } from "@/components/hero-section";
import { Navbar } from "@/components/navbar";
import { OrderBook } from "@/components/order-book";
import { OrderForm } from "@/components/order-form";
import { VaultDashboard } from "@/components/vault-dashboard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Vault } from "lucide-react";

export default function Home() {
  const [showApp, setShowApp] = useState(false);
  const [activeTab, setActiveTab] = useState("trade");

  const handleLaunchApp = () => {
    console.log("Launch button clicked - showing app");
    setShowApp(true);
  };

  if (!showApp) {
    return <HeroSection onLaunchApp={handleLaunchApp} />;
  }

  return (
    <main className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-6 py-6">
        <div className="mb-6">
          <div className="flex items-baseline gap-3 mb-1.5">
            <h1 className="text-3xl font-bold tracking-tight">APT/USDC</h1>
            <span className="text-sm text-muted-foreground">Market</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Gasless limit orders • Automated copy-trading vaults
          </p>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="space-y-5"
        >
          <TabsList className="grid w-full max-w-[340px] grid-cols-2 h-9">
            <TabsTrigger value="trade" className="text-sm">
              <TrendingUp className="w-3.5 h-3.5 mr-1.5" />
              Trading
            </TabsTrigger>
            <TabsTrigger value="vault" className="text-sm">
              <Vault className="w-3.5 h-3.5 mr-1.5" />
              Vaults
            </TabsTrigger>
          </TabsList>

          <TabsContent value="trade" className="space-y-5 mt-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2">
                <OrderBook />
              </div>
              <div>
                <OrderForm />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="vault" className="mt-5">
            <VaultDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
