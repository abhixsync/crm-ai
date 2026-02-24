export class TelephonyRegistry {
  constructor() {
    this.adapters = new Map();
  }

  register(providerType, adapter) {
    this.adapters.set(providerType, adapter);
  }

  resolve(providerType) {
    const adapter = this.adapters.get(providerType);

    if (!adapter) {
      throw new Error(`No telephony adapter registered for provider type: ${providerType}`);
    }

    return adapter;
  }
}
