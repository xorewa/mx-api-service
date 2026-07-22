import { Module } from '@nestjs/common';
import { VmQueryModule } from '../vm.query/vm.query.module';
import { DrwaGovernanceService } from './drwa.governance.service';
import { DrwaService } from './drwa.service';

@Module({
  imports: [VmQueryModule],
  providers: [DrwaService, DrwaGovernanceService],
  exports: [DrwaService, DrwaGovernanceService],
})
export class DrwaModule {}
