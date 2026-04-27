export class DrwaTransactionObservability {
  private static counters = new Map<string, number>();

  static increment(metric: string): void {
    const current = DrwaTransactionObservability.counters.get(metric) ?? 0;
    DrwaTransactionObservability.counters.set(metric, current + 1);
  }

  static snapshot(): Record<string, number> {
    return Object.fromEntries(DrwaTransactionObservability.counters.entries());
  }

  static reset(): void {
    DrwaTransactionObservability.counters = new Map<string, number>();
  }
}
