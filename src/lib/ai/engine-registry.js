export class AIEngineRegistry {
  constructor() {
    this.engines = new Map();
  }

  register(providerType, engine) {
    this.engines.set(providerType, engine);
  }

  resolve(providerType) {
    const engine = this.engines.get(providerType);

    if (!engine) {
      throw new Error(`No engine registered for provider type: ${providerType}`);
    }

    return engine;
  }

  has(providerType) {
    return this.engines.has(providerType);
  }
}
