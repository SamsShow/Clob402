"use client";

import { ArrowUpRight } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";

interface HeroSectionProps {
  onLaunchApp: () => void;
}

export function HeroSection({ onLaunchApp }: HeroSectionProps) {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    console.log("Button clicked!");
    onLaunchApp();
  };

  return (
    <div className="relative h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 dark:from-slate-950 dark:via-black dark:to-slate-950">
      {/* Mode toggle in top right */}
      <div className="absolute top-6 right-6 z-20">
        <ModeToggle />
      </div>

      {/* Animated stars background */}
      <div className="absolute inset-0">
        <div className="stars-container">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="star"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 3}s`,
                animationDuration: `${2 + Math.random() * 3}s`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-radial from-slate-500/10 via-transparent to-transparent" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-6 py-12">
        {/* Badge */}
        <div className="mb-6 px-4 py-2 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm">
          <span className="text-sm text-white/90 font-medium">
            Powered by Aptos
          </span>
        </div>

        {/* Main Heading */}
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold text-center text-white mb-4 max-w-5xl leading-tight">
          Trade with <span className="text-slate-300">Zero Gas</span>
          <br />
          on Aptos CLOB
        </h1>

        {/* Subheading */}
        <p className="text-base md:text-lg text-white/70 text-center max-w-2xl mb-8">
          Gasless limit orders • Copy-trading vaults • x402 payment flow
          <br />
          Experience the future of DeFi trading with security and ease
        </p>

        {/* Launch Button */}
        <button
          onClick={handleClick}
          className="group relative h-16 w-16 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-sm transition-all duration-300 hover:scale-110 p-0 cursor-pointer z-50 inline-flex items-center justify-center"
          aria-label="Launch App"
          type="button"
        >
          <ArrowUpRight className="h-6 w-6 text-white transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 pointer-events-none" />
        </button>

        {/* Feature Pills */}
        <div className="mt-10 flex flex-wrap justify-center gap-3 max-w-3xl">
          <div className="px-5 py-2.5 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm">
            <span className="text-xs md:text-sm text-white/90 font-medium">
              🚀 Gasless Trading
            </span>
          </div>
          <div className="px-5 py-2.5 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm">
            <span className="text-xs md:text-sm text-white/90 font-medium">
              📊 Limit Order Book
            </span>
          </div>
          <div className="px-5 py-2.5 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm">
            <span className="text-xs md:text-sm text-white/90 font-medium">
              🎯 Copy-Trading Vaults
            </span>
          </div>
          <div className="px-5 py-2.5 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm">
            <span className="text-xs md:text-sm text-white/90 font-medium">
              🔒 x402 Payment Auth
            </span>
          </div>
        </div>

        {/* Network Diagram - Grey theme */}
        <div className="mt-12 relative w-full max-w-4xl">
          <svg
            viewBox="0 0 1200 300"
            className="w-full h-auto opacity-70"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Connection Lines */}
            <defs>
              <linearGradient
                id="lineGradient1"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#94a3b8" stopOpacity="0.8" />
              </linearGradient>
              <linearGradient
                id="lineGradient2"
                x1="0%"
                y1="0%"
                x2="100%"
                y2="0%"
              >
                <stop offset="0%" stopColor="#64748b" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#64748b" stopOpacity="0.8" />
              </linearGradient>
            </defs>

            {/* Lines connecting to center */}
            <line
              x1="250"
              y1="80"
              x2="520"
              y2="150"
              stroke="url(#lineGradient1)"
              strokeWidth="2"
              opacity="0.5"
            />
            <line
              x1="350"
              y1="120"
              x2="520"
              y2="150"
              stroke="url(#lineGradient1)"
              strokeWidth="2"
              opacity="0.5"
            />
            <line
              x1="250"
              y1="220"
              x2="520"
              y2="150"
              stroke="url(#lineGradient2)"
              strokeWidth="2"
              opacity="0.5"
            />
            <line
              x1="680"
              y1="150"
              x2="950"
              y2="80"
              stroke="url(#lineGradient1)"
              strokeWidth="2"
              opacity="0.5"
            />
            <line
              x1="680"
              y1="150"
              x2="850"
              y2="120"
              stroke="url(#lineGradient1)"
              strokeWidth="2"
              opacity="0.5"
            />
            <line
              x1="680"
              y1="150"
              x2="950"
              y2="220"
              stroke="url(#lineGradient2)"
              strokeWidth="2"
              opacity="0.5"
            />

            {/* Left side nodes - Traders */}
            <g className="node-group">
              <circle
                cx="250"
                cy="80"
                r="35"
                fill="#1e293b"
                stroke="#64748b"
                strokeWidth="2"
                opacity="0.8"
              />
              <circle cx="250" cy="80" r="20" fill="#64748b" opacity="0.8" />
            </g>

            <g className="node-group">
              <circle
                cx="350"
                cy="120"
                r="35"
                fill="#1e293b"
                stroke="#475569"
                strokeWidth="2"
                opacity="0.8"
              />
              <circle cx="350" cy="120" r="20" fill="#475569" opacity="0.8" />
            </g>

            <g className="node-group">
              <circle
                cx="250"
                cy="220"
                r="35"
                fill="#1e293b"
                stroke="#64748b"
                strokeWidth="2"
                opacity="0.8"
              />
              <circle cx="250" cy="220" r="20" fill="#64748b" opacity="0.8" />
            </g>

            {/* Center node - CLOB */}
            <g className="node-group">
              <circle
                cx="600"
                cy="150"
                r="45"
                fill="#1e293b"
                stroke="#94a3b8"
                strokeWidth="3"
                opacity="0.9"
              />
              <circle cx="600" cy="150" r="30" fill="#94a3b8" opacity="0.9" />
            </g>

            {/* Right side nodes - Vaults */}
            <g className="node-group">
              <circle
                cx="950"
                cy="80"
                r="35"
                fill="#1e293b"
                stroke="#64748b"
                strokeWidth="2"
                opacity="0.8"
              />
              <circle cx="950" cy="80" r="20" fill="#64748b" opacity="0.8" />
            </g>

            <g className="node-group">
              <circle
                cx="850"
                cy="120"
                r="35"
                fill="#1e293b"
                stroke="#475569"
                strokeWidth="2"
                opacity="0.8"
              />
              <circle cx="850" cy="120" r="20" fill="#475569" opacity="0.8" />
            </g>

            <g className="node-group">
              <circle
                cx="950"
                cy="220"
                r="35"
                fill="#1e293b"
                stroke="#64748b"
                strokeWidth="2"
                opacity="0.8"
              />
              <circle cx="950" cy="220" r="20" fill="#64748b" opacity="0.8" />
            </g>
          </svg>
        </div>
      </div>

      <style jsx>{`
        .stars-container {
          position: absolute;
          width: 100%;
          height: 100%;
        }

        .star {
          position: absolute;
          width: 2px;
          height: 2px;
          background: white;
          border-radius: 50%;
          animation: twinkle linear infinite;
        }

        @keyframes twinkle {
          0%,
          100% {
            opacity: 0.2;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.5);
          }
        }

        .node-group {
          animation: float 3s ease-in-out infinite;
        }

        .node-group:nth-child(2n) {
          animation-delay: 0.5s;
        }

        .node-group:nth-child(3n) {
          animation-delay: 1s;
        }

        @keyframes float {
          0%,
          100% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-8px);
          }
        }

        .bg-gradient-radial {
          background: radial-gradient(
            circle at 50% 30%,
            var(--tw-gradient-stops)
          );
        }
      `}</style>
    </div>
  );
}
