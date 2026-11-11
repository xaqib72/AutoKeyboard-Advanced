import type { RunState } from "../types/workflow";

export function BottomBar({
  repeatTimes,
  onRepeatTimes,
  runState,
  status,
  elapsedMs,
}: {
  repeatTimes: number;
  onRepeatTimes: (value: number) => void;
  runState: RunState;
  status: string;
  elapsedMs: number;
}) {
  const time = `${Math.floor(elapsedMs / 60000)
    .toString()
    .padStart(2, "0")}:${Math.floor((elapsedMs % 60000) / 1000)
    .toString()
    .padStart(2, "0")}`;
  return (
    <div className="bottom-bar">
      <label>
        Repeat Times:
        <input
          type="number"
          min={1}
          max={1000000}
          value={repeatTimes}
          disabled={
            !(["idle", "completed", "failed", "cancelled"] as RunState[]).includes(runState)
          }
          onChange={(e) => onRepeatTimes(Math.max(1, Number(e.target.value)))}
        />
      </label>
      <span className={`runtime-badge state-${runState}`}>{runState.toUpperCase()}</span>
      <span className="status-message">{status}</span>
      <span className="developer-watermark">Developed By Vegeta-Codes</span>
      <span className="elapsed">{time}</span>
    </div>
  );
}
