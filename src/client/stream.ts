import type { Packet } from "../shared/lesson.js";
export class PacketDecoder {
  private buffer = "";
  push(chunk: string): Packet[] {
    this.buffer += chunk;
    const packets: Packet[] = [];
    let match: RegExpExecArray | null;
    while ((match = /\r?\n\r?\n/.exec(this.buffer))) {
      const frame = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);
      const data = frame
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) packets.push(JSON.parse(data) as Packet);
    }
    return packets;
  }
}
export async function readPackets(
  response: Response,
  handle: (p: Packet) => void,
) {
  if (!response.body) throw new Error("Streaming is unavailable.");
  const reader = response.body.getReader(),
    decoder = new TextDecoder(),
    frames = new PacketDecoder();
  let donePacket = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      const text = done
        ? decoder.decode()
        : decoder.decode(value, { stream: true });
      for (const packet of frames.push(text)) {
        if (packet.kind === "done") donePacket = true;
        handle(packet);
      }
      if (done) break;
    }
    if (!donePacket)
      throw new Error(
        "Connection ended without an observation outcome. Reopen the thread view to recover history.",
      );
  } finally {
    reader.releaseLock();
  }
}
