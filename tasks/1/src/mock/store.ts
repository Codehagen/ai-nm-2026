/**
 * In-memory entity store with auto-increment IDs and version tracking.
 */

export type Entity = Record<string, unknown> & {
  id: number;
  version: number;
  url?: string;
};

export class EntityStore {
  private stores = new Map<string, Map<number, Entity>>();
  private nextId = 30000001;
  private seedFn: ((store: EntityStore) => void) | null = null;

  constructor(seedFn?: (store: EntityStore) => void) {
    this.seedFn = seedFn ?? null;
    if (this.seedFn) this.seedFn(this);
  }

  private getStore(type: string): Map<number, Entity> {
    if (!this.stores.has(type)) {
      this.stores.set(type, new Map());
    }
    return this.stores.get(type)!;
  }

  create(type: string, data: Record<string, unknown>): Entity {
    const store = this.getStore(type);
    const id = this.nextId++;
    const entity: Entity = {
      ...data,
      id,
      version: 0,
      url: `https://tripletex.no/v2/${type}/${id}`,
    };
    store.set(id, entity);
    return entity;
  }

  /** Insert with a specific ID (used for seeding) */
  seed(type: string, id: number, data: Record<string, unknown>): Entity {
    const store = this.getStore(type);
    const entity: Entity = {
      ...data,
      id,
      version: 0,
      url: `https://tripletex.no/v2/${type}/${id}`,
    };
    store.set(id, entity);
    // Keep nextId ahead of any seeded ID
    if (id >= this.nextId) this.nextId = id + 1;
    return entity;
  }

  getById(type: string, id: number): Entity | null {
    return this.getStore(type).get(id) ?? null;
  }

  list(type: string): Entity[] {
    return Array.from(this.getStore(type).values());
  }

  has(type: string, id: number): boolean {
    return this.getStore(type).has(id);
  }

  update(type: string, id: number, data: Record<string, unknown>, expectedVersion?: number): Entity | null | "version_conflict" {
    const store = this.getStore(type);
    const existing = store.get(id);
    if (!existing) return null;

    if (expectedVersion !== undefined && existing.version !== expectedVersion) {
      return "version_conflict";
    }

    const updated: Entity = {
      ...existing,
      ...data,
      id, // preserve id
      version: existing.version + 1,
      url: existing.url,
    };
    store.set(id, updated);
    return updated;
  }

  delete(type: string, id: number): boolean {
    return this.getStore(type).delete(id);
  }

  reset(): void {
    this.stores.clear();
    this.nextId = 30000001;
    if (this.seedFn) this.seedFn(this);
  }

  /** Get current next ID (for testing) */
  getNextId(): number {
    return this.nextId;
  }
}
