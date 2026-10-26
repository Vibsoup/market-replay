use std::collections::BTreeMap;
use std::error::Error;
use std::net::SocketAddr;
use std::time::Duration;

use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    response::IntoResponse,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tokio::time::sleep;
use tower_http::cors::CorsLayer;

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
enum Side {
    Bid,
    Ask,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct MarketEvent {
    timestamp: u64,
    side: Side,
    price: i64,
    quantity: f64,
}

#[derive(Serialize)]
struct PriceLevel {
    price: i64,
    quantity: f64,
}

#[derive(Serialize)]
struct OrderBookSnapshot {
    timestamp: u64,
    bids: Vec<PriceLevel>,
    asks: Vec<PriceLevel>,
    best_bid: Option<i64>,
    best_ask: Option<i64>,
    spread: Option<i64>,
    mid_price: Option<f64>,
}

#[derive(Deserialize)]
#[serde(tag = "action", rename_all = "lowercase")]
enum ReplayCommand {
    Play,
    Pause,
    Reset,
    Next,
    Speed { value: f64 },
}

#[derive(Serialize)]
struct ReplayState {
    kind: &'static str,
    status: &'static str,
    index: usize,
    total: usize,
    speed: f64,
}

struct OrderBook {
    bids: BTreeMap<i64, f64>,
    asks: BTreeMap<i64, f64>,
}

impl OrderBook {
    fn new() -> Self {
        Self {
            bids: BTreeMap::new(),
            asks: BTreeMap::new(),
        }
    }

    fn apply(&mut self, event: &MarketEvent) {
        let levels = match event.side {
            Side::Bid => &mut self.bids,
            Side::Ask => &mut self.asks,
        };

        if event.quantity <= 0.0 {
            levels.remove(&event.price);
        } else {
            levels.insert(event.price, event.quantity);
        }
    }

    fn snapshot(&self, timestamp: u64) -> OrderBookSnapshot {
        let bids: Vec<PriceLevel> = self.bids.iter().rev()
            .map(|(&price, &quantity)| PriceLevel { price, quantity })
            .collect();
        let asks: Vec<PriceLevel> = self.asks.iter()
            .map(|(&price, &quantity)| PriceLevel { price, quantity })
            .collect();
        let best_bid = bids.first().map(|level| level.price);
        let best_ask = asks.first().map(|level| level.price);
        OrderBookSnapshot {
            timestamp,
            bids,
            asks,
            best_bid,
            best_ask,
            spread: best_bid.zip(best_ask).map(|(bid, ask)| ask - bid),
            mid_price: best_bid.zip(best_ask)
                .map(|(bid, ask)| (bid as f64 + ask as f64) / 2.0),
        }
    }
}

fn load_events(path: &str) -> Result<Vec<MarketEvent>, Box<dyn Error>> {
    let mut reader = csv::Reader::from_path(path)?;
    let mut events = Vec::new();
    for result in reader.deserialize() {
        events.push(result?);
    }
    events.sort_by_key(|event: &MarketEvent| event.timestamp);
    Ok(events)
}

async fn get_events() -> Json<Vec<MarketEvent>> {
    Json(load_events("data/events.csv").unwrap_or_default())
}

async fn get_snapshots() -> Json<Vec<OrderBookSnapshot>> {
    let events = load_events("data/events.csv").unwrap_or_default();
    let mut book = OrderBook::new();
    Json(events.iter().map(|event| {
        book.apply(event);
        book.snapshot(event.timestamp)
    }).collect())
}

async fn websocket_handler(ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(handle_replay)
}

async fn send_state(socket: &mut WebSocket, status: &'static str, index: usize, total: usize, speed: f64) -> bool {
    let state = ReplayState { kind: "state", status, index, total, speed };
    let message = serde_json::to_string(&state).unwrap();
    socket.send(Message::Text(message.into())).await.is_ok()
}

async fn send_snapshot(socket: &mut WebSocket, book: &OrderBook, timestamp: u64) -> bool {
    #[derive(Serialize)]
    struct SnapshotMessage {
        kind: &'static str,
        snapshot: OrderBookSnapshot,
    }
    let message = SnapshotMessage { kind: "snapshot", snapshot: book.snapshot(timestamp) };
    let json = serde_json::to_string(&message).unwrap();
    socket.send(Message::Text(json.into())).await.is_ok()
}

async fn handle_replay(mut socket: WebSocket) {
    let events = match load_events("data/events.csv") {
        Ok(events) => events,
        Err(error) => {
            eprintln!("Replay error: {error}");
            return;
        }
    };
    let mut book = OrderBook::new();
    let mut index = 0usize;
    let mut playing = false;
    let mut speed = 1.0_f64;
    if !send_state(&mut socket, "paused", index, events.len(), speed).await {
        return;
    }
    loop {
        tokio::select! {
            message = socket.recv() => {
                let Some(Ok(Message::Text(text))) = message else { break; };
                let command = match serde_json::from_str::<ReplayCommand>(&text) {
                    Ok(command) => command,
                    Err(_) => continue,
                };
                let mut clear = false;
                match command {
                    ReplayCommand::Play => {
                        if index >= events.len() {
                            index = 0;
                            book = OrderBook::new();
                            clear = true;
                        }
                        playing = true;
                    }
                    ReplayCommand::Pause => playing = false,
                    ReplayCommand::Reset => {
                        playing = false;
                        index = 0;
                        book = OrderBook::new();
                        clear = true;
                    }
                    ReplayCommand::Next => {
                        playing = false;
                        if let Some(event) = events.get(index) {
                            book.apply(event);
                            index += 1;
                            if !send_snapshot(&mut socket, &book, event.timestamp).await { break; }
                        }
                    }
                    ReplayCommand::Speed { value } => {
                        if value.is_finite() && (0.25..=10.0).contains(&value) { speed = value; }
                    }
                }
                if clear && socket.send(Message::Text(r#"{"kind":"clear"}"#.into())).await.is_err() {
                    break;
                }
                let status = if index >= events.len() {
                    playing = false;
                    "complete"
                } else if playing { "playing" } else { "paused" };
                if !send_state(&mut socket, status, index, events.len(), speed).await { break; }
            }
            _ = sleep(Duration::from_secs_f64(0.5 / speed)), if playing => {
                if let Some(event) = events.get(index) {
                    book.apply(event);
                    index += 1;
                    if !send_snapshot(&mut socket, &book, event.timestamp).await { break; }
                }
                let status = if index >= events.len() {
                    playing = false;
                    "complete"
                } else { "playing" };
                if !send_state(&mut socket, status, index, events.len(), speed).await { break; }
            }
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let app = Router::new()
        .route("/api/events", get(get_events))
        .route("/api/snapshots", get(get_snapshots))
        .route("/ws/replay", get(websocket_handler))
        .layer(CorsLayer::permissive());
    let address = SocketAddr::from(([127, 0, 0, 1], 8000));
    let listener = tokio::net::TcpListener::bind(address).await?;
    println!("Market Replay API: http://{address}");
    println!("WebSocket replay: ws://{address}/ws/replay");
    axum::serve(listener, app).await?;
    Ok(())
}
