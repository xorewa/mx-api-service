import 'reflect-metadata';
import { DrwaTransactionService } from '../../endpoints/transactions/drwa.transaction.service';
import { TokenService } from '../../endpoints/tokens/token.service';
import { TokenType } from '../../common/indexer/entities';

function benchmark(label: string, iterations: number, fn: () => void) {
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  const end = process.hrtime.bigint();
  const totalNs = Number(end - start);
  const nsPerOp = totalNs / iterations;
  console.log(`${label}: ${nsPerOp.toFixed(1)} ns/op over ${iterations} iterations`);
}

async function benchmarkAsync(label: string, iterations: number, fn: () => Promise<void>) {
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) {
    await fn();
  }
  const end = process.hrtime.bigint();
  const totalNs = Number(end - start);
  const nsPerOp = totalNs / iterations;
  console.log(`${label}: ${nsPerOp.toFixed(1)} ns/op over ${iterations} iterations`);
}

const service = new DrwaTransactionService();
const tokenService = new TokenService(
  {} as any,
  {
    getCollection: () => Promise.resolve(undefined),
  } as any,
  {} as any,
  {} as any,
  {} as any,
  {} as any,
  {} as any,
  {} as any,
  {} as any,
  {} as any,
  {} as any,
  {} as any,
  {} as any,
  {} as any
);

const txWithDenial: any = {
  status: 'success',
  results: [
    {
      returnMessage: 'execution failed DRWA_KYC_REQUIRED holder is not eligible',
      logs: undefined
    }
  ],
  logs: undefined,
  operation: 'drwa',
  function: 'drwaPolicySync'
};

const txWithSignalOnly: any = {
  status: 'success',
  results: [],
  logs: {
    events: [
      {
        identifier: 'drwaPolicyApplied'
      }
    ]
  },
  operation: 'drwa',
  function: 'drwaPolicySync'
};

benchmark('api_applyDrwa_denial', 100000, () => {
  const tx = { ...txWithDenial };
  service.applyDrwa(tx);
  if (tx.drwa?.denialCode !== 'DRWA_KYC_REQUIRED') {
    throw new Error('unexpected denial code');
  }
});

benchmark('api_applyDrwa_signal', 100000, () => {
  const tx = { ...txWithSignalOnly };
  service.applyDrwa(tx);
  if (!tx.drwa?.hasComplianceSignal) {
    throw new Error('missing compliance signal');
  }
});

const drwaToken: any = {
  identifier: 'RWA-123456',
  type: TokenType.FungibleESDT,
  name: 'Regulated Asset',
  assets: {
    svgUrl: 'https://example.com/rwa.svg'
  },
  drwa: {
    regulated: true,
    policyId: 'policy-1',
    tokenPolicyVersion: 9,
    globalPause: false
  }
};

(tokenService as any).getAllTokens = () => Promise.resolve([drwaToken]);
(tokenService as any).applySupply = () => Promise.resolve(undefined);
(tokenService as any).getTokenRoles = () => Promise.resolve([]);

void (async () => {
  await benchmarkAsync('api_getToken_drwa', 20000, async () => {
    const result = await (tokenService as any).getToken('RWA-123456');
    if (!result?.drwa?.regulated) {
      throw new Error('missing drwa token');
    }
  });
})();
