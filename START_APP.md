# 🚀 How to Run the App

## Quick Start (Recommended)

### Option 1: Run Everything at Once

```bash
cd /Users/samshow/Desktop/Clob402
npm run dev
```

This starts both backend and frontend simultaneously!

---

## Step-by-Step Instructions

### Step 1: Start the Backend Server

Open a terminal and run:

```bash
cd /Users/samshow/Desktop/Clob402/backend
npm run dev
```

**Expected Output:**

```
Facilitator backend running on port 3001
Network: testnet
Facilitator address: 0xf90391c81027f03cdea491ed8b36ffaced26b6df208a9b569e5baf2590eb9b16
```

✅ **Backend is running at:** http://localhost:3001

**Test it:**

```bash
curl http://localhost:3001/health
```

---

### Step 2: Start the Frontend (New Terminal)

Open a **NEW terminal** and run:

```bash
cd /Users/samshow/Desktop/Clob402/frontend
npm run dev
```

**Expected Output:**

```
ready - started server on 0.0.0.0:3000, url: http://localhost:3000
```

✅ **Frontend is running at:** http://localhost:3000

---

## Access Your App

### 🌐 Open in Browser

- **Frontend UI**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **Health Check**: http://localhost:3001/health

### 📱 What You'll See

1. **Landing Page** with wallet connection
2. **Order Book** interface
3. **Vault Dashboard**
4. **Trading Interface**

---

## 🛑 How to Stop

Press `Ctrl + C` in each terminal to stop the servers.

---

## 🔧 Troubleshooting

### Port Already in Use

If you get "port already in use" error:

**For Backend (port 3001):**

```bash
lsof -ti:3001 | xargs kill -9
```

**For Frontend (port 3000):**

```bash
lsof -ti:3000 | xargs kill -9
```

### Dependencies Not Found

```bash
# Reinstall backend dependencies
cd backend
npm install

# Reinstall frontend dependencies
cd ../frontend
npm install
```

### Environment Variables Not Set

The app is already configured with default values in:

- `backend/.env`
- `frontend/.env.local`

---

## 📋 Pre-Flight Checklist

Before running the app, make sure:

- [x] Node.js installed (v18+)
- [x] Dependencies installed (`npm install` already done)
- [x] Environment files exist (`.env` files created)
- [x] Tests passing (`npm run test:backend`)
- [x] Ports 3000 and 3001 available

---

## 🎯 Using the App

### 1. Connect Your Wallet

- Click "Connect Wallet" button
- Choose Petra or Martian wallet
- Approve connection

### 2. View Order Book

- Browse live orders
- See bid/ask spreads
- Check order depths

### 3. Place an Order

- Enter price and quantity
- Choose buy or sell
- Sign the transaction
- No gas fees! (sponsored by facilitator)

### 4. Use Strategy Vault

- Deposit USDC into vault
- Earn from copy-trading
- Withdraw anytime

---

## 🔑 Test Account

The backend is configured with a test facilitator account:

```
Address: 0xf90391c81027f03cdea491ed8b36ffaced26b6df208a9b569e5baf2590eb9b16
Network: testnet
```

**Note:** This is a test key. Never use this in production!

---

## 📊 API Endpoints

Once running, these endpoints are available:

### Health Check

```bash
GET http://localhost:3001/health
```

### Payment Authorization

```bash
POST http://localhost:3001/api/auth/request-intent
POST http://localhost:3001/api/auth/submit-authorization
GET  http://localhost:3001/api/auth/status/:txHash
```

### Order Book

```bash
POST http://localhost:3001/api/orders/place
POST http://localhost:3001/api/orders/cancel
GET  http://localhost:3001/api/orders/user/:address
GET  http://localhost:3001/api/orders/order/:orderId
```

### Strategy Vault

```bash
POST http://localhost:3001/api/vault/deposit
POST http://localhost:3001/api/vault/withdraw
GET  http://localhost:3001/api/vault/shares/:address
GET  http://localhost:3001/api/vault/info
```

---

## 🧪 Testing While Running

In another terminal, run tests:

```bash
# Test backend
cd /Users/samshow/Desktop/Clob402
npm run test:backend

# Test smart contracts
cd move
aptos move test --dev
```

---

## 🔄 Development Workflow

### Typical Development Session

```bash
# Terminal 1: Backend with auto-reload
cd /Users/samshow/Desktop/Clob402/backend
npm run dev

# Terminal 2: Frontend with hot-reload
cd /Users/samshow/Desktop/Clob402/frontend
npm run dev

# Terminal 3: Run tests when needed
cd /Users/samshow/Desktop/Clob402
npm run test:backend
```

### Making Changes

- **Backend changes**: Auto-reload with `tsx watch`
- **Frontend changes**: Hot-reload with Next.js
- **Smart contracts**: Re-compile with `aptos move compile`

---

## 🌐 Production Deployment

For production deployment, see:

- `README.md` - Deployment section
- `SETUP.md` - Production configuration
- `.env.example` files - Production environment variables

---

## 💡 Tips

1. **Always start backend first** (frontend depends on it)
2. **Use separate terminals** for each service
3. **Check logs** if something doesn't work
4. **Keep both running** for full functionality
5. **Use browser DevTools** to debug frontend issues

---

## 📞 Need Help?

- Check logs in the terminal
- Review `TESTING.md` for common issues
- Verify `.env` files are correct
- Make sure ports 3000 and 3001 are free

---

**Ready to go!** 🎉

Just run: `npm run dev` from the project root!
