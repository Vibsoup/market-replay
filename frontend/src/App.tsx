import { useEffect, useRef, useState } from "react";
import DepthChart from "./components/DepthChart";
import Arrow from "./components/Arrow";
import "./App.css";

type PriceLevel = { price: number; quantity: number };
type Snapshot = {
  timestamp: number;
  bids: PriceLevel[];
  asks: PriceLevel[];
  best_bid: number | null;
  best_ask: number | null;
  spread: number | null;
  mid_price: number | null;
};
type ReplayState = {
  kind: "state";
  status: "paused" | "playing" | "complete";
  index: number;
  total: number;
  speed: number;
};
type ServerMessage = ReplayState | { kind: "snapshot"; snapshot: Snapshot } | { kind: "clear" };
type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";
const WS_URL = "ws://127.0.0.1:8000/ws/replay";

function App() {
  const socketRef = useRef<WebSocket | null>(null);
  const [connection, setConnection] = useState<ConnectionStatus>("disconnected");
  const [replay, setReplay] = useState<ReplayState | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const socket = new WebSocket(WS_URL);
    socketRef.current = socket;
    socket.onopen = () => setConnection("connected");
    socket.onmessage = (event: MessageEvent<string>) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        if (message.kind === "state") setReplay(message);
        if (message.kind === "snapshot") setSnapshot(message.snapshot);
        if (message.kind === "clear") setSnapshot(null);
      } catch {
        setError("Invalid message received from Rust engine.");
      }
    };
    socket.onerror = () => {
      setError("Cannot connect to Rust. Start the backend with cargo run.");
      setConnection("error");
    };
    socket.onclose = () => setConnection((current) => current === "error" ? "error" : "disconnected");
    return () => { socket.close(); socketRef.current = null; };
  }, []);

  function command(action: string, value?: number) {
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(value === undefined ? { action } : { action, value }));
    }
  }

  function price(value: number | null | undefined) {
    return value == null ? "—" : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const bids = snapshot?.bids ?? [];
  const asks = snapshot?.asks ?? [];
  const ready = connection === "connected";
  const playing = replay?.status === "playing";

  const progress = replay && replay.total > 0 ? Math.min(100, (replay.index / replay.total) * 100) : 0;

  return (
    <main className="desk">
      <header className="masthead">
        <nav className="nav" aria-label="Engine and replay status">
          <span>Engine: {connection}</span>
          <span>Replay: {replay?.status ?? "idle"}</span>
          <span>Event {replay?.index ?? 0} / {replay?.total ?? 0}</span>
          <span>Synthetic data</span>
        </nav>
        <div className="logo">
          <h1>Market Replay</h1>
          <p>a rust-powered market simulator for btc / usd</p>
        </div>
        <div className="mascot">
          <p className="chalk">i’m watching the book. press play.</p>
          <img className="spiral" src="/spiral-girl.webp" alt="Painted girl with big spiral eyes and a flat, unbothered mouth" />
        </div>
      </header>

      <section className="notes" aria-label="Market summary">
        <div className="note note-kraft"><span>market</span><strong>BTC / USD</strong></div>
        <div className="note note-paper"><span>best bid</span><strong className="bid">{price(snapshot?.best_bid)}</strong></div>
        <div className="note note-lilac"><span>best ask</span><strong className="ask">{price(snapshot?.best_ask)}</strong></div>
        <div className="note note-peach"><span>spread</span><strong>{price(snapshot?.spread)}</strong></div>
        <div className="note note-blush"><span>mid price</span><strong>{price(snapshot?.mid_price)}</strong></div>
      </section>

      <div className="board">
        <div className="col">
          <p className="chalk">green is buyers, red is sellers <Arrow className="chalk-arrow" /></p>
          <section className="paper notebook" aria-labelledby="book-title">
            <div className="panel-head"><h2 id="book-title">Order book</h2><span>btc / usd</span></div>
            <div className="book-header"><span>price (usd)</span><span>quantity (btc)</span></div>
            <div className="order-book">
              {[...asks].reverse().map((level) => (
                <div className="book-row" key={`ask-${level.price}`}><span className="ask">{level.price.toLocaleString()}</span><span>{level.quantity.toFixed(4)}</span></div>
              ))}
              <div className="spread-row"><span>spread {price(snapshot?.spread)}</span></div>
              {bids.map((level) => (
                <div className="book-row" key={`bid-${level.price}`}><span className="bid">{level.price.toLocaleString()}</span><span>{level.quantity.toFixed(4)}</span></div>
              ))}
              {!snapshot && <div className="book-empty">Nothing here yet. Press play to start the replay.</div>}
            </div>
          </section>
        </div>

        <div className="col">
          <section className="paper peach controls" aria-labelledby="controls-title">
            <img className="cat" src="/cat-girl.webp" alt="" />
            <div className="panel-head"><h2 id="controls-title">Replay controls</h2><span>timestamp {snapshot?.timestamp ?? 0} ms</span></div>
            <div className="progress" role="progressbar" aria-label="Replay progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}><i style={{ width: `${progress}%` }} /></div>
            <div className="control-row">
              <button type="button" className="primary" disabled={!ready} onClick={() => command(playing ? "pause" : "play")}>{playing ? "Pause" : replay?.status === "complete" ? "Replay" : "Play"}</button>
              <button type="button" disabled={!ready || replay?.status === "complete"} onClick={() => command("next")}>Next</button>
              <button type="button" disabled={!ready} onClick={() => command("reset")}>Reset</button>
              <label htmlFor="speed">speed</label>
              <select id="speed" disabled={!ready} value={replay?.speed ?? 1} onChange={(event) => command("speed", Number(event.target.value))}>
                <option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option><option value={5}>5x</option>
              </select>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
          </section>
          <p className="chalk chalk-right">how much is waiting at each price <Arrow className="chalk-arrow" /></p>
          <DepthChart bids={bids} asks={asks} />
        </div>
      </div>

      <footer>rust websocket engine, synthetic historical-style replay, no live trading</footer>
    </main>
  );
}
export default App;
