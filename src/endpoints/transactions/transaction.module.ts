import { forwardRef, Module } from "@nestjs/common";
import { AssetsModule } from "src/common/assets/assets.module";
import { DataApiModule } from "src/common/data-api/data-api.module";
import { PluginModule } from "src/plugins/plugin.module";
import { BlockModule } from "../blocks/block.module";
import { NetworkModule } from "../network/network.module";
import { PoolModule } from "../pool/pool.module";
import { TokenModule } from "../tokens/token.module";
import { UsernameModule } from "../usernames/username.module";
import { TransactionActionModule } from "./transaction-action/transaction.action.module";
import { DrwaTransactionService } from "./drwa.transaction.service";
import { TransactionGetService } from "./transaction.get.service";
import { TransactionPriceService } from "./transaction.price.service";
import { TransactionService } from "./transaction.service";

@Module({
  imports: [
    forwardRef(() => TokenModule),
    forwardRef(() => PluginModule),
    forwardRef(() => TransactionActionModule),
    forwardRef(() => BlockModule),
    forwardRef(() => PoolModule),
    forwardRef(() => NetworkModule),
    AssetsModule,
    UsernameModule,
    DataApiModule,
  ],
  providers: [
    DrwaTransactionService, TransactionGetService, TransactionPriceService, TransactionService,
  ],
  exports: [
    DrwaTransactionService, TransactionGetService, TransactionPriceService, TransactionService,
  ],
})
export class TransactionModule { }
