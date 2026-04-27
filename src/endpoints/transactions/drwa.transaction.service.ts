import { Injectable } from '@nestjs/common';
import { TransactionDetailed } from './entities/transaction.detailed';
import { TransactionLog } from './entities/transaction.log';
import { TransactionDrwa } from './entities/transaction.drwa';
import { DrwaTransactionObservability } from './drwa.transaction.observability';

@Injectable()
export class DrwaTransactionService {
  private readonly denialPattern = /\bDRWA_[A-Z0-9_]+\b/;
  private readonly knownDrwaFunctions = new Set([
    'settokenpolicy',
    'deactivatetokenpolicy',
    'setwhitepapercid',
    'setregistrationstatus',
    'registerasset',
    'updateasset',
    'initiatewinddown',
    'syncholdercompliance',
    'registeridentity',
    'updatecompliancestatus',
    'deactivateidentity',
    'eraseidentity',
    'setauditor',
    'acceptauditor',
    'revokeauditor',
    'recordattestation',
    'revokeattestation',
    'setgovernance',
    'acceptgovernance',
    'revokegovernance',
    'manageddrwasyncmirror',
    'drwa',
  ]);

  applyDrwa(transaction: TransactionDetailed): void {
    const denialMessage = this.getDenialMessage(transaction);
    const hasComplianceSignal = this.hasComplianceSignal(transaction);
    const isDrwa =
      hasComplianceSignal ||
      !!denialMessage ||
      this.isDRWAIndexedTransaction(transaction);

    if (!isDrwa) {
      return;
    }

    if (hasComplianceSignal) {
      DrwaTransactionObservability.increment('drwa_signal_accepted');
    }
    if (denialMessage) {
      DrwaTransactionObservability.increment('drwa_denial_detected');
      const denialCode = this.extractDenialCode(denialMessage);
      if (denialCode) {
        DrwaTransactionObservability.increment(`drwa_denial_code_${denialCode.toLowerCase()}`);
      }
    }

    transaction.drwa = new TransactionDrwa({
      isDrwa: true,
      hasComplianceSignal,
      denialCode: this.extractDenialCode(denialMessage),
      denialMessage,
    });
  }

  private getDenialMessage(
    transaction: TransactionDetailed,
  ): string | undefined {
    if (this.extractDenialCode(transaction.status)) {
      return transaction.status;
    }

    for (const result of transaction.results ?? []) {
      if (this.extractDenialCode(result.returnMessage)) {
        return result.returnMessage;
      }
    }

    return undefined;
  }

  private hasComplianceSignal(transaction: TransactionDetailed): boolean {
    const rootSignal = this.logHasDRWASignal(
      transaction.logs,
      transaction.function,
      transaction.receiver,
    );
    if (rootSignal) {
      return true;
    }

    for (const result of transaction.results ?? []) {
      if (this.logHasDRWASignal(result.logs, result.function, result.receiver)) {
        return true;
      }
    }

    return false;
  }

  // Canonical set of DRWA event identifiers.  Prefix matching is avoided: it
  // would misclassify unrelated application events whose identifiers happen to
  // start with "drwa", producing false-positive compliance signals.
  private readonly canonicalDrwaEvents = new Set([
    'drwatokenpolicy',
    'drwaassetregistered',
    'drwaassetupdated',
    'drwaholdercompliance',
    'drwatransferdenied',
    'drwatransferallowed',
    'drwaglobalpause',
    'drwametadataprotection',
    'drwawhitepapercidset',
    'drwaregistrationstatusset',
    'drwaidentityregistered',
    'drwacomplianceupdated',
    'drwaidentitydeactivated',
    'drwaidentityerased',
    'drwawinddowninitiated',
    'drwaauditorproposed',
    'drwaauditoraccepted',
    'drwaauditorrevoked',
    'drwaattestationoverwritten',
    'drwaattestationrecorded',
    'drwagovernanceproposed',
    'drwagovernanceaccepted',
    'drwagovernancerevoked',
  ]);

  private logHasDRWASignal(
    logs: TransactionLog | undefined,
    functionName: string | undefined,
    trustedEmitter: string | undefined,
  ): boolean {
    if (!this.isKnownDRWAFunction(functionName) || !trustedEmitter) {
      return false;
    }

    return !!logs?.events?.some(({ identifier, address }) =>
      this.recordSignalDecision(identifier, address, trustedEmitter),
    );
  }

  private recordSignalDecision(
    identifier: string | undefined,
    address: string | undefined,
    trustedEmitter: string,
  ): boolean {
    const isCanonical = this.canonicalDrwaEvents.has(identifier?.toLowerCase() ?? '');
    if (!isCanonical) {
      return false;
    }

    if (address !== trustedEmitter) {
      DrwaTransactionObservability.increment('drwa_signal_rejected');
      return false;
    }

    return true;
  }

  private isDRWAIndexedTransaction(transaction: TransactionDetailed): boolean {
    const operation = transaction.operation?.toLowerCase();
    if (operation === 'drwa') {
      return true;
    }

    return this.isKnownDRWAFunction(transaction.function);
  }

  private isKnownDRWAFunction(functionName: string | undefined): boolean {
    const normalized = functionName?.toLowerCase();
    return normalized ? this.knownDrwaFunctions.has(normalized) : false;
  }

  private extractDenialCode(message: string | undefined): string | undefined {
    if (!message) {
      return undefined;
    }

    return message.match(this.denialPattern)?.[0];
  }
}
