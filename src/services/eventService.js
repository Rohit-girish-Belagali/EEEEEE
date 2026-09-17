import { EventEmitter } from "node:events";

const MAX_EVENTS = 500;

/**
 * Activity log + pub/sub. Every event gets a monotonically increasing id so
 * SSE clients can resume with Last-Event-ID after a reconnect.
 */
export class EventService {
  constructor(store) {
    this.store = store;
    this.bus = new EventEmitter();
    this.bus.setMaxListeners(0);
    this.events = [];
    this.nextId = 1;
    this.persistChain = Promise.resolve();
  }

  async init() {
    this.events = await this.store.loadEvents();
    this.nextId = this.events.reduce((max, e) => Math.max(max, e.id), 0) + 1;
  }

  publish(projectId, type, data = {}) {
    const event = { id: this.nextId++, projectId, type, timestamp: new Date().toISOString(), data };
    this.events.push(event);
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);

    // Serialize writes so concurrent publishes can't interleave on disk.
    const snapshot = [...this.events];
    this.persistChain = this.persistChain
      .then(() => this.store.saveEvents(snapshot))
      .catch((err) => console.error(`Failed to persist events: ${err.message}`));

    this.bus.emit("event", event);
    return event;
  }

  list(projectId, { limit = 100, afterId = 0 } = {}) {
    return this.events.filter((e) => e.projectId === projectId && e.id > afterId).slice(-limit);
  }

  subscribe(projectId, listener) {
    const handler = (event) => {
      if (event.projectId === projectId) listener(event);
    };
    this.bus.on("event", handler);
    return () => this.bus.off("event", handler);
  }

  flush() {
    return this.persistChain;
  }
}
