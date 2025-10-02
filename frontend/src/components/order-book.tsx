"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpIcon, ArrowDownIcon } from "lucide-react";

interface Order {
  price: number;
  quantity: number;
  total: number;
}

export function OrderBook() {
  // Mock order book data - in production, fetch from backend
  const [bids, setBids] = useState<Order[]>([
    { price: 10.5, quantity: 100, total: 1050 },
    { price: 10.45, quantity: 250, total: 2612.5 },
    { price: 10.4, quantity: 150, total: 1560 },
    { price: 10.35, quantity: 300, total: 3105 },
    { price: 10.3, quantity: 200, total: 2060 },
  ]);

  const [asks, setAsks] = useState<Order[]>([
    { price: 10.55, quantity: 150, total: 1582.5 },
    { price: 10.6, quantity: 200, total: 2120 },
    { price: 10.65, quantity: 100, total: 1065 },
    { price: 10.7, quantity: 250, total: 2675 },
    { price: 10.75, quantity: 180, total: 1935 },
  ]);

  const spread = asks[0]?.price - bids[0]?.price;
  const spreadPercent = ((spread / bids[0]?.price) * 100).toFixed(2);

  return (
    <Card className="border-muted/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Order Book</CardTitle>
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Spread</span>
              <span className="font-mono font-medium">
                ${spread.toFixed(2)}
              </span>
              <span className="text-muted-foreground">({spreadPercent}%)</span>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {/* Order Book Table */}
        <div className="grid grid-cols-2 gap-6">
          {/* Asks */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <ArrowDownIcon className="w-3.5 h-3.5 text-red-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Sell Orders
              </span>
            </div>
            <div className="space-y-0.5">
              <div className="grid grid-cols-3 text-[10px] text-muted-foreground mb-1.5 px-1 uppercase tracking-wider">
                <div>Price</div>
                <div className="text-right">Size</div>
                <div className="text-right">Total</div>
              </div>
              {asks.map((ask, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-3 text-sm hover:bg-red-500/5 px-1 py-0.5 rounded cursor-pointer transition-colors"
                >
                  <div className="text-red-500 font-medium font-mono">
                    {ask.price.toFixed(2)}
                  </div>
                  <div className="text-right font-mono text-xs">
                    {ask.quantity}
                  </div>
                  <div className="text-right text-muted-foreground font-mono text-xs">
                    {ask.total.toFixed(0)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Bids */}
          <div>
            <div className="flex items-center gap-1.5 mb-2 px-1">
              <ArrowUpIcon className="w-3.5 h-3.5 text-green-500" />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Buy Orders
              </span>
            </div>
            <div className="space-y-0.5">
              <div className="grid grid-cols-3 text-[10px] text-muted-foreground mb-1.5 px-1 uppercase tracking-wider">
                <div>Price</div>
                <div className="text-right">Size</div>
                <div className="text-right">Total</div>
              </div>
              {bids.map((bid, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-3 text-sm hover:bg-green-500/5 px-1 py-0.5 rounded cursor-pointer transition-colors"
                >
                  <div className="text-green-500 font-medium font-mono">
                    {bid.price.toFixed(2)}
                  </div>
                  <div className="text-right font-mono text-xs">
                    {bid.quantity}
                  </div>
                  <div className="text-right text-muted-foreground font-mono text-xs">
                    {bid.total.toFixed(0)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
