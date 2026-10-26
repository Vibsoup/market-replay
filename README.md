## market reply

Educational Rust and React market microstructure replay prototype. Uses a small **synthetic** BTC/USD level-2 event dataset. It is not a live trading bot, and does not place trades.

##Prereq

- Rust and Cargo
- Node.js and npm

## Run on Fedora (i use fish shell)
open 2 terminals:

Terminal 1:

```fish
cd market-replay
cargo run
```

Terminal 2:

```fish
cd market-replay/frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173/ and press PLAY.

## Features

- Rust level-2 order book with bid/ask updates
- CSV dataset replay
- HTTP endpoints: `/api/events`, `/api/snapshots`
- WebSocket endpoint: `/ws/replay`
- Rust-controlled play, pause, next, reset, and speed
- React order book and cumulative depth chart

## Limitations

- Synthetic sample data, not real Binance historical feed
- Prices use integer dollar ticks and quantities use floats; production market data needs fixed-point representation
- Replay interval is fixed at 500 ms / speed rather than true event-time pacing
- No exchange snapshot synchronization, sequence-gap detection, order queue modeling, fills, or strategy backtesting yet
- The backend expects to run from the repository root, because it reads `data/events.csv` using a relative path
- Local development only; permissive CORS and unauthenticated WebSocket commands are not suitable for public deployment

## WebSocket protocol

Client commands: `{"action":"play"}`, `{"action":"pause"}`, `{"action":"reset"}`, `{"action":"next"}`, `{"action":"speed","value":2}`.

Server messages have `kind` equal to `state`, `snapshot`, or `clear`.
