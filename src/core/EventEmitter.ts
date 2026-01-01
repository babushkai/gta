type EventCallback<T = unknown> = (data: T) => void;

export class EventEmitter {
  private events: Map<string, Set<EventCallback>> = new Map();

  on<T = unknown>(event: string, callback: EventCallback<T>): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(callback as EventCallback);

    return () => this.off(event, callback as EventCallback);
  }

  once<T = unknown>(event: string, callback: EventCallback<T>): void {
    const wrapper: EventCallback<T> = (data: T) => {
      this.off(event, wrapper as EventCallback);
      callback(data);
    };
    this.on(event, wrapper);
  }

  off(event: string, callback: EventCallback): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.events.delete(event);
      }
    }
  }

  emit<T = unknown>(event: string, data?: T): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
}

export const globalEvents = new EventEmitter();
