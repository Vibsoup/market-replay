import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type PriceLevel = { price: number; quantity: number };
type Props = { bids: PriceLevel[]; asks: PriceLevel[] };

const INK = "#4a2c3b";

function DepthChart({ bids, asks }: Props) {
  const sortedBids = [...bids].sort((a, b) => b.price - a.price);
  const sortedAsks = [...asks].sort((a, b) => a.price - b.price);
  let bidTotal = 0;
  let askTotal = 0;
  const bidPoints = sortedBids.map((level) => {
    bidTotal += level.quantity;
    return { price: level.price, bidDepth: bidTotal, askDepth: null };
  });
  const askPoints = sortedAsks.map((level) => {
    askTotal += level.quantity;
    return { price: level.price, bidDepth: null, askDepth: askTotal };
  });
  const data = [...bidPoints, ...askPoints].sort((a, b) => a.price - b.price);
  const midPrice = sortedBids.length && sortedAsks.length
    ? (sortedBids[0].price + sortedAsks[0].price) / 2 : undefined;
  return (
    <section className="paper graph-paper" aria-labelledby="depth-title">
      <div className="panel-head"><h2 id="depth-title">Market depth</h2><span>cumulative liquidity</span></div>
      <div className="chart-box">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <XAxis dataKey="price" type="number" domain={["dataMin", "dataMax"]} stroke={INK} tick={{ fill: INK, fontSize: 12, fontFamily: "Courier Prime, monospace" }} tickFormatter={(value: number) => value.toLocaleString()} />
            <YAxis allowDecimals={false} stroke={INK} tick={{ fill: INK, fontSize: 12, fontFamily: "Courier Prime, monospace" }} width={48} />
            <Tooltip contentStyle={{ background: "#fffbf5", border: `2px solid ${INK}`, borderRadius: 10, color: INK, fontFamily: "Courier Prime, monospace" }} />
            {midPrice !== undefined && <ReferenceLine x={midPrice} stroke={INK} strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" />}
            <Area type="stepBefore" name="Bid depth" dataKey="bidDepth" stroke="#1f8a66" strokeWidth={2.5} fill="#3ccf9b" fillOpacity={0.4} connectNulls={false} isAnimationActive={false} />
            <Area type="stepAfter" name="Ask depth" dataKey="askDepth" stroke="#d6285f" strokeWidth={2.5} fill="#ff6f9c" fillOpacity={0.4} connectNulls={false} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
export default DepthChart;
