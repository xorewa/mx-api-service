import { Module } from '@nestjs/common';
import { DrwaService } from './drwa.service';

@Module({
  providers: [DrwaService],
  exports: [DrwaService],
})
export class DrwaModule { }
