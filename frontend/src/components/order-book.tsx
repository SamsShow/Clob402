"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUpIcon, ArrowDownIcon, RefreshCwIcon } from "lucide-react";

interface Order {
  order_id: number;
  owner: string;
  price: number;
  quantity: number;
  filled_quantity: number;
  remaining_quantity: number;
  side: number;
  status: number;
  timestamp: number;
  total: number;
}

const OCTAS_TO_APT = 100_000_000;

export function OrderBook() {
  const [bids, setBids] = useState<Order[]>([]);
  const [asks, setAsks] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchOrderBook = async () => {
    try {
      const response = await fetch("http://localhost:3001/api/orders/all");
      if (response.ok) {
        const data = await response.json();
        setBids(data.bids || []);
        setAsks(data.asks || []);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error("Error fetching order book:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrderBook();

    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchOrderBook, 5000);
    return () => clearInterval(interval);
  }, []);

  const spread =
    asks[0]?.price && bids[0]?.price ? asks[0].price - bids[0].price : 0;
  const spreadPercent = bids[0]?.price
    ? ((spread / bids[0].price) * 100).toFixed(2)
    : "0";

  return (
    <Card className="border-muted/40">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Order Book</CardTitle>
          <div className="flex items-center gap-4 text-xs">
            {lastUpdate && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <RefreshCwIcon className="w-3 h-3" />
                <span>{lastUpdate.toLocaleTimeString()}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">Spread</span>
              <span className="font-mono font-medium">
                {spread > 0 ? spread.toLocaleString() : "—"} octas
              </span>
              {spread > 0 && bids[0] && (
                <span className="text-muted-foreground">
                  ({spreadPercent}%)
                </span>
              )}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCwIcon className="w-4 h-4 animate-spin mr-2" />
            Loading orders...
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-6">
            {/* Asks */}
            <div>
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <ArrowDownIcon className="w-3.5 h-3.5 text-red-500" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Sell Orders ({asks.length})
                </span>
              </div>
              <div className="space-y-0.5">
                <div className="grid grid-cols-3 text-[10px] text-muted-foreground mb-1.5 px-1 uppercase tracking-wider">
                  <div>Price (octas)</div>
                  <div className="text-right">Size (APT)</div>
                  <div className="text-right">Total (octas)</div>
                </div>
                {asks.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-4">
                    No sell orders
                  </div>
                ) : (
                  asks.slice(0, 10).map((ask) => (
                    <div
                      key={ask.order_id}
                      className="grid grid-cols-3 text-sm hover:bg-red-500/5 px-1 py-0.5 rounded cursor-pointer transition-colors"
                      title={`Order #${ask.order_id} by ${ask.owner.slice(
                        0,
                        6
                      )}...${ask.owner.slice(-4)}`}
                    >
                      <div className="text-red-500 font-medium font-mono">
                        {ask.price.toLocaleString()}
                      </div>
                      <div className="text-right font-mono text-xs">
                        {(ask.remaining_quantity / OCTAS_TO_APT).toFixed(4)}
                      </div>
                      <div className="text-right text-muted-foreground font-mono text-xs">
                        {ask.total.toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bids */}
            <div>
              <div className="flex items-center gap-1.5 mb-2 px-1">
                <ArrowUpIcon className="w-3.5 h-3.5 text-green-500" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Buy Orders ({bids.length})
                </span>
              </div>
              <div className="space-y-0.5">
                <div className="grid grid-cols-3 text-[10px] text-muted-foreground mb-1.5 px-1 uppercase tracking-wider">
                  <div>Price (octas)</div>
                  <div className="text-right">Size (APT)</div>
                  <div className="text-right">Total (octas)</div>
                </div>
                {bids.length === 0 ? (
                  <div className="text-center text-xs text-muted-foreground py-4">
                    No buy orders
                  </div>
                ) : (
                  bids.slice(0, 10).map((bid) => (
                    <div
                      key={bid.order_id}
                      className="grid grid-cols-3 text-sm hover:bg-green-500/5 px-1 py-0.5 rounded cursor-pointer transition-colors"
                      title={`Order #${bid.order_id} by ${bid.owner.slice(
                        0,
                        6
                      )}...${bid.owner.slice(-4)}`}
                    >
                      <div className="text-green-500 font-medium font-mono">
                        {bid.price.toLocaleString()}
                      </div>
                      <div className="text-right font-mono text-xs">
                        {(bid.remaining_quantity / OCTAS_TO_APT).toFixed(4)}
                      </div>
                      <div className="text-right text-muted-foreground font-mono text-xs">
                        {bid.total.toLocaleString()}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
