import type { GeometryRequest, GeometryResponse } from "./protocol";

type Ok = Extract<GeometryResponse, { ok: true }>;

/** Client promesse du worker de géométrie. */
export class GeometryClient {
  private worker = new Worker(new URL("./geometry.worker.ts", import.meta.url), { type: "module" });
  private pending = new Map<number, (r: GeometryResponse) => void>();
  private next = 1;

  constructor() {
    this.worker.onmessage = (e: MessageEvent<GeometryResponse>) => {
      this.pending.get(e.data.id)?.(e.data);
      this.pending.delete(e.data.id);
    };
  }

  request(req: Omit<GeometryRequest, "id">): Promise<Ok> {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, (r) => (r.ok ? resolve(r) : reject(new Error(r.error))));
      this.worker.postMessage({ ...req, id } satisfies GeometryRequest);
    });
  }
}
