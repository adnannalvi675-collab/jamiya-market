import { Module } from '@nestjs/common';
import { JameyaController } from './jameya.controller';
import { JameyaService } from './jameya.service';
import { MarketplaceService } from './marketplace.service';
import { UserModule } from '../user/user.module';

@Module({
  imports: [UserModule],
  controllers: [JameyaController],
  providers: [JameyaService, MarketplaceService],
  exports: [JameyaService],
})
export class JameyaModule {}
