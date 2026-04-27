import { DrwaTransactionService } from '../../../endpoints/transactions/drwa.transaction.service';
import { DrwaTransactionObservability } from '../../../endpoints/transactions/drwa.transaction.observability';
import { TransactionDetailed } from '../../../endpoints/transactions/entities/transaction.detailed';
import { TransactionLog } from '../../../endpoints/transactions/entities/transaction.log';

describe('DrwaTransactionService', () => {
  let service: DrwaTransactionService;

  beforeEach(() => {
    DrwaTransactionObservability.reset();
    service = new DrwaTransactionService();
  });

  it('prefers root transaction denial status over result-level denial messages', () => {
    const transaction = new TransactionDetailed({
      status: 'DRWA_KYC_REQUIRED root denial',
      results: [{ returnMessage: 'DRWA_TOKEN_PAUSED nested denial' }] as any,
    });

    service.applyDrwa(transaction);

    expect(transaction.drwa?.denialCode).toBe('DRWA_KYC_REQUIRED');
    expect(transaction.drwa?.denialMessage).toContain('DRWA_KYC_REQUIRED');
    expect(DrwaTransactionObservability.snapshot().drwa_denial_detected).toBe(1);
    expect(DrwaTransactionObservability.snapshot().drwa_denial_code_drwa_kyc_required).toBe(1);
  });

  it('marks DRWA compliance presence from logs without inventing a denial', () => {
    const transaction = new TransactionDetailed({
      function: 'setTokenPolicy',
      receiver: 'erd1policy',
      logs: new TransactionLog({
        events: [{ identifier: 'drwaTransferDenied', address: 'erd1policy', topics: [] }] as any,
      }),
    });

    service.applyDrwa(transaction);

    expect(transaction.drwa?.isDrwa).toBe(true);
    expect(transaction.drwa?.hasComplianceSignal).toBe(true);
    expect(transaction.drwa?.denialCode).toBeUndefined();
    expect(DrwaTransactionObservability.snapshot().drwa_signal_accepted).toBe(1);
  });

  it('ignores generic failures that do not carry a DRWA prefix', () => {
    const transaction = new TransactionDetailed({
      status: 'execution failed',
      results: [{ returnMessage: 'gateway timeout' }] as any,
    });

    service.applyDrwa(transaction);

    expect(transaction.drwa).toBeUndefined();
  });

  it('does not classify unrelated drwa-prefixed functions as DRWA transactions', () => {
    const transaction = new TransactionDetailed({
      function: 'drwaCustomPing',
    });

    service.applyDrwa(transaction);

    expect(transaction.drwa).toBeUndefined();
  });

  it('ignores DRWA substring false positives in generic statuses', () => {
    const transaction = new TransactionDetailed({
      status: 'execution failed: XDRWA_KYC_REQUIREDY',
    });

    service.applyDrwa(transaction);

    expect(transaction.drwa).toBeUndefined();
  });

  it('ignores canonical DRWA events when the function context is unrelated', () => {
    const transaction = new TransactionDetailed({
      function: 'customPing',
      receiver: 'erd1spoof',
      logs: new TransactionLog({
        events: [{ identifier: 'drwaTransferAllowed', address: 'erd1spoof', topics: [] }] as any,
      }),
    });

    service.applyDrwa(transaction);

    expect(transaction.drwa).toBeUndefined();
  });

  it('ignores canonical DRWA events when the emitter address does not match the trusted receiver', () => {
    const transaction = new TransactionDetailed({
      function: 'setTokenPolicy',
      receiver: 'erd1policy',
      logs: new TransactionLog({
        events: [{ identifier: 'drwaTransferAllowed', address: 'erd1spoof', topics: [] }] as any,
      }),
    });

    service.applyDrwa(transaction);

    expect(transaction.drwa?.hasComplianceSignal).not.toBe(true);
    expect(DrwaTransactionObservability.snapshot().drwa_signal_rejected).toBe(1);
  });

  it('accepts newer canonical DRWA events emitted by known DRWA functions', () => {
    const transaction = new TransactionDetailed({
      function: 'initiateWindDown',
      receiver: 'erd1asset',
      logs: new TransactionLog({
        events: [{ identifier: 'drwaWindDownInitiated', address: 'erd1asset', topics: [] }] as any,
      }),
    });

    service.applyDrwa(transaction);

    expect(transaction.drwa?.isDrwa).toBe(true);
    expect(transaction.drwa?.hasComplianceSignal).toBe(true);
    expect(DrwaTransactionObservability.snapshot().drwa_signal_accepted).toBe(1);
  });

  it('accepts drwaAssetUpdated emitted by the trusted asset-manager receiver', () => {
    const transaction = new TransactionDetailed({
      function: 'updateAsset',
      receiver: 'erd1asset',
      logs: new TransactionLog({
        events: [{ identifier: 'drwaAssetUpdated', address: 'erd1asset', topics: [] }] as any,
      }),
    });

    service.applyDrwa(transaction);

    expect(transaction.drwa?.isDrwa).toBe(true);
    expect(transaction.drwa?.hasComplianceSignal).toBe(true);
    expect(DrwaTransactionObservability.snapshot().drwa_signal_accepted).toBe(1);
  });
});
