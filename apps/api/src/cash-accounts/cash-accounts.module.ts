import { Module } from "@nestjs/common";
import { CashAccountRepository } from "./cash-account.repository.js";
import { CashAccountsController } from "./cash-accounts.controller.js";
import { CashAccountsService } from "./cash-accounts.service.js";

@Module({
	controllers: [CashAccountsController],
	providers: [CashAccountRepository, CashAccountsService],
})
export class CashAccountsModule {}
